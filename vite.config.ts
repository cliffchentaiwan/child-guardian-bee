import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  root: "client",
  build: {
    // 👇 使用 path.resolve 鎖定絕對路徑，保證準確！
    outDir: path.resolve(__dirname, "server/public"),
    emptyOutDir: true,
  },
});