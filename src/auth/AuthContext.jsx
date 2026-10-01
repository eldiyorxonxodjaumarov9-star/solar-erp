import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { api } from "../api/http";
import { getClientAuth, signInServerToken, signOutFirebase } from "../firebase";
import { clearSession, saveSession } from "./authStorage";
import { verifiedSessionForUser } from "./verifiedSession";
import { getDeviceInfo } from "../activity/deviceInfo";
import { appendUstaLoginLog, closeLatestOpenUstaSession, syncUstaLoginLogToFirestore } from "../activity/userActivityLogsStorage";

import { clearPrivateCaches } from "./privateCache.js";
const AuthContext = createContext(null);
const LOGIN_ERROR = "Login yoki parol noto'g'ri.";
async function verifySession(user) {
  if (!user || user.isAnonymous) return null;
  const idToken = await user.getIdToken();
  const result = await api.get("/api/auth/session", { headers: { Authorization: `Bearer ${idToken}` } });
  return verifiedSessionForUser(result.session, user);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const currentSession = useRef(null);
  const loginBusy = useRef(false);
  const updateSession = useCallback((next) => {
    currentSession.current = next;
    setSession(next);
    // Optional display cache only. Never read this to grant access.
    try { if (next) saveSession(next); else { clearSession(); clearPrivateCaches(); } } catch { /* cache is optional */ }
  }, []);
  useEffect(() => {
    let stopped = false;
    let revision = 0;
    try {
      const auth = getClientAuth();
      const unsubscribe = onIdTokenChanged(auth, (user) => {
        const version = ++revision;
        updateSession(null); setAuthLoading(true);
        void verifySession(user).catch(() => null).then((next) => {
          if (stopped || version !== revision || auth.currentUser?.uid !== user?.uid) return;
          updateSession(next); setAuthLoading(false);
        });
      });
      const revalidate = async () => {
        const user = auth.currentUser;
        if (!user) return;
        const version = revision;
        const next = await verifySession(user).catch(() => null);
        if (stopped || version !== revision || auth.currentUser?.uid !== user.uid) return;
        if (!next) { updateSession(null); await signOutFirebase().catch(() => {}); }
      };
      const interval = setInterval(revalidate, 60000);
      window.addEventListener('focus',revalidate);
      return () => { stopped = true; revision++; unsubscribe(); clearInterval(interval); window.removeEventListener('focus',revalidate); };
    } catch { updateSession(null); setAuthLoading(false); }
  }, [updateSession]);

  const login = useCallback(async (role, username, password) => {
    if (loginBusy.current) return { ok: false, error: LOGIN_ERROR };
    loginBusy.current = true;
    updateSession(null); setAuthLoading(true);
    try {
      const result = await api.post("/api/auth/login", { role, login: username, password });
      if (!result.customToken) throw new Error();
      const credential = await signInServerToken(result.customToken);
      const next = await verifySession(credential.user);
      if (!next || getClientAuth().currentUser?.uid !== credential.user.uid) throw new Error();
      updateSession(next);
      if (next.role === "usta") {
        const device = getDeviceInfo();
        try { appendUstaLoginLog(next.workerId, next.name, "", "", device); } catch { /* optional cache */ }
        void syncUstaLoginLogToFirestore(next.workerId, next.name, "", "", device).catch(() => {});
        void api.post("/api/master/mark-login", { workerId: next.workerId, login: next.login, name: next.name }).catch(() => {});
      }
      return { ok: true, ...next };
    } catch {
      updateSession(null);
      try { await signOutFirebase(); } catch { /* stays logged out */ }
      return { ok: false, error: LOGIN_ERROR };
    } finally { loginBusy.current = false; setAuthLoading(false); }
  }, [updateSession]);
  const loginAdmin = useCallback((name, password) => login("admin", name, password), [login]);
  const loginUsta = useCallback((name, password) => login("usta", name, password), [login]);
  const loginAsisten = useCallback((name, password) => login("asisten", name, password), [login]);
  const logout = useCallback(async () => {
    const previous = currentSession.current;
    updateSession(null);
    if (previous?.role === "usta") closeLatestOpenUstaSession(previous.workerId);
    try { await signOutFirebase(); } catch { /* UI remains logged out */ }
  }, [updateSession]);
  // Legacy local impersonation/credential editing cannot establish authenticated identity.
  const switchToAsistenProfile = useCallback(() => ({ ok: false, error: "Asisten login/paroli bilan qayta kiring." }), []);
  const returnToAdminProfile = useCallback(() => ({ ok: false, error: "Admin login/paroli bilan qayta kiring." }), []);
  const changeAdminCredentials = useCallback(() => ({ ok: false, error: "Admin ma'lumotlari server secret sozlamasida o'zgartiriladi." }), []);
  const value = useMemo(() => ({ session, authLoading, loginAdmin, loginUsta, loginAsisten, logout, switchAccount: logout,
    switchToAsistenProfile, returnToAdminProfile, changeAdminCredentials }),
    [session, authLoading, loginAdmin, loginUsta, loginAsisten, logout, switchToAsistenProfile, returnToAdminProfile, changeAdminCredentials]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
