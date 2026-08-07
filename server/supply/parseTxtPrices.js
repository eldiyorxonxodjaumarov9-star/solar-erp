import { numOrNull } from "./parseCsv.js";

/**
 * Taminot_Narxlari.txt kabi fayllarni parse qiladi.
 * Narx: `0.68$` yoki `70.000 so'm` / `20.000 so’m`
 */
function parseMoneyToken(raw) {
  const t = String(raw || "")
    .replace(/\u00a0/g, " ")
    .trim();
  const usd = t.match(/([\d]+(?:[.,]\d+)?)\s*\$/);
  if (usd) {
    return { priceUsd: Number(usd[1].replace(",", ".")), priceUzs: null, currency: "USD" };
  }
  const uzs = t.match(/([\d.\s]+)\s*so[‘'’`]?m/i);
  if (uzs) {
    const digits = uzs[1].replace(/\s/g, "").replace(/\./g, "");
    const n = Number(digits);
    if (Number.isFinite(n)) return { priceUsd: null, priceUzs: n, currency: "UZS" };
  }
  return null;
}

function splitNamePrice(line) {
  const cleaned = String(line || "")
    .replace(/^\d+\.\s*/, "")
    .trim();
  const m = cleaned.match(/^(.+?):\s*(.+)$/);
  if (!m) return null;
  const left = m[1].trim();
  const right = m[2].trim();
  // "1 dona - 70.000 so'm" yoki "1 metr - 0.68$"
  const unitMatch = right.match(/^([\d.]+)\s*(dona|metr|m|pcs)?\s*[-–—]\s*(.+)$/i);
  let unit = "dona";
  let moneyRaw = right;
  if (unitMatch) {
    unit = (unitMatch[2] || "dona").toLowerCase().startsWith("m") ? "metr" : "dona";
    moneyRaw = unitMatch[3];
  }
  const money = parseMoneyToken(moneyRaw);
  if (!money) return null;
  return { name: left, unit, ...money };
}

/**
 * @param {string} text
 * @param {number} exchangeRateUsdUzs
 */
export function parseTaminotPricesTxt(text, exchangeRateUsdUzs) {
  const rate = Number(exchangeRateUsdUzs) || 0;
  const toUsd = (item) => {
    if (item.priceUsd != null) return { ...item, price: item.priceUsd, currency: "USD" };
    if (item.priceUzs != null && rate > 0) {
      return {
        ...item,
        price: Math.round((item.priceUzs / rate) * 10000) / 10000,
        currency: "USD",
      };
    }
    return { ...item, price: null, currency: item.currency || "USD" };
  };

  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const metal = [];
  const breakers = [];
  const accessories = [];
  let section = "metal";

  for (const line of lines) {
    if (/^—+\s*Breaker/i.test(line) || /^-+?\s*Breaker/i.test(line)) {
      section = "breaker";
      continue;
    }
    if (/^—+\s*Aksessuar/i.test(line) || /Aksessuarlar/i.test(line)) {
      section = "accessory";
      continue;
    }

    if (/Metal|Metall/i.test(line) && /:/i.test(line)) {
      const parsed = splitNamePrice(line.replace(/^Metal\s*konstruktsiya/i, "Metall konstruksiya"));
      // "Metal konstruktsiya: 1 metr - 20.000 so'm"
      const m2 = line.match(/:\s*(.+)$/);
      if (m2) {
        const unitMatch = m2[1].match(/^([\d.]+)\s*(metr|m|dona)?\s*[-–—]\s*(.+)$/i);
        if (unitMatch) {
          const money = parseMoneyToken(unitMatch[3]);
          if (money) {
            metal.push(
              toUsd({
                id: "metal-per-meter",
                category: "metal",
                name: "Metall konstruksiya",
                brand: "",
                model: "Metall konstruksiya",
                unit: "metr",
                subtype: "metal",
                ...money,
              }),
            );
          }
        } else if (parsed) {
          metal.push(
            toUsd({
              id: "metal-per-meter",
              category: "metal",
              ...parsed,
              brand: "",
              model: parsed.name,
              subtype: "metal",
            }),
          );
        }
      }
      continue;
    }

    const parsed = splitNamePrice(line);
    if (!parsed) continue;

    const slug = parsed.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);

    if (section === "breaker") {
      let subtype = "other";
      if (/YCB7|Avto|2P C/i.test(parsed.name) && !/YC6S/i.test(parsed.name)) subtype = "ac";
      else if (/PV-32|1000V|Upower|Upover/i.test(parsed.name)) subtype = "dc";
      else if (/Kabel/i.test(parsed.name)) subtype = "cable";
      else if (/Surge/i.test(parsed.name)) subtype = "surge";
      else if (/YC6S/i.test(parsed.name)) subtype = "ac_alt";

      const category = subtype === "cable" ? "cable" : "breaker";
      breakers.push(
        toUsd({
          id: `${category}-${slug || subtype}`,
          category,
          brand: "",
          model: parsed.name,
          name: parsed.name,
          unit: parsed.unit,
          subtype,
          ...parsed,
        }),
      );
    } else if (section === "accessory") {
      let subtype = "accessory";
      if (/MC4/i.test(parsed.name)) subtype = "mc4";
      else if (/Orta|O‘rta|O'rta/i.test(parsed.name)) subtype = "orta_shayba";
      else if (/Chekka/i.test(parsed.name)) subtype = "chekka_shayba";
      accessories.push(
        toUsd({
          id: `acc-${slug || subtype}`,
          category: "accessory",
          brand: "",
          model: parsed.name,
          name: parsed.name,
          unit: parsed.unit,
          subtype,
          ...parsed,
        }),
      );
    }
  }

  return { metal, breakers, accessories };
}

export function mapCsvBatteryRow(row, idx) {
  const id = String(row.id || `csv-bat-${idx + 1}`);
  const name = String(row.name || "").trim();
  const capacityKwh = numOrNull(row.capacity_kwh ?? row.capacitykwh);
  const price = numOrNull(row.price ?? row.price_usd);
  return {
    id: `bat-csv-${id}`,
    category: "battery",
    brand: "",
    model: name,
    name,
    capacityKwh,
    capacityAh: null,
    voltage: "",
    chemistry: /GEL/i.test(name) ? "GEL" : /AGM/i.test(name) ? "AGM" : /LiFe/i.test(name) ? "LiFePO4" : "",
    unit: "dona",
    price,
    priceUsd: price,
    currency: "USD",
    subtype: "",
    source: "csv",
  };
}
