/**
 * PM2 process file (run from server/):  pm2 start ecosystem.config.cjs --env production
 * Cluster mode with 2 instances → zero-downtime `pm2 reload baba-solars-api`.
 * The app reports "ready" once it listens (wait_ready) and shuts down gracefully on SIGINT.
 */
module.exports = {
  apps: [
    {
      name: 'baba-solars-api',
      script: 'dist/server.js',
      node_args: '--env-file=.env --enable-source-maps',
      cwd: __dirname,
      exec_mode: 'cluster',
      instances: 2,
      wait_ready: true,
      listen_timeout: 15000,
      kill_timeout: 16000,
      max_memory_restart: '400M',
      autorestart: true,
      exp_backoff_restart_delay: 200,
      time: true,
      merge_logs: true,
      out_file: '/var/log/babasolars/api.out.log',
      error_file: '/var/log/babasolars/api.err.log',
      env_production: { NODE_ENV: 'production' },
    },
  ],
}
