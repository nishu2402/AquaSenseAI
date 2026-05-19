import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// AquaSense AI · Frontend dev server
// Proxies HTTP /api/* and the WebSocket /ws to the Express backend on :4000
// so the React app can call same-origin URLs in both dev and production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:4000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
