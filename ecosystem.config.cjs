/** VPS da doimiy ishlash: `npm run build` keyin `npx pm2 start ecosystem.config.cjs` */
module.exports = {
  apps: [
    {
      name: "solar-erp",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "450M",
      env: {
        NODE_ENV: "production",
        SERVE_STATIC: "true",
      },
    },
  ],
};
