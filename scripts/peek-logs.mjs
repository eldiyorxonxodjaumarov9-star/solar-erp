import Database from "better-sqlite3";

const db = new Database("data/solar-erp.db");
const rows = db
  .prepare("SELECT data FROM documents WHERE collection = 'user_activity_logs' LIMIT 8")
  .all();
for (const r of rows) {
  const d = JSON.parse(r.data);
  console.log({
    ustaId: d.ustaId,
    ustaName: d.ustaName,
    dateKey: d.dateKey,
    loginTime: d.loginTime?.slice(0, 19),
    logoutTime: d.logoutTime?.slice(0, 19),
  });
}
for (const col of ["user_activity_logs", "telegram_events", "work_logs", "workers"]) {
  const c = db
    .prepare("SELECT COUNT(*) AS c FROM documents WHERE collection = ?")
    .get(col);
  console.log(col, c.c);
}

const workers = db.prepare("SELECT id, data FROM documents WHERE collection='workers'").all();
console.log("workers ids:", workers.map((w) => ({ id: w.id, name: JSON.parse(w.data).fullName })));

const june = db.prepare("SELECT data FROM documents WHERE collection='user_activity_logs'").all()
  .map((r) => JSON.parse(r.data))
  .filter((d) => String(d.dateKey || "").startsWith("2026-06"));
console.log("june logs count", june.length);
const byUsta = {};
for (const d of june) {
  byUsta[d.ustaId] = (byUsta[d.ustaId] || 0) + 1;
}
console.log("june by ustaId", byUsta);
