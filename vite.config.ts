import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const partyAppDir = path.resolve(__dirname, "party-app");

export default defineConfig({
  root: partyAppDir,
  base: "/party/",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "party-app/src") },
  },
  build: {
    outDir: path.resolve(__dirname, "party"),
    emptyOutDir: true,
  },
});
