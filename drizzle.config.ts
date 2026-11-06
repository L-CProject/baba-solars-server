import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://babasolars:devpass@127.0.0.1:5432/babasolars' },
  strict: true,
  verbose: true,
})
