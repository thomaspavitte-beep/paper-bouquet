/*
  Asset normaliser for Paper Bouquet.

  Converts a raw Illustrator SVG export into a contract-compliant asset:
    - viewBox -50 -50 100 100, visual centre at (0, 0)
    - fills mapped to palette slot variables, no literal colours
    - transforms flattened into path data, one path per slot, no groups
    - data-attach point on the root svg
    - SVGO-optimised, target under 4 KB

  Run per file, review the printed proposal, then re-run with --write:

    npx tsx tools/normalise.ts "assets/raw/Leaf.svg" \
      --id leaf-almond --type leaf --size medium --attach 2.27,143.74 --write

  Flags:
    --id <slug>            asset id, also the output filename (required)
    --type <t>             head | leaf | sprig (required)
    --size <s>             large | medium | small (required)
    --attach <spec>        "x,y" in raw coordinates, or bottom | top | center
                           (default: center)
    --attach-norm <x,y>    attach given directly in normalised output
                           coordinates (overrides --attach); useful when
                           re-running an asset whose manifest attach is known
    --attach-angle <deg>   optional data-attach-angle
    --map <spec>           "#hex=slot,#hex=slot" to override proposed mapping
    --no-flip              mark the asset as not flippable
    --keep-parts           keep one path per raw shape instead of merging per
                           slot, and mark the manifest entry parts: true, so
                           petals can animate individually
    --write                actually write the asset and manifest entry
                           (without it, dry run: prints the proposal only)
*/

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "svgo";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SLOTS = ["primary", "secondary", "centre", "accent", "detail"] as const;
type Slot = (typeof SLOTS)[number];
type AssetType = "head" | "leaf" | "sprig";
type SizeClass = "large" | "medium" | "small";

// ---------------------------------------------------------------- geometry

interface Pt {
  x: number;
  y: number;
}
type Seg = { c1: Pt; c2: Pt; end: Pt } | { end: Pt }; // cubic or line
interface SubPath {
  start: Pt;
  segs: Seg[];
}
interface Shape {
  fill: string;
  order: number;
  subs: SubPath[];
}

type Mat = [number, number, number, number, number, number]; // a b c d e f

const IDENT: Mat = [1, 0, 0, 1, 0, 0];

function matMul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Mat, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

