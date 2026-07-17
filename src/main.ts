/* Paper Bouquet: stage plus controls panel. Vase and blooms run on separate
   seeds so either can be locked while the other regenerates. Seed and
   parameters live in the query string for shareable results. */

import { mulberry32 } from "./rng";
import { PALETTES } from "./palette";
import { generateVase, SILHOUETTES, type Silhouette } from "./vase";
import { loadLibrary, type Library } from "./assets";
import { generateArrangement } from "./arrange";
import { grow, type GrowHandle, type GrowOptions } from "./grow";
import { createPanel, type PanelState } from "./ui";
import { downloadSvg, exportSvg } from "./export";

interface AppState extends PanelState {
  vaseSeed: number;
  bloomSeed: number;
}

const state: AppState = {
  seed: 1,
  vaseSeed: 1,
  bloomSeed: 1,
  lockVase: false,
  lockBlooms: false,
  paletteIndex: 0,
  silhouette: "auto",
  mediums: null,
  density: 1,
  curviness: 1,
  sway: 1,
  speed: 1,
  view: "bouquet",
};

// grow reads sway from this object every frame, so the slider works live
const liveOpts: GrowOptions = { speed: 1, sway: 1 };

let lib: Library;
let growHandle: GrowHandle | null = null;

// ---------------------------------------------------------------- URL state

function readURL() {
  const q = new URLSearchParams(location.search);
  const num = (k: string, fallback: number) => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && q.has(k) ? v : fallback;
  };
  state.vaseSeed = Math.trunc(num("vs", 1)) || 1;
  state.bloomSeed = Math.trunc(num("bs", 1)) || 1;
  state.seed = state.bloomSeed;
  const pal = PALETTES.findIndex((p) => p.name === q.get("pal"));
  if (pal >= 0) state.paletteIndex = pal;
  const sil = q.get("vase");
  if (sil && (SILHOUETTES as readonly string[]).includes(sil)) state.silhouette = sil as Silhouette;
  const md = q.get("md");
  if (md && md !== "auto" && Number(md) >= 2) state.mediums = Math.min(5, Math.trunc(Number(md)));
  state.density = Math.min(1.5, Math.max(0.5, num("dn", 1)));
  state.curviness = Math.min(2, Math.max(0, num("cv", 1)));
  state.sway = Math.min(2, Math.max(0, num("sw", 1)));
  state.speed = Math.min(2, Math.max(0.5, num("sp", 1)));
}

function writeURL() {
  const q = new URLSearchParams({
    vs: String(state.vaseSeed),
    bs: String(state.bloomSeed),
    pal: PALETTES[state.paletteIndex]!.name,
    vase: state.silhouette,
    md: state.mediums === null ? "auto" : String(state.mediums),
    dn: String(state.density),
    cv: String(state.curviness),
    sw: String(state.sway),
    sp: String(state.speed),
  });
  history.replaceState(null, "", `${location.pathname}?${q}`);
}

// ---------------------------------------------------------------- rendering

const app = document.getElementById("app")!;
app.innerHTML = `
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: ui-monospace, "SF Mono", Menlo, monospace; background: #1e1c1a; color: #e8e0d2; }
    #app { display: flex; flex-direction: column; min-height: 100vh; }
    header { padding: 16px 24px 10px; }
    h1 { font-size: 16px; font-weight: 600; }
    .sub { font-size: 12px; opacity: 0.6; margin-top: 2px; }
    .layout { display: flex; gap: 18px; padding: 0 24px 24px; align-items: flex-start; flex: 1; }
    #stage { flex: 1; display: flex; justify-content: center; }
    #stage svg { border-radius: 12px; display: block; }
    #panel { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; }
    .section .heading { font-size: 11px; opacity: 0.55; margin-bottom: 6px; }
    .row { display: flex; gap: 6px; align-items: center; }
    .row.checks { margin-top: 6px; gap: 12px; }
    .row.checks label { font-size: 12px; display: flex; gap: 5px; align-items: center; cursor: pointer; }
    .pills { display: flex; flex-wrap: wrap; gap: 5px; }
    button {
      font: inherit; font-size: 12px; padding: 5px 10px; cursor: pointer;
      border: 1px solid #4a453e; border-radius: 6px; background: #2b2825; color: #e8e0d2;
    }
    button.active { background: #e8e0d2; color: #1e1c1a; border-color: #e8e0d2; }
    button.wide { width: 100%; padding: 8px; }
    input[type="number"] {
      font: inherit; font-size: 12px; width: 84px; padding: 5px 8px;
      border: 1px solid #4a453e; border-radius: 6px; background: #2b2825; color: #e8e0d2;
    }
    .slider-row { display: grid; grid-template-columns: 52px 1fr 34px; gap: 8px; align-items: center; margin: 5px 0; font-size: 12px; }
    .slider-row em { font-style: normal; opacity: 0.65; font-size: 11px; text-align: right; }
    input[type="range"] { accent-color: #e8e0d2; width: 100%; }
    .sheet { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; width: 100%; }
    .sheet .cell { position: relative; }
    .sheet svg { width: 100%; height: auto; }
    .sheet .tag { position: absolute; top: 8px; left: 10px; font-size: 10px; opacity: 0.65; color: #1e1c1a; mix-blend-mode: multiply; }
  </style>
  <header>
    <h1>Paper Bouquet</h1>
    <div class="sub">A generative bouquet in cut paper. Every seed grows a new one.</div>
  </header>
  <div class="layout">
    <div id="stage"></div>
    <div id="panel"></div>
  </div>
`;

