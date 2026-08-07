import fs from "node:fs";

const HTML = process.argv[2];
if (!HTML) {
  console.log("Foydalanish: node scripts/parse-telegram-export.mjs <messages.html yo‘li> [messages2.html ...]");
  process.exit(1);
}

const files = process.argv.slice(2);
let raw = "";
for (const f of files) {
  try {
    raw += fs.readFileSync(f, "utf8");
  } catch (e) {
    console.log(`!! ${f} o‘qilmadi: ${e.message}`);
  }
}

function normDate(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); // DD.MM.YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

// Har bir <div class="text"> ... </div> blokini ko‘rib chiqamiz.
const blocks = raw.split('<div class="text">').slice(1);
const records = [];
for (const b of blocks) {
  const end = b.indexOf("</div>");
  const text = (end >= 0 ? b.slice(0, end) : b).trim();
  let mode = "";
  if (/Ishga keldi/.test(text)) mode = "arrival";
  else if (/Ishdan ketdi/.test(text)) mode = "departure";
  else if (/Dam olish/.test(text)) mode = "day_off";
  else continue;
  const usta = (text.match(/Usta:\s*([^<\n]+)/) || [])[1]?.trim() || "";
  const vaqt = (text.match(/Vaqt:\s*([0-9]{1,2}:[0-9]{2})/) || [])[1]?.trim() || "";
  const sanaRaw = (text.match(/Sana:\s*([^<\n]+)/) || [])[1]?.trim() || "";
  const sana = normDate(sanaRaw);
  if (!usta || !sana) continue;
  records.push({ mode, usta, vaqt, sana });
}

console.log(`Jami keldi/ketdi/dam xabarlari: ${records.length}\n`);

// Usta nomini soddalashtirish (taqqoslash uchun).
function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b(aka|aka|usta|xoja|xon)\b/g, "")
    .replace(/[^a-zа-яёўқғҳ ]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// (usta, sana) bo‘yicha guruh: birinchi keldi + oxirgi ketdi.
const byKey = new Map();
for (const r of records) {
  const key = `${normName(r.usta)}|${r.sana}`;
  const prev = byKey.get(key) || {
    name: r.usta,
    date: r.sana,
    arrival: null,
    departure: null,
    dayOff: false,
  };
  if (r.mode === "arrival") {
    if (!prev.arrival || r.vaqt < prev.arrival) prev.arrival = r.vaqt;
  } else if (r.mode === "departure") {
    if (!prev.departure || r.vaqt > prev.departure) prev.departure = r.vaqt;
  } else if (r.mode === "day_off") {
    prev.dayOff = true;
  }
  byKey.set(key, prev);
}

const days = [...byKey.values()];
console.log(`Noyob (usta + kun) yozuvlar: ${days.length}\n`);

// Oy bo‘yicha
const byMonth = new Map();
for (const d of days) {
  const ym = d.date.slice(0, 7);
  byMonth.set(ym, (byMonth.get(ym) || 0) + 1);
}
console.log("Oy bo‘yicha (usta-kun):");
for (const [k, v] of [...byMonth.entries()].sort()) console.log(`  ${k}: ${v} kun-yozuv`);

// Usta bo‘yicha (normName -> namuna nomi, kunlar soni, May/Iyun)
const byUsta = new Map();
for (const d of days) {
  const nn = normName(d.name);
  const cur = byUsta.get(nn) || { sample: d.name, total: 0, may: 0, jun: 0, withDep: 0 };
  cur.total += 1;
  if (d.date.startsWith("2026-05")) cur.may += 1;
  if (d.date.startsWith("2026-06")) cur.jun += 1;
  if (d.departure) cur.withDep += 1;
  byUsta.set(nn, cur);
}
console.log("\nUsta bo‘yicha (export ichidagi nom -> kunlar):");
for (const [nn, c] of [...byUsta.entries()].sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${c.sample.padEnd(18)} | jami ${c.total} kun | May ${c.may} | Iyun ${c.jun} | ketdi bor ${c.withDep}`);
}

// Natijani faylga yozamiz (keyingi qadam — Firebase'ga yozish uchun)
fs.writeFileSync(
  "scripts/recovered-attendance.json",
  JSON.stringify(days, null, 2),
  "utf8",
);
console.log("\n=> scripts/recovered-attendance.json saqlandi (keyingi qadam uchun).");
