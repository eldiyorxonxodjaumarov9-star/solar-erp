/** @typedef {{ id: string, name: string, image: string }} Battery */

/** @type {Battery[]} */
export const BATTERIES = [
  {
    id: "gel",
    name: "Geliviy akkumlator",
    image: "/products/batteries/gel-battery.png",
  },
  {
    id: "lithium",
    name: "Lithium akkumlator",
    image: "/products/batteries/lithium-battery.png",
  },
];

/** @param {string} [id] */
export function getBatteryById(id) {
  return BATTERIES.find((item) => item.id === id) || null;
}

/** @param {string} [name] */
export function getBatteryByName(name) {
  const trimmed = String(name || "").trim();
  return BATTERIES.find((item) => item.name === trimmed) || null;
}

/** @param {string} [name] */
export function isValidBatteryType(name) {
  return Boolean(getBatteryByName(name));
}

/**
 * @param {string} [batteryType]
 * @param {string} [batteryImage]
 */
export function resolveBatteryImage(batteryType, batteryImage) {
  const image = String(batteryImage || "").trim();
  if (image) return image;
  return getBatteryByName(batteryType)?.image || "";
}
