/* Vase generator: parametric silhouette plus banded fill patterns.
   Local coordinates: x symmetric about 0, y = 0 at the mouth, y = height at
   the base. The caller positions the group. */

import { type Rng, range, rangeInt, pick, weighted } from "./rng";
import type { Palette } from "./palette";

export const SILHOUETTES = ["capsule", "trapezoid", "flared", "urn", "cylinder"] as const;
export type Silhouette = (typeof SILHOUETTES)[number];

export interface VaseSpec {
  markup: string; // self-contained <g>, includes its clipPath def
  silhouette: Silhouette;
  width: number; // max outer width
  height: number;
  mouthHalf: number; // half-width of the opening stems emerge from
  colours: string[]; // colours actually used, for debugging
}

interface Outline {
  d: string;
  maxHalf: number;
  mouthHalf: number;
  height: number;
}

const f = (n: number) => Math.round(n * 100) / 100;

/* Mirror a descending right-side profile (mouth to base) into a closed
   symmetric path. Each curve runs from the previous point to (x, y) with
   control points (c1x, c1y) (c2x, c2y). */
interface Curve {
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  x: number;
  y: number;
}

function mirrorClosed(mouthX: number, curves: Curve[]): string {
  let d = `M${f(-mouthX)},0L${f(mouthX)},0`;
  for (const c of curves) {
    d += `C${f(c.c1x)},${f(c.c1y)} ${f(c.c2x)},${f(c.c2y)} ${f(c.x)},${f(c.y)}`;
  }
  const last = curves[curves.length - 1];
  if (!last) throw new Error("mirrorClosed needs at least one curve");
  d += `L${f(-last.x)},${f(last.y)}`;
  // ascend the left side: reversed curves, x negated, control points swapped
  const pts = [{ x: mouthX, y: 0 }, ...curves.map((c) => ({ x: c.x, y: c.y }))];
  for (let i = curves.length - 1; i >= 0; i--) {
    const c = curves[i]!;
    const to = pts[i]!;
    d += `C${f(-c.c2x)},${f(c.c2y)} ${f(-c.c1x)},${f(c.c1y)} ${f(-to.x)},${f(to.y)}`;
  }
  return d + "Z";
}

// ---------------------------------------------------------------- silhouettes

function capsule(rng: Rng): Outline {
  const w2 = range(rng, 27, 40);
  const height = Math.min(140, Math.max(90, w2 * range(rng, 2.4, 3.4)));
  const rTop = w2 * range(rng, 0.18, 0.38);
  const rBot = w2 * range(rng, 0.6, 0.95);
  const d =
    `M${f(-w2 + rTop)},0L${f(w2 - rTop)},0Q${f(w2)},0 ${f(w2)},${f(rTop)}` +
    `L${f(w2)},${f(height - rBot)}Q${f(w2)},${f(height)} ${f(w2 - rBot)},${f(height)}` +
    `L${f(-w2 + rBot)},${f(height)}Q${f(-w2)},${f(height)} ${f(-w2)},${f(height - rBot)}` +
    `L${f(-w2)},${f(rTop)}Q${f(-w2)},0 ${f(-w2 + rTop)},0Z`;
  return { d, maxHalf: w2, mouthHalf: w2 - rTop, height };
}

function trapezoid(rng: Rng): Outline {
  const mouthHalf = range(rng, 33, 46);
  const baseHalf = mouthHalf * range(rng, 0.55, 0.8);
  const height = range(rng, 85, 125);
  const d = `M${f(-mouthHalf)},0L${f(mouthHalf)},0L${f(baseHalf)},${f(height)}L${f(-baseHalf)},${f(height)}Z`;
  return { d, maxHalf: mouthHalf, mouthHalf, height };
}

