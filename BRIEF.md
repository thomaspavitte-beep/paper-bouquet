# Paper Bouquet

A generative bouquet builder in the cut-paper folk style. Every run grows a unique vase and flower arrangement from a seed, governed by composition rules, with animated growth and ambient motion. Part of the four-shapes family of tools (this one lives mostly in circle and line territory).

Working title only. Rename freely once it earns a better one.

## What it does

1. Generates a parametric vase (silhouette plus fill pattern) from a constrained palette
2. Grows an arrangement of stems, leaves, flower heads, and sprigs out of the vase mouth, following placement rules that guarantee good composition
3. Animates the growth (stems draw on, heads bloom) and then idles with gentle sway
4. Exports a clean static SVG at print resolution, plus optionally a looping animation later
5. Reproducible from seed. Same seed plus same parameters always gives the same bouquet

## Status of assets

Raw Illustrator exports exist in `assets/raw/`. They are NOT yet normalised. Several are compound drawings (full flower with stem and leaves baked in) that must be separated. Phase 1 of this project is an asset pipeline that converts raw exports into contract-compliant assets. Do not build the generator against raw assets.

## Tech stack

- Vite plus TypeScript, strict mode
- SVG rendering direct to DOM (no canvas, no p5 for this one; the output IS an SVG document so we build it as one)
- No runtime dependencies unless something genuinely earns it. Seeded PRNG implemented in-project (mulberry32 or similar, consistent with the other tools)
- Deployed via GitHub to Netlify
- Single page app, controls panel plus stage, consistent with the family look of the other tools

## Repository layout

```
paper-bouquet/
  BRIEF.md
  CLAUDE.md
  index.html
  src/
    main.ts
    rng.ts              seeded PRNG plus helpers (range, pick, weighted, gaussian)
    palette.ts          palette definitions and slot assignment
    assets.ts           manifest loader, asset instantiation, recolouring
    vase.ts             vase silhouette plus pattern grammar
    arrange.ts          stem placement, collision, composition rules
    grow.ts             animation timeline
    export.ts           static SVG export
    ui.ts               controls panel
  assets/
    raw/                untouched Illustrator exports, never read by the app
    leaves/
    heads/
    sprigs/
    manifest.json
  tools/
    normalise.ts        asset pipeline script, run with npx tsx
    harness.html        asset review harness
```

## Phase 1: Asset pipeline

A script (`tools/normalise.ts`) that processes files from `assets/raw/` into contract-compliant assets. Run per file with flags, not as a blind batch, because each asset needs human decisions (what to keep, where the attach point is).

### The asset contract

Every finished asset must satisfy:

1. viewBox `-50 -50 100 100`, visual centre at (0, 0)
2. All fills replaced with slot variables: `var(--primary)`, `var(--secondary)`, `var(--centre)`, `var(--accent)`, `var(--detail)`. No literal colours anywhere
3. Fill only, no strokes
4. Flat structure: transforms flattened into path data, no nested groups, no editor metadata, no masks. Cutouts use `fill-rule="evenodd"` on a single path where possible
5. Root svg carries `data-attach="x,y"` (stem connection point in asset coordinates) and optionally `data-attach-angle` and `data-no-flip`
6. Under 4 KB after optimisation

### What the script does

- Parses the raw SVG, flattens transforms, merges to minimal paths
- Rescales and recentres to the unit viewBox. Centre defaults to bounding box centre, override with a flag for assets like the tulip head where the attach point is the base
- Maps literal fills to slots. The script proposes a mapping (largest area gets primary, small central shapes get centre, and so on) and prints it for confirmation. Mapping can be overridden with flags
- Strips metadata, runs an SVGO pass configured to preserve viewBox, data attributes, and CSS variables
- Writes to the correct category folder and appends an entry to `manifest.json`

### Separation work

These raw files contain compound drawings. Separate before or during normalisation:

- Tulips (two colour variants, keep ONE silhouette): extract the cup only, attach at base
- Rounded-petal yellow flower: extract head only
- Forget-me-not cluster: extract a single small five-petal head. The cluster gets rebuilt parametrically
- Paddle leaves attached to stems: extract as single leaf assets if distinct from existing leaves
- Berry sprig: not an asset. Keep the raw file as visual reference for tuning the parametric sprig generator
- Leafy branch sprig and three-leaf cluster: keep whole, attach at base of central stem

Colour variants of the same silhouette are duplicates. One asset per shape, colour comes from the palette system.

### Manifest format

