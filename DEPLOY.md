## تشغيل على VPS (Linux + PM2)

### 1) تنزيل المشروع

```bash
cd /opt
git clone https://github.com/MostafaAhmed71/nokbat-bot.git nokbat-bot
cd nokbat-bot
npm install --omit=dev
```

### 2) إعداد `.env`

انسخ `.env.example` إلى `.env` ثم عدّل القيم.

### 3) تشغيل PM2 (البوت + لوحة الأدمن)

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs nokbat_alshamal_bot
pm2 logs nokbat_admin_web
```

### 4) إعداد Supabase للنتائج (مرة واحدة)

نفّذ الملف:
- `supabase/migrations/phase2_results.sql`

### 5) لوحة الأدمن

- افتح: `http://SERVER_IP:3000/admin`
- الدخول: Basic Auth باستخدام `ADMIN_WEB_USER` و `ADMIN_WEB_PASS`
- استيراد Excel: `/admin/import`
- رفع النتائج: `/admin/results`
- الصور ستظهر عبر: `/files/results/<national_id>.jpg`

> لو عندك دومين وReverse proxy (Nginx)، اضبطه بحيث يمرر `/admin` و `/files` إلى `WEB_PORT`.

