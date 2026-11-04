// Separate build for the Laboratory Scope of Work demo (fictional data): `npm run build:scope-demo` → dist-scope-demo/.
// It is not part of the Sites build or the GitHub Pages deployment and never reads the app's records.
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(import.meta.dirname, 'scope-demo'),
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist-scope-demo'),
    emptyOutDir: true,
    sourcemap: false,
    // One self-contained file: inline the logo and keep a single script and stylesheet.
    assetsInlineLimit: 200_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
