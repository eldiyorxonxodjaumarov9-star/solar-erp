/**
 * Loyiha `address` maydoni: "Viloyat, Tuman" (Loyihalar formasi bilan mos).
 * @param {string} addressRaw
 * @returns {{ viloyat: string; district: string }}
 */
export function regionDistrictFromAddress(addressRaw) {
  const address = String(addressRaw || "").trim();
  if (!address) return { viloyat: "", district: "" };
  const parts = address.split(",").map((x) => String(x || "").trim());
  const viloyat = parts[0] || "";
  const district = parts.slice(1).filter(Boolean).join(", ") || "";
  return { viloyat, district };
}
