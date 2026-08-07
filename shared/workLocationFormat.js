/** @param {Record<string, unknown> | null | undefined} loc */
export function locationSourceLabel(loc) {
  if (!loc) return "";
  if (loc.source === "ip") return "Taxminiy (internet, ~5 km)";
  if (loc.source === "device") return "Aniq (GPS)";
  return "";
}

/** @param {Record<string, unknown> | null | undefined} loc */
export function formatLocationTelegramBlock(loc) {
  if (!loc || loc.latitude == null || loc.longitude == null) return "";
  const lat = Number(loc.latitude).toFixed(6);
  const lng = Number(loc.longitude).toFixed(6);
  const lines = [`📍 Joylashuv: ${lat}, ${lng}`];
  const address = String(loc.address || "").trim();
  if (address) lines.push(`Manzil: ${address}`);
  const src = locationSourceLabel(loc);
  if (src) lines.push(`(${src})`);
  const acc = Number(loc.accuracy);
  if (Number.isFinite(acc) && acc > 0) lines.push(`Aniqlik: ±${Math.round(acc)} m`);
  const mapsUrl =
    String(loc.mapsUrl || "").trim() ||
    `https://maps.google.com/?q=${lat},${lng}`;
  lines.push(mapsUrl);
  return lines.join("\n");
}

/** @param {Record<string, unknown> | null | undefined} loc */
export function formatLocationFull(loc) {
  if (!loc || loc.latitude == null || loc.longitude == null) return "—";
  const address = String(loc.address || "").trim();
  if (address) return address;
  return `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}`;
}

export function mapsEmbedUrl(loc) {
  if (!loc || loc.latitude == null || loc.longitude == null) return "";
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `https://maps.google.com/maps?q=${lat},${lng}&hl=uz&z=16&output=embed`;
}

/** @param {Record<string, unknown> | null | undefined} loc */
export function formatLocationShort(loc) {
  if (!loc || loc.latitude == null || loc.longitude == null) return "—";
  const address = String(loc.address || "").trim();
  const approx = loc.source === "ip" ? "≈ " : "";
  if (address) {
    const short = address.split(",").slice(0, 2).join(",").trim();
    if (short) return `${approx}${short}`;
  }
  return `${approx}${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}`;
}

export function mapsLink(loc) {
  if (!loc || loc.latitude == null || loc.longitude == null) return "";
  return (
    String(loc.mapsUrl || "").trim() ||
    `https://maps.google.com/?q=${Number(loc.latitude)},${Number(loc.longitude)}`
  );
}
