import {
  addCollectionDoc,
  deleteCollectionDoc,
  listCollection,
  subscribeCollection,
  updateCollectionDoc,
} from "../../firebase/firestoreCrud";

export const SOLAR_COLLECTION = "commercialOffers";
export const SOLAR_PANEL_TYPE = "solar_panel";

export async function listSolarOffers() {
  const list = await listCollection(SOLAR_COLLECTION);
  return Array.isArray(list) ? list : [];
}

export function subscribeSolarOffers(onData, onError) {
  return subscribeCollection(SOLAR_COLLECTION, onData, onError);
}

export async function saveSolarOffer(id, payload) {
  const data = { ...payload, type: SOLAR_PANEL_TYPE };
  if (id) {
    return updateCollectionDoc(SOLAR_COLLECTION, id, data);
  }
  const created = await addCollectionDoc(SOLAR_COLLECTION, {
    ...data,
    createdAt: data.updatedAt,
  });
  return created;
}

export async function deleteSolarOffer(id) {
  return deleteCollectionDoc(SOLAR_COLLECTION, id);
}
