/**
 * Oddiy CSV parser (papka ichidagi supply fayllar uchun).
 * Birinchi qator — header.
 */
export function parseCsv(text) {
  const rows = [];
  let i = 0;
  const s = String(text || "");
  let row = [];
  let cell = "";
  let inQuotes = false;

  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((c) => String(c).trim() !== "")) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((c) => String(c).trim() !== "")) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((h) =>
    String(h || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_"),
  );
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] != null ? String(r[idx]).trim() : "";
    });
    return obj;
  });
}

export function numOrNull(v) {
  if (v == null || v === "" || String(v).toLowerCase() === "null") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
