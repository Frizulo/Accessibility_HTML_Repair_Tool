import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({

  plugins: [
    react(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },

  // 前端根目錄
  root: path.resolve(__dirname, "client"),

  build: {
    // 產出給 Nginx 的靜態檔
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },

  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
