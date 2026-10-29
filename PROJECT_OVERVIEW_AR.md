# توثيق مشروع بوت تيليجرام — نخبة الشمال

**المسار المحلي:** `E:\mohamad exam\teleg bot`  
**اسم الحزمة (`package.json`):** `nokbat_alshamal_bot`  
**الوصف:** بوت تيليجرام للمدرسة (طلاب، أولياء أمور، معلمون، مدير) مع لوحة ويب إدارية وقاعدة بيانات Supabase.

---

## 1. نقطة الدخول والتشغيل

| الملف | الدور |
|--------|--------|
| `index.js` | تحميل `.env`، بناء البوت عبر `buildBot()` من `bot.js`، `bot.launch()`، وتشغيل المهام المجدولة: `examsCron`، `challengesCron`، `adminReportCron`، و`ensureDailyChallenge()` عند الإقلاع |
| `bot.js` | تجميع كل معالجات Telegraf (أوامر، أزرار، جلسات)، ربط الطلاب/المعلمين/المدير |
| `web/server.js` | خادم Express: ملفات ثابتة ولوحة `/admin` بحماية Basic Auth |

**متطلبات التشغيل:** Node.js ≥ 18 (`engines` في `package.json`).

```bash
npm install
copy .env.example .env   # Windows — ثم عدّل القيم
npm start                # أو: npm run dev  (إعادة تشغيل عند تعديل الملفات)
npm run web              # لوحة الإدارة منفصلة عن البوت
npm run import:csv       # استيراد من CSV (انظر scripts/import-from-csv.js)
```

**الإنتاج على VPS:** استخدم `ecosystem.config.cjs` مع PM2 لتشغيل العمليتين `nokbat_alshamal_bot` و`nokbat_admin_web`. التفاصيل في `DEPLOY.md`.

---

## 2. التقنيات والاعتماديات

- **telegraf** — البوت  
- **@supabase/supabase-js** — قاعدة البيانات (`services/supabase.js` يفضّل `SUPABASE_SERVICE_ROLE_KEY` إن وُجد وإلا `SUPABASE_ANON_KEY`)  
- **@google/generative-ai** — مساعد الطلاب، الاختبار السريع، التشخيص، و**تحدي اليوم** (توليد JSON عبر Gemini)  
- **express، multer** — لوحة الويب والرفع  
- **pdf-parse، mammoth** — استخراج نص من PDF وWord لمكتبة المحتوى  
- **minisearch** — فهرسة/بحث محلي داخل `services/searchIndex.js`  
- **node-cron** — تذكيرات الامتحانات، تحدي يومي، تقرير أسبوعي للمدير  
- **xlsx، csv-parse** — استيراد Excel/CSV  

---

## 3. أدوار المستخدمين في البوت

### 3.1 مدير تيليجرام

- يُحدَّد بمطابقة `ctx.from.id` مع **`ADMIN_TELEGRAM_ID`** في `.env`.  
- الأمر **`/admin`** يفتح لوحة أزرار (inline) تعكس كثيراً من وظائف **لوحة الويب** (`handlers/admin.js` + `handlers/adminWebParity.js`): أرقام، قوائم طلاب/معلمين/مراجعات، استيراد Excel، امتحانات، مكتبة، رفع صورة نتيجة، إدخال يدوي، CRUD طلاب، جداول المعلمين، بحث لجنة/معلم، إعلانات.  

### 3.2 معلم

- يُكتشف عبر **`teachers.telegram_id`** في Supabase.  
- لوحة مفاتيح (`handlers/teacher.js`): جدول اليوم، بحث طالب (لجنة)، رفع مراجعة، مراجعاتي المرفوعة.  
- الرفع يمر بمكتبة المحتوى (`ingestFile`) مع حد تنزيل من تيليجرام (~**20 ميغابايت** كحد أقصى عملي لـ Bot API — مذكور في `bot.js`).

### 3.3 طالب

- بعد **`/start`**: إن وُجد **`students.telegram_id`** يُعرض القائمة الرئيسية (`studentMainKeyboard` في `handlers/student.js`).  
- وإلا تسجيل: اختيار **طالب** أو **ولي أمر**، ثم ربط بالهوية/اختيار الطالب حسب التدفق في `bot.js`.

### 3.4 ولي أمر

- جدول **`parents`** يربط `telegram_id` بـ `student_id`.  
- أزرار مثل «نتيجة ابني»، «لجنة ابني»، «جدول امتحانات ابني» بعد الربط.

---

## 4. ما يقدّمه البوت للطالب (قائمة رئيسية)

من `handlers/student.js` و`bot.js` (أزرار و`hears`):

| الميزة | وصف مختصر |
|--------|------------|
| **اسأل مساعد AI** | أسئلة بالعربية حسب مادة (`gemini.js`)، مع تاريخ محادثة، تلخيص/تبسيط/تفصيل، حفظ في المفضلة، وعرض «مصادر» من **مكتبة المحتوى** المفهرسة (`contentLibrary.searchLibrary`) |
| **اختبار سريع** | أسئلة اختيار من متعدد مولّدة عبر Gemini، صعوبة قابلة للضبط، نقاط وسلسلة يومية |
| **اختبار تشخيصي** | 10 أسئلة JSON من Gemini للمادة، تخزين في `diagnostic_tests` (`handlers/diagnosticChallenge.js`) |
| **تحدي اليوم / المتصدرين** | سؤال يومي من جدول `daily_challenges`؛ إنشاء السؤال تلقائياً صباحاً؛ إعلان أبرز الإجابات مساءاً |
| **جدول الامتحانات** | من **`exams_schedule`** حسب صف الطالب |
| **مفضلتي** | أسئلة/أجوبة محفوظة من المحادثة (`favorites`) |
| **لجنّتي** | عرض **`committee_number`** و**`committee_location`** من سجل الطالب |
| **نتيجتي** | صورة **`result_image_url`** بعد إدخال الهوية (`handlers/results.js`) — تُرفع غالباً من لوحة الويب |
| **الإعدادات** | مستوى صف دراسي (مفاتيح m1–m3، s1–s3) لملاءمة المحتوى والامتحانات |
| **المساعدة** | شرح مختصر عبر أزرار تفاعيلية |

**أوامر م useful:**  
- **`/start`** — بدء أو استعادة القائمة حسب الدور  
- **`/myid`** أو **`معرف`** — إظهار معرّف تيليجرام لربط الحساب في جداول الطلاب/المعلمين  
- **`/result`** أو **`نتيجتي`** — تدفق النتيجة بالهوية  

---

## 5. المهام المجدولة (Cron) — توقيت `Asia/Riyadh`

| الخدمة | الملف | الجدولة | الوظيفة |
|--------|--------|---------|---------|
| تذكير امتحانات الغد | `services/examsCron.js` | `0 20 * * *` (8 مساءً يومياً) | إرسال لطلاب وأولياء أمور لهذا الصف حسب **`exams_schedule`** لتاريخ الغد |
| إنشاء تحدي اليوم | `services/challengesCron.js` | `0 7 * * *` (7 صباحاً) | **`ensureDailyChallenge()`** يولّد MCQ بالـ Gemini ويخزنه في **`daily_challenges`** |
| إعلان المتصدرين | `services/challengesCron.js` | `0 21 * * *` (9 مساءً) | **`announceChallengeWinners`** يرسل لجميع **`telegram_id`** للطلاب |
| تقرير أسبوعي للمدير | `services/adminReportCron.js` | `0 20 * * 5` (جمعة 8 مساءً) | **`getAdminWeeklyKpis`** وإرسال لـ **`ADMIN_TELEGRAM_ID`** |

عند تشغيل `index.js` يُستدعى أيضاً **`ensureDailyChallenge()`** مرة عند الإقلاع لتقليل فارغ يومي.

---

## 6. لوحة الويب الإدارية (`web/server.js`)

- **المصادقة:** Basic Auth (`ADMIN_WEB_USER` / `ADMIN_WEB_PASS`).  
- **الملفات العامة:** `GET /files/*` من مجلد **`FILES_ROOT`** (أو `files/` افتراضياً)، مثلاً صور النتائج تحت `files/results/`.  
- **`BASE_PUBLIC_URL`** أو رأس الطلب لتكوين روابط عامة مطلقة للصور بعد الرفع.

**مسارات رئيسية:**

| الطريقة | المسار | الغرض |
|---------|--------|--------|
| GET | `/` | إعادة توجيه إلى `/admin` |
| GET | `/admin` | لوحة رئيسية مع أعداد (طلاب، معلمين، محتوى، امتحانات) |
| GET/عمليات | `/admin/students`, `/admin/teachers`, `/admin/reviews` | إدارة قوائم |
| GET/POST | `/admin/import` | استيراد Excel (`adminExcel`) |
| GET/POST | `/admin/exams` | جدولة امتحانات |
| GET/POST | `/admin/library` | رفع ملف لمكتبة المحتوى وفهرسته (`ingestFile`) |
| GET/POST | `/admin/results` | رفع صورة نتيجة لرقم هوية وتحديث **`result_image_url`** |
| GET/POST | `/admin/manual` + مسارات فرعية | إدخال يدوي لمعلم/طالب/حصة جدول |

واجهة RTL عربية مضمّنة في HTML داخل `server.js`.

---

## 7. قاعدة البيانات Supabase

### 7.1 المخطط الأساسي

الملف **`supabase/schema.sql`** يعرّف الجداول الأساسية، منها:

