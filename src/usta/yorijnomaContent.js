/** Usta yo‘riqnoma — video manbasi (.env yoki public/videos/). */
export const USTA_YORIJNOMA_VIDEO_SRC =
  (import.meta.env.VITE_USTA_YORIJNOMA_VIDEO_URL || "").trim() ||
  "/videos/usta-yorijnoma.mp4";

/** Video majburiy bo‘lishi uchun .env: VITE_USTA_YORIJNOMA_VIDEO_REQUIRED=true */
export const USTA_YORIJNOMA_VIDEO_REQUIRED =
  String(import.meta.env.VITE_USTA_YORIJNOMA_VIDEO_REQUIRED || "")
    .trim()
    .toLowerCase() === "true";

export const USTA_YORIJNOMA_TITLE = "SUNNUR ENERGY TECH";
export const USTA_YORIJNOMA_SUBTITLE = "Har kunlik xavfsizlik yo‘riqnomasi";

/** Bitta tasdiqlash katakchasi matni */
export const USTA_YORIJNOMA_CONFIRM_TEXT =
  "Xavfsizlik yo‘riqnomasi bilan tanishib chiqdim va to‘liq rioya qilishga roziman";

/**
 * Bo‘limlar: har biri sarlavha + bandlar (+ ixtiyoriy ogohlantirish).
 * @type {{ id: string; title: string; items: string[]; warn?: string[] }[]}
 */
export const USTA_YORIJNOMA_SECTIONS = [
  {
    id: "boshlashdan-oldin",
    title: "Ish boshlashdan oldin",
    items: [
      "Bugungi ish rejasi va xavfli nuqtalar brigada bilan muhokama qilinadi.",
      "Barcha mahsulot va materiallar yetib kelganligi tekshiriladi: quyosh panellari, konstruksiyalar, kabel, inverter va elektr uskunalari, issiqlik nasosi, mahkamlovchi detallar.",
    ],
    warn: ["Yetishmaydigan mahsulotlarni omborchiga aytib olib keltiring."],
  },
  {
    id: "himoya-vositalari",
    title: "Maxsus himoya vositalari (har bir xodim shart)",
    items: [
      "Kaska, maxsus ish kiyimi, himoya qo‘lqopi, sirpanmaydigan oyoq kiyim, himoya ko‘zoynagi, xavfsizlik kamari.",
    ],
    warn: ["Himoya vositalarisiz tom ustida ishlash qat’iyan taqiqlanadi."],
  },
  {
    id: "asbob-tekshiruv",
    title: "Asbob-uskunalarni tekshirish",
    items: [
      "Shurupovort, svarka apparati, bolgarka, elektr uskunalari, kabel va udlinitel, narvonlar, xavfsizlik troslari va himoya jihozlari tekshiriladi.",
    ],
    warn: ["Nosoz yoki xavfli uskuna bilan ishlash mumkin emas."],
  },
  {
    id: "narvon-balandlik",
    title: "Narvon va balandlikdagi ishlar",
    items: [
      "Narvon mustahkam joyga o‘rnatiladi; sirpanchiq yoki nosoz narvon ishlatilmaydi.",
      "Narvonda bir xodim ishlaydi, ikkinchisi pastdan ushlab nazorat qiladi.",
      "Tom ustida xavfsizlik troslari va kamaridan foydalanish majburiy.",
    ],
    warn: ["Himoyasiz balandlikda ishlash taqiqlanadi."],
  },
  {
    id: "tom-ustida",
    title: "Tom ustida ishlash",
    items: [
      "Tomning sirpanchiqligi, namligi va mustahkamligi tekshiriladi.",
      "Qor, yomg‘ir yoki muz bo‘lsa tomga chiqilmaydi; kuchli shamolda panel montaji qilinmaydi.",
    ],
    warn: ["Sirpanchiq tom — hayot uchun xavf."],
  },
  {
    id: "ob-havo",
    title: "Ob-havo o‘zgarib qolsa",
    items: [
      "Yomg‘ir, qor yoki kuchli shamolda darhol xavfsizlik choralari ko‘riladi.",
      "Konstruksiya va panellar mahkamligi tekshiriladi, bo‘sh materiallar xavfsiz joylashtiriladi.",
    ],
    warn: ["Zarurat bo‘lsa ish vaqtincha to‘xtatiladi."],
  },
  {
    id: "panel-montaj",
    title: "Quyosh paneli montaji",
    items: [
      "Panellar ehtiyotkorlik bilan tashiladi va vaqtincha xavfsiz joylashtiriladi.",
      "Panel mahkam qotirilmaguncha qarovsiz qoldirilmaydi.",
    ],
    warn: ["Panel tushib ketishi inson hayoti uchun xavf tug‘diradi."],
  },
  {
    id: "elektr",
    title: "Elektr xavfsizligi",
    items: [
      "Nam qo‘l bilan elektr uskunalariga tegilmaydi; ochiq yoki shikastlangan kabel ishlatilmaydi.",
      "Tok ostidagi ish faqat mutaxassis nazoratida bajariladi; ulanishlar standart talablarga mos bo‘ladi.",
    ],
    warn: ["Elektr bilan ehtiyotsizlik og‘ir jarohat yoki o‘limga olib keladi."],
  },
  {
    id: "issiqlik-nasosi",
    title: "Issiqlik nasosi montaji",
    items: [
      "Freon liniyalari ehtiyotkorlik bilan ulanadi; bosim va ulanish joylari tekshiriladi.",
      "Elektr qismlari mutaxassis tomonidan ishga tushiriladi, tizim sinovdan o‘tkaziladi.",
    ],
  },
  {
    id: "ish-davomida",
    title: "Ish davomida",
    items: [
      "Ish joyi toza saqlanadi, yo‘lakda keraksiz buyum qolmaydi.",
      "Tomdan buyum tashlash taqiqlanadi.",
      "Hazillashish, chalg‘ituvchi harakatlar va telefon bilan band bo‘lish mumkin emas.",
    ],
  },
  {
    id: "ish-tugagach",
    title: "Ish tugagandan keyin",
    items: [
      "Elektr uskunalari o‘chiriladi, asboblar yig‘ishtiriladi, ish joyi tozalanadi.",
      "Tomda bo‘sh uskuna yoki material qoldirilmaydi.",
      "Bajarilgan ishlarning rasm/videolari olinadi va guruhga yuboriladi, hisobot topshiriladi.",
      "Tizim to‘liq tekshirilib, mijozga ishlash holatida topshiriladi.",
    ],
    warn: ["Ob’ektni tekshirmasdan va topshirmasdan tark etish mumkin emas."],
  },
  {
    id: "yakuniy",
    title: "Yakuniy eslatma",
    items: [],
    warn: [
      "Xavfsizlik — har bir xodimning majburiyati.",
      "Shoshilish — xato va xavfga olib keladi.",
      "Avvalo xavfsizlik, keyin tezlik va sifat.",
    ],
  },
];
