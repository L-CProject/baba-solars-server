import { Queue, Worker } from 'bullmq'
import { env } from '../config/env'
import { logger } from '../lib/logger'
import { authService } from '../modules/auth/auth.service'
import { enquiriesService } from '../modules/enquiries/enquiries.service'

/**
 * Background jobs. With REDIS_URL they run on BullMQ (one run per schedule even with several
 * API processes); without Redis a simple in-process timer does the same work.
 *  • sessions:cleanup  — every hour, delete expired sessions.
 *  • leads:follow-up-digest — every day at 08:30 IST, log follow-ups due today and overdue
 *    (hook point for email / WhatsApp reminders once a provider is chosen).
 */
const JOBS = {
  'sessions:cleanup': async () => ({ deleted: await authService.purgeExpired() }),
  'leads:follow-up-digest': async () => {
    const s = await enquiriesService.stats()
    return { followUpsDue: s.followUpsDue, followUpsOverdue: s.followUpsOverdue, newLeads: s.new }
  },
} as const
type JobName = keyof typeof JOBS

async function run(name: JobName) {
  try {
    const result = await JOBS[name]()
    logger.info({ job: name, result }, 'job finished')
    return result
  } catch (err) {
    logger.error({ job: name, err }, 'job failed')
    throw err
  }
}

let stop: () => Promise<void> = async () => {}

export async function startJobs() {
  if (env.isTest) return
  if (env.REDIS_URL) {
    try {
      const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null as null }
      const queue = new Queue('baba-solars', { connection })
      await queue.upsertJobScheduler('sessions-cleanup', { pattern: '0 * * * *', tz: 'Asia/Kolkata' }, { name: 'sessions:cleanup' })
      await queue.upsertJobScheduler('follow-up-digest', { pattern: '30 8 * * *', tz: 'Asia/Kolkata' }, { name: 'leads:follow-up-digest' })
      const worker = new Worker('baba-solars', (job) => run(job.name as JobName), { connection, concurrency: 1 })
      worker.on('error', (err) => logger.warn({ err: err.message }, 'job worker error'))
      stop = async () => { await worker.close(); await queue.close() }
      logger.info('background jobs: BullMQ (Redis)')
      return
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Redis not reachable — using in-process timers for background jobs')
    }
  }
  const hourly = setInterval(() => void run('sessions:cleanup').catch(() => {}), 3600_000)
  const daily = setInterval(() => void run('leads:follow-up-digest').catch(() => {}), 24 * 3600_000)
  hourly.unref(); daily.unref()
  stop = async () => { clearInterval(hourly); clearInterval(daily) }
  logger.info('background jobs: in-process timers')
}

export const stopJobs = () => stop()
