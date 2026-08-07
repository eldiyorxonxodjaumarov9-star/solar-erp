/**
 * Firestore kolleksiya nomlari — yangi schema + mavjud (legacy) aliaslar.
 * Mavjud kod `workers`, `stage_photos` va hokazolarni ishlatishda davom etadi.
 */
export const COLLECTIONS = {
  users: "users",
  workers: "workers",
  assistants: "assistants",
  brigades: "brigades",
  projects: "projects",
  projectSteps: "projectSteps",
  stagePhotos: "stage_photos",
  attendance: "attendance",
  userActivityLogs: "user_activity_logs",
  expenses: "expenses",
  complaints: "complaints",
  jalbalar: "jalbalar",
  points: "points",
  instructions: "instructions",
  ustaYorijnoma: "usta_yorijnoma",
  projectStageLocks: "project_stage_locks",
};

export const ROLES = {
  ADMIN: "admin",
  MASTER: "usta",
  ASSISTANT: "asisten",
};

/** Loyiha progress uchun 3 ta majburiy bosqich (stage id). */
export const PROJECT_PROGRESS_STAGES = [
  { stepNumber: 1, stageId: "stage-1", name: "Maxsulot yetib bordi" },
  { stepNumber: 2, stageId: "stage-2", name: "Karkazni tugatildi" },
  { stepNumber: 3, stageId: "stage-3", name: "Panel o‘rnatish" },
];

export const STEP_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
};

export const STEP_STATUS_LABEL = {
  pending: "Kutilmoqda",
  accepted: "Qabul qilindi",
  rejected: "Rad etildi",
};
