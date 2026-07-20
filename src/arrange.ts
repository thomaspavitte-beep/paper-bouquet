/* Arrangement engine: the heart of the project. Places a focal bloom and
   supporting heads above the vase mouth, grows stems from within the mouth,
   dresses stems with leaves, and fills angular gaps with parametric berry
   sprigs and loose leaves.

   Coordinates: the vase mouth centre is (0, 0); y is negative upward. The
   caller draws the returned markup first and the vase after it, so stem
   bases tuck behind the vase. */

import { type Rng, range, rangeInt, pick } from "./rng";
import { greenShades, type Palette } from "./palette";
import { type Library, type LoadedAsset, instantiate, naturalAngle } from "./assets";

export interface VaseShape {
  mouthHalf: number;
  width: number;
  height: number;
}

export interface Arrangement {
  markup: string;
  headCount: number;
  sprigCount: number;
  bounds?: { x: number; y: number; w: number; h: number }; // cluster mode only
}

export type ArrangeMode = "stems" | "posy" | "wreath";

export interface ArrangeOptions {
  mediums?: number; // medium head count; default draws 2 to 4 from the seed
  density: number; // 0.5 sparse to 1.5 lush; scales fillers and leaf counts
  curviness: number; // 0 near-straight to 2 bowed stems
  mode: ArrangeMode; // stems = vased bouquet; posy and wreath have no stems or vase
  literal: boolean; // substitute slot variables with real colours, no animation hooks
}

const DEFAULT_OPTS: ArrangeOptions = { density: 1, curviness: 1, mode: "stems", literal: false };

interface Pt {
  x: number;
  y: number;
}

interface Circle extends Pt {
  r: number;
}

interface Stem {
  base: Pt;
  ctrl: Pt;
  tip: Pt;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/* angle of a vector in degrees, 0 = straight up, positive = clockwise */
const angleOf = (v: Pt) => (Math.atan2(v.x, -v.y) * 180) / Math.PI;

const qPoint = (s: Stem, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * s.base.x + 2 * u * t * s.ctrl.x + t * t * s.tip.x,
    y: u * u * s.base.y + 2 * u * t * s.ctrl.y + t * t * s.tip.y,
  };
};

const qTangent = (s: Stem, t: number): Pt => ({
  x: 2 * ((1 - t) * (s.ctrl.x - s.base.x) + t * (s.tip.x - s.ctrl.x)),
  y: 2 * ((1 - t) * (s.ctrl.y - s.base.y) + t * (s.tip.y - s.ctrl.y)),
});

const stemD = (s: Stem) =>
  `M${r2(s.base.x)},${r2(s.base.y)}Q${r2(s.ctrl.x)},${r2(s.ctrl.y)} ${r2(s.tip.x)},${r2(s.tip.y)}`;

/* fraction of the smaller circle's area covered by the overlap */
function overlapFraction(a: Circle, b: Circle): number {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  const [r1, r2c] = [a.r, b.r];
  const small = Math.min(r1, r2c);
  if (d >= r1 + r2c) return 0;
  if (d <= Math.abs(r1 - r2c)) return 1;
  const lens =
    r1 * r1 * Math.acos((d * d + r1 * r1 - r2c * r2c) / (2 * d * r1)) +
    r2c * r2c * Math.acos((d * d + r2c * r2c - r1 * r1) / (2 * d * r2c)) -
    0.5 *
      Math.sqrt(
        (-d + r1 + r2c) * (d + r1 - r2c) * (d - r1 + r2c) * (d + r1 + r2c),
      );
  return lens / (Math.PI * small * small);
}

interface PlacedHead {
  asset: LoadedAsset;
  circle: Circle;
  primary: string;
}

/* In the stemless modes a head should sit centred on its packing circle,
   but instantiate() places the attach point. For directional assets (tulip,
   bottlebrush) the attach is at the base, so compute where to put the attach
   so the asset's visual centre lands on the target instead. */
function attachForCentre(
  asset: LoadedAsset,
  target: Pt,
  rotationDeg: number,
  scale: number,
  flip: boolean,
): Pt {
  const [ax, ay] = asset.attach;
  const vx = (flip ? ax : -ax) * scale;
  const vy = -ay * scale;
  const rad = (rotationDeg * Math.PI) / 180;
  const rx = vx * Math.cos(rad) - vy * Math.sin(rad);
  const ry = vx * Math.sin(rad) + vy * Math.cos(rad);
  return { x: target.x - rx, y: target.y - ry };
}

