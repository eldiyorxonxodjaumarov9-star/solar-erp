/** Loyiha bosqichlari — foizlar jami 100% */
export const STAGES = [
  { id: "stage-1", name: "Maxsulot yetib bordi", percent: 15 },
  { id: "stage-2", name: "Karkazni tugatildi", percent: 20 },
  { id: "stage-3", name: "Panel o‘rnatish", percent: 20 },
  { id: "stage-5", name: "Invertor o‘rnatish", percent: 20 },
  { id: "stage-6", name: "Mijozga ishni topshirish", percent: 15 },
  { id: "stage-8", name: "Mijoz uchun akt topshirish", percent: 10 },
];

export const STAGE_INVERTOR_ID = "stage-5";
export const STAGE_HANDOVER_ID = "stage-6";

export const STAGE_PHOTO_SLOTS = [1, 2, 3];

/** @deprecated STAGE_PHOTO_SLOTS */
export const STAGE_SLOT_NUMBERS = STAGE_PHOTO_SLOTS;

export function isStageVideoRecord(record) {
  return String(record?.mediaType || "") === "video";
}

export function isStageImageRecord(record) {
  return !isStageVideoRecord(record);
}

/** Rasm sloti yorlig‘i */
export function getStageSlotLabel(stageId, slotNumber) {
  if (stageId === STAGE_INVERTOR_ID) {
    if (slotNumber === 1) return "Invertor dirkasi";
    if (slotNumber === 2) return "Panellar dirkasi";
    if (slotNumber === 3) return "Umumiy rasm";
  }
  return `Rasm ${slotNumber}`;
}

/** Slot ostidagi qisqa ko‘rsatma */
export function getStageSlotHint(stageId, slotNumber) {
  if (stageId === STAGE_INVERTOR_ID && slotNumber === 1) {
    return "Invertor dirkasini aniq va tiniq rasmga oling";
  }
  if (stageId === STAGE_INVERTOR_ID && slotNumber === 2) {
    return "Panellar dirkasini aniq va tiniq rasmga oling";
  }
  return "";
}

/** Bosqich ustidagi eslatma */
export function getStageNote(stageId) {
  if (stageId === STAGE_HANDOVER_ID) {
    return "Mijoz bilan birga tushuntirilgan xolda video jonatish (ixtiyoriy)";
  }
  return "Video jonatish — ixtiyoriy, majburiy emas";
}

export function getStageSubtitle(stageId) {
  if (stageId === STAGE_HANDOVER_ID) {
    return "Mijoz bilan birga tushuntirilgan xolda video jonatish";
  }
  return "";
}
