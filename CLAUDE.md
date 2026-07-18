# Paper Bouquet

Generative cut-paper bouquet builder. Read BRIEF.md first; it is the spec.

## Commands

- `npm run dev` — vite dev server on port 4643 (strict). Harness at /tools/harness.html
- `npm run normalise -- <raw.svg> --id <slug> --type head|leaf|sprig --size large|medium|small [--attach x,y|bottom|top|center] [--map "#hex=slot,..."] [--no-flip] [--write]` — asset pipeline. Dry run without `--write`; review the printed colour-to-slot proposal before writing
- `npx tsc --noEmit` — typecheck

## Rules that bite

- The generator reads only `assets/manifest.json`, never the asset directories
- `assets/raw/` is untouched Illustrator exports; the app never loads from it
- Asset contract: viewBox `-50 -50 100 100`, slot-variable fills only (`var(--primary)` etc.), no strokes, flat paths, `data-attach` on the root, under 4 KB
- Radial heads attach at the seed disc centre (stem tucks behind); tulips attach at bbox bottom-centre; leaves attach at the pointed base tip
- Every subpath is normalised to positive winding so overlapping same-slot shapes union under nonzero fill; do not switch merged paths to evenodd unless you actually want cutouts
- No `Math.random` outside `src/rng.ts`. Seeded reproducibility everywhere
- No em-dashes in any user-facing copy
- Asset review: every new or re-normalised asset must be eyeballed in the harness before generator work uses it

## State

