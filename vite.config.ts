import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    // During "npm run dev" the API runs on 3001; the app talks to it through /api.
    proxy: { "/api": "http://localhost:3001" },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
