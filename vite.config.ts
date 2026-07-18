import { resolve } from "node:path";
import { defineConfig } from "vite";

// relative base so the bundle works from a GitHub Pages subpath;
// build into docs/ so Pages can serve straight from the main branch.
// Two pages: index.html (public) and studio.html (the full tool)
export default defineConfig({
  base: "./",
  build: {
    outDir: "docs",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        studio: resolve(__dirname, "studio.html"),
      },
    },
  },
});
