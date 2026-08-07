/** @type {import("../types/panel.js").Panel[]} */
export const PANELS = [
  {
    id: "longi",
    name: "Longi Hi-MO X10",
    image: "/panels/longi-himo-x10.png",
    logo: "/panels/logos/longi-logo.png",
  },
  {
    id: "restar",
    name: "Restar Solar",
    image: "/panels/restar-solar.png",
    logo: "/panels/logos/restar-logo.png",
  },
  {
    id: "jinko",
    name: "Jinko Solar",
    image: "/panels/jinko.png",
    logo: "/panels/logos/jinko-logo.png",
  },
  {
    id: "ja",
    name: "JA Solar",
    image: "/panels/ja-solar.png",
    logo: "/panels/logos/ja-solar-logo.png",
  },
];

const LEGACY_PANEL_NAMES = {
  Jinko: "Jinko Solar",
};

/** @param {string} [name] */
export function normalizePanelName(name) {
  const trimmed = String(name || "").trim();
  return LEGACY_PANEL_NAMES[trimmed] || trimmed;
}

/** @param {string} [id] */
export function getPanelById(id) {
  return PANELS.find((p) => p.id === id) || null;
}

/** @param {string} [name] */
export function getPanelByName(name) {
  const normalized = normalizePanelName(name);
  return PANELS.find((p) => p.name === normalized) || null;
}

/** @param {string} [name] */
export function isValidPanelType(name) {
  return Boolean(getPanelByName(name));
}

/**
 * @param {string} [panelType]
 * @param {string} [panelImage]
 */
export function resolvePanelImage(panelType, panelImage) {
  const image = String(panelImage || "").trim();
  if (image) return image;
  return getPanelByName(panelType)?.image || "";
}

/**
 * @param {string} [panelType]
 * @param {string} [panelLogo]
 */
export function resolvePanelLogo(panelType, panelLogo) {
  const logo = String(panelLogo || "").trim();
  if (logo) return logo;
  return getPanelByName(panelType)?.logo || "";
}

/** @returns {string[]} */
export function panelTypeNames() {
  return PANELS.map((p) => p.name);
}
