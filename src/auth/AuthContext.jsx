import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../api/http";

import {
  AUTH_SESSION_CHANGED_EVENT,
  ADMIN_RETURN_SESSION_KEY,
  clearSession,
  loadSession,
  saveSession,
} from "./authStorage";
import { loadAssistants, persistAssistants } from "../assistants/assistantStorage";
import {
  loadAdminCredentials,
  saveAdminCredentials,
} from "./adminDefaults";
import { loadWorkers, persistWorkers } from "../workers/workerStorage";
import { listCollection } from "../firebase/firestoreCrud";
import { getDeviceInfo } from "../activity/deviceInfo";
import {
  appendUstaLoginLog,
  closeLatestOpenUstaSession,
  syncUstaLoginLogToFirestore,
} from "../activity/userActivityLogsStorage";

async function loadWorkersForLogin() {
  try {
    const workers = await listCollection("workers");
    if (workers.length) persistWorkers(workers);
    return workers;
  } catch (error) {
    console.warn("Firebase workers o‘qilmadi:", error);
    return loadWorkers();
  }
}

async function loadAssistantsForLogin() {
  try {
    const assistants = await listCollection("assistants");
    if (assistants.length) persistAssistants(assistants);
    return assistants;
  } catch (error) {
    console.warn("Firebase assistants o‘qilmadi:", error);
    return loadAssistants();
  }
}

async function notifyServerUstaLogin(session) {
  try {
    await api.post("/api/master/mark-login", {
      workerId: session.workerId,
      login: session.login,
      name: session.name,
    });
  } catch {
    /* server ishlamasa ham login davom etadi */
  }
}

