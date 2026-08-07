/** @param {string | undefined} role */
export function homePathForRole(role) {
  if (role === "usta") return "/usta-panel";
  if (role === "asisten") return "/asisten-panel";
  return "/";
}
