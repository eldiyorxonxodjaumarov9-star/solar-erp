# Avvalgi hisoblar bilan lokal SolarERP

`scripts/local-emulator-app.mjs` faqat loopback demo Auth/Firestore/Storage emulatorlari bilan ishlaydi. Root `.env` va production Firebase credentials ishlatilmaydi. `data/solar-erp.db` read-only ochiladi; hujjatlar emulatorga sanitized nusxa qilinadi. Ishchi/asisten parollari `accountCredentials`ga hash qilib yoziladi, client-readable profillarga plaintext chiqarilmaydi. Asl SQL fayl o‘zgarmaydi.

Ishga tushirish (PowerShell):

```powershell
$env:DEBUG=''
$env:FIREBASE_EMULATORS_PATH=(Resolve-Path .security-artifacts/emulators).Path
firebase emulators:exec --only auth,firestore,storage --project demo-solar-authorization "node scripts/local-emulator-app.mjs"
```

Login: http://127.0.0.1:5179/login. Avvalgi 13 ishchi va 1 asisten login/paroli saqlanadi. Emulator process qayta ochilganda original read-only snapshot qayta olinadi: emulator ichida qilingan biznes o‘zgarishlar asl SQL’ga yozilmaydi.

Admin eski frontend/localStorage credential’dan avtomatik ishonchli hisob qilinmaydi. Serverda admin credential yo‘q bo‘lsa http://127.0.0.1:5179/local-account-setup sahifasida avvalgi login/parolni operator bir marta kiritadi. Parol hech qayerga log qilinmaydi; scrypt hash ignored `.security-artifacts/local-admin.json`da server uchun saqlanadi. Setup faqat bir marta, exact loopback Origin va nonce bilan; production serverga bu endpoint ulanmagan. Bu lokal bootstrap avvalgi admin parolining tarixiy haqiqiyligini isbotlamaydi, operator uni server uchun qayta belgilaydi. Default parol mavjud emas.

Reports/supply/raw-SQL API qismlari fixture bo‘lib qoladi; auth/staff/Firebase CRUD/private-media server funksiyalari haqiqiy modul bilan ishlaydi. Ushbu buyruq production deploy yoki real account migration emas.
