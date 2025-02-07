import { defineConfig } from 'tsup'

// src/index.ts src/cli.ts --format cjs,esm --dts --clean
export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  sourcemap: true,
  clean: true,
  dts: true,
  format: ['esm'], // cjs can't be used for top level await
  minify: false,
  treeshake: false,
  splitting: true, // share code between entry points
})
