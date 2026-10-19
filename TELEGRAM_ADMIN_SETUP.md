# Telegram admin panel sozlamasi

Admin huquqi faqat server muhitidagi `TELEGRAM_ADMIN_IDS` qiymati bilan tekshiriladi. Qiymatni bot ishlaydigan serverning himoyalangan muhit sozlamasiga vergul bilan ajratilgan Telegram foydalanuvchi IDlari ko‘rinishida kiriting, masalan: `TELEGRAM_ADMIN_IDS=123456789,987654321`.

Bu qiymatni frontendga, ommaviy repozitoriyga yoki loglarga joylamang. Qiymat sozlanmagan yoki ID ro‘yxatda bo‘lmasa, `/admin` ruxsat bermaydi. Telegram foydalanuvchi IDlarini bot update’idan ishonchli manbada tekshirib oling.

`Xodimlar` bo‘limi `workers` profilini ustuvor qilib, `users` legacy profilini document ID bo‘yicha birlashtiradi. Telefon, maosh, parol va Telegram tokenlari chiqarilmaydi. `Hisobni ulash` bo‘limi xodimni o‘z Telegram hisobidan `/start` yuborib, o‘z kontaktini jo‘natadigan mavjud xavfsiz ulash oqimiga yo‘naltiradi. Admin xodim nomidan Telegram hisobini ulay olmaydi.
