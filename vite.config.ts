import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // 防止 Vite 在 Tauri 中遮盖错误
  clearScreen: false,

  // Tauri 使用固定端口，如果端口被占用则退出
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 监听 src 目录的变化
      ignored: ["**/src-tauri/**"],
    },
  },
});
