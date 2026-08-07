/** Asisten panel navigatsiyasi */
export const ASISTEN_PANEL_NAV = [
  { to: "/asisten-panel", label: "Bosh sahifa", end: true },
  { to: "/asisten-panel/loyihalar", label: "Loyihalar" },
  { to: "/asisten-panel/monthly-reports", label: "Oylik hisobot" },
  { to: "/asisten-panel/tijoriy-taklif", label: "Tijoriy taklif" },
  { to: "/asisten-panel/taminot", label: "Taminot", icon: "supply" },
  { to: "/asisten-panel/ish-vaqti", label: "Ish vaqti" },
  { to: "/asisten-panel/rasmlar", label: "Rasmlar" },
];

export const ASISTEN_MOBILE_BOTTOM_NAV = [
  { to: "/asisten-panel", label: "Bosh", end: true },
  { to: "/asisten-panel/loyihalar", label: "Loyihalar" },
  { to: "/asisten-panel/ish-vaqti", label: "Ish vaqti" },
  { to: "/asisten-panel/rasmlar", label: "Rasmlar" },
];

/** Usta panel desktop sidebar — full list under `/usta-panel` */
export const USTA_PANEL_NAV = [
  { to: "/usta-panel", label: "Bosh sahifa", end: true },
  { to: "/usta-panel/jalba", label: "Jalba" },
  { to: "/usta-panel/loyihalar", label: "Loyihalar" },
  { to: "/usta-panel/xarajatlar", label: "Xarajatlar" },
  { to: "/usta-panel/ish-vaqti", label: "Ish vaqti" },
];

/** Usta mobile bottom bar shortcuts */
export const USTA_MOBILE_BOTTOM_NAV = [
  { to: "/usta-panel/loyihalar", label: "Loyihalar" },
  { to: "/usta-panel/xarajatlar", label: "Xarajatlar" },
  { to: "/usta-panel/ish-vaqti", label: "Ish vaqti" },
];

/** Usta mobile hamburger — secondary links only */
export const USTA_EXTRA_MENU_NAV = [
  { to: "/usta-panel", label: "Bosh sahifa", end: true },
  { to: "/usta-panel/jalba", label: "Jalba" },
];

/** Primary sidebar navigation — paths match React Router routes */
export const MAIN_NAV = [
  { to: "/", label: "Bosh sahifa", end: true },
  { to: "/ustalar", label: "Masterlar" },
  { to: "/asistenlar", label: "Asistenlar" },
  { to: "/usta-faolligi", label: "Master faolligi" },
  { to: "/hisobot", label: "Hisobot" },
  { to: "/admin/commercial-offers", label: "Tijoriy taklif" },
  { to: "/admin/supply", label: "Taminot", icon: "supply" },
  { to: "/admin/contacts", label: "Contactlar" },
  { to: "/jalba", label: "Jalba" },
  { to: "/yorijnoma", label: "Yo‘riqnoma" },
  { to: "/brigadalar", label: "Brigadalar" },
  { to: "/loyihalar", label: "Loyihalar" },
  { to: "/vazifalar", label: "Vazifalar", isDisabled: true },
  { to: "/xarajatlar", label: "Xarajatlar" },
  { to: "/rasmlar", label: "Rasmlar" },
  { to: "/sifat-nazorati", label: "Sifat nazorati", isDisabled: true },
  { to: "/tahlil", label: "Tahlil" },
  { to: "/admin/monthly-reports", label: "Oylik hisobot" },
  { to: "/viloyat-ish-kunlari", label: "Viloyat ish kunlari" },
  { to: "/ish-vaqtlari", label: "Ish vaqtlari" },
  { to: "/monitoring", label: "Monitoring", isDisabled: true },
  { to: "/sozlamalar", label: "Sozlamalar" },
];

export const SECTION_COPY = {
  ustalar: {
    title: "Masterlar",
    description:
      "Master va mutaxassislar ro‘yxati, bandlik va reyting.",
  },
  asistenlar: {
    title: "Asistenlar",
    description: "Admin yordamchilari profillari.",
  },
  "usta-faolligi": {
    title: "Master faolligi",
    description:
      "Har bir master nechta loyihada qatnashgani, nechta loyihani tugatgani va joriy bandligi.",
  },
  brigadalar: {
    title: "Brigadalar",
    description: "Brigadalarni tuzish va ularni loyihalarga biriktirish.",
  },
  loyihalar: {
    title: "Loyihalar",
    description: "Faol va yakunlangan quyosh loyihalari holati.",
  },
  vazifalar: {
    title: "Vazifalar",
    description: "Topshiriqlar, muddatlar va ijrochi biriktirish.",
  },
  xarajatlar: {
    title: "Xarajatlar",
    description: "Byudjet, chiqimlar va tasdiqlash oqimi.",
  },
  rasmlar: {
    title: "Rasmlar",
    description: "Ob‘yekt rasmlari va hujjatlar arxivi.",
  },
  "sifat-nazorati": {
    title: "Sifat nazorati",
    description: "Tekshiruvlar va aktlar (demo).",
  },
  tahlil: {
    title: "Tahlil",
    description: "Ko‘rsatkichlar va hisobotlar.",
  },
  "monthly-reports": {
    title: "Oylik hisobot",
    description:
      "Loyihalarni oylar, kW va sistema turi kesimida tahlil qilish; PDF va Excel eksport.",
  },
  "viloyat-ish-kunlari": {
    title: "Viloyat ish kunlari",
    description:
      "Loyiha, usta va oy bo‘yicha ish kunlari; 14 viloyat jadvali bilan PDF hisobot — Telegramga yuborilmaydi.",
  },
  "ish-vaqtlari": {
    title: "Ish vaqtlari",
    description: "Ustalar va asistenlarning keldi-ketdi yozuvlari, rasmlar va smenalar.",
  },
  contactlar: {
    title: "Contactlar",
    description: "Loyihalardagi mijozlar — telefon, quvvat va holat.",
  },
  supply: {
    title: "Taminot",
    description: "Taminot bo‘limi",
  },
  monitoring: {
    title: "Monitoring",
    description: "Real vaqt monitoring va signal holati.",
  },
  sozlamalar: {
    title: "Sozlamalar",
    description: "Tizim va hisob sozlamalari.",
  },
};
