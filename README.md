# Paper Bouquet

A generative bouquet builder in the cut-paper folk style. Every generation grows a unique vase and flower arrangement from a seed: stems draw on, petals unfold one by one, the seed pops on top, and the finished bouquet sways, barely alive.

**[Grow a bouquet](https://thomaspavitte-beep.github.io/paper-bouquet/)** - the public page. One button; a click anywhere grows a new one.

**[Studio](https://thomaspavitte-beep.github.io/paper-bouquet/studio.html)** - the full tool: seeds, locks, palettes, vase silhouettes, shape and motion sliders, packed posy and wreath modes without stems, per-asset toggles, contact sheets, and print-ready SVG export. Seed and parameters live in the URL, so any result is shareable.

Artwork by [Thomas Pavitte](https://thomaspavitte.com). Built with Claude Code.

## How it works

- **Assets.** Flower heads and leaves are drawn in Illustrator and normalised by a pipeline script into contract-compliant SVGs: a shared viewBox, palette-slot colours (`var(--primary)` and friends) instead of literal fills, a recorded stem attach point, and one path per petal so blooms can animate part by part. The generator only ever reads the manifest.
- **Vases** are parametric: five silhouettes (capsule, trapezoid, flared, urn, cylinder with lip) filled with a seeded band grammar of stripes, checkers, and blocks, governed by rules that keep them looking designed rather than random.
- **Arrangement** places one focal bloom off-centre, supporting heads at distinct heights within an overlap budget, stems as single gentle curves fanning from the vase mouth, leaves alternating along stems, and parametric berry sprigs filling the angular gaps. With stems off, a packing algorithm nestles large flowers into a tight posy, or chains them tangentially around a closed ring for a wreath.
- **Growth** is a small requestAnimationFrame timeline: the vase rises, stems draw on longest first, each leaf unfolds as the stem passes it, and petals bloom clockwise before the seed lands on top. Idle sway is a layered-sine rotation around each stem base. `prefers-reduced-motion` skips straight to the finished bouquet.
- Everything derives from the seed. Same seed, same parameters, same bouquet, every time.

## Development

```
npm install
npm run dev        # http://localhost:4643 (public) and /studio.html
npm run build      # builds both pages into docs/
```

The asset review harness lives at `/tools/harness.html` in dev: every asset at three scales, flipped and unflipped, cycling palettes, with the attach point crosshaired.

New artwork goes through the normaliser, one file at a time:

```
npx tsx tools/normalise.ts "assets/raw/My Flower.svg" \
  --id head-my-flower --type head --size medium --keep-parts --write
```

Run it without `--write` first to review the proposed colour mapping. Raw exports must be fill-only; strokes cannot be ingested (outline them in Illustrator first).

## Deploying

GitHub Pages serves the `docs/` folder on `main`. Deploying is `npm run build`, commit, push.
