import Database from "better-sqlite3";

const db = new Database("d:/solar-erp/data/supply/database.db", { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("tables:", tables.map((t) => t.name).join(", "));
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
  const n = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get();
  console.log(`\n## ${t.name} (${n.c})`);
  console.log("cols:", cols.map((c) => c.name).join(", "));
  // faqat non-price ustunlar sample
  const priceCols = new Set(
    cols.filter((c) => /price|narx|cost/i.test(c.name)).map((c) => c.name),
  );
  const safeCols = cols.map((c) => c.name).filter((n) => !priceCols.has(n));
  if (!safeCols.length) {
    console.log("sample: (faqat price ustunlari — o‘tkazildi)");
    continue;
  }
  const rows = db.prepare(`SELECT ${safeCols.join(", ")} FROM ${t.name} LIMIT 2`).all();
  console.log("sample:", JSON.stringify(rows));
}
db.close();
