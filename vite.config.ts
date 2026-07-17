import { defineConfig } from "vite";

// relative base so the bundle works from a GitHub Pages subpath;
// build into docs/ so Pages can serve straight from the main branch
export default defineConfig({
  base: "./",
  build: { outDir: "docs" },
});