function flared(rng: Rng): Outline {
  const mouthHalf = range(rng, 36, 50);
  const shoulder = mouthHalf * range(rng, 0.6, 0.74);
  const baseHalf = shoulder * range(rng, 0.78, 0.95);
  const height = range(rng, 85, 125);
  const fy = height * range(rng, 0.18, 0.28);
  const d =
    `M${f(-mouthHalf)},0L${f(mouthHalf)},0` +
    `C${f(mouthHalf - (mouthHalf - shoulder) * 0.25)},${f(fy * 0.45)} ${f(shoulder)},${f(fy * 0.55)} ${f(shoulder)},${f(fy)}` +
    `L${f(baseHalf)},${f(height)}L${f(-baseHalf)},${f(height)}L${f(-shoulder)},${f(fy)}` +
    `C${f(-shoulder)},${f(fy * 0.55)} ${f(-(mouthHalf - (mouthHalf - shoulder) * 0.25))},${f(fy * 0.45)} ${f(-mouthHalf)},0Z`;
  return { d, maxHalf: mouthHalf, mouthHalf, height };
}

function urn(rng: Rng): Outline {
  const m = range(rng, 22, 30);
  const height = range(rng, 95, 135);
  const neckY = height * 0.13;
  const neck = m * range(rng, 0.78, 0.92);
  const bellyY = height * range(rng, 0.42, 0.52);
  const belly = m * range(rng, 1.35, 1.7);
  const waistY = height * 0.82;
  const waist = belly * range(rng, 0.38, 0.52);
  const foot = waist * range(rng, 1.25, 1.5);
  const curves: Curve[] = [
    { c1x: m, c1y: neckY * 0.5, c2x: neck, c2y: neckY * 0.5, x: neck, y: neckY },
    {
      c1x: neck, c1y: neckY + (bellyY - neckY) * 0.45,
      c2x: belly, c2y: bellyY - (bellyY - neckY) * 0.4,
      x: belly, y: bellyY,
    },
    {
      c1x: belly, c1y: bellyY + (waistY - bellyY) * 0.55,
      c2x: waist, c2y: waistY - (waistY - bellyY) * 0.2,
      x: waist, y: waistY,
    },
    {
      c1x: waist, c1y: waistY + (height - waistY) * 0.45,
      c2x: foot, c2y: height - (height - waistY) * 0.3,
      x: foot, y: height,
    },
  ];
  return { d: mirrorClosed(m, curves), maxHalf: belly, mouthHalf: m * 0.92, height };
}

function cylinder(rng: Rng): Outline {
  const w2 = range(rng, 25, 37);
  const lipHalf = w2 * range(rng, 1.12, 1.28);
  const lipH = range(rng, 7, 13);
  const height = range(rng, 90, 130);
  const d =
    `M${f(-lipHalf)},0L${f(lipHalf)},0L${f(lipHalf)},${f(lipH)}L${f(w2)},${f(lipH)}` +
    `L${f(w2)},${f(height)}L${f(-w2)},${f(height)}L${f(-w2)},${f(lipH)}L${f(-lipHalf)},${f(lipH)}Z`;
  return { d, maxHalf: lipHalf, mouthHalf: w2 * 0.95, height };
}

const OUTLINES: Record<Silhouette, (rng: Rng) => Outline> = {
  capsule,
  trapezoid,
  flared,
  urn,
  cylinder,
};

// ---------------------------------------------------------------- patterns

type PatternKind = "solid" | "stripes" | "checker" | "blocks";

/* symmetric stripe x-positions: a centre stripe (or centred gap) mirrored outward */
function stripeRects(rng: Rng, maxHalf: number, y0: number, h: number, fill: string): string {
  const irregular = rng() < 0.4;
  const baseW = range(rng, 5, 11);
  const gap = baseW * range(rng, 0.8, 1.6);
  let out = "";
  const rect = (x: number, w: number) =>
    `<rect x="${f(x)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}" fill="${fill}"/>`;
  const centred = rng() < 0.5;
  let x = centred ? -((irregular ? range(rng, 4, 14) : baseW) / 2) : gap / 2;
  if (centred) {
    const w = -2 * x;
    out += rect(x, w);
    x = -x + gap;
  }
  while (x < maxHalf) {
    const w = irregular ? range(rng, 4, 14) : baseW;
    out += rect(x, Math.min(w, maxHalf - x)) + rect(-Math.min(x + w, maxHalf), Math.min(w, maxHalf - x));
    x += w + (irregular ? range(rng, 4, 12) : gap);
  }
  return out;
}

