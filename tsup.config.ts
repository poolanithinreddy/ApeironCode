import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  clean: true,
  dts: true,
  // ws uses CJS dynamic require; must be external in ESM bundle
  external: ['ws'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});