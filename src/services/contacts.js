/** Telefon raqamini dedup uchun normalizatsiya (faqat raqamlar). */
export function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/** Loyihadagi stansiya quvvati — bir nechta legacy maydon nomi. */
export function extractStationPower(project) {
  const raw =
    project?.stationPower ??
    project?.power ??
    project?.kw ??
    project?.powerKw ??
    null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractProjectStatus(project) {
  return String(project?.holat || project?.status || "—").trim() || "—";
}

export function projectCreatedTime(project) {
  const raw = project?.createdAt || project?.updatedAt || project?.startDate || "";
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Firestore project → contact obyekti. */
export function mapProjectToContact(project) {
  if (!project?.id) return null;
  const clientName = String(project.clientName || "").trim();
  const phone = String(project.phone || "").trim();
  if (!clientName && !phone) return null;

  return {
    projectId: String(project.id),
    clientName: clientName || "—",
    phone: phone || "—",
    stationPower: extractStationPower(project),
    status: extractProjectStatus(project),
    createdAt: project.createdAt || project.updatedAt || project.startDate || "",
    _sortTime: projectCreatedTime(project),
    _phoneKey: normalizePhone(phone),
  };
}

/**
 * Bir xil telefon bilan bir nechta loyiha bo‘lsa — eng yangisi qoladi.
 * Telefon bo‘sh bo‘lsa — har bir loyiha alohida contact.
 */
export function dedupeContactsByPhone(contacts) {
  const byPhone = new Map();
  const noPhone = [];

  for (const c of contacts) {
    if (!c._phoneKey) {
      noPhone.push(c);
      continue;
    }
    const prev = byPhone.get(c._phoneKey);
    if (!prev || c._sortTime >= prev._sortTime) {
      byPhone.set(c._phoneKey, c);
    }
  }

  return [...byPhone.values(), ...noPhone];
}

export function buildContactsFromProjects(projects) {
  const list = Array.isArray(projects) ? projects : [];
  const mapped = list.map(mapProjectToContact).filter(Boolean);
  const deduped = dedupeContactsByPhone(mapped);
  return sortContactsByNewest(deduped);
}

export function sortContactsByNewest(contacts) {
  return [...contacts].sort((a, b) => b._sortTime - a._sortTime);
}

export function sortContactsByKv(contacts, direction = "asc") {
  const factor = direction === "desc" ? -1 : 1;
  return [...contacts].sort((a, b) => {
    const av = a.stationPower ?? -1;
    const bv = b.stationPower ?? -1;
    if (av === bv) return b._sortTime - a._sortTime;
    return (av - bv) * factor;
  });
}

export function filterContacts(contacts, { search = "", kvSort = "newest" } = {}) {
  let result = [...contacts];
  const q = String(search || "").trim().toLowerCase();
  if (q) {
    result = result.filter((c) => {
      const name = c.clientName.toLowerCase();
      const phone = c.phone.toLowerCase();
      const phoneDigits = normalizePhone(c.phone);
      const qDigits = normalizePhone(q);
      return (
        name.includes(q) ||
        phone.includes(q) ||
        (qDigits.length > 0 && phoneDigits.includes(qDigits))
      );
    });
  }

  if (kvSort === "asc") return sortContactsByKv(result, "asc");
  if (kvSort === "desc") return sortContactsByKv(result, "desc");
  return sortContactsByNewest(result);
}

export function formatContactDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Tashkent",
  });
}

export async function copyPhoneToClipboard(phone) {
  const text = String(phone || "").trim();
  if (!text || text === "—") return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
