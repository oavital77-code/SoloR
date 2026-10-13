# SoloR — אב טיפוס

קצב מצלם נתח → מפרסם → הנתח מופיע בלייב אצל הלקוחות → לקוח מזמין נתח שלם או סטייקים → המלאי מתעדכן אטומית → הקצב מכין ומעדכן סטטוס.

האפיון המלא: [`SPEC.md`](SPEC.md). שאלות פתוחות וחובות טכניים: [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md).

## טכנולוגיות

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, Realtime) · Vercel · PWA.

## סביבה חיה

- אתר: https://solor-steel.vercel.app (פרויקט Vercel בשם `solor`, הפונקציות רצות בפרנקפורט `fra1`)
- Supabase: פרויקט `SoloR` (`ckkzvlheczzdifvfvygv`, אזור `eu-central-1`)
- כל push לענף `claude/funny-fermat-217fy0` מעלה גרסה חדשה לייצור.

## מבנה

```
supabase/
  migrations/   ← סכמה, פונקציות RPC אטומיות, RLS, bucket ו-Realtime
  seed.sql      ← גזעים + רשומת קצבייה אחת
  tests/        ← בדיקות SQL (כולל מקביליות ו-idempotency)
src/
  app/(customer)/      ← פיד לייב, דף נתח, ההזמנות שלי, פרופיל
  app/butcher/         ← בית קצב, אשף נתח, ניהול נתח, הזמנות
  app/login, onboarding, auth/*
  components/          ← CutDetail (משותף לדף הנתח ולתצוגה המקדימה), MediaUploader, OrderTimeline…
  lib/pricing.ts       ← חישובי מחיר (זהים ל-SQL) + בדיקות
  lib/i18n/he.ts       ← כל הטקסטים בעברית
  lib/labels.ts        ← enum → עברית
  middleware.ts        ← הגנת נתיבים לפי התחברות, פרופיל ותפקיד
```

## הקמה

### 1. פרויקט Supabase

1. יוצרים פרויקט חדש (מומלץ אזור `eu-central-1` — פרנקפורט, הכי קרוב לישראל).
2. מריצים את המיגרציות לפי הסדר, ואז את ה-seed. אחת משתי דרכים:
   - **CLI:** `npx supabase link --project-ref <ref>` ואז `npx supabase db push`, ואחר כך מריצים את `supabase/seed.sql` ב-SQL Editor.
   - **ידנית:** מדביקים ב-SQL Editor את קבצי `supabase/migrations/*.sql` לפי הסדר, ואחריהם את `supabase/seed.sql`.
3. **Auth → Providers → Email:** מופעל. כדי שיישלח **קוד כניסה** (ולא רק לינק), ב-**Auth → Email Templates → Magic Link** מוסיפים לתבנית את `{{ .Token }}`, למשל:
   ```html
   <h2>קוד הכניסה שלך ל-SoloR</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   ```
   (מומלץ אותו דבר גם בתבנית **Confirm signup**.)
4. **שליחת מיילים:** שירות המייל המובנה של Supabase שולח רק לכתובות של חברי הארגון ב-Supabase, ובקצב נמוך מאוד (כמה מיילים בשעה). כדי שהקצב והמייסדים יקבלו קוד, מגדירים SMTP חיצוני (למשל Resend) ב-**Auth → SMTP Settings**, או מוסיפים את הכתובות שלהם כחברים בארגון.
5. **Auth → URL Configuration:** Site URL = כתובת ה-Vercel. ב-Redirect URLs מוסיפים `https://<domain>/auth/callback`.
6. **Google (רשות):** מפעילים את הספק ב-Auth, ומגדירים ב-Vercel `NEXT_PUBLIC_ENABLE_GOOGLE=true`.
7. **Storage:** ה-bucket `cut-media` נוצר במיגרציה, עם מגבלה של 200MB לקובץ. **שימו לב:** בתוכנית Free מגבלת הקובץ הגלובלית היא 50MB. כדי להעלות סרטונים גדולים יותר צריך תוכנית Pro, ולהעלות את המגבלה ב-Storage → Settings.

### 2. הגדרת חשבון הקצב

הקצב נרשם באפליקציה כמו כל משתמש (אימייל וקוד, ואז שם וטלפון). אחר כך מריצים ב-SQL Editor:

```sql
update profiles
set role = 'butcher', butcher_id = '00000000-0000-4000-8000-000000000001'
where id = (select id from auth.users where email = 'butcher@example.com');
```

ומעדכנים את פרטי הקצבייה (שם, כתובת, טלפון ושעות איסוף):

```sql
update butchers set name = '...', address = '...', phone = '...', pickup_hours = '...'
where id = '00000000-0000-4000-8000-000000000001';
```

### 3. Vercel

מייבאים את הריפו ל-Vercel ומגדירים משתני סביבה (ראו `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
NEXT_PUBLIC_ENABLE_GOOGLE=false
```

ה-service role key **לא** נדרש לאפליקציה, ואסור לשים אותו בצד הלקוח.

### 4. פיתוח מקומי

```bash
cp .env.example .env.local   # ממלאים URL ו-anon key
npm install
npm run dev                  # http://localhost:3000
```

## בדיקות

```bash
npm test          # בדיקות יחידה: pricing (כולל הדוגמה מ-6.3), ולידציה, סינון פיד
npm run typecheck
npm run db:test   # מיגרציות + RPC + RLS + מקביליות על Postgres מקומי (PGHOST/PGUSER/PGPASSWORD)
```

`db:test` מקים מסד נתונים זמני, יוצר תחליף מינימלי לסכמת `auth` של Supabase, מריץ את כל המיגרציות וה-seed, ובודק:

- פרסום, הזמנה, ביטול, מעברי סטטוס, מכירה בחנות, הסרה מפרסום ומחיקת טיוטה;
- חסימת כתיבה ישירה מהלקוח למלאי, להזמנות ולתפקיד;
- **מקביליות:** שני לקוחות על הסטייק האחרון — רק אחד מצליח, השני מקבל `NOT_ENOUGH_STEAKS`;
- **idempotency:** לחיצה כפולה עם אותו מפתח יוצרת הזמנה אחת בלבד.

## עקרונות שמומשו בקוד

- **מלאי רק דרך RPC:** `publish_cut`, `place_order`, `cancel_order`, `advance_order`, `store_sale`, `withdraw_cut` ו-`revert_to_draft` הן `SECURITY DEFINER` ונועלות את שורת הנתח (`FOR UPDATE`). ללקוח יש הרשאת עמודות רק לשדות תוכן; לסטטוס, למלאי ולהזמנות אין לו הרשאת כתיבה בכלל.
- **מחיר מחושב בשרת** ונשמר כ-snapshot בהזמנה. חישובי הלקוח ב-`pricing.ts` זהים לחישוב ב-SQL, ומשמשים לתצוגה בלבד.
- **אין פרסום בלי אישור:** טיוטה נשמרת אוטומטית (debounce של 800ms), והפרסום נעשה רק דרך מסך התצוגה המקדימה ודיאלוג האישור. עריכה של נתח שכבר באוויר נשמרת רק בלחיצה על "שמור שינויים".
- **לא סומכים רק על Realtime:** כל מסך עושה refetch בחזרה לפוקוס, כשהטאב נהיה גלוי שוב וכשהרשת חוזרת.
