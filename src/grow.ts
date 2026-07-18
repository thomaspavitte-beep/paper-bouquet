/* Growth animation and idle sway.

   Timeline: vase rises and fades in, stems draw on (staggered, longest
   first) via stroke-dash offset, each piece (leaf, branch, berry) unfolds
   when its stem's draw-on passes the piece's data-t, and each bloom pops
   with slight overshoot as its stem completes. Once everything has grown,
   idle sway ramps in: per-unit layered-sine rotation around the stem base,
   so displacement grows toward the tip and heads tilt a degree or two.

   Respects prefers-reduced-motion: the bouquet renders in its final state
   and nothing moves. */

import { mulberry32 } from "./rng";

export interface GrowOptions {
  speed: number; // 0.5 slow to 2 fast; scales the whole growth timeline
  sway: number; // 0 still to 2; read every frame, so it can change live
}

export interface GrowHandle {
  destroy(): void;
}

interface Piece {
  el: SVGGraphicsElement;
  at: { x: number; y: number };
  triggerAt: number; // ms on the master clock
  dur: number;
  overshoot: number;
}

interface UnitAnim {
  stemEl?: SVGPathElement; // cluster mode units have no stem
  len: number;
  start: number;
  dur: number;
  rotEls: SVGGElement[];
  base: { x: number; y: number };
  pieces: Piece[];
  // sway parameters
  amp: number;
  w1: number;
  w2: number;
  p1: number;
  p2: number;
}

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const invEaseOutCubic = (y: number) => 1 - Math.pow(1 - y, 1 / 3);
const clamp01 = (p: number) => Math.max(0, Math.min(1, p));

/* back-out with a gentle overshoot */
function backOut(p: number, s: number): number {
  const q = p - 1;
  return 1 + (s + 1) * q * q * q + s * q * q;
}

const parsePt = (s: string | null) => {
  const [x, y] = (s ?? "0,0").split(",").map(Number);
  return { x: x ?? 0, y: y ?? 0 };
};

