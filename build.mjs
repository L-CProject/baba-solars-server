/**
 * Production build: bundles the API and the CLI scripts into dist/ (Node ESM).
 * Shared business rules (shared/: same files as the website's src/lib, src/types, seed data) are bundled in;
 * node_modules stay external (installed on the server with `npm ci --omit=dev`).
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'

const root = fileURLToPath(new URL('.', import.meta.url))
await rm(new URL('dist/', import.meta.url), { recursive: true, force: true })
await build({
  entryPoints: {
    server: 'src/index.ts',
    migrate: 'src/scripts/migrate.ts',
    seed: 'src/scripts/seed.ts',
    'migrate-data': 'src/scripts/migrate-data.ts',
  },
  absWorkingDir: root,
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  alias: { '@': fileURLToPath(new URL('./shared', import.meta.url)) },
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
})
