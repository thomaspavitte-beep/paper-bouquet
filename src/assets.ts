/* Manifest loader and asset instantiation. The generator reads only the
   manifest, never the asset directories. */

export type SizeClass = "large" | "medium" | "small";
export type AssetType = "head" | "leaf" | "sprig";

export interface AssetMeta {
  id: string;
  file: string;
  type: AssetType;
  slots: string[];
  attach: [number, number];
  flip: boolean;
  sizeClass: SizeClass;
  parts?: boolean; // one element per petal; grow.ts animates them individually
}

export interface LoadedAsset extends AssetMeta {
  inner: string; // markup inside the root <svg>, contract coordinates
}

export interface Library {
  heads: Record<SizeClass, LoadedAsset[]>;
  leaves: LoadedAsset[];
  sprigs: LoadedAsset[];
  byId: Map<string, LoadedAsset>;
}

export async function loadLibrary(): Promise<Library> {
  // relative paths so the app works from a GitHub Pages subpath
  const manifest: { assets: AssetMeta[] } = await fetch("assets/manifest.json").then((r) => r.json());
  const lib: Library = {
    heads: { large: [], medium: [], small: [] },
    leaves: [],
    sprigs: [],
    byId: new Map(),
  };
  await Promise.all(
    manifest.assets.map(async (meta) => {
      const text = await fetch(`assets/${meta.file}`).then((r) => r.text());
      const inner = text.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
      const attachAttr = text.match(/data-attach="([^"]+)"/)?.[1];
      const attach = attachAttr
        ? (attachAttr.split(",").map(Number) as [number, number])
        : meta.attach;
      const asset: LoadedAsset = { ...meta, attach, inner };
      lib.byId.set(asset.id, asset);
      if (asset.type === "head") lib.heads[asset.sizeClass].push(asset);
      else if (asset.type === "leaf") lib.leaves.push(asset);
      else lib.sprigs.push(asset);
    }),
  );
  return lib;
}

export interface Placement {
  x: number;
  y: number;
  scale: number;
  rotation: number; // degrees
  flip: boolean;
  colours: Record<string, string>; // slot -> colour
}

/* Place an asset so its attach point lands at (x, y). In literal mode the
   slot variables are substituted with real colours, for standalone export. */
export function instantiate(asset: LoadedAsset, p: Placement, literal = false): string {
  const [ax, ay] = asset.attach;
  const sx = p.flip ? -p.scale : p.scale;
  const transform =
    `translate(${r2(p.x)} ${r2(p.y)}) rotate(${r2(p.rotation)}) ` +
    `scale(${r2(sx)} ${r2(p.scale)}) translate(${r2(-ax)} ${r2(-ay)})`;
  if (literal) {
    const inner = asset.inner.replace(/var\(--([a-z]+)\)/g, (m, slot: string) => p.colours[slot] ?? m);
    return `<g transform="${transform}">${inner}</g>`;
  }
  const style = Object.entries(p.colours)
    .map(([slot, colour]) => `--${slot}:${colour}`)
    .join(";");
  return `<g transform="${transform}" style="${style}">${asset.inner}</g>`;
}

/* Direction the asset naturally grows from its attach point, in degrees,
   0 = straight up, positive = clockwise. Radial assets (attach near centre)
   return 0. */
export function naturalAngle(asset: LoadedAsset): number {
  const [ax, ay] = asset.attach;
  if (Math.hypot(ax, ay) < 10) return 0;
  return (Math.atan2(-ax, ay) * 180) / Math.PI;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
