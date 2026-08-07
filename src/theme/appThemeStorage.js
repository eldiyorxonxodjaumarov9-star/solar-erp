export const APP_THEME_KEY = "appTheme";

/** @typedef {'yashil' | 'yorug' | 'qorongi'} AppThemeId */

export const APP_THEME_IDS = /** @type {const} */ ([
  "yashil",
  "yorug",
  "qorongi",
]);

export const APP_THEME_LABELS = {
  yashil: "Yashil",
  yorug: "Yorug'",
  qorongi: "Qorong'i",
};

/** @returns {AppThemeId} */
export function loadAppTheme() {
  try {
    const v = localStorage.getItem(APP_THEME_KEY);
    if (APP_THEME_IDS.includes(/** @type {AppThemeId} */ (v))) {
      return /** @type {AppThemeId} */ (v);
    }
  } catch {
    /* ignore */
  }
  return "yashil";
}

/** @param {AppThemeId} theme */
export function persistAppTheme(theme) {
  if (!APP_THEME_IDS.includes(theme)) return;
  localStorage.setItem(APP_THEME_KEY, theme);
  document.documentElement.setAttribute("data-app-theme", theme);
  window.dispatchEvent(new CustomEvent("solar-erp-app-theme-changed"));
}
