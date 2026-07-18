/* Static SVG export: regenerates the bouquet deterministically in literal
   mode (real colours substituted for slot variables, no animation hooks)
   and wraps it as a standalone document suitable for print at any size. */

import { mulberry32 } from "./rng";
import { PALETTES } from "./palette";
import { generateVase, type Silhouette } from "./vase";
import { generateArrangement } from "./arrange";
import type { Library } from "./assets";

export interface BouquetParams {
  vaseSeed: number;
  bloomSeed: number;
  paletteIndex: number;
  silhouette?: Silhouette; // undefined = seeded
  mediums?: number; // undefined = seeded
  density: number;
  curviness: number;
  stems: boolean;
}

const VIEW = { x: -165, y: -345, w: 330, h: 510 };

export function exportSvg(lib: Library, p: BouquetParams): string {
  const palette = PALETTES[p.paletteIndex]!;
  const vase = generateVase(mulberry32(p.vaseSeed), palette, p.silhouette, "x");
  const arr = generateArrangement(mulberry32(p.bloomSeed), palette, lib, {
    mouthHalf: vase.mouthHalf,
    width: vase.width,
    height: vase.height,
  }, { mediums: p.mediums, density: p.density, curviness: p.curviness, stems: p.stems, literal: true });

  const view = p.stems ? VIEW : arr.bounds ? { x: arr.bounds.x, y: arr.bounds.y, w: arr.bounds.w, h: arr.bounds.h } : VIEW;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" width="${Math.round(view.w * 2)}" height="${Math.round(view.h * 2)}">\n` +
    `<title>Paper Bouquet</title>\n` +
    `<desc>Paper Bouquet, vase seed ${p.vaseSeed}, bloom seed ${p.bloomSeed}, palette ${palette.name}.</desc>\n` +
    `<rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="${palette.ground}"/>\n` +
    arr.markup +
    (p.stems ? `<g>${vase.markup}</g>\n` : "") +
    `</svg>`
  );
}

export function downloadSvg(lib: Library, p: BouquetParams): void {
  const svg = exportSvg(lib, p);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paper-bouquet-v${p.vaseSeed}-b${p.bloomSeed}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