```json
{
  "assets": [
    {
      "id": "head-scallop-cutout",
      "file": "heads/head-scallop-cutout.svg",
      "type": "head",
      "slots": ["primary", "secondary", "accent"],
      "attach": [0, 42],
      "flip": true,
      "sizeClass": "large"
    }
  ]
}
```

`sizeClass` is one of `large`, `medium`, `small` and drives the composition rules. The generator reads only the manifest, never the directory.

### Review harness

`tools/harness.html`: a standalone page that loads the manifest and renders every asset at three scales (0.3, 1.0, 2.5), flipped and unflipped, cycling through palettes, with the attach point marked as a crosshair and a sample stem drawn into it. Every asset gets eyeballed here before the generator work starts. Acceptance for Phase 1 is the full library passing in the harness.

## Phase 2: Vase generator

- Silhouettes: capsule, trapezoid, flared trapezoid, urn, cylinder with lip. Parametric proportions within tasteful ranges
- Fill grammar: horizontal bands, each band filled with one of: solid, vertical stripes (regular or irregular widths), checker, offset blocks. Band heights and pattern choice seeded. Colours drawn from the active palette
- The vase uses 4 to 6 colours max from the palette. Rules prevent same colour in adjacent cells
- Vase width sets the mouth, which sets how many stems can plausibly emerge

## Phase 3: Arrangement

The heart of the project. Rules, tuned for subtlety:

- Exactly one `large` head as the focal bloom, placed off-centre (roughly rule of thirds within the arrangement bounds)
- 2 to 4 `medium` heads at varied heights, none at the same height as another (minimum vertical separation)
- `small` heads and parametric sprigs fill remaining angular gaps
- Stems emerge from within the vase mouth, fan outward with seeded jitter, curve gently (single quadratic or low-amplitude cubic, never S-curves)
- Head collision: heads may overlap up to roughly 15 percent of the smaller head's area, then z-order by size (larger behind is often nicer, experiment). Beyond that, retry placement
- Leaves attach to stems at seeded positions, alternating sides with jitter, plus loose leaves scattered into empty negative space if a gap exceeds a threshold
- Arrangement silhouette target: roughly fan or dome shaped, wider than the vase, total height 1.4 to 2.2 times vase height
- Everything derives from the seed. A `regenerate` keeps parameters and draws a new seed

## Phase 4: Growth animation and idle

- Timeline: vase fades or slides in first, then stems draw on (staggered, longest first), each head scales up with slight overshoot as its stem completes, leaves unfold after their stem passes them
- Stem draw-on via stroke-dasharray offset on the stem path, or point-lerp if stems become filled tapered shapes
- Idle: per-stem sway from layered sine or noise, phase offset per stem, amplitude larger at the tip than the base. Heads rotate a degree or two with the sway. Subtle. If it looks like wind, it is too much; it should read as barely alive
- Reduced motion media query respected: skip to final state, no idle sway

## Phase 5: Controls and export

Controls panel, consistent with the family style:

- Seed (number input plus dice button)
- Palette picker (curated palettes, 5 to 7 to start)
- Bloom count range, density, stem curviness, sway amount, growth speed
- Vase silhouette lock (let the vase stay while arrangements change, and vice versa)
- Export static SVG: the final composed frame as a clean standalone SVG with literal colours substituted for the variables, suitable for print at any size
- URL state: seed and parameters encoded in the query string for shareable results

## Palettes

Start from the reference print palette: cream ground, cobalt, vermilion, pink, lilac, leaf green, yellow. Build 4 to 6 more with the same rules: one ground, one green, 4 to 6 bloom colours, at least one high-chroma accent. Palettes are named and versioned in `palette.ts`.

## Conventions

- Seeded reproducibility everywhere. No `Math.random` outside `rng.ts`
- TypeScript strict, no `any`
- No em-dashes in any user-facing copy, including control labels and exported file metadata
- Subtlety first. Default parameter ranges should produce bouquets that look designed, not random. Extremes are allowed on the sliders but defaults sit in the tasteful middle
- Commit messages describe visual outcomes where relevant, since diffs of generative code rarely explain themselves

## Milestones

1. Asset pipeline built, full library normalised and passing the review harness
2. Vase generator producing good vases across all silhouettes and 3 palettes
3. Static arrangements that look composed at default settings across 50 consecutive seeds
4. Growth animation and idle sway
5. Controls, export, URL state, deploy to Netlify

## Open questions

- Whether stems should be strokes or filled tapered shapes (tapered looks more cut-paper but complicates draw-on animation)
- Whether the vase pattern should ever animate (probably not, but a one-time build-in during the intro might be charming)
- Animated export (SVG SMIL, CSS in SVG, or record to video) is out of scope until the static tool is solid
