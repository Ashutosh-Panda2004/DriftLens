import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
  },
  format: ['cjs'],
  target: 'node18',
  outDir: 'dist',
  outExtension: () => ({ js: '.cjs' }),
  clean: true,
  sourcemap: false,
  dts: false,
  splitting: false,
  bundle: true,
  platform: 'node',
  shims: false,
});
