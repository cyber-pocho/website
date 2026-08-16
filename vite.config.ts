import { defineConfig } from "vite";

// Single-page terminal: the default index.html entry is all that's needed.
//
// Assets are emitted with relative URLs so the build works from any path.
// GitHub Pages serves this repo at /website/, and an absolute base would
// resolve assets to /assets/... and 404. Relative keeps it correct there and
// at the domain root, so renaming the repo later needs no config change.
export default defineConfig({
  base: "./",
});