/* seeded round-robin over the non-accent blooms, skipping colours a head's
   neighbours already wear */
function bloomCycler(rng: Rng, palette: Palette): (avoid: ReadonlySet<string>) => string {
  const accent = palette.blooms[palette.accentIndex]!;
  const pool = [...palette.blooms].filter((b) => b !== accent);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  let idx = 0;
  return (avoid: ReadonlySet<string>) => {
    for (let k = 0; k < pool.length; k++) {
      const c = pool[(idx + k) % pool.length]!;
      if (!avoid.has(c)) {
        idx += k + 1;
        return c;
      }
    }
    return pool[0]!;
  };
}

export function generateArrangement(
  rng: Rng,
  palette: Palette,
  lib: Library,
  vase: VaseShape,
  options?: Partial<ArrangeOptions>,
): Arrangement {
  const opts: ArrangeOptions = { ...DEFAULT_OPTS, ...options };
  if (opts.mode === "posy") return generateCluster(rng, palette, lib, vase, opts);
  if (opts.mode === "wreath") return generateWreath(rng, palette, lib, vase, opts);
  const W = Math.max(vase.width * range(rng, 1.35, 1.7), 120); // arrangement width
  const H = vase.height * range(rng, 1.5, 2.1); // arrangement height above mouth
  const accent = palette.blooms[palette.accentIndex]!;

  // width of the dome at a given height; widest just above the vase
  const domeHalf = (y: number) => {
    const t = (-y - 0.3 * H) / (0.75 * H);
    return (W / 2) * Math.sqrt(Math.max(0.12, 1 - t * t));
  };

  // ---- heads: one large focal off-centre, 2 to 4 mediums at distinct heights
  const heads: PlacedHead[] = [];
  const minVSep = H * 0.13;

  const bloomPool = [...palette.blooms].filter((b) => b !== accent);
  for (let i = bloomPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bloomPool[i], bloomPool[j]] = [bloomPool[j]!, bloomPool[i]!];
  }
  let bloomIdx = 0;
  const nextBloom = (avoid: string) => {
    for (let k = 0; k < bloomPool.length; k++) {
      const c = bloomPool[(bloomIdx + k) % bloomPool.length]!;
      if (c !== avoid) {
        bloomIdx += k + 1;
        return c;
      }
    }
    return bloomPool[0]!;
  };

  const focalSide = rng() < 0.5 ? -1 : 1;
  const focalR = W * range(rng, 0.17, 0.21);
  const focal: PlacedHead = {
    asset: pick(rng, lib.heads.large),
    circle: {
      x: focalSide * W * range(rng, 0.1, 0.18),
      y: -H * range(rng, 0.55, 0.7),
      r: focalR,
    },
    primary: accent,
  };
  heads.push(focal);

  // always draw so the seed's stream stays stable when the override is unset
  const drawnMediums = rangeInt(rng, 2, 4);
  const mediumCount = opts.mediums ?? drawnMediums;
  const mediumAssets = [...lib.heads.medium];
  for (let k = 0; k < mediumCount; k++) {
    const r = focalR * range(rng, 0.58, 0.75);
    let placed = false;
    for (let attempt = 0; attempt < 60 && !placed; attempt++) {
      const y = -H * range(rng, 0.32, 0.95);
      if (heads.some((h) => Math.abs(h.circle.y - y) < minVSep)) continue;
      const side = k % 2 === 0 ? -focalSide : focalSide;
      const x = side * range(rng, 0.15, 0.9) * domeHalf(y);
      const c: Circle = { x, y, r };
      if (heads.some((h) => overlapFraction(h.circle, c) > 0.15)) continue;
      const asset = mediumAssets.length
        ? mediumAssets.splice(Math.floor(rng() * mediumAssets.length), 1)[0]!
        : pick(rng, lib.heads.medium);
      heads.push({ asset, circle: c, primary: nextBloom(accent) });
      placed = true;
    }
  }

  // ---- angular gap analysis for sprigs and loose leaves
  const FAN = 72; // degrees each side of vertical
  const headAngles = heads
    .map((h) => angleOf({ x: h.circle.x, y: h.circle.y }))
    .sort((a, b) => a - b);
  const boundaries = [-FAN, ...headAngles, FAN];
  interface Filler {
    kind: "sprig" | "leaf";
    angle: number;
  }
  const fillers: Filler[] = [];
  const clampAngle = (deg: number, lim: number) => Math.max(-lim, Math.min(lim, deg));
  const gapThreshold = 30 / opts.density;
  const bigGapThreshold = 58 / opts.density;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i]!;
    const b = boundaries[i + 1]!;
    const gap = b - a;
    if (gap > gapThreshold) {
      const kind = fillers.length % 2 === 0 ? "sprig" : "leaf";
      fillers.push({ kind, angle: clampAngle((a + b) / 2, kind === "sprig" ? 68 : 55) });
    }
    if (gap > bigGapThreshold) fillers.push({ kind: "leaf", angle: clampAngle(a + gap * (rng() < 0.5 ? 0.28 : 0.72), 55) });
  }

  // ---- stems: bases spread inside the mouth, ordered to match tip order
  interface StemJob {
    tip: Pt;
    head?: PlacedHead;
    filler?: Filler;
    length: number;
  }
  const jobs: StemJob[] = heads.map((h) => ({
    tip: { x: h.circle.x, y: h.circle.y },
    head: h,
    length: Math.hypot(h.circle.x, h.circle.y),
  }));
  for (const filler of fillers) {
    const len = filler.kind === "sprig" ? H * range(rng, 0.55, 0.85) : H * range(rng, 0.34, 0.5);
    const rad = (filler.angle * Math.PI) / 180;
    jobs.push({
      tip: { x: Math.sin(rad) * len * 0.9, y: -Math.cos(rad) * len },
      filler,
      length: len,
    });
  }

  jobs.sort((a, b) => a.tip.x - b.tip.x);
  const spread = vase.mouthHalf * 0.72;
  const stems: { job: StemJob; stem: Stem }[] = jobs.map((job, i) => {
    const fx = jobs.length === 1 ? 0.5 : i / (jobs.length - 1);
    const base: Pt = { x: (fx * 2 - 1) * spread, y: 8 };
    const dx = job.tip.x - base.x;
    const ctrl: Pt = {
      x: base.x + dx * range(rng, 0.42, 0.58) + dx * range(rng, 0.12, 0.28) * opts.curviness,
      y: base.y + (job.tip.y - base.y) * range(rng, 0.48, 0.62),
    };
    return { job, stem: { base, ctrl, tip: job.tip } };
  });

  // ---- render layers
  // three foliage tones so overlapping greens separate: stems lean on the
  // darker pair, leaves use the full range
  const greens = greenShades(palette.green);
  const stemGreens = [greens[0], greens[1]];
  const stemW = range(rng, 2.3, 3.1);

  /* Each stem and everything riding it forms a unit. grow.ts finds units by
     the data-u index: the stem draws on, pieces (leaves, branches, berries)
     unfold when the draw-on passes their data-t, the bloom pops at the tip,
     and idle sway rotates every pb-rot wrapper of a unit around data-base. */
  interface Unit {
    base: Pt;
    stemD: string;
    stemWidth: number;
    green: string; // this unit's stem tone
    mid: string[]; // pb-piece groups
    head?: { markup: string; r: number; at: Pt };
  }
  const units: Unit[] = [];

  const leafMarkup = (at: Pt, tangentDeg: number, side: number, scale: number): string => {
    if (!lib.leaves.length) return ""; // every leaf toggled off
    const asset = pick(rng, lib.leaves);
    const flip = side > 0 && asset.flip;
    const natural = flip ? -naturalAngle(asset) : naturalAngle(asset);
    const target = tangentDeg + side * range(rng, 32, 58);
    return instantiate(asset, {
      x: at.x,
      y: at.y,
      scale,
      rotation: target - natural,
      flip,
      colours: { primary: pick(rng, greens) },
    }, opts.literal);
  };

  const piece = (t: number, at: Pt, inner: string) =>
    opts.literal
      ? `<g>${inner}</g>`
      : `<g class="pb-piece" data-t="${r2(t)}" data-at="${r2(at.x)},${r2(at.y)}">${inner}</g>`;

  for (const { job, stem } of stems) {
    const isSprig = job.filler?.kind === "sprig";
    const unit: Unit = {
      base: stem.base,
      stemD: stemD(stem),
      stemWidth: isSprig ? stemW * 0.7 : stemW,
      green: pick(rng, stemGreens),
      mid: [],
    };
    units.push(unit);

    if (job.head) {
      // leaves along the stem, alternating sides with jitter
      const nLeaves =
        job.length > (H * 0.55) / opts.density ? 2 : job.length > (H * 0.35) / opts.density ? 1 : rangeInt(rng, 0, 1);
      let side = rng() < 0.5 ? -1 : 1;
      const ts = nLeaves === 2 ? [range(rng, 0.32, 0.46), range(rng, 0.58, 0.74)] : [range(rng, 0.38, 0.6)];
      for (let li = 0; li < nLeaves; li++) {
        const t = ts[li]!;
        const at = qPoint(stem, t);
        if (at.y > -6) continue; // keep leaves clear of the mouth line
        const leaf = leafMarkup(at, angleOf(qTangent(stem, t)), side, (W * range(rng, 0.2, 0.28)) / 100);
        if (leaf) unit.mid.push(piece(t, at, leaf));
        side = -side;
      }

      // the head itself, attach point on the stem tip
      const h = job.head;
      const tangentDeg = angleOf(qTangent(stem, 1));
      const directional = Math.hypot(h.asset.attach[0], h.asset.attach[1]) > 10;
      const rotation = directional
        ? Math.max(-32, Math.min(32, tangentDeg)) * range(rng, 0.6, 0.9)
        : tangentDeg * 0.35 + range(rng, -9, 9);
      const others = palette.blooms.filter((b) => b !== h.primary);
      const centre = pick(rng, others);
      const markup = instantiate(h.asset, {
        x: h.circle.x,
        y: h.circle.y,
        scale: h.circle.r / 50,
        rotation,
        flip: h.asset.flip && rng() < 0.5,
        colours: {
          primary: h.primary,
          secondary: pick(rng, others.filter((c) => c !== centre).concat(centre)),
          centre,
          accent,
          detail: palette.ground,
        },
      }, opts.literal);
      unit.head = { markup, r: h.circle.r, at: { x: h.circle.x, y: h.circle.y } };
    } else if (isSprig) {
      // parametric berry sprig: branchlets off the main stem, berry at each tip
      const berryR = Math.max(2.2, job.length * 0.032);
      const berryColour = rng() < 0.7 ? accent : pick(rng, palette.blooms);
      const nBranches = rangeInt(rng, 2, 4);
      let side = rng() < 0.5 ? -1 : 1;
      for (let bi = 0; bi < nBranches; bi++) {
        const t = range(rng, 0.45, 0.88);
        const at = qPoint(stem, t);
        const tan = angleOf(qTangent(stem, t));
        const branchAngle = ((tan + side * range(rng, 28, 52)) * Math.PI) / 180;
        const len = job.length * range(rng, 0.14, 0.22);
        const end: Pt = { x: at.x + Math.sin(branchAngle) * len, y: at.y - Math.cos(branchAngle) * len };
        unit.mid.push(piece(t, at,
          `<path d="M${r2(at.x)},${r2(at.y)}L${r2(end.x)},${r2(end.y)}" stroke="${unit.green}" stroke-width="${r2(stemW * 0.55)}" stroke-linecap="round"/>` +
          `<circle cx="${r2(end.x)}" cy="${r2(end.y)}" r="${r2(berryR)}" fill="${berryColour}"/>`));
        side = -side;
      }
      unit.mid.push(piece(1, stem.tip,
        `<circle cx="${r2(stem.tip.x)}" cy="${r2(stem.tip.y)}" r="${r2(berryR * 1.15)}" fill="${berryColour}"/>`));
    } else {
      // loose leaf filler: a leaf riding its own short stem into the gap,
      // pulled toward upright so edge-of-fan leaves never lie sideways
      const tangentDeg = angleOf(qTangent(stem, 1)) * 0.65;
      const side = stem.tip.x >= 0 ? 1 : -1;
      const leaf = leafMarkup(stem.tip, tangentDeg, side * 0.25, (W * range(rng, 0.22, 0.3)) / 100);
      if (leaf) unit.mid.push(piece(1, stem.tip, leaf));
    }
  }

  // three z-layers (stems, mid pieces, heads with larger behind smaller),
  // each element wrapped per unit so sway can rotate a whole unit in step
  const baseAttr = (u: Unit) => `${r2(u.base.x)},${r2(u.base.y)}`;
  const rot = (u: Unit, i: number, inner: string) =>
    opts.literal
      ? `<g>${inner}</g>`
      : `<g class="pb-rot" data-u="${i}" data-base="${baseAttr(u)}">${inner}</g>`;

  const stemLayer = units
    .map((u, i) => rot(u, i,
      `<path${opts.literal ? "" : ` class="pb-stem"`} d="${u.stemD}" fill="none" stroke="${u.green}" stroke-width="${r2(u.stemWidth)}" stroke-linecap="round"/>`))
    .join("");
  const midLayer = units
    .map((u, i) => (u.mid.length ? rot(u, i, u.mid.join("")) : ""))
    .join("");
  const headLayer = units
    .map((u, i) => ({ u, i }))
    .filter((x): x is { u: Unit & { head: NonNullable<Unit["head"]> }; i: number } => !!x.u.head)
    .sort((a, b) => b.u.head.r - a.u.head.r)
    .map((x) => rot(x.u, x.i,
      opts.literal
        ? x.u.head.markup
        : `<g class="pb-bloom" data-at="${r2(x.u.head.at.x)},${r2(x.u.head.at.y)}">${x.u.head.markup}</g>`))
    .join("");

  return {
    markup: `<g>${stemLayer}</g><g>${midLayer}</g><g>${headLayer}</g>`,
    headCount: heads.length,
    sprigCount: fillers.filter((f) => f.kind === "sprig").length,
  };
}

