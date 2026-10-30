import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Two islands in the server-rendered site: /ask (the chat) and /admin (the owner's
// dashboard). The build goes to frontend/public/app, which FastAPI serves; fixed entry
// names let the templates link them, with a version query for cache busting.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/app/",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  worker: { format: "es" },
  build: {
    outDir: "../public/app",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    // One stylesheet for both islands (they share the components), linked as app.css.
    cssCodeSplit: false,
    rollupOptions: {
      input: { ask: "src/ask.tsx", admin: "src/admin.tsx" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (info) => (info.names?.[0]?.endsWith(".css") ? "app.css" : "assets/[name]-[hash][extname]"),
      },
    },
  },
});
