/**
 * Read canonical localStorage key, migrating from legacy when empty.
 */
export function migrateReadStorage(newKey, legacyKey) {
  try {
    const cur = localStorage.getItem(newKey);
    if (cur != null && cur !== "") return cur;
    if (legacyKey) {
      const old = localStorage.getItem(legacyKey);
      if (old != null && old !== "") {
        localStorage.setItem(newKey, old);
        return old;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
