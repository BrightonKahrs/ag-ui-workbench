import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const entry = process.env.ENTRY || "dataset-explorer";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: entry === "dataset-explorer", // Only first build clears dist
    rollupOptions: {
      input: `${entry}.html`,
    },
  },
});
