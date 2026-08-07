const TYPE_SLUGS = {
  heat_pump: "issiqlik-nasosi",
  solar_panel: "quyosh-paneli",
};

function slugify(name) {
  return (
    String(name || "mijoz")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "mijoz"
  );
}

/** @param {'heat_pump' | 'solar_panel'} offerType */
export function offerPdfFileName(offerType, clientName) {
  const typeSlug = TYPE_SLUGS[offerType] || "tijoriy-taklif";
  const date = new Date().toISOString().slice(0, 10);
  return `${typeSlug}-tijoriy-taklif-${slugify(clientName)}-${date}.pdf`;
}
