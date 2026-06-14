import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Relative base => the static build runs from file:// or any sub-path (export-ready).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 4316, strictPort: true },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1500,
    sourcemap: false,
  },
})
