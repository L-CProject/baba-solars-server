/**
 * DATA MIGRATION — moves the website's existing data into PostgreSQL and verifies it.
 *
 *   npm run data:migrate                         bundled website data (src/mocks/seed): content, offers,
 *                                                plans, services, projects, reviews, FAQs, slides, gallery,
 *                                                companies, products, business settings
 *   npm run data:migrate -- --backup file.json   + a backup exported from the old browser admin
 *                                                (Site content → Backup & restore, tick "include enquiries")
 *   --dry-run              run everything, print the report, then roll back
 *   --overwrite-settings   replace content/business settings that already exist in the database
 *   --force                run again even if the same file was already imported
 *   --report out.json      also write the report to a file
 *
 * Safe to re-run: records keep their ids, existing records are skipped (never duplicated or overwritten),
 * and the whole run is one transaction. Image paths (/images/…) are checked against ../public.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, eq, sql } from 'drizzle-orm'
import { db, pool } from '../db/client'
import { dataMigrations, enquiries, siteItems } from '../db/schema'
import { importData, verifyImported, type ImportReport } from '../modules/admin/data-import.service'
import { bundledSeed } from '../modules/admin/seed-data'
import { readSetting } from '../modules/content/settings.repo'
import { uploadDir } from '../modules/uploads/uploads.service'

const args = process.argv.slice(2)
const flag = (f: string) => args.includes(f)
const value = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const dryRun = flag('--dry-run')
const here = path.dirname(fileURLToPath(import.meta.url))
// Website's public/ folder (for the /images/… check). Set PUBLIC_DIR when the website is in another folder.
const publicDir = path.resolve(process.env.PUBLIC_DIR ?? path.resolve(here, here.endsWith('dist') ? '../../web/public' : '../../../web/public'))

class DryRun extends Error {}

function imagePaths(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === 'string' && /^\/(images|uploads)\/\S+\.(png|jpe?g|webp|gif|avif|svg)$/i.test(v)) out.add(v)
  else if (Array.isArray(v)) v.forEach((x) => imagePaths(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => imagePaths(x, out))
  return out
}

async function runOne(name: string, source: string, data: Record<string, unknown>, opts: { mode: 'seed' | 'backup' }) {
  const checksum = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  const [done] = await db.select().from(dataMigrations).where(and(eq(dataMigrations.name, name), eq(dataMigrations.checksum, checksum))).limit(1)
  if (done && !flag('--force')) {
    console.log(`• ${name}: already imported on ${done.ranAt.toISOString()} (same file) — skipped. Use --force to re-run.`)
    return null
  }
  const before = await db.select({ n: sql<number>`count(*)::int` }).from(enquiries)
  let result: { report: ImportReport; verification: Awaited<ReturnType<typeof verifyImported>> } | null = null
  try {
    await db.transaction(async (t) => {
      const report = await importData(t, data, { mode: opts.mode, replaceWebsite: false, overwriteSettings: flag('--overwrite-settings'), userId: null })
      const verification = await verifyImported(t, data)
      const missing = Object.entries(verification).filter(([, v]) => v.missing.length && !['proposals', 'quotations', 'invoices'].includes(v as never))
      result = { report, verification }
      const failures = Object.entries(verification).filter(([, v]) => v.found !== v.expected)
      if (failures.length) console.warn(`⚠ ${name}: some records are not in the database:`, failures.map(([k, v]) => `${k} ${v.found}/${v.expected}`).join(', '))
      void missing
      if (!dryRun) await t.insert(dataMigrations).values({ name, checksum, source, report: { report, verification } })
        .onConflictDoUpdate({ target: [dataMigrations.name, dataMigrations.checksum], set: { report: { report, verification }, ranAt: new Date() } })
      if (dryRun) throw new DryRun()
    })
  } catch (e) {
    if (!(e instanceof DryRun)) throw e
  }
  const after = await db.select({ n: sql<number>`count(*)::int` }).from(enquiries)
  return { name, checksum, dryRun, enquiriesBefore: before[0].n, enquiriesAfter: after[0].n, ...result! }
}

function print(r: NonNullable<Awaited<ReturnType<typeof runOne>>>) {
  console.log(`\n━━ ${r.name}${r.dryRun ? ' (dry run — rolled back)' : ''} ━━`)
  console.table(Object.fromEntries(Object.entries(r.report.collections).map(([k, v]) => [k, {
    'in file': v.inFile, inserted: v.inserted, updated: v.updated, skipped: v.skipped, failed: v.failed.length,
    verified: r.verification[k] ? `${r.verification[k].found}/${r.verification[k].expected}` : '—',
  }])))
  if (r.report.settings.length) console.log(`Settings imported: ${r.report.settings.join(', ')}`)
  if (r.report.imagesConverted) console.log(`Embedded images saved as files: ${r.report.imagesConverted}`)
  for (const w of r.report.warnings) console.log(`⚠ ${w}`)
  for (const [k, v] of Object.entries(r.report.collections)) for (const f of v.failed) console.log(`✖ ${k} ${f.id}: ${f.reason}`)
}

try {
  const reports: unknown[] = []
  // 1. Bundled website data — only what is missing (an edited database is never overwritten).
  const seed = bundledSeed()
  const fresh = !(await readSetting('content'))
  const seedRun = await runOne('bundled-website-data', 'src/mocks/seed', seed, { mode: 'seed' })
  if (seedRun) { print(seedRun); reports.push(seedRun) }
  if (!fresh && seedRun) console.log('(Database already had content: only missing items were added.)')

  // 2. Browser backup (optional)
  const file = value('--backup')
  if (file) {
    const raw = JSON.parse(readFileSync(path.resolve(file), 'utf8')) as { data?: Record<string, unknown> }
    if (!raw || typeof raw !== 'object' || !raw.data || typeof raw.data !== 'object') throw new Error(`${file} is not a Baba Solars backup (no "data").`)
    const run = await runOne(`backup:${path.basename(file)}`, path.resolve(file), raw.data, { mode: 'backup' })
    if (run) { print(run); reports.push(run) }
  }

  // 3. Image check: every /images/… path used by the data must exist in public/, every /uploads/… in UPLOAD_DIR.
  const rows = await db.select({ data: siteItems.data }).from(siteItems)
  const content = await readSetting('content')
  const used = imagePaths([rows.map((r) => r.data), content, await db.execute(sql`select images from offers`).then((r) => r.rows)])
  const canCheckPublic = existsSync(publicDir)
  if (!canCheckPublic) console.log(`(Website public/ folder not found at ${publicDir} — /images/… paths not checked. Set PUBLIC_DIR to check them.)`)
  const missingImages = [...used].filter((p) => p.startsWith('/uploads/') ? !existsSync(path.join(uploadDir(), p.slice(9))) : canCheckPublic && !existsSync(path.join(publicDir, p)))
  console.log(`\nImages referenced: ${used.size}; missing files: ${missingImages.length}${missingImages.length ? '\n  ' + missingImages.join('\n  ') : ''}`)

  // 4. Totals
  const totals = await db.execute<{ table: string; rows: number }>(sql`
    select 'site_items' as table, count(*)::int as rows from site_items union all select 'offers', count(*)::int from offers
    union all select 'companies', count(*)::int from companies union all select 'catalog_items', count(*)::int from catalog_items
    union all select 'enquiries', count(*)::int from enquiries union all select 'enquiry_activities', count(*)::int from enquiry_activities
    union all select 'follow_ups', count(*)::int from follow_ups union all select 'proposals', count(*)::int from proposals
    union all select 'quotations', count(*)::int from quotations union all select 'invoices', count(*)::int from invoices
    union all select 'invoice_payments', count(*)::int from invoice_payments`)
  console.log('\nDatabase totals:')
  console.table(Object.fromEntries(totals.rows.map((r) => [r.table, r.rows])))
  const out = value('--report')
  if (out) writeFileSync(out, JSON.stringify({ runAt: new Date().toISOString(), reports, images: { referenced: used.size, missing: missingImages }, totals: totals.rows }, null, 2))
  await pool.end()
  if (missingImages.length) process.exitCode = 2
} catch (err) {
  console.error('\n✖ Data migration failed — the database was not changed.\n', err instanceof Error ? err.message : err)
  await pool.end()
  process.exit(1)
}
