/** +998 XX XXX XX XX */
export function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

export function formatPhoneUz(raw) {
  let d = normalizePhoneDigits(raw);
  if (d.startsWith("998")) d = d.slice(3);
  if (d.length > 9) d = d.slice(0, 9);
  const a = d.slice(0, 2);
  const b = d.slice(2, 5);
  const c = d.slice(5, 7);
  const e = d.slice(7, 9);
  let out = "+998";
  if (a) out += ` ${a}`;
  if (b) out += ` ${b}`;
  if (c) out += ` ${c}`;
  if (e) out += ` ${e}`;
  return out;
}

export function isValidPhoneUz(raw) {
  const d = normalizePhoneDigits(raw);
  const local = d.startsWith("998") ? d.slice(3) : d;
  return local.length === 9 && /^[0-9]{9}$/.test(local);
}
