import { defineConfig } from "vite";

// base: "./" so the built dist/ works when zipped and served from itch.io's
// arbitrary sub-path, not just from a domain root.
export default defineConfig({
  base: "./",
});
