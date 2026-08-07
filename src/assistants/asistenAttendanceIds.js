/** Asisten keldi/ketdi va rasmlar uchun barqaror ID (ustalar bilan aralashmasin). */
export function asistenAttendancePersonId(assistantId) {
  const id = String(assistantId || "").trim();
  if (!id) return "";
  return `asst_${id}`;
}

export function isAsistenAttendancePersonId(personId) {
  return String(personId || "").startsWith("asst_");
}

export function parseAsistenAttendancePersonId(personId) {
  const raw = String(personId || "");
  return raw.startsWith("asst_") ? raw.slice(5) : "";
}
