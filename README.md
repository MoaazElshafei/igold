# igold

أسعار الذهب في مصر (استرشادية) وعالميا + العملات. GitHub Actions + Supabase + PWA.

## التشغيل
1. Supabase: أنشئ مشروع، وشغّل `supabase.sql` في SQL Editor.
2. GitHub: ارفع المجلد كله على ريبو Public فرع `main`.
3. Settings → Secrets → Actions: ضيف `SUPABASE_URL` و `SUPABASE_SERVICE_KEY` (و `GOLDAPI_KEY` اختياري).
4. Actions → "Update igold prices" → Run workflow (تجربة أولى).
5. في `web/app.js` حط `SUPABASE_URL` و `SUPABASE_ANON_KEY` (مفتاح anon فقط، مش service_role).
6. Settings → Pages → Source: GitHub Actions. اعمل push لأي تعديل في `web/`.
7. اظبط الهامش: `python gold_prices.py --calibrate <بيع24> <شراء24>` وحط الناتج في `MARGIN_*`.
