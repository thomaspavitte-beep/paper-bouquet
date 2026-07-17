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
