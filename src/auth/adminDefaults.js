/** Vaqtinchalik default admin (keyinroq backend almashtiriladi) */
export const DEFAULT_ADMIN_LOGIN = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin123";

const ADMIN_CREDENTIALS_KEY = "solar-erp-admin-credentials";

export function loadAdminCredentials() {
  try {
    const raw = localStorage.getItem(ADMIN_CREDENTIALS_KEY);
    if (!raw) {
      return {
        login: DEFAULT_ADMIN_LOGIN,
        password: DEFAULT_ADMIN_PASSWORD,
      };
    }
    const parsed = JSON.parse(raw);
    const login = String(parsed?.login || "").trim();
    const password = String(parsed?.password || "");
    if (!login || !password) {
      return {
        login: DEFAULT_ADMIN_LOGIN,
        password: DEFAULT_ADMIN_PASSWORD,
      };
    }
    return { login, password };
  } catch {
    return {
      login: DEFAULT_ADMIN_LOGIN,
      password: DEFAULT_ADMIN_PASSWORD,
    };
  }
}

export function saveAdminCredentials(login, password) {
  const payload = {
    login: String(login || "").trim(),
    password: String(password || ""),
  };
  localStorage.setItem(ADMIN_CREDENTIALS_KEY, JSON.stringify(payload));
}
