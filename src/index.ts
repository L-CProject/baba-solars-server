import { createServer } from 'node:http'
import { env } from './config/env'
import { createApp, markShuttingDown } from './app'
import { pool } from './db/client'
import { cache, connectCache } from './jobs/cache'
import { startJobs, stopJobs } from './jobs/queue'
import { logger } from './lib/logger'

const app = createApp()
const server = createServer(app)
server.keepAliveTimeout = 65_000 // longer than Nginx's upstream keepalive
server.headersTimeout = 66_000
server.requestTimeout = 60_000

server.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT, env: env.NODE_ENV }, 'Baba Solars API listening')
  // PM2 wait_ready: the app is ready once it listens.
  process.send?.('ready')
  connectCache()
  void startJobs()
})

/** Graceful shutdown: stop taking requests, finish in-flight ones, then close DB/Redis. */
let closing = false
async function shutdown(signal: string) {
  if (closing) return
  closing = true
  markShuttingDown()
  logger.info({ signal }, 'shutting down')
  const force = setTimeout(() => { logger.error('forced exit after 15 s'); process.exit(1) }, 15_000)
  force.unref()
  server.close(async () => {
    try {
      await stopJobs()
      await cache.close()
      await pool.end()
      logger.info('shutdown complete')
      process.exit(0)
    } catch (err) {
      logger.error({ err }, 'error during shutdown')
      process.exit(1)
    }
  })
  server.closeIdleConnections()
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('message', (msg) => { if (msg === 'shutdown') void shutdown('pm2') })
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled promise rejection'))
process.on('uncaughtException', (err) => { logger.fatal({ err }, 'uncaught exception'); void shutdown('uncaughtException') })
