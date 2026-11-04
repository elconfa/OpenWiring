// Build della riga di comando (Node): un solo file in dist-cli/openwiring.mjs
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'cli/openwiring.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'openwiring.mjs' }, external: [/^pdfjs-dist/, /^7z-wasm/, /^@xmldom/] },
  },
  // pdf.js, 7-Zip e xmldom restano esterni: in Node si caricano da node_modules
  ssr: { noExternal: true, external: ['pdfjs-dist', '7z-wasm', '@xmldom/xmldom'] },
  logLevel: 'error',
});