- Phase 1 done: 10 assets normalised (5 radial heads, 2 tulips, 3 leaves), all passing in the harness
- Phase 2 done: vase generator (src/vase.ts) with 5 silhouettes and band/pattern grammar, 4 palettes in src/palette.ts. Viewer in src/main.ts has single and contact-sheet modes. Verified good across all silhouettes and all 4 palettes
- Vase rules: ground colour never a band background (only inside patterns, as cutout); adjacent bands differ in background and pattern kind; after two patterned bands the next is forced solid; mouth band leans solid. VaseSpec exposes mouthHalf/height/width for Phase 3
- Phase 3 done: arrangement engine (src/arrange.ts) + manifest loader (src/assets.ts). Verified composed across seeds 1-60 in all 4 palettes via the sheet view
- Arrangement rules: one large focal off-centre (accent colour), 2-4 mediums with min vertical separation H*0.13, <=15% circle-overlap between heads (lens-area formula), larger heads drawn behind smaller, stems single quadratics bowing outward (no S-curves), leaves alternate sides along stems, angular gaps >30 deg get parametric berry sprigs alternating with loose leaves (filler angles clamped, loose leaves pulled toward upright). Stems drawn first, vase last, so bases tuck behind the vase
- Library gaps vs brief: no `small` heads, no sprig assets, no berry-sprig visual reference. Forget-me-not cluster, paddle leaves, and sprig exports were never delivered; flag when more raw exports arrive. Gap-filling currently relies entirely on parametric sprigs + loose leaves
- Phase 4 done: growth + idle sway (src/grow.ts, rAF timeline, no deps). Arrangement markup carries animation structure: pb-rot wrappers per unit (data-u, data-base), pb-stem paths, pb-piece groups (data-t = position along stem, data-at = pop origin), pb-bloom groups; main.ts wraps the vase in pb-vase. Vase fades/rises, stems draw on longest-first via dash offset (easeOutCubic), pieces pop with back-out overshoot when the eased draw-on passes their data-t (inverse-easing precomputed), blooms pop at stem completion. Idle sway = per-unit rotation around the stem base, layered sines, ~1 deg amplitude, ramps in after the last growth event. prefers-reduced-motion: grow() is a no-op, markup is already the final state
- Sway rotates whole units, so a unit's stem/leaves/head live in separate z-layers but share identical pb-rot transforms per frame; don't merge units into single groups or head z-sorting breaks
- Note: rAF does not fire in the hidden preview tab; to verify animation there, shim requestAnimationFrame with setTimeout in preview_eval (see session notes). Real browsers are fine
- Phase 5 done: controls panel (src/ui.ts), static SVG export (src/export.ts), URL state, deployed. All five phases complete
- Deploy: GitHub Pages, NOT Netlify (owner's decision 2026-07-17, supersedes BRIEF.md). Repo https://github.com/thomaspavitte-beep/paper-bouquet, live at https://thomaspavitte-beep.github.io/paper-bouquet/. vite.config.ts uses base "./" and builds to docs/; Pages serves main branch /docs. Deploying = npm run build, commit docs/, push
- Served assets live in public/assets/ (vite copies them into docs/assets/); assets/raw/ holds untouched Illustrator sources and never ships. tools/normalise.ts writes to public/assets/
- Vase and blooms run on separate seeds (vs/bs in the URL) so either can lock while the other rerolls. Export regenerates deterministically in literal mode (instantiate substitutes slot vars, no classes/data attrs). Six palettes. Params: mediums (null = seeded; the seed draw always runs so streams stay stable), density, curviness, sway (live, read per frame via shared GrowOptions object), speed
- window.__pbExport() in the console returns the current export SVG string, for checking without downloading
- Petal-by-petal bloom (2026-07-17): the five radial heads are normalised with --keep-parts (one path per petal, manifest parts: true, svgo mergePaths disabled); tulips remain single-path and keep the whole-head pop. grow.ts petal mode triggers when a pb-bloom's inner group has 3+ shape children: primary-fill parts sort clockwise from the top by bbox-centre angle (parts all within 12 units of centre keep DOM order, which makes layered heads like scallop-burst bloom layer by layer), then non-primary parts (the seed) pop last with a bigger overshoot. Petal transforms are plain scale(s) — asset-local origin is the head centre, so no translate bookkeeping
- normalise.ts re-run flags: --attach-norm x,y feeds the manifest's recorded attach back in output coords; scallop-burst needs --map "#e35621=centre"
- Verifying animation in the hidden preview tab: setTimeout shims get background-throttled to ~1 fps, which fakes simultaneity — pump rAF synchronously with a virtual clock instead (queue callbacks, call them in a loop with vt += 16)
- New assets batch (2026-07-18): head-swoop-bloom + head-windmill (large), head-sunburst + head-bottlebrush (medium), leaf-fern — 15 assets total. Overrides used: swoop-bloom --map "#fe97d1=centre"; sunburst attach 146.99,137.09 (raw circle centre); bottlebrush attach bottom (directional like tulips). Bottle Brush 1 raw is stroke-geometry bristles (fill:none rects) — NOT ingestible by the fill-only contract; kept in assets/raw as reference; ask Thomas to expand/outline strokes in Illustrator if he wants it
- grow.ts petal-mode ordering (2026-07-18): primary parts within 12 units of centre bloom first in DOM order (sunburst disc before rays), off-centre primaries clockwise from top, ALL non-primary parts pop together as one seed moment (prevents windmill's 15 seed dots taking 1.3s)
- Asset toggles (2026-07-18, Thomas's request): flowers/leaves pill sections in the panel, lit = included; state.disabled Set of ids, URL param off= (comma ids, omitted when empty); filteredLib() in main.ts applies it with fallbacks (no larges -> any enabled head; none enabled -> toggles ignored; leaves may be genuinely empty and arrange.ts skips them). Panel is now created AFTER loadLibrary since it lists assets
- Stems toggle / cluster mode (2026-07-17, Thomas's request): stems checkbox in the shape section; off = generateCluster in arrange.ts. Packed posy: heads placed greedily nearest-centre (overlap cap 0.24, nearest-neighbour gap must be <= -r*0.08 so circles interpenetrate; circles overestimate tulip cups so this reads snug, not crowded), fringe leaves point outward with bases inset focalR*0.55-0.75 under the flowers, drawn behind heads. No stems, no vase (vase still generated for sizing). Cluster units are stemless pb-rot wrappers carrying data-len = maxDist - dist so grow's longest-first stagger blooms centre-outward; grow treats missing pb-stem as a 300ms pop unit and tightens stagger to 90ms. Arrangement.bounds drives the export/sheet viewBox in cluster mode. URL param st=0/1
- Full-bleed UI (2026-07-17, Thomas's direction): page background IS the palette ground, no stage box, title only ("Paper Bouquet", no subtitle), settings hidden behind a floating toggle (a dice button also floats outside the panel; Claude's addition so regenerating stays one click, remove if Thomas objects). Bouquet viewBox is fitted per render via svg.getBBox() + 24 padding so it fills the window — measure BEFORE grow() hides pieces. Chrome ink (--ink CSS var) flips by ground luminance (inkFor in main.ts)
