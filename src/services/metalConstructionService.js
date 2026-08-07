/** @typedef {{ id: string, name: string, image: string }} MetalConstruction */

/** @type {MetalConstruction[]} */
export const METAL_CONSTRUCTIONS = [
  {
    id: "alumin-karkaz",
    name: "ALUMIN KARKAZ",
    image: "/products/metal-construction/alumin-karkaz.png",
  },
  {
    id: "atsenkovka",
    name: "Atsenkovka (zanglamas temir)",
    image: "/products/metal-construction/atsenkovka.png",
  },
  {
    id: "temir-karkaz",
    name: "Temir karkaz (kraskalangan)",
    image: "/products/metal-construction/temir-karkaz.png",
  },
];

/** @param {string} [id] */
export function getMetalConstructionById(id) {
  return METAL_CONSTRUCTIONS.find((item) => item.id === id) || null;
}

/** @param {string} [name] */
export function getMetalConstructionByName(name) {
  const trimmed = String(name || "").trim();
  return METAL_CONSTRUCTIONS.find((item) => item.name === trimmed) || null;
}

/** @param {string} [name] */
export function isValidMetalConstructionType(name) {
  return Boolean(getMetalConstructionByName(name));
}

/**
 * @param {string} [constructionType]
 * @param {string} [constructionImage]
 */
export function resolveMetalConstructionImage(constructionType, constructionImage) {
  const image = String(constructionImage || "").trim();
  if (image) return image;
  return getMetalConstructionByName(constructionType)?.image || "";
}
