/** تشغيل من مجلد المشروع: pm2 start ecosystem.config.cjs */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'nokbat_alshamal_bot',
      script: path.join(__dirname, 'index.js'),
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