function parseTransform(t: string | undefined): Mat {
  if (!t) return IDENT;
  let m = IDENT;
  const re = /(translate|rotate|scale|matrix)\s*\(([^)]*)\)/g;
  for (const [, fn, argStr] of t.matchAll(re)) {
    const a = (argStr ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
    let n: Mat;
    switch (fn) {
      case "translate":
        n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case "scale":
        n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const rad = ((a[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        n = [cos, sin, -sin, cos, 0, 0];
        if (a.length >= 3) {
          const cx = a[1] ?? 0;
          const cy = a[2] ?? 0;
          n = matMul(matMul([1, 0, 0, 1, cx, cy], n), [1, 0, 0, 1, -cx, -cy]);
        }
        break;
      }
      case "matrix":
        n = [a[0] ?? 1, a[1] ?? 0, a[2] ?? 0, a[3] ?? 1, a[4] ?? 0, a[5] ?? 0];
        break;
      default:
        n = IDENT;
    }
    m = matMul(m, n);
  }
  return m;
}

function transformSub(sub: SubPath, m: Mat): SubPath {
  return {
    start: apply(m, sub.start),
    segs: sub.segs.map((s) =>
      "c1" in s
        ? { c1: apply(m, s.c1), c2: apply(m, s.c2), end: apply(m, s.end) }
        : { end: apply(m, s.end) },
    ),
  };
}

// bbox of a cubic segment via derivative roots
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const out = [p0, p3];
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  for (const t of ts) {
    if (t > 0 && t < 1) {
      const u = 1 - t;
      out.push(u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3);
    }
  }
  return out;
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bboxOf(shapes: Shape[]): BBox {
  const b: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const eat = (xs: number[], ys: number[]) => {
    for (const x of xs) {
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
    }
    for (const y of ys) {
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
    }
  };
  for (const sh of shapes) {
    for (const sub of sh.subs) {
      let cur = sub.start;
      eat([cur.x], [cur.y]);
      for (const s of sub.segs) {
        if ("c1" in s) {
          eat(cubicExtrema(cur.x, s.c1.x, s.c2.x, s.end.x), cubicExtrema(cur.y, s.c1.y, s.c2.y, s.end.y));
        } else {
          eat([s.end.x], [s.end.y]);
        }
        cur = s.end;
      }
    }
  }
  return b;
}

// flatten a subpath to points, for area
function flatten(sub: SubPath, perCurve = 16): Pt[] {
  const pts: Pt[] = [sub.start];
  let cur = sub.start;
  for (const s of sub.segs) {
    if ("c1" in s) {
      for (let i = 1; i <= perCurve; i++) {
        const t = i / perCurve;
        const u = 1 - t;
        pts.push({
          x: u * u * u * cur.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.end.x,
          y: u * u * u * cur.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.end.y,
        });
      }
    } else {
      pts.push(s.end);
    }
    cur = s.end;
  }
  return pts;
}

function signedArea(sub: SubPath): number {
  const pts = flatten(sub);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

// reverse a subpath so overlapping same-slot shapes never cancel under nonzero fill
function reverseSub(sub: SubPath): SubPath {
  const points: Pt[] = [sub.start];
  for (const s of sub.segs) points.push(s.end);
  const segs: Seg[] = [];
  for (let i = sub.segs.length - 1; i >= 0; i--) {
    const s = sub.segs[i]!;
    const end = points[i]!;
    segs.push("c1" in s ? { c1: s.c2, c2: s.c1, end } : { end });
  }
  return { start: points[points.length - 1]!, segs };
}

// ---------------------------------------------------------------- raw parsing

const KAPPA = 0.5522847498307936;

function circleToSub(cx: number, cy: number, r: number): SubPath {
  const k = r * KAPPA;
  return {
    start: { x: cx + r, y: cy },
    segs: [
      { c1: { x: cx + r, y: cy + k }, c2: { x: cx + k, y: cy + r }, end: { x: cx, y: cy + r } },
      { c1: { x: cx - k, y: cy + r }, c2: { x: cx - r, y: cy + k }, end: { x: cx - r, y: cy } },
      { c1: { x: cx - r, y: cy - k }, c2: { x: cx - k, y: cy - r }, end: { x: cx, y: cy - r } },
      { c1: { x: cx + k, y: cy - r }, c2: { x: cx + r, y: cy - k }, end: { x: cx + r, y: cy } },
    ],
  };
}

function parsePathData(d: string): SubPath[] {
  const subs: SubPath[] = [];
  let cur: SubPath | null = null;
  let pos: Pt = { x: 0, y: 0 };
  let startPt: Pt = { x: 0, y: 0 };
  let prevC2: Pt | null = null;
  let prevQ: Pt | null = null;

  const tokens = d.match(/[MmLlHhVvCcSsQqTtZzAa]|-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g) ?? [];
  let i = 0;
  const num = () => {
    const t = tokens[i++];
    const n = Number(t);
    if (t === undefined || Number.isNaN(n)) throw new Error(`bad number in path data near token ${i}: ${t}`);
    return n;
  };

  let cmd = "";
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z" || cmd === "z") {
        pos = startPt;
        prevC2 = prevQ = null;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === "A") throw new Error("arc commands not supported; convert arcs in the source file first");

    switch (C) {
      case "M": {
        const x = num();
        const y = num();
        pos = rel ? { x: pos.x + x, y: pos.y + y } : { x, y };
        startPt = pos;
        cur = { start: pos, segs: [] };
        subs.push(cur);
        cmd = rel ? "l" : "L"; // subsequent pairs are implicit lineto
        prevC2 = prevQ = null;
        break;
      }
      case "L": {
        const x = num();
        const y = num();
        pos = rel ? { x: pos.x + x, y: pos.y + y } : { x, y };
        cur!.segs.push({ end: pos });
        prevC2 = prevQ = null;
        break;
      }
      case "H": {
        const x = num();
        pos = { x: rel ? pos.x + x : x, y: pos.y };
        cur!.segs.push({ end: pos });
        prevC2 = prevQ = null;
        break;
      }
      case "V": {
        const y = num();
        pos = { x: pos.x, y: rel ? pos.y + y : y };
        cur!.segs.push({ end: pos });
        prevC2 = prevQ = null;
        break;
      }
      case "C": {
        const c1 = rel ? { x: pos.x + num(), y: pos.y + num() } : { x: num(), y: num() };
        const c2 = rel ? { x: pos.x + num(), y: pos.y + num() } : { x: num(), y: num() };
        const end = rel ? { x: pos.x + num(), y: pos.y + num() } : { x: num(), y: num() };
        cur!.segs.push({ c1, c2, end });
        prevC2 = c2;
        prevQ = null;
        pos = end;
        break;
      }
      case "S": {
        const c1 = prevC2 ? { x: 2 * pos.x - prevC2.x, y: 2 * pos.y - prevC2.y } : pos;
        const c2 = rel ? { x: pos.x + num(), y: pos.y + num() } : { x: num(), y: num() };
        const end = rel ? { x: pos.x + num(), y: pos.y + num() } : { x: num(), y: num() };
        cur!.segs.push({ c1, c2, end });
        prevC2 = c2;
        prevQ = null;
        pos = end;
        break;
      }
      case "Q":
      case "T": {
        let q: Pt;
        if (C === "Q") {
          q = rel ? { x: pos.x + num(), y: pos.y + num() } : { x: num(), y: num() };
        } else {
          q = prevQ ? { x: 2 * pos.x - prevQ.x, y: 2 * pos.y - prevQ.y } : pos;
        }
        const end = rel ? { x: pos.x + num(), y: pos.y + num() } : { x: num(), y: num() };
        const c1 = { x: pos.x + (2 / 3) * (q.x - pos.x), y: pos.y + (2 / 3) * (q.y - pos.y) };
        const c2 = { x: end.x + (2 / 3) * (q.x - end.x), y: end.y + (2 / 3) * (q.y - end.y) };
        cur!.segs.push({ c1, c2, end });
        prevQ = q;
        prevC2 = null;
        pos = end;
        break;
      }
      default:
        throw new Error(`unsupported path command: ${cmd}`);
    }
  }
  return subs;
}

interface RawParse {
  shapes: Shape[];
  colours: Map<string, { area: number; ids: string[] }>;
  viewBox: string;
}

function parseRaw(svg: string): RawParse {
  // class -> fill from the <style> block
  const classFill = new Map<string, string>();
  const styleBlock = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";
  for (const [, cls, fill] of styleBlock.matchAll(/\.([\w-]+)\s*\{[^}]*fill:\s*([^;}\s]+)/g)) {
    classFill.set(cls!, fill!.toLowerCase());
  }

  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? "";
  const shapes: Shape[] = [];
  let order = 0;

  const elRe = /<(circle|rect|polygon|polyline|path|ellipse)\b([^>]*?)\/?>/g;
  for (const [, tag, attrStr] of svg.matchAll(elRe)) {
    const attrs = new Map<string, string>();
    for (const [, k, v] of attrStr!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs.set(k!, v!);

    const cls = attrs.get("class");
    let fill = attrs.get("fill") ?? (cls ? classFill.get(cls) : undefined);
    if (!fill) throw new Error(`<${tag}> with no resolvable fill (id=${attrs.get("id") ?? "?"})`);
    fill = fill.toLowerCase();
    if (fill === "#ffffff") fill = "#fff";
    const m = parseTransform(attrs.get("transform"));

    let subs: SubPath[];
    switch (tag) {
      case "circle": {
        subs = [circleToSub(Number(attrs.get("cx") ?? 0), Number(attrs.get("cy") ?? 0), Number(attrs.get("r")))];
        break;
      }
      case "ellipse": {
        const cx = Number(attrs.get("cx") ?? 0);
        const cy = Number(attrs.get("cy") ?? 0);
        const rx = Number(attrs.get("rx"));
        const ry = Number(attrs.get("ry"));
        const unit = circleToSub(0, 0, 1);
        const em: Mat = [rx, 0, 0, ry, cx, cy];
        subs = [transformSub(unit, em)];
        break;
      }
      case "rect": {
        const x = Number(attrs.get("x") ?? 0);
        const y = Number(attrs.get("y") ?? 0);
        const w = Number(attrs.get("width"));
        const h = Number(attrs.get("height"));
        subs = [
          {
            start: { x, y },
            segs: [{ end: { x: x + w, y } }, { end: { x: x + w, y: y + h } }, { end: { x, y: y + h } }, { end: { x, y } }],
          },
        ];
        break;
      }
      case "polygon":
      case "polyline": {
        const nums = (attrs.get("points") ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
        const pts: Pt[] = [];
        for (let j = 0; j + 1 < nums.length; j += 2) pts.push({ x: nums[j]!, y: nums[j + 1]! });
        subs = [{ start: pts[0]!, segs: pts.slice(1).map((p) => ({ end: p })) }];
        break;
      }
      case "path": {
        subs = parsePathData(attrs.get("d") ?? "");
        break;
      }
      default:
        throw new Error(`unsupported element <${tag}>`);
    }

    subs = subs.map((s) => transformSub(s, m));
    // consistent winding so overlapping same-colour shapes union under nonzero fill
    subs = subs.map((s) => (signedArea(s) < 0 ? reverseSub(s) : s));
    shapes.push({ fill, order: order++, subs });
  }

  const colours = new Map<string, { area: number; ids: string[] }>();
  const idRe = /<(?:circle|rect|polygon|polyline|path|ellipse)\b[^>]*?>/g;
  const els = svg.match(idRe) ?? [];
  shapes.forEach((sh, idx) => {
    const entry = colours.get(sh.fill) ?? { area: 0, ids: [] };
    entry.area += sh.subs.reduce((a, s) => a + Math.abs(signedArea(s)), 0);
    const id = els[idx]?.match(/id="([^"]+)"/)?.[1];
    if (id) entry.ids.push(id);
    colours.set(sh.fill, entry);
  });

  return { shapes, colours, viewBox };
}

// ---------------------------------------------------------------- slot mapping

function proposeMapping(colours: Map<string, { area: number; ids: string[] }>): Map<string, Slot> {
  const map = new Map<string, Slot>();
  const remaining = [...colours.entries()].sort((a, b) => b[1].area - a[1].area);
  const free = new Set<Slot>(SLOTS);
  const take = (hex: string, slot: Slot) => {
    map.set(hex, slot);
    free.delete(slot);
  };

  // a shape named Seed (or similar) is the flower centre
  for (const [hex, info] of remaining) {
    if (info.ids.some((id) => /seed|centre|center/i.test(id)) && free.has("centre")) take(hex, "centre");
  }
  // white reads as the paper-cut detail layer
  for (const [hex] of remaining) {
    if (!map.has(hex) && (hex === "#fff" || hex === "white") && free.has("detail")) take(hex, "detail");
  }
  // largest remaining area gets primary, then secondary, accent, detail
  const orderPref: Slot[] = ["primary", "secondary", "accent", "detail", "centre"];
  for (const [hex] of remaining) {
    if (map.has(hex)) continue;
    const slot = orderPref.find((s) => free.has(s));
    if (!slot) throw new Error("more colours than available slots");
    take(hex, slot);
  }
  return map;
}

// ---------------------------------------------------------------- output

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

function subToD(sub: SubPath): string {
  let d = `M${fmt(sub.start.x)},${fmt(sub.start.y)}`;
  for (const s of sub.segs) {
    d += "c1" in s
      ? `C${fmt(s.c1.x)},${fmt(s.c1.y)} ${fmt(s.c2.x)},${fmt(s.c2.y)} ${fmt(s.end.x)},${fmt(s.end.y)}`
      : `L${fmt(s.end.x)},${fmt(s.end.y)}`;
  }
  return d + "Z";
}

// ---------------------------------------------------------------- main

interface Args {
  input: string;
  id: string;
  type: AssetType;
  size: SizeClass;
  attach: string;
  attachNorm?: string; // attach given directly in normalised output coords
  attachAngle?: number;
  map?: string;
  noFlip: boolean;
  keepParts: boolean; // one path per raw shape, for per-petal animation
  write: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { attach: "center", noFlip: false, keepParts: false, write: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--id": out.id = argv[++i]; break;
      case "--type": out.type = argv[++i] as AssetType; break;
      case "--size": out.size = argv[++i] as SizeClass; break;
      case "--attach": out.attach = argv[++i]; break;
      case "--attach-norm": out.attachNorm = argv[++i]; break;
      case "--attach-angle": out.attachAngle = Number(argv[++i]); break;
      case "--map": out.map = argv[++i]; break;
      case "--no-flip": out.noFlip = true; break;
      case "--keep-parts": out.keepParts = true; break;
      case "--write": out.write = true; break;
      default: positional.push(a);
    }
  }
  out.input = positional[0];
  if (!out.input || !out.id || !out.type || !out.size) {
    throw new Error("usage: normalise.ts <raw.svg> --id <slug> --type head|leaf|sprig --size large|medium|small [--attach x,y|bottom|top|center] [--map \"#hex=slot,...\"] [--no-flip] [--write]");
  }
  if (!["head", "leaf", "sprig"].includes(out.type)) throw new Error(`bad --type ${out.type}`);
  if (!["large", "medium", "small"].includes(out.size)) throw new Error(`bad --size ${out.size}`);
  return out as Args;
}

