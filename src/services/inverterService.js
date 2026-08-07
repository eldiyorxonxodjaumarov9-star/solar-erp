/** @type {import("../types/inverter.js").Inverter[]} */
export const INVERTERS = [
  {
    id: "solax",
    name: "SolaX Power",
    image: "/products/inverters/solax.png",
  },
  {
    id: "deltron",
    name: "Deltron",
    image: "/products/inverters/deltron.png",
  },
  {
    id: "restar",
    name: "Restar",
    image: "/products/inverters/restar.png",
  },
  {
    id: "deye",
    name: "Deye",
    image: "/products/inverters/deye.png",
  },
  {
    id: "felicity",
    name: "Felicity Solar",
    image: "/products/inverters/felicity.png",
  },
];

/** @param {string} [id] */
export function getInverterById(id) {
  return INVERTERS.find((item) => item.id === id) || null;
}

/** @param {string} [name] */
export function getInverterByName(name) {
  const trimmed = String(name || "").trim();
  return INVERTERS.find((item) => item.name === trimmed) || null;
}

/** @param {string} [name] */
export function isValidInverterType(name) {
  return Boolean(getInverterByName(name));
}

/**
 * @param {string} [inverterType]
 * @param {string} [inverterImage]
 */
export function resolveInverterImage(inverterType, inverterImage) {
  const image = String(inverterImage || "").trim();
  if (image) return image;
  return getInverterByName(inverterType)?.image || "";
}

/**
 * @param {string} [inverterType]
 * @param {string} [inverterLogo]
 */
export function resolveInverterLogo(inverterType, inverterLogo) {
  const logo = String(inverterLogo || "").trim();
  if (logo) return logo;
  return getInverterByName(inverterType)?.logo || "";
}

/** @returns {string[]} */
export function inverterTypeNames() {
  return INVERTERS.map((item) => item.name);
}