/* ---------------------------------------------------------------- cluster
   Stems off: a tightly packed posy. Heads pack greedily toward the centre
   within the overlap rule, leaves tuck around the fringe behind them.
   Growth blooms centre-outward (data-len drives the stagger order), sway
   becomes a tiny per-flower breathe around each head's own centre. */

function generateCluster(
  rng: Rng,
  palette: Palette,
  lib: Library,
  vase: VaseShape,
  opts: ArrangeOptions,
): Arrangement {
  const W = Math.max(vase.width * range(rng, 1.35, 1.7), 120);
  const accent = palette.blooms[palette.accentIndex]!;
  const greens = greenShades(palette.green); // varied leaf tones for depth
  const focalR = W * range(rng, 0.24, 0.3); // noticeably larger than stem mode

  const nextBloom = bloomCycler(rng, palette);

  interface CHead {
    asset: LoadedAsset;
    x: number;
    y: number;
    r: number;
    primary: string;
  }
  const heads: CHead[] = [
    { asset: pick(rng, lib.heads.large), x: 0, y: 0, r: focalR, primary: accent },
  ];

  const drawn = rangeInt(rng, 6, 9); // stream-stable whether or not overridden
  const count = Math.max(3, Math.min(14, Math.round((opts.mediums ?? drawn) * opts.density)));
  // every head asset is fair game at any scale, so sizes can vary freely
  const headPool = [...lib.heads.large, ...lib.heads.medium, ...lib.heads.small];
  const unused = [...headPool];
  for (let k = 0; k < count; k++) {
    const r = focalR * range(rng, 0.35, 0.85); // some big, some small
    let best: { x: number; y: number; score: number } | null = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      // land tangent to an existing head, then reject any overlap: packed
      // tight but never on top of each other
      const anchor = pick(rng, heads);
      const theta = rng() * Math.PI * 2;
      const d = anchor.r + r + range(rng, 1, 4);
      const x = anchor.x + Math.cos(theta) * d;
      const y = anchor.y + Math.sin(theta) * d;
      if (heads.some((h) => Math.hypot(h.x - x, h.y - y) < h.r + r + 1)) continue;
      const score = Math.hypot(x, y * 1.2); // slight horizontal spread
      if (!best || score < best.score) best = { x, y, score };
    }
    if (!best) continue;
    const avoid = new Set<string>([accent]);
    for (const h of heads) {
      if (Math.hypot(h.x - best.x, h.y - best.y) < h.r + r + 10) avoid.add(h.primary);
    }
    const asset = unused.length
      ? unused.splice(Math.floor(rng() * unused.length), 1)[0]!
      : pick(rng, headPool);
    heads.push({ asset, x: best.x, y: best.y, r, primary: nextBloom(avoid) });
  }

  // fringe leaves: bases tucked behind the cluster edge, pointing outward
  const cx = heads.reduce((a, h) => a + h.x, 0) / heads.length;
  const cy = heads.reduce((a, h) => a + h.y, 0) / heads.length;
  interface CLeaf {
    asset: LoadedAsset;
    bx: number;
    by: number;
    rotation: number;
    scale: number;
    flip: boolean;
    tipX: number;
    tipY: number;
  }
  const leaves: CLeaf[] = [];
  const K = lib.leaves.length ? Math.round(heads.length * range(rng, 1.1, 1.5)) : 0;
  for (let k = 0; k < K; k++) {
    const thetaDeg = (k / K) * 360 + range(rng, -14, 14);
    const th = (thetaDeg * Math.PI) / 180;
    const dx = Math.sin(th);
    const dy = -Math.cos(th);
    let edge = 0;
    for (const h of heads) {
      edge = Math.max(edge, (h.x - cx) * dx + (h.y - cy) * dy + h.r);
    }
    const leafLen = focalR * range(rng, 0.9, 1.3);
    const inset = focalR * range(rng, 0.55, 0.75); // bases buried under the flowers
    const bx = cx + dx * (edge - inset);
    const by = cy + dy * (edge - inset);
    const asset = pick(rng, lib.leaves);
    const flip = dx >= 0 && asset.flip;
    const natural = flip ? -naturalAngle(asset) : naturalAngle(asset);
    const target = thetaDeg + range(rng, -18, 18);
    leaves.push({
      asset,
      bx,
      by,
      rotation: target - natural,
      scale: leafLen / 100,
      flip,
      tipX: bx + dx * leafLen,
      tipY: by + dy * leafLen,
    });
  }

  // markup: leaves behind, heads sorted large-behind-small; every element in
  // its own pb-rot so grow.ts can order blooms and breathe each one
  const lit = opts.literal;
  let u = 0;
  const maxDist = Math.max(...heads.map((h) => Math.hypot(h.x, h.y) + h.r));
  const rot = (base: string, len: number, inner: string) =>
    lit ? `<g>${inner}</g>` : `<g class="pb-rot" data-u="${u++}" data-base="${base}" data-len="${r2(len)}">${inner}</g>`;

  const leavesLayer = leaves
    .map((l) => {
      const inner = instantiate(l.asset, {
        x: l.bx,
        y: l.by,
        scale: l.scale,
        rotation: l.rotation,
        flip: l.flip,
        colours: { primary: pick(rng, greens) },
      }, lit);
      const wrapped = lit
        ? inner
        : `<g class="pb-piece" data-t="1" data-at="${r2(l.bx)},${r2(l.by)}">${inner}</g>`;
      return rot(`${r2(l.bx)},${r2(l.by)}`, range(rng, 1, 8), wrapped);
    })
    .join("");

  const headLayer = [...heads]
    .sort((a, b) => b.r - a.r)
    .map((h) => {
      const others = palette.blooms.filter((b) => b !== h.primary);
      const centre = pick(rng, others);
      const rotation = range(rng, -14, 14);
      const flip = h.asset.flip && rng() < 0.5;
      const scale = h.r / 50;
      const at = attachForCentre(h.asset, { x: h.x, y: h.y }, rotation, scale, flip);
      const inner = instantiate(h.asset, {
        x: at.x,
        y: at.y,
        scale,
        rotation,
        flip,
        colours: {
          primary: h.primary,
          secondary: pick(rng, others.filter((c) => c !== centre).concat(centre)),
          centre,
          accent,
          detail: palette.ground,
        },
      }, lit);
      const wrapped = lit ? inner : `<g class="pb-bloom" data-at="${r2(h.x)},${r2(h.y)}">${inner}</g>`;
      // focal (largest distance score inverted): centre blooms first
      return rot(`${r2(h.x)},${r2(h.y)}`, maxDist - Math.hypot(h.x, h.y) + 40, wrapped);
    })
    .join("");

  const xs = [...heads.map((h) => h.x - h.r), ...heads.map((h) => h.x + h.r), ...leaves.map((l) => l.tipX)];
  const ys = [...heads.map((h) => h.y - h.r), ...heads.map((h) => h.y + h.r), ...leaves.map((l) => l.tipY)];
  const pad = 16;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;

  return {
    markup: `<g>${leavesLayer}</g><g>${headLayer}</g>`,
    headCount: heads.length,
    sprigCount: 0,
    bounds: { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY },
  };
}

