/* Curated palettes, named and versioned. Rules per BRIEF.md: one ground,
   one green, 4 to 6 bloom colours, at least one high-chroma accent. */

/* Three flat foliage tones derived from a palette's green: darker, base,
   lighter, with a little hue drift so overlapping leaves and stems separate
   instead of blending into one silhouette. */
export function greenShades(green: string): [string, string, string] {
  const n = parseInt(green.slice(1), 16);
  const [h, s, l] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return [
    hslToHex(h - 8, s, Math.max(0.08, l - 0.08)),
    green,
    hslToHex(h + 8, Math.max(0, s - 0.05), Math.min(0.85, l + 0.1)),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export interface Palette {
  name: string;
  version: number;
  ground: string;
  green: string;
  blooms: string[]; // blooms[accentIndex] is the high-chroma accent
  accentIndex: number;
}

export const PALETTES: Palette[] = [
  {
    name: "reference",
    version: 1,
    ground: "#f2e8d5",
    green: "#327247",
    blooms: ["#3076d9", "#e35621", "#fe97d1", "#adaaed", "#d3a905"],
    accentIndex: 1, // vermilion
  },
  {
    name: "midnight",
    version: 1,
    ground: "#22304a",
    green: "#7fae8e",
    blooms: ["#f2e8d5", "#fe97d1", "#d3a905", "#adaaed", "#e0533d"],
    accentIndex: 4, // coral
  },
  {
    name: "market",
    version: 1,
    ground: "#f6e8cf",
    green: "#3d7a52",
    blooms: ["#c44f33", "#2a7f7f", "#d9a441", "#7c4a6b", "#e9b7a4"],
    accentIndex: 0, // brick
  },
  {
    name: "sorbet",
    version: 1,
    ground: "#fdf3e7",
    green: "#63b58f",
    blooms: ["#f2549c", "#f78c3b", "#f5d63f", "#6fb3e0", "#9b8ff2"],
    accentIndex: 0, // hot pink
  },
  {
    name: "meadow",
    version: 1,
    ground: "#f7f2e2",
    green: "#5a8a3c",
    blooms: ["#d94f2b", "#5b7fd4", "#eec93f", "#faf6ee", "#c96a92"],
    accentIndex: 0, // poppy
  },
  {
    name: "coast",
    version: 1,
    ground: "#e9f0ee",
    green: "#4a8a6a",
    blooms: ["#ff7a59", "#1f3a5f", "#f6efe3", "#7fb6d9", "#e3c565"],
    accentIndex: 0, // coral
  },
];
