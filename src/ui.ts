/* Controls panel. main.ts owns the state; this module builds the DOM and
   reports interactions back through the callbacks. */

import { PALETTES } from "./palette";
import { SILHOUETTES, type Silhouette } from "./vase";

export interface PanelState {
  seed: number;
  lockVase: boolean;
  lockBlooms: boolean;
  paletteIndex: number;
  silhouette: Silhouette | "auto";
  mediums: number | null; // null = seeded
  density: number;
  curviness: number;
  stems: boolean; // off = packed posy, no stems or vase
  disabled: Set<string>; // asset ids excluded from generation
  sway: number;
  speed: number;
  view: "bouquet" | "sheet" | "vases";
}

export interface PanelAsset {
  id: string;
  label: string;
  kind: "head" | "leaf";
}

export interface PanelCallbacks {
  onDice(): void;
  onReplay(): void;
  onExport(): void;
  onChange(animate: boolean): void; // regenerate; animate only for seed-level changes
  onSwayLive(): void; // sway slider moves are applied live, no regeneration
}

export function createPanel(
  root: HTMLElement,
  state: PanelState,
  assets: PanelAsset[],
  cb: PanelCallbacks,
): { sync(): void } {
  root.innerHTML = `
    <div class="section">
      <div class="heading">seed</div>
      <div class="row">
        <input type="number" id="seed" value="${state.seed}">
        <button id="dice" title="new seed for everything not locked">dice</button>
        <button id="replay" title="replay the growth">replay</button>
      </div>
      <div class="row checks">
        <label><input type="checkbox" id="lockVase"> lock vase</label>
        <label><input type="checkbox" id="lockBlooms"> lock blooms</label>
      </div>
    </div>
    <div class="section"><div class="heading">palette</div><div class="pills" id="palettes"></div></div>
    <div class="section"><div class="heading">vase</div><div class="pills" id="silhouettes"></div></div>
    <div class="section">
      <div class="heading">shape</div>
      <div class="row checks" style="margin: 0 0 8px">
        <label><input type="checkbox" id="stems" checked> stems</label>
      </div>
      <div class="slider-row"><span>blooms</span><input type="range" id="mediums" min="1" max="5" step="1" value="1"><em id="mediums-val">auto</em></div>
      <div class="slider-row"><span>density</span><input type="range" id="density" min="0.5" max="1.5" step="0.05" value="${state.density}"><em id="density-val"></em></div>
      <div class="slider-row"><span>curve</span><input type="range" id="curviness" min="0" max="2" step="0.1" value="${state.curviness}"><em id="curviness-val"></em></div>
    </div>
    <div class="section">
      <div class="heading">motion</div>
      <div class="slider-row"><span>sway</span><input type="range" id="sway" min="0" max="2" step="0.1" value="${state.sway}"><em id="sway-val"></em></div>
      <div class="slider-row"><span>speed</span><input type="range" id="speed" min="0.5" max="2" step="0.1" value="${state.speed}"><em id="speed-val"></em></div>
    </div>
    <div class="section">
      <div class="heading">flowers</div><div class="pills" id="asset-heads"></div>
      <div class="heading" style="margin-top: 8px">leaves</div><div class="pills" id="asset-leaves"></div>
    </div>
    <div class="section"><div class="heading">view</div><div class="pills" id="views"></div></div>
    <div class="section"><button id="export" class="wide">export svg</button></div>
  `;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const seedInput = $<HTMLInputElement>("seed");

  const pills = <T extends string>(id: string, items: readonly T[], get: () => T, set: (v: T) => void) => {
    const el = $(id);
    for (const item of items) {
      const b = document.createElement("button");
      b.textContent = item;
      b.dataset.value = item;
      b.addEventListener("click", () => {
        set(item);
        cb.onChange(false);
      });
      el.appendChild(b);
    }
    return () => {
      el.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.value === get()));
    };
  };

  // asset toggles: lit pill = included in generation
  const assetPills = (containerId: string, kind: "head" | "leaf") => {
    const el = $(containerId);
    for (const a of assets.filter((x) => x.kind === kind)) {
      const b = document.createElement("button");
      b.textContent = a.label;
      b.dataset.id = a.id;
      b.addEventListener("click", () => {
        if (state.disabled.has(a.id)) state.disabled.delete(a.id);
        else state.disabled.add(a.id);
        cb.onChange(false);
      });
      el.appendChild(b);
    }
    return () => {
      el.querySelectorAll("button").forEach((b) =>
        b.classList.toggle("active", !state.disabled.has(b.dataset.id!)),
      );
    };
  };

  const syncFns = [
    assetPills("asset-heads", "head"),
    assetPills("asset-leaves", "leaf"),
    pills("palettes", PALETTES.map((p) => p.name), () => PALETTES[state.paletteIndex]!.name, (name) => {
      state.paletteIndex = PALETTES.findIndex((p) => p.name === name);
    }),
    pills("silhouettes", ["auto", ...SILHOUETTES], () => state.silhouette, (s) => {
      state.silhouette = s;
    }),
    pills("views", ["bouquet", "sheet", "vases"] as const, () => state.view, (v) => {
      state.view = v;
    }),
  ];

  seedInput.addEventListener("change", () => {
    state.seed = Math.trunc(Number(seedInput.value)) || 1;
    cb.onDice();
  });
  $("dice").addEventListener("click", () => {
    state.seed = Date.now() % 1000000; // seeded PRNG everywhere else; the dice itself may be arbitrary
    cb.onDice();
  });
  $("replay").addEventListener("click", cb.onReplay);
  $("export").addEventListener("click", cb.onExport);

  $<HTMLInputElement>("lockVase").addEventListener("change", (e) => {
    state.lockVase = (e.target as HTMLInputElement).checked;
  });
  $<HTMLInputElement>("lockBlooms").addEventListener("change", (e) => {
    state.lockBlooms = (e.target as HTMLInputElement).checked;
  });
  $<HTMLInputElement>("stems").addEventListener("change", (e) => {
    state.stems = (e.target as HTMLInputElement).checked;
    cb.onChange(true); // mode change deserves a fresh growth
  });

  const slider = (id: string, apply: (v: number) => void, live = false) => {
    const el = $<HTMLInputElement>(id);
    el.addEventListener(live ? "input" : "change", () => {
      apply(Number(el.value));
      if (live) {
        sync(); // keep the readout fresh; live sliders regenerate nothing
        cb.onSwayLive();
      } else {
        cb.onChange(false);
      }
    });
  };
  slider("mediums", (v) => {
    state.mediums = v <= 1 ? null : Math.round(v);
  });
  slider("density", (v) => {
    state.density = v;
  });
  slider("curviness", (v) => {
    state.curviness = v;
  });
  slider("sway", (v) => {
    state.sway = v;
  }, true);
  slider("speed", (v) => {
    state.speed = v;
  });

  const sync = () => {
    for (const fn of syncFns) fn();
    seedInput.value = String(state.seed);
    $<HTMLInputElement>("lockVase").checked = state.lockVase;
    $<HTMLInputElement>("lockBlooms").checked = state.lockBlooms;
    $<HTMLInputElement>("stems").checked = state.stems;
    $<HTMLInputElement>("mediums").value = String(state.mediums ?? 1);
    $("mediums-val").textContent = state.mediums === null ? "auto" : String(state.mediums);
    $<HTMLInputElement>("density").value = String(state.density);
    $("density-val").textContent = state.density.toFixed(2);
    $<HTMLInputElement>("curviness").value = String(state.curviness);
    $("curviness-val").textContent = state.curviness.toFixed(1);
    $<HTMLInputElement>("sway").value = String(state.sway);
    $("sway-val").textContent = state.sway.toFixed(1);
    $<HTMLInputElement>("speed").value = String(state.speed);
    $("speed-val").textContent = state.speed.toFixed(1);
  };
  return { sync };
}
