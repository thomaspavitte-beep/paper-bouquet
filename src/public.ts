/* Public page: one bouquet, one action. A generate button (or a click
   anywhere) grows a fresh vase and flower combination. Palette, vase
   silhouette, bloom count, density, and stem curve are all drawn from the
   seed, so every generation is a surprise but still reproducible. The full
   tool lives at studio.html. */

import { mulberry32, range, rangeInt, pick } from "./rng";
import { PALETTES } from "./palette";
import { generateVase } from "./vase";
import { loadLibrary, type Library } from "./assets";
import { generateArrangement } from "./arrange";
import { grow, type GrowHandle } from "./grow";

const SWAY = 2.0;
const SPEED = 0.5;

let lib: Library;
let growHandle: GrowHandle | null = null;

const app = document.getElementById("app")!;
app.innerHTML = `
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: ui-monospace, "SF Mono", Menlo, monospace; transition: background 0.4s ease; cursor: pointer; }
    h1 { font-size: 16px; font-weight: 600; position: fixed; top: 18px; left: 22px; color: var(--ink, #2b2825); z-index: 3; }
    #generate {
      position: fixed; top: 14px; right: 18px; z-index: 4; cursor: pointer;
      font: inherit; font-size: 12px; padding: 5px 11px; border-radius: 6px;
      background: transparent; color: var(--ink, #2b2825); border: 1px solid var(--ink, #2b2825);
      opacity: 0.75;
    }
    #generate:hover { opacity: 1; }
    #studio-link {
      position: fixed; bottom: 14px; right: 18px; z-index: 3; font-size: 11px;
      color: var(--ink, #2b2825); opacity: 0.35; text-decoration: none;
    }
    #studio-link:hover { opacity: 0.8; }
    #stage { position: fixed; inset: 0; }
    #stage svg { width: 100vw; height: 100vh; display: block; }
  </style>
  <h1>Paper Bouquet</h1>
  <button id="generate">generate</button>
  <div id="stage"></div>
  <a id="studio-link" href="studio.html">studio</a>
`;

const stage = document.getElementById("stage")!;

function inkFor(ground: string): string {
  const n = parseInt(ground.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 140 ? "#2b2825" : "#f2e8d5";
}

function generate(seed: number) {
  growHandle?.destroy();
  growHandle = null;

  // everything varies per generation, all drawn from the one seed
  const rng = mulberry32(seed);
  const palette = pick(rng, PALETTES);
  const mediums = rangeInt(rng, 2, 5);
  const density = range(rng, 0.6, 1.4);
  const curviness = range(rng, 0.3, 1.7);

  const vase = generateVase(rng, palette); // silhouette seeded too
  const arr = generateArrangement(rng, palette, lib, {
    mouthHalf: vase.mouthHalf,
    width: vase.width,
    height: vase.height,
  }, { mediums, density, curviness });

  document.body.style.background = palette.ground;
  document.documentElement.style.setProperty("--ink", inkFor(palette.ground));

  stage.innerHTML = `
    <svg viewBox="-165 -345 330 510">
      ${arr.markup}
      <g class="pb-vase">${vase.markup}</g>
    </svg>`;
  const svg = stage.querySelector<SVGSVGElement>("svg")!;
  const bb = svg.getBBox();
  const pad = 24;
  svg.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`);
  growHandle = grow(svg, seed, { speed: SPEED, sway: SWAY });
}

const newSeed = () => Date.now() % 1000000;

loadLibrary().then((l) => {
  lib = l;
  generate(newSeed());
  document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("#studio-link")) return;
    generate(newSeed());
  });
});