const TYPE_DIR: Record<AssetType, string> = { head: "heads", leaf: "leaves", sprig: "sprigs" };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolve(ROOT, args.input);
  const raw = readFileSync(inputPath, "utf8");
  const { shapes, colours, viewBox } = parseRaw(raw);

  // slot mapping: proposed, then overridden by --map
  const mapping = proposeMapping(colours);
  if (args.map) {
    for (const pair of args.map.split(",")) {
      const [hex, slot] = pair.split("=").map((s) => s.trim().toLowerCase());
      if (!hex || !SLOTS.includes(slot as Slot)) throw new Error(`bad --map entry: ${pair}`);
      mapping.set(hex === "#ffffff" ? "#fff" : hex, slot as Slot);
    }
  }

  // normalise geometry: centre on bbox centre, fit longest side to 100
  const bb = bboxOf(shapes);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const scale = 100 / Math.max(w, h);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  const norm: Mat = [scale, 0, 0, scale, -cx * scale, -cy * scale];

  // attach point
  let attach: Pt;
  if (args.attachNorm) {
    const [x, y] = args.attachNorm.split(",").map(Number);
    if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) throw new Error(`bad --attach-norm ${args.attachNorm}`);
    attach = { x, y };
  } else {
    let attachRaw: Pt;
    switch (args.attach) {
      case "center": attachRaw = { x: cx, y: cy }; break;
      case "bottom": attachRaw = { x: cx, y: bb.maxY }; break;
      case "top": attachRaw = { x: cx, y: bb.minY }; break;
      default: {
        const [x, y] = args.attach.split(",").map(Number);
        if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) throw new Error(`bad --attach ${args.attach}`);
        attachRaw = { x, y };
      }
    }
    attach = apply(norm, attachRaw);
  }
  const attachStr = `${Math.round(attach.x * 10) / 10},${Math.round(attach.y * 10) / 10}`;

  // group shapes by slot, preserving document paint order
  const bySlot = new Map<Slot, { subs: SubPath[]; firstOrder: number }>();
  for (const sh of shapes) {
    const slot = mapping.get(sh.fill);
    if (!slot) throw new Error(`no slot for colour ${sh.fill}`);
    const entry = bySlot.get(slot) ?? { subs: [], firstOrder: sh.order };
    entry.subs.push(...sh.subs.map((s) => transformSub(s, norm)));
    bySlot.set(slot, entry);
  }
  const ordered = [...bySlot.entries()].sort((a, b) => a[1].firstOrder - b[1].firstOrder);

  const attrs = [
    `xmlns="http://www.w3.org/2000/svg"`,
    `viewBox="-50 -50 100 100"`,
    `data-attach="${attachStr}"`,
  ];
  if (args.attachAngle !== undefined) attrs.push(`data-attach-angle="${args.attachAngle}"`);
  if (args.noFlip) attrs.push(`data-no-flip=""`);

  let svg = `<svg ${attrs.join(" ")}>`;
  if (args.keepParts) {
    // one path per raw shape (petal), document order, so grow.ts can
    // animate parts individually
    for (const sh of [...shapes].sort((a, b) => a.order - b.order)) {
      const slot = mapping.get(sh.fill)!;
      svg += `<path fill="var(--${slot})" d="${sh.subs.map((s) => subToD(transformSub(s, norm))).join("")}"/>`;
    }
  } else {
    for (const [slot, entry] of ordered) {
      svg += `<path fill="var(--${slot})" d="${entry.subs.map(subToD).join("")}"/>`;
    }
  }
  svg += `</svg>`;

  const optimised = optimize(svg, {
    multipass: true,
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            removeViewBox: false,
            removeUnknownsAndDefaults: { keepDataAttrs: true },
            convertPathData: { floatPrecision: 2 },
            cleanupNumericValues: { floatPrecision: 2 },
            // keep-parts assets must stay one path per petal
            ...(args.keepParts ? { mergePaths: false } : {}),
          },
        },
      },
    ],
  }).data;

  const bytes = Buffer.byteLength(optimised, "utf8");
  const slots = ordered.map(([slot]) => slot);
  const relFile = `${TYPE_DIR[args.type]}/${args.id}.svg`;

  // report
  console.log(`\n${args.input}`);
  console.log(`  raw viewBox   ${viewBox}, bbox ${fmt(w)} x ${fmt(h)}`);
  console.log(`  colour -> slot mapping${args.map ? " (overridden)" : " (proposed)"}:`);
  for (const [hex, info] of [...colours.entries()].sort((a, b) => b[1].area - a[1].area)) {
    const ids = info.ids.length ? ` [${info.ids.join(", ")}]` : "";
    console.log(`    ${hex.padEnd(8)} area ${Math.round(info.area).toString().padStart(7)} -> ${mapping.get(hex)}${ids}`);
  }
  console.log(`  attach        ${attachStr} (${args.attach})`);
  console.log(`  paint order   ${slots.join(", ")}`);
  console.log(`  output        assets/${relFile}, ${bytes} bytes${bytes > 4096 ? "  ** OVER 4 KB **" : ""}`);

  if (!args.write) {
    console.log(`  dry run only. Re-run with --write to save.`);
    return;
  }

  writeFileSync(join(ROOT, "public", "assets", relFile), optimised);

  const manifestPath = join(ROOT, "public", "assets", "manifest.json");
  const manifest: { assets: Record<string, unknown>[] } = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : { assets: [] };
  const entry: Record<string, unknown> = {
    id: args.id,
    file: relFile,
    type: args.type,
    slots,
    attach: [Math.round(attach.x * 10) / 10, Math.round(attach.y * 10) / 10],
    flip: !args.noFlip,
    sizeClass: args.size,
  };
  if (args.keepParts) entry.parts = true;
  const existing = manifest.assets.findIndex((a) => a.id === args.id);
  if (existing >= 0) manifest.assets[existing] = entry;
  else manifest.assets.push(entry);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  written, manifest now has ${manifest.assets.length} assets.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
