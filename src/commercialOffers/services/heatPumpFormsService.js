import {
  addCollectionDoc,
  deleteCollectionDoc,
  listCollection,
  subscribeCollection,
  updateCollectionDoc,
} from "../../firebase/firestoreCrud";
import { HEAT_PUMP_COLLECTION } from "../../heatPumpForms/heatPumpFormLayout.js";

export const HEAT_PUMP_TYPE = "heat_pump";

export async function listHeatPumpForms() {
  const list = await listCollection(HEAT_PUMP_COLLECTION);
  return Array.isArray(list) ? list : [];
}

export function subscribeHeatPumpForms(onData, onError) {
  return subscribeCollection(HEAT_PUMP_COLLECTION, onData, onError);
}

export async function saveHeatPumpForm(id, payload) {
  const data = { ...payload, type: HEAT_PUMP_TYPE };
  if (id) {
    return updateCollectionDoc(HEAT_PUMP_COLLECTION, id, data);
  }
  const created = await addCollectionDoc(HEAT_PUMP_COLLECTION, {
    ...data,
    createdAt: data.updatedAt,
  });
  return created;
}

export async function deleteHeatPumpForm(id) {
  return deleteCollectionDoc(HEAT_PUMP_COLLECTION, id);
}
