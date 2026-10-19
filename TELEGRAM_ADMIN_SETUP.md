# Telegram admin Web App sozlamasi

## Xavfsizlik modeli

- `/admin` faqat server muhitidagi `TELEGRAM_ADMIN_IDS` ro‘yxatida bo‘lgan Telegram foydalanuvchisiga Web App tugmasini beradi.
- Tugma manzili `TELEGRAM_ADMIN_WEBAPP_URL` orqali beriladi. U haqiqiy TLS sertifikatli `https://` manzil bo‘lishi shart; repozitoriyga maxfiy ID yoki token qo‘shmang.
- Web App har bir API so‘rovida Telegram bergan `initData` qiymatini yuboradi. Server uni `TELEGRAM_BOT_TOKEN` orqali HMAC bilan tekshiradi va har so‘rovda admin ID ro‘yxatini qayta tekshiradi.
- Xodim ro‘yxatida faqat ism, faollik va Telegram ulanish holati ko‘rsatiladi. Telefon, login, maosh, parol, credential va Telegram ID qaytarilmaydi.
- Xodim yaratish `server/workerService.js` orqali mavjud `workers`, `accountCredentials`, password hash va `prepareWorkerSalaryRate` qoidalaridan foydalanadi. Yangi xodim `workers` kolleksiyasiga bir marta yoziladi; `users` uchun alohida profil ochilmaydi.
- Yaratish so‘rovi Telegram ID, username yoki mavjud Telegram mappinglarini qabul qilmaydi. Xodim o‘z hisobidan `/start` bosib, kontaktini o‘zi yuborgandagina mavjud linking oqimi bog‘laydi.

## Server sozlamalari

Quyidagi qiymatlarni faqat bot ishlaydigan serverning himoyalangan muhit sozlamasiga kiriting:

```dotenv
TELEGRAM_ADMIN_IDS=<tasdiqlangan Telegram IDlar vergul bilan>
TELEGRAM_ADMIN_WEBAPP_URL=https://<amaldagi-API-domen>/api/telegram/admin/app
```

`TELEGRAM_BOT_TOKEN` amaldagi himoyalangan sozlamada bo‘lishi kerak. Uni bu faylga ko‘chirmang. `TELEGRAM_ADMIN_IDS` bo‘sh bo‘lsa, bot admin Web App tugmasini bermaydi; URL HTTPS bo‘lmasa panel ochilmaydi.

## HTTPS va Nginx

`TELEGRAM_ADMIN_WEBAPP_URL` Telegram Web App uchun ochiq, amal qiluvchi TLS sertifikatli domen bo‘lishi kerak. Hozircha production domeni tasdiqlanmagani sababli bu loyiha hech qanday aniq domenni taxmin qilmaydi. DNS va sertifikat tasdiqlangach, mavjud SolarERP HTTPS server blokida `ops/nginx-api.conf.template` dagi faqat `/api/telegram/admin/app` uchun ajratilgan location qoidasini ko‘rib chiqing.

Web App sahifasi `frame-ancestors https://web.telegram.org https://*.telegram.org` siyosatini beradi. Nginx shu aniq sahifa marshrutida `X-Frame-Options: DENY` sarlavhasini olib tashlaydi; qolgan `/api` marshrutlari va attendance webhook himoyasi o‘zgarishsiz qoladi. Nginx server blokini o‘zgartirishdan avval amaldagi konfiguratsiya va upstream manzilini tekshirish kerak.

## Tekshiruv va chiqarish tartibi

1. `npm run test:telegram-admin`, `npm run test:auth`, `npm run test:telegram-linking` va `npm run build` ni staging clone’da bajaring.
2. HTTPS domen va Telegram Web App origin siyosatini ko‘rib chiqing.
3. `TELEGRAM_ADMIN_IDS` ni faqat admin ID egasining roziligi va ishonchli manbadan tasdiqlangandan keyin kiriting.
4. Productiondagi dirty fayllarni to‘liq almashtirmang. Faqat ko‘rib chiqilgan branch patchini backup va rollback bilan alohida release katalogida sinang.
5. Deploy, `solar-erp` PM2 restart, Nginx o‘zgarishi yoki webhookni yangilashdan oldin alohida ruxsat va smoke-test rejasi talab qilinadi.
