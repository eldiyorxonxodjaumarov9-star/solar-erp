/**
 * SOATO asosidagi to‘liq viloyat/tuman ro‘yxatini regionDistricts.js ga yig‘adi.
 * Manba: FounderDAO/uzbekistan-regions-data (JSON)
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const regionsUrl =
  "https://raw.githubusercontent.com/FounderDAO/uzbekistan-regions-data/master/JSON/regions.json";
const districtsUrl =
  "https://raw.githubusercontent.com/FounderDAO/uzbekistan-regions-data/master/JSON/districts.json";

const REGION_ORDER = [
  "Andijon viloyati",
  "Buxoro viloyati",
  "Farg‘ona viloyati",
  "Jizzax viloyati",
  "Namangan viloyati",
  "Navoiy viloyati",
  "Qashqadaryo viloyati",
  "Qoraqalpog‘iston Respublikasi",
  "Samarqand viloyati",
  "Sirdaryo viloyati",
  "Surxondaryo viloyati",
  "Toshkent shahri",
  "Toshkent viloyati",
  "Xorazm viloyati",
];

const SKIP_DISTRICTS = new Set([
  "Toshkent shahrining tumanlari",
]);

function toApostrophe(s) {
  return String(s || "")
    .replace(/`/g, "‘")
    .replace(/'/g, "‘")
    .replace(/ʻ/g, "‘")
    .replace(/ʼ/g, "‘");
}

function districtLabel(nameUz) {
  const n = toApostrophe(nameUz).trim();
  if (!n || SKIP_DISTRICTS.has(n)) return "";
  if (/ tumani$| shahri$| shaxar$| shahri$/.test(n)) {
    return n.replace(/ shaxar$/, " shahri");
  }
  return `${n} shahri`;
}

function regionLabel(nameUz) {
  return toApostrophe(nameUz).trim();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yuklab bo‘lmadi: ${url}`);
  return res.json();
}

async function main() {
  const [regions, districts] = await Promise.all([
    fetchJson(regionsUrl),
    fetchJson(districtsUrl),
  ]);

  const regionById = new Map(regions.map((r) => [r.id, regionLabel(r.name_uz)]));
  const map = {};

  for (const d of districts) {
    const region = regionById.get(d.region_id);
    const label = districtLabel(d.name_uz);
    if (!region || !label) continue;
    if (!map[region]) map[region] = [];
    if (!map[region].includes(label)) map[region].push(label);
  }

  for (const list of Object.values(map)) {
    list.sort((a, b) => a.localeCompare(b, "uz"));
  }

  const ordered = {};
  for (const name of REGION_ORDER) {
    if (map[name]?.length) ordered[name] = map[name];
  }
  for (const [name, list] of Object.entries(map)) {
    if (!ordered[name]) ordered[name] = list;
  }

  const totalDistricts = Object.values(ordered).reduce((n, arr) => n + arr.length, 0);
  const body = `/** O‘zbekiston viloyatlari va tumanlari — Loyihalar va Tijoriy taklif formalarida.
 * To‘liq ro‘yxat (SOATO, ${Object.keys(ordered).length} viloyat, ${totalDistricts} tuman/shahar).
 * Yangilash: node scripts/build-region-districts.mjs
 */
export const REGION_DISTRICTS = ${JSON.stringify(ordered, null, 2)};

export const REGIONS = Object.keys(REGION_DISTRICTS);

export const PINNED_DISTRICT_LABELS = {
  "Farg‘ona viloyati": ["Farg‘ona shahar", "Qo‘qon", "Marg‘ilon", "Quvasoy"],
  "Toshkent viloyati": ["Angren", "Qibray", "Chirchiq", "Olmaliq", "Nurafshon"],
};

export function normalizeRegionLabel(value) {
  return String(value || "")
    .trim()
    .replace(/\\u0060/g, "‘")
    .replace(/'/g, "‘")
    .replace(/ʻ/g, "‘")
    .replace(/ʼ/g, "‘");
}

export function canonicalDistrict(value) {
  const v = normalizeRegionLabel(value);
  if (!v) return "";

  for (const list of Object.values(REGION_DISTRICTS)) {
    if (list.includes(v)) return v;
  }

  const lower = v.toLowerCase();
  if (lower === "fargona shahar" || lower === "farg'ona shahar") {
    return "Farg‘ona shahri";
  }

  for (const list of Object.values(REGION_DISTRICTS)) {
    for (const item of list) {
      if (item.toLowerCase() === lower) return item;
      const short = item.replace(/\\s+(shahri|tumani)$/i, "").toLowerCase();
      if (short === lower) return item;
    }
  }

  return v;
}

export function districtOptionsForRegion(region, savedDistrict = "") {
  const key = normalizeRegionLabel(region);
  const base = REGION_DISTRICTS[key] || REGION_DISTRICTS[region] || [];
  const pinned = PINNED_DISTRICT_LABELS[key] || [];
  const saved = canonicalDistrict(savedDistrict);

  const options = [];
  const seenValues = new Set();

  const add = (label, value = canonicalDistrict(label)) => {
    if (!value || seenValues.has(value)) return;
    seenValues.add(value);
    options.push({ value, label: label || value });
  };

  for (const label of pinned) add(label);
  if (saved) add(savedDistrict, saved);
  for (const item of base) add(item, item);

  const pinnedValues = new Set(
    pinned.map((label) => canonicalDistrict(label)).filter(Boolean),
  );
  const head = options.filter((o) => pinnedValues.has(o.value));
  const tail = options
    .filter((o) => !pinnedValues.has(o.value))
    .sort((a, b) => a.label.localeCompare(b.label, "uz"));

  return [...head, ...tail];
}

export function districtsForRegion(region, savedDistrict = "") {
  return districtOptionsForRegion(region, savedDistrict).map((o) => o.label);
}
`;

  const outPath = join(root, "src", "data", "regionDistricts.js");
  writeFileSync(outPath, body, "utf8");
  console.log(
    `[build-region-districts] ${Object.keys(ordered).length} viloyat, ${totalDistricts} tuman/shahar → ${outPath}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
