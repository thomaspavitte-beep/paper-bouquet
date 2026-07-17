/* Curated palettes, named and versioned. Rules per BRIEF.md: one ground,
   one green, 4 to 6 bloom colours, at least one high-chroma accent. */

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
