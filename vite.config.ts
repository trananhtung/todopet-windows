import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const page = (name: string) => resolve(import.meta.dirname, `${name}.html`);

// Tauri expects a fixed port and fails if it is taken.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      // index.html is the dev hub: served by `npm run dev`, never shipped.
      input: {
        overlay: page("overlay"),
        settings: page("settings"),
        diary: page("diary"),
        gallery: page("gallery"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
