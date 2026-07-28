import { defineConfig } from 'vite';

export default defineConfig({
  // Self-hosting font files under /public keeps the "handmade" feel and avoids
  // a Google Fonts request (which would also be an AI-ish tell).
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2500, // tfjs chunk is large; expected
  },
  optimizeDeps: {
    // Force esbuild to pre-bundle the WASM backend so the CJS
    // `wasmWorkerContents` named export survives Vite's CJS->ESM interop.
    // (Excluding it made Vite serve the raw CJS worker file and drop the export.)
    include: ['@tensorflow/tfjs-backend-wasm'],
  },
});