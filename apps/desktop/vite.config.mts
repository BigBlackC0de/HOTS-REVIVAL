import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" : les assets sont chargés en file:// dans Electron.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
