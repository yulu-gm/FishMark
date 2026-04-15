import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devServerPort = Number(process.env.YULORA_DEV_SERVER_PORT ?? "5173");

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  server: {
    host: "localhost",
    port: devServerPort,
    strictPort: true
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true
  }
});