function checkerRects(rng: Rng, maxHalf: number, y0: number, h: number, fill: string): string {
  const c = range(rng, 6, 11);
  let out = "";
  const rows = Math.ceil(h / c);
  const cols = Math.ceil(maxHalf / c);
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * c;
    const ch = Math.min(c, y0 + h - y);
    for (let k = -cols; k <= cols; k++) {
      if ((Math.abs(k) + r) % 2 !== 0) continue;
      out += `<rect x="${f(k * c - c / 2)}" y="${f(y)}" width="${f(c)}" height="${f(ch)}" fill="${fill}"/>`;
    }
  }
  return out;
}

function blockRects(rng: Rng, maxHalf: number, y0: number, h: number, fill: string): string {
  const rows = h >= 30 ? 3 : 2;
  const rowH = h / rows;
  const bw = range(rng, 10, 18);
  const g = bw * range(rng, 0.35, 0.7);
  const period = bw + g;
  let out = "";
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * rowH + rowH * 0.14;
    const bh = rowH * 0.72;
    const offset = (r % 2) * (period / 2);
    for (let x = -maxHalf - period + offset; x < maxHalf + period; x += period) {
      out += `<rect x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(bh)}" fill="${fill}"/>`;
    }
  }
  return out;
}

// ---------------------------------------------------------------- generator

export function generateVase(
  rng: Rng,
  palette: Palette,
  forced?: Silhouette,
  idSuffix = "v",
): VaseSpec {
  const silhouette = forced ?? pick(rng, SILHOUETTES);
  const outline = OUTLINES[silhouette](rng);
  const { height, maxHalf } = outline;

  // colour pool: 4 to 6 from the palette. Ground is allowed inside patterns
  // (reads as cutout) but never as a band background, where it would dissolve
  // the silhouette into the page.
  const candidates = [...palette.blooms, palette.green, palette.ground];
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  const pool = candidates.slice(0, rangeInt(rng, 4, Math.min(6, candidates.length)));
  const bgPool = pool.filter((c) => c !== palette.ground);

  // band heights: seeded partition with a minimum height
  const n = Math.max(3, Math.min(6, Math.round(height / range(rng, 22, 34))));
  const weights = Array.from({ length: n }, () => range(rng, 0.55, 1.5));
  const total = weights.reduce((a, b) => a + b, 0);
  const heights = weights.map((w) => (w / total) * height);

  const used = new Set<string>();
  let body = "";
  let y = 0;
  let prevBg = "";
  let prevKind: PatternKind | "" = "";
  let busyRun = 0;

  for (let i = 0; i < n; i++) {
    const h = heights[i]!;
    const bg = pick(rng, bgPool.filter((c) => c !== prevBg));
    used.add(bg);

    // subtlety first: the mouth band leans quiet, and two busy bands in a row
    // earn a solid one
    const options: { value: PatternKind; weight: number }[] = [
      { value: "solid", weight: i === 0 ? 5 : 3 },
    ];
    if (h >= 9) options.push({ value: "stripes", weight: 2.5 });
    if (h >= 16) options.push({ value: "checker", weight: 1.6 });
    if (h >= 18) options.push({ value: "blocks", weight: 1.6 });
    let kind = weighted(rng, options);
    if ((kind === prevKind && kind !== "solid") || busyRun >= 2) kind = "solid";
    busyRun = kind === "solid" ? 0 : busyRun + 1;

    // small overlap kills antialiasing seams between bands
    body += `<rect x="${f(-maxHalf - 1)}" y="${f(y - 0.3)}" width="${f(maxHalf * 2 + 2)}" height="${f(h + 0.6)}" fill="${bg}"/>`;

    if (kind !== "solid") {
      const fg = pick(rng, pool.filter((c) => c !== bg));
      used.add(fg);
      const draw = kind === "stripes" ? stripeRects : kind === "checker" ? checkerRects : blockRects;
      body += draw(rng, maxHalf + 1, y, h, fg);
    }

    prevBg = bg;
    prevKind = kind;
    y += h;
  }

  const clipId = `vase-clip-${idSuffix}`;
  const markup =
    `<g>` +
    `<defs><clipPath id="${clipId}"><path d="${outline.d}"/></clipPath></defs>` +
    `<g clip-path="url(#${clipId})">${body}</g>` +
    `</g>`;

  return {
    markup,
    silhouette,
    width: maxHalf * 2,
    height,
    mouthHalf: outline.mouthHalf,
    colours: [...used],
  };
}