const stage = document.getElementById("stage")!;

function bouquetSvg(vaseSeed: number, bloomSeed: number, showTag: boolean): string {
  const palette = PALETTES[state.paletteIndex]!;
  const forced = state.silhouette === "auto" ? undefined : state.silhouette;
  const vase = generateVase(mulberry32(vaseSeed), palette, forced, `s${vaseSeed}-${bloomSeed}`);
  const arr = generateArrangement(mulberry32(bloomSeed), palette, lib, {
    mouthHalf: vase.mouthHalf,
    width: vase.width,
    height: vase.height,
  }, {
    mediums: state.mediums ?? undefined,
    density: state.density,
    curviness: state.curviness,
  });
  const tag = showTag ? `<div class="tag">${bloomSeed}</div>` : "";
  return `
    <div class="cell">${tag}
      <svg viewBox="-165 -345 330 510" ${state.view === "bouquet" ? `width="430"` : ""} style="background:${palette.ground}">
        ${arr.markup}
        <g class="pb-vase">${vase.markup}</g>
      </svg>
    </div>`;
}

function vaseSvg(seed: number, showTag: boolean): string {
  const palette = PALETTES[state.paletteIndex]!;
  const forced = state.silhouette === "auto" ? undefined : state.silhouette;
  const vase = generateVase(mulberry32(seed), palette, forced, `v${seed}`);
  const tag = showTag ? `<div class="tag">${seed} ${vase.silhouette}</div>` : "";
  return `
    <div class="cell">${tag}
      <svg viewBox="-110 -12 220 174" style="background:${palette.ground}">
        <g transform="translate(0 ${150 - vase.height})">${vase.markup}</g>
      </svg>
    </div>`;
}

function render(animate: boolean) {
  growHandle?.destroy();
  growHandle = null;
  liveOpts.speed = state.speed;
  liveOpts.sway = state.sway;
  if (state.view === "bouquet") {
    stage.innerHTML = bouquetSvg(state.vaseSeed, state.bloomSeed, false);
    if (animate) {
      const svg = stage.querySelector<SVGSVGElement>("svg");
      if (svg) growHandle = grow(svg, state.bloomSeed, liveOpts);
    }
  } else if (state.view === "sheet") {
    let cells = "";
    for (let i = 0; i < 12; i++) cells += bouquetSvg(state.vaseSeed + i, state.bloomSeed + i, true);
    stage.innerHTML = `<div class="sheet">${cells}</div>`;
  } else {
    let cells = "";
    for (let i = 0; i < 12; i++) cells += vaseSvg(state.vaseSeed + i, true);
    stage.innerHTML = `<div class="sheet">${cells}</div>`;
  }
  writeURL();
  panel.sync();
}

const panel = createPanel(document.getElementById("panel")!, state, {
  onDice() {
    if (!state.lockVase) state.vaseSeed = state.seed;
    if (!state.lockBlooms) state.bloomSeed = state.seed;
    render(true);
  },
  onReplay() {
    if (state.view !== "bouquet") state.view = "bouquet";
    render(true);
  },
  onExport() {
    downloadSvg(lib, {
      vaseSeed: state.vaseSeed,
      bloomSeed: state.bloomSeed,
      paletteIndex: state.paletteIndex,
      silhouette: state.silhouette === "auto" ? undefined : state.silhouette,
      mediums: state.mediums ?? undefined,
      density: state.density,
      curviness: state.curviness,
    });
  },
  onChange(animate) {
    render(animate);
  },
  onSwayLive() {
    liveOpts.sway = state.sway;
    writeURL();
  },
});

readURL();
loadLibrary().then((l) => {
  lib = l;
  render(true);
  // console convenience for checking export output without downloading
  (window as unknown as Record<string, unknown>).__pbExport = () =>
    exportSvg(lib, {
      vaseSeed: state.vaseSeed,
      bloomSeed: state.bloomSeed,
      paletteIndex: state.paletteIndex,
      silhouette: state.silhouette === "auto" ? undefined : state.silhouette,
      mediums: state.mediums ?? undefined,
      density: state.density,
      curviness: state.curviness,
    });
});