function recordUstaLogin(workerId, name, brigadeId, brigadeName) {
  const deviceInfo = getDeviceInfo();
  appendUstaLoginLog(workerId, name, brigadeId, brigadeName, deviceInfo);
  void syncUstaLoginLogToFirestore(workerId, name, brigadeId, brigadeName, deviceInfo);
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => loadSession());

  useEffect(() => {
    const sync = () => setSession(loadSession());
    window.addEventListener("storage", sync);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, sync);
    };
  }, []);

  const loginAdmin = useCallback((login, password) => {
    const l = login.trim();
    const creds = loadAdminCredentials();

    if (l === creds.login && password === creds.password) {
      const next = {
        role: "admin",
        login: l,
        name: "Administrator",
      };

      saveSession(next);
      setSession(next);

      return { ok: true };
    }

    return { ok: false, error: "Login yoki parol noto‘g‘ri." };
  }, []);

  const changeAdminCredentials = useCallback(
    ({ currentPassword, nextLogin, nextPassword }) => {
      const creds = loadAdminCredentials();
      const current = String(currentPassword || "");
      const login = String(nextLogin || "").trim();
      const password = String(nextPassword || "");

      if (current !== creds.password) {
        return { ok: false, error: "Joriy parol noto‘g‘ri." };
      }
      if (!login) {
        return { ok: false, error: "Yangi login kiriting." };
      }
      if (password.length < 4) {
        return { ok: false, error: "Yangi parol kamida 4 ta belgi bo‘lsin." };
      }

      saveAdminCredentials(login, password);
      const cur = loadSession();
      if (cur?.role === "admin") {
        const nextSession = { ...cur, login };
        saveSession(nextSession);
        setSession(nextSession);
      }
      return { ok: true };
    },
    [],
  );

  const loginUsta = useCallback(async (login, password) => {
    const l = login.trim().toLowerCase();
    const workers = await loadWorkersForLogin();
    const localWorker = workers.find(
      (x) => String(x.login || "").trim().toLowerCase() === l,
    );

    if (!localWorker || localWorker.password !== password) {
      return { ok: false, error: "Login yoki parol noto‘g‘ri." };
    }

    const next = {
      role: "usta",
      login: String(localWorker.login || "").trim(),
      name:
        String(localWorker.fullName || "").trim() ||
        String(localWorker.name || "").trim() ||
        "Usta",
      workerId: localWorker.id,
    };

    recordUstaLogin(
      next.workerId,
      next.name,
      typeof localWorker.brigadeId === "string" ? localWorker.brigadeId : "",
      typeof localWorker.brigadeName === "string"
        ? localWorker.brigadeName
        : "",
    );
    void notifyServerUstaLogin(next);

    saveSession(next);
    setSession(next);
    return { ok: true, workerId: next.workerId };
  }, []);

  const loginAsisten = useCallback(async (login, password) => {
    const l = login.trim().toLowerCase();
    const assistants = await loadAssistantsForLogin();
    const local = assistants.find(
      (x) => String(x.login || "").trim().toLowerCase() === l,
    );
    if (!local || local.password !== password) {
      return { ok: false, error: "Login yoki parol noto‘g‘ri." };
    }

    const next = {
      role: "asisten",
      login: String(local.login || "").trim(),
      name: String(local.fullName || "").trim() || "Asisten",
      assistantId: local.id,
      masterName: "Administrator",
    };
    saveSession(next);
    setSession(next);
    return { ok: true, assistantId: next.assistantId };
  }, []);

  const switchToAsistenProfile = useCallback((assistant) => {
    const cur = loadSession();
    if (cur?.role !== "admin") {
      return { ok: false, error: "Faqat admin asisten profiliga kira oladi." };
    }
    if (!assistant?.id) {
      return { ok: false, error: "Asisten topilmadi." };
    }
    try {
      sessionStorage.setItem(ADMIN_RETURN_SESSION_KEY, JSON.stringify(cur));
    } catch {
      /* ignore */
    }
    const next = {
      role: "asisten",
      login: String(assistant.login || "").trim(),
      name: String(assistant.fullName || "").trim() || "Asisten",
      assistantId: assistant.id,
      masterName: cur.name || "Administrator",
      impersonatedByAdmin: true,
    };
    saveSession(next);
    setSession(next);
    return { ok: true };
  }, []);

  const returnToAdminProfile = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(ADMIN_RETURN_SESSION_KEY);
      if (!raw) return { ok: false, error: "Admin sessiyasi topilmadi." };
      const adminSession = JSON.parse(raw);
      if (!adminSession || adminSession.role !== "admin") {
        return { ok: false, error: "Admin sessiyasi noto‘g‘ri." };
      }
      sessionStorage.removeItem(ADMIN_RETURN_SESSION_KEY);
      saveSession(adminSession);
      setSession(adminSession);
      return { ok: true };
    } catch {
      return { ok: false, error: "Admin panelga qaytib bo‘lmadi." };
    }
  }, []);

  const logout = useCallback(() => {
    const cur = loadSession();

    if (cur?.role === "usta" && cur.workerId) {
      closeLatestOpenUstaSession(cur.workerId);
    }

    try {
      sessionStorage.removeItem(ADMIN_RETURN_SESSION_KEY);
    } catch {
      /* ignore */
    }

    clearSession();
    setSession(null);
  }, []);

  const switchAccount = useCallback(() => {
    const cur = loadSession();

    if (cur?.role === "usta" && cur.workerId) {
      closeLatestOpenUstaSession(cur.workerId);
    }

    try {
      sessionStorage.removeItem(ADMIN_RETURN_SESSION_KEY);
    } catch {
      /* ignore */
    }

    clearSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      loginAdmin,
      loginUsta,
      loginAsisten,
      switchToAsistenProfile,
      returnToAdminProfile,
      logout,
      switchAccount,
      changeAdminCredentials,
    }),
    [
      session,
      loginAdmin,
      loginUsta,
      loginAsisten,
      switchToAsistenProfile,
      returnToAdminProfile,
      logout,
      switchAccount,
      changeAdminCredentials,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return ctx;
}