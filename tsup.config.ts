import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: { resolve: true },
  clean: true,
  splitting: false,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  outDir: 'dist',
});