/* ---------------------------------------------------------------- wreath
   Heads pack tangentially around a ring whose radius is computed so the
   circle closes exactly. Directional heads point outward, leaves and berry
   clusters dress the gaps, and data-len ordering makes the growth travel
   around the ring flower by flower. */

function generateWreath(
  rng: Rng,
  palette: Palette,
  lib: Library,
  vase: VaseShape,
  opts: ArrangeOptions,
): Arrangement {
  const W = Math.max(vase.width * range(rng, 1.35, 1.7), 120);
  const accent = palette.blooms[palette.accentIndex]!;
  const greens = greenShades(palette.green);
  const focalR = W * range(rng, 0.2, 0.26);
  const nextBloom = bloomCycler(rng, palette);

  const drawn = rangeInt(rng, 10, 13); // stream-stable whether or not overridden
  const base = opts.mediums !== undefined ? opts.mediums * 2.5 : drawn;
  const n = Math.max(6, Math.min(18, Math.round(base * opts.density)));

  // radii first (head 0 is the accent focal), then the ring radius that
  // makes the chain of tangent circles close into a loop
  const radii = [focalR, ...Array.from({ length: n - 1 }, () => focalR * range(rng, 0.45, 0.8))];
  const gaps = radii.map(() => range(rng, 3, 8));
  let span = 0;
  for (let i = 0; i < n; i++) span += radii[i]! + radii[(i + 1) % n]! + gaps[i]!;
  const R = span / (2 * Math.PI);

  interface WHead {
    asset: LoadedAsset;
    x: number;
    y: number;
    r: number;
    theta: number; // radians, 0 = top, clockwise
    primary: string;
  }
  const headPool = [...lib.heads.large, ...lib.heads.medium, ...lib.heads.small];
  const unused = [...headPool];
  const heads: WHead[] = [];
  let theta = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const r = radii[i]!;
    const rr = R * range(rng, 0.97, 1.04);
    const x = Math.sin(theta) * rr;
    const y = -Math.cos(theta) * rr;
    let primary: string;
    if (i === 0) primary = accent;
    else {
      const avoid = new Set<string>([accent, heads[i - 1]!.primary]);
      if (i === n - 1) avoid.add(heads[0]!.primary); // the ring closes
      primary = nextBloom(avoid);
    }
    const asset =
      i === 0
        ? pick(rng, lib.heads.large)
        : unused.length
          ? unused.splice(Math.floor(rng() * unused.length), 1)[0]!
          : pick(rng, headPool);
    heads.push({ asset, x, y, r, theta, primary });
    theta += (radii[i]! + radii[(i + 1) % n]! + gaps[i]!) / R;
  }

  // gap dressing: leaves pointing outward (sometimes inward), berry clusters
  interface GapPiece {
    markup: string;
    bx: number;
    by: number;
    tips: Pt[];
  }
  const gapPieces: GapPiece[] = [];
  const lit = opts.literal;
  for (let i = 0; i < n; i++) {
    const midTheta = heads[i]!.theta + (radii[i]! + gaps[i]! / 2) / R;
    const outwardDeg = (midTheta * 180) / Math.PI;
    const dirX = Math.sin(midTheta);
    const dirY = -Math.cos(midTheta);
    let markup = "";
    const tips: Pt[] = [];
    const baseR = R * range(rng, 0.86, 0.98);
    const bx = dirX * baseR;
    const by = dirY * baseR;

    if (lib.leaves.length) {
      const nLeaves = rangeInt(rng, 1, 2);
      for (let li = 0; li < nLeaves; li++) {
        const asset = pick(rng, lib.leaves);
        const flip = rng() < 0.5 && asset.flip;
        const natural = flip ? -naturalAngle(asset) : naturalAngle(asset);
        const target = outwardDeg + range(rng, -38, 38);
        const scale = (focalR * range(rng, 0.75, 1.05)) / 100;
        markup += instantiate(asset, {
          x: bx,
          y: by,
          scale,
          rotation: target - natural,
          flip,
          colours: { primary: pick(rng, greens) },
        }, lit);
        const tRad = (target * Math.PI) / 180;
        tips.push({ x: bx + Math.sin(tRad) * scale * 100, y: by - Math.cos(tRad) * scale * 100 });
      }
      if (rng() < 0.4) {
        // a smaller leaf reaching into the ring
        const asset = pick(rng, lib.leaves);
        const flip = rng() < 0.5 && asset.flip;
        const natural = flip ? -naturalAngle(asset) : naturalAngle(asset);
        const target = outwardDeg + 180 + range(rng, -25, 25);
        markup += instantiate(asset, {
          x: dirX * R * 0.96,
          y: dirY * R * 0.96,
          scale: (focalR * range(rng, 0.5, 0.7)) / 100,
          rotation: target - natural,
          flip,
          colours: { primary: pick(rng, greens) },
        }, lit);
      }
    }
    if (rng() < 0.35) {
      // berry cluster riding the ring line
      const berryColour = rng() < 0.7 ? accent : pick(rng, palette.blooms);
      const nBerries = rangeInt(rng, 2, 3);
      for (let bi = 0; bi < nBerries; bi++) {
        const a = midTheta + range(rng, -0.06, 0.06);
        const br = R * range(rng, 0.95, 1.06);
        markup += `<circle cx="${r2(Math.sin(a) * br)}" cy="${r2(-Math.cos(a) * br)}" r="${r2(range(rng, 2.5, 4.5))}" fill="${berryColour}"/>`;
      }
    }
    gapPieces.push({ markup, bx, by, tips });
  }

  // markup: gap dressing behind, heads on top; data-len interleaves so the
  // growth travels around the ring: head 0, gap 0, head 1, gap 1, ...
  let u = 0;
  const rot = (basePt: string, len: number, at: Pt | null, inner: string) => {
    if (lit) return `<g>${inner}</g>`;
    const wrapped =
      at === null ? inner : `<g class="pb-piece" data-t="1" data-at="${r2(at.x)},${r2(at.y)}">${inner}</g>`;
    return `<g class="pb-rot" data-u="${u++}" data-base="${basePt}" data-len="${r2(len)}">${wrapped}</g>`;
  };

  const BIG = 1000;
  const gapLayer = gapPieces
    .map((g, i) =>
      g.markup ? rot(`${r2(g.bx)},${r2(g.by)}`, BIG - i * 2 - 1, { x: g.bx, y: g.by }, g.markup) : "")
    .join("");
  const headLayer = heads
    .map((h, i) => ({ h, i }))
    .sort((a, b) => b.h.r - a.h.r)
    .map(({ h, i }) => {
      const others = palette.blooms.filter((b) => b !== h.primary);
      const centre = pick(rng, others);
      const directional = Math.hypot(h.asset.attach[0], h.asset.attach[1]) > 10;
      const rotation = directional
        ? (h.theta * 180) / Math.PI + range(rng, -8, 8)
        : range(rng, -14, 14);
      const flip = h.asset.flip && rng() < 0.5;
      const scale = h.r / 50;
      const at = attachForCentre(h.asset, { x: h.x, y: h.y }, rotation, scale, flip);
      const inner = instantiate(h.asset, {
        x: at.x,
        y: at.y,
        scale,
        rotation,
        flip,
        colours: {
          primary: h.primary,
          secondary: pick(rng, others.filter((c) => c !== centre).concat(centre)),
          centre,
          accent,
          detail: palette.ground,
        },
      }, lit);
      const wrapped = lit ? inner : `<g class="pb-bloom" data-at="${r2(h.x)},${r2(h.y)}">${inner}</g>`;
      return rot(`${r2(h.x)},${r2(h.y)}`, BIG - i * 2, null, wrapped);
    })
    .join("");

  const xs = [
    ...heads.map((h) => h.x - h.r),
    ...heads.map((h) => h.x + h.r),
    ...gapPieces.flatMap((g) => g.tips.map((t) => t.x)),
  ];
  const ys = [
    ...heads.map((h) => h.y - h.r),
    ...heads.map((h) => h.y + h.r),
    ...gapPieces.flatMap((g) => g.tips.map((t) => t.y)),
  ];
  const pad = 16;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;

  return {
    markup: `<g>${gapLayer}</g><g>${headLayer}</g>`,
    headCount: heads.length,
    sprigCount: 0,
    bounds: { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY },
  };
}