export function grow(svg: SVGSVGElement, seed: number, opts: GrowOptions = { speed: 1, sway: 1 }): GrowHandle {
  const speed = Math.max(0.25, opts.speed);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const vase = svg.querySelector<SVGGElement>(".pb-vase");
  const rotWrappers = [...svg.querySelectorAll<SVGGElement>(".pb-rot")];

  // group wrappers by unit index
  const byUnit = new Map<number, SVGGElement[]>();
  for (const el of rotWrappers) {
    const u = Number(el.dataset.u);
    const list = byUnit.get(u) ?? [];
    list.push(el);
    byUnit.set(u, list);
  }

  if (reduced || byUnit.size === 0) {
    return { destroy() {} }; // markup is already the final state
  }

  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0); // animation's own stream

  const units: UnitAnim[] = [];
  for (const [, els] of [...byUnit.entries()].sort((a, b) => a[0] - b[0])) {
    const stemEl = els.map((e) => e.querySelector<SVGPathElement>(".pb-stem")).find(Boolean) ?? undefined;
    const first = els[0]!;
    // stemless (cluster) units carry their stagger order in data-len
    const len = stemEl ? stemEl.getTotalLength() : Number(first.dataset.len ?? 0);
    units.push({
      stemEl,
      len,
      start: 0,
      dur: (stemEl ? 520 + len * 1.6 : 300) / speed,
      rotEls: els,
      base: parsePt(first.dataset.base ?? null),
      pieces: [],
      amp: 0.55 + rng() * 0.65,
      w1: 0.55 + rng() * 0.35,
      w2: 1.4 + rng() * 0.5,
      p1: rng() * Math.PI * 2,
      p2: rng() * Math.PI * 2,
    });
  }

  // stagger: longest stems first (in cluster mode data-len encodes
  // centre-outward order, and the pace tightens for the bigger unit count)
  const order = [...units].sort((a, b) => b.len - a.len);
  const stemless = units.every((u) => !u.stemEl);
  const VASE_DUR = (stemless ? 0 : 620) / speed;
  order.forEach((u, i) => {
    u.start = ((stemless ? 200 : 380) + i * (stemless ? 90 : 130)) / speed;
  });

  // collect pieces and blooms with trigger times mapped through the easing
  let lastEvent = VASE_DUR;

  /* heads normalised with --keep-parts have one element per petal: petals
     unfold one by one around the flower, then the seed pops on top. Petal
     scale transforms act in asset-local space, where the head centre is the
     origin, so scale(s) alone blooms each petal outward from the centre. */
  const bloomParts = (pieceEl: SVGGElement): SVGGraphicsElement[] | null => {
    const inner = pieceEl.querySelector<SVGGElement>(":scope > g");
    if (!inner) return null;
    const parts = [...inner.children].filter(
      (c): c is SVGGraphicsElement => c instanceof SVGGraphicsElement,
    );
    return parts.length >= 3 ? parts : null;
  };

  units.forEach((u, ui) => {
    for (const el of u.rotEls) {
      for (const pieceEl of el.querySelectorAll<SVGGElement>(".pb-piece, .pb-bloom")) {
        const isBloom = pieceEl.classList.contains("pb-bloom");
        const parts = isBloom ? bloomParts(pieceEl) : null;

        if (isBloom && parts) {
          const withCentre = parts.map((p) => {
            const b = p.getBBox();
            return { p, dist: Math.hypot(b.x + b.width / 2, b.y + b.height / 2), cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
          });
          const primaries = withCentre.filter((w) => w.p.getAttribute("fill") === "var(--primary)");
          // body pieces near the centre come first, then petals unfold
          // clockwise from the top; everything non-primary is the seed and
          // pops together on top at the end
          const core = primaries.filter((w) => w.dist < 12);
          const petals = primaries
            .filter((w) => w.dist >= 12)
            .sort(
              (a, b) =>
                ((Math.atan2(a.cx, -a.cy) + Math.PI * 2) % (Math.PI * 2)) -
                ((Math.atan2(b.cx, -b.cy) + Math.PI * 2) % (Math.PI * 2)),
            );
          const seq = [...core, ...petals];
          const base = u.start + u.dur - 70 / speed;
          const stagger = 85 / speed;
          seq.forEach((w, i) => {
            const piece: Piece = {
              el: w.p,
              at: { x: 0, y: 0 },
              triggerAt: base + i * stagger,
              dur: 300 / speed,
              overshoot: 1.25,
            };
            units[ui]!.pieces.push(piece);
            lastEvent = Math.max(lastEvent, piece.triggerAt + piece.dur);
          });
          const seedAt = base + seq.length * stagger + 50 / speed;
          for (const w of withCentre.filter((x) => x.p.getAttribute("fill") !== "var(--primary)")) {
            const piece: Piece = {
              el: w.p,
              at: { x: 0, y: 0 },
              triggerAt: seedAt,
              dur: 470 / speed,
              overshoot: 1.7,
            };
            units[ui]!.pieces.push(piece);
            lastEvent = Math.max(lastEvent, piece.triggerAt + piece.dur);
          }
          continue;
        }

        const t = isBloom ? 1 : Number(pieceEl.dataset.t ?? 1);
        const triggerAt = isBloom
          ? u.start + u.dur - 70 / speed
          : u.start + u.dur * invEaseOutCubic(clamp01(t));
        const piece: Piece = {
          el: pieceEl,
          at: parsePt(pieceEl.dataset.at ?? null),
          triggerAt,
          dur: (isBloom ? 470 : 360) / speed,
          overshoot: isBloom ? 1.4 : 1.1,
        };
        units[ui]!.pieces.push(piece);
        lastEvent = Math.max(lastEvent, triggerAt + piece.dur);
      }
    }
    lastEvent = Math.max(lastEvent, u.start + u.dur);
  });

  // initial state, set synchronously before first paint
  if (vase) vase.setAttribute("opacity", "0");
  for (const u of units) {
    u.stemEl?.setAttribute("stroke-dasharray", String(u.len));
    u.stemEl?.setAttribute("stroke-dashoffset", String(u.len));
    for (const p of u.pieces) {
      p.el.setAttribute("transform", `translate(${p.at.x} ${p.at.y}) scale(0.001) translate(${-p.at.x} ${-p.at.y})`);
    }
  }

  let raf = 0;
  let t0 = -1;
  const SWAY_RAMP = 1800;

  const frame = (now: number) => {
    if (t0 < 0) t0 = now;
    const t = now - t0;

    if (vase) {
      const p = clamp01(t / VASE_DUR);
      const e = easeOutCubic(p);
      vase.setAttribute("opacity", String(Math.round(e * 100) / 100));
      vase.setAttribute("transform", `translate(0 ${(1 - e) * 14})`);
    }

    for (const u of units) {
      const p = clamp01((t - u.start) / u.dur);
      const e = easeOutCubic(p);
      u.stemEl?.setAttribute("stroke-dashoffset", String(u.len * (1 - e)));
      for (const piece of u.pieces) {
        const pp = clamp01((t - piece.triggerAt) / piece.dur);
        const s = pp <= 0 ? 0.001 : Math.max(0.001, backOut(pp, piece.overshoot));
        piece.el.setAttribute("transform", `translate(${piece.at.x} ${piece.at.y}) scale(${Math.round(s * 1000) / 1000}) translate(${-piece.at.x} ${-piece.at.y})`);
      }
    }

    // idle sway, ramping in after the last growth event; amount read live
    if (t > lastEvent) {
      const ramp = clamp01((t - lastEvent) / SWAY_RAMP) * Math.max(0, opts.sway);
      const ts = t / 1000;
      for (const u of units) {
        const a = ramp * u.amp * (0.72 * Math.sin(u.w1 * ts + u.p1) + 0.28 * Math.sin(u.w2 * ts + u.p2));
        const rot = `rotate(${Math.round(a * 100) / 100} ${u.base.x} ${u.base.y})`;
        for (const el of u.rotEls) el.setAttribute("transform", rot);
      }
    }

    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}
