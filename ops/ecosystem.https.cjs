/** Candidate only; do not start until production identity/port/backup sign-off. */
module.exports = {apps:[{
  name:'solar-erp',script:'server.js',cwd:'/root/solar-erp',instances:1,
  exec_mode:'fork',autorestart:true,max_memory_restart:'450M',
  min_uptime:'10s',max_restarts:10,exp_backoff_restart_delay:1000,
  kill_timeout:10000,time:true,merge_logs:true,
  out_file:'/root/.pm2/logs/solar-erp-out.log',error_file:'/root/.pm2/logs/solar-erp-error.log',
  // server.js loads cwd/.env. Provision server-only credentials there; never in this file.
  env:{NODE_ENV:'production',SERVE_STATIC:'true',PORT:'3000',BIND_HOST:'127.0.0.1',FIREBASE_PROJECT_ID:'solar-erp-51870',SOLARERP_DISABLE_BACKGROUND_TASKS:'true',PRIVATE_STORAGE_ADAPTER:'vps',PRIVATE_MEDIA_DIR:'/root/solar-erp-private-media'}
}]};