- **`students`** — بيانات الطالب، `national_id` فريد، `telegram_id`، لجنة، **`result_image_url`**  
- **`teachers`** — `telegram_id` فريد  
- **`schedule`** — جدول حصص المعلم (يوم، حصة، صف، فصل)  
- **`parents`** — ربط ولي أمر بالطالب  
- **`exams_schedule`** — مواعيد الامتحانات حسب الصف والمادة والتاريخ  
- **`content_items`** + **`content_chunks`** — مكتبة المراجعات المفهرسة للبحث ومساعد AI  
- **`chat_history`**, **`favorites`** — سجل AI والمفضلة  
- **`diagnostic_tests`**, **`daily_challenges`**, **`challenge_answers`** — تشخيصي وتحدي يومي  
- **`announcements`** — سجل الإعلانات  
- **`results`** — سجل درجات اختياري (موازٍ لصور النتائج)

### 7.2 ملفات الهجرة الإضافية (`supabase/migrations/`)

تُنفَّذ حسب الحاجة والترتيب المنطقي لمشروعك:

- `phase2_results.sql` (+ `phase2_results_unique_fix.sql`) — نتائج/قيود  
- `phase3_content_library.sql` — مكتبة المحتوى  
- `phase4_registration.sql` — تسجيل  
- `phase5_exams_schedule.sql` — امتحانات  
- `phase6_announcements.sql` — إعلانات  
- `phase7_favorites_history.sql` — مفضلة وتاريخ  
- `phase8_diagnostic_challenges.sql` — تشخيص وتحديات  

`DEPLOY.md` يشير على الأقل إلى **`phase2_results.sql`** للنتائج.

كما يوجد **`supabase/arabic_search.sql`** وملفات seed مثل **`seed.example.sql`** للأمثلة.

---

## 8. هيكل المجلدات (ملخص)

| المجلد | المحتوى |
|--------|---------|
| `handlers/` | `admin.js`, `adminWebParity.js`, `student.js`, `teacher.js`, `results.js`, `diagnosticChallenge.js`, `platformContent.js` |
| `services/` | اتصال Supabase، Gemini، مكتبة المحتوى، استخراج النص، Excel، Cron |
| `web/` | `server.js` — لوحة الإدارة |
| `scripts/` | `import-from-csv.js` |
| `utils/` | تواريخ الرياض، تطبيع الهوية، استخراج JSON، أيام الأسبوع العربية، **`platformGrade`** و**`sortUploadedMaterials`** لمواءمة صف المنصّة مع البوت |
| `data/` | بيانات مساعدة إن وُجدت |
| `files/` | تخزين محلي للرفوعات (نتائج، مؤقت، …) |

---

## 9. المتغيرات البيئية (`.env.example`)

| المتغير | الغرض |
|---------|--------|
| `TELEGRAM_BOT_TOKEN` | توكن البوت من BotFather |
| `SUPABASE_URL` | رابط المشروع |
| `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | مفتاح القراءة/الكتابة (الخدمة الأقوى للسيرفر فقط) |
| `ADMIN_TELEGRAM_ID` | معرّف المدير في تيليجرام |
| `WEB_PORT` | منفذ Express |
| `BASE_PUBLIC_URL` | رابط العلن للصور والروابط المطلقة |
| `FILES_ROOT` | مسار تخزين الملفات على السيرفر |
| `ADMIN_WEB_USER` / `ADMIN_WEB_PASS` | حماية `/admin` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | مساعد AI والتوليد |
| **`PLATFORM_PUBLIC_URL`** (اختياري إن لم تُستخدم `BASE_PUBLIC_URL`) | عنوان منصّة الويب لفتح روابط **`/#test/{share_token}`** من البوت |

---

## 10. عرض محتوى المنصّة (رفع Vite) داخل البوت

عند استخدام **مشروع Supabase واحد** مع منصّة المدرسة على الويب، يقرأ البوت جدولَي **`uploaded_materials`** و**`electronic_tests`** (انظر `services/supabase.js`) ويعرضها للطالب أو لولي الأمر:

- زر **«محتوى المنصّة التعليمية»** وقائمة أنواع (جدول مرئي، محلولة، غير محلولة، فيديو، اختبارات إلكترونية).  
- لولي الأمر: **«محتوى المنصّة (ابني)»** بحسب صف الطالب المسجَّل بنص عربي إلى `{ stage, gradeNum }` عبر `utils/platformGrade.js`.  
- **جدول الامتحانات النصّي** من `exams_schedule` يبقى كما هو؛ ويُضاف توجيه لفتح **جداول الصور/الملفات من المنصّة** من نفس القائمة الجديدة (`handlers/platformContent.js`).

---

## 11. خلاصة

هذا المشروع **نظام متكامل داخل تيليجرام** لمدرسة نخبة الشمال: **دعم تعليمي بالذكاء الاصطناعي** مع **مكتبة مراجعات قابلة للبحث**، **اختبارات سريعة وتشخيصية**، **تحدي يومي**، **جداول امتحانات وتذكيرات**، **لجان ونتائج صورية**، و**إدارة من تيليجرام ومن لوحة ويب** بنفس المنطق تقريباً. لضمان عمل كل الميزات، راعِ تطبيق **`schema.sql`** وملفات **`migrations`** المناسبة على Supabase، وتعبئة **Gemini** و**مفاتيح Supabase** و**توكن البوت** في `.env`.
