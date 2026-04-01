import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/cli.ts'],
    format: ['esm', 'cjs'],
    dts: false,
    clean: true,
    splitting: false,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
    outDir: 'dist',
  },
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: { resolve: true },
    clean: false,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
  },
]);
