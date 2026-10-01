import { createHash, timingSafeEqual } from "node:crypto";
import { getServerAdminDb } from "./firebaseAdminAuth.js";

import { securityVersion } from './accountSecurity.js';
import { verifyPasswordHash } from './passwordHash.js';
export const LOGIN_ERROR = "Login yoki parol noto'g'ri.";
export function equalPassword(given, stored) {
  const digest = (value) => createHash("sha256").update(String(value || "")).digest();
  return timingSafeEqual(digest(given), digest(stored)) && !!stored;
}
const ROLE_ALIASES = { admin: "admin", usta: "usta", worker: "usta", master: "usta", asisten: "asisten", assistant: "asisten", manager: "asisten" };
export function createAccountVerifier({ getDb = getServerAdminDb, env = process.env } = {}) {
  return async (input) => {
    const requestedRole = String(input?.role || "").toLowerCase();
    const role = Object.hasOwn(ROLE_ALIASES, requestedRole) ? ROLE_ALIASES[requestedRole] : null;
    const login = String(input?.login || "").trim();
    const password = typeof input?.password === "string" ? input.password : "";
    if (!role || !login || !password || login.length > 128 || password.length > 1024) return null;
    if (role === "admin") {
      // No default or browser-supplied admin account. Provision existing credentials in server secrets.
      let validHash=false;
      if(env.ADMIN_PASSWORD_HASH){try{validHash=verifyPasswordHash(password,JSON.parse(env.ADMIN_PASSWORD_HASH));}catch{return null;}}
      const valid = (env.ADMIN_PASSWORD_HASH ? validHash : equalPassword(password, env.ADMIN_PASSWORD)) && !!env.ADMIN_LOGIN && login === env.ADMIN_LOGIN.trim();
      if (!valid) return null;
      const sessionVersion = await securityVersion("admin:primary", await getDb());
      return { id: "primary", role, login, name: "Administrator", sessionVersion, adminSessionVersion: Number(env.ADMIN_SESSION_VERSION || 0) };
    }
    const db = await getDb();
    const names = role === "usta" ? ["workers", "users"] : ["assistants"];
    let matched = null;
    const identities=new Set();
    for (const name of names) {
      const snapshot = await db.collection(name).get();
      const matches = snapshot.docs.filter((doc) => String(doc.data().login || "").trim().toLowerCase() === login.toLowerCase());
      if (matches.length > 1) return null;
      if (matches.length === 1) { identities.add(matches[0].id); if(!matched)matched=matches[0]; }
    }
    if(identities.size>1)return null;
    const data = matched?.data();
    let validPassword = false;
    if (matched) {
      const privateAccount = await db.collection('accountCredentials').doc(`${role}:${matched.id}`).get();
      if (privateAccount.exists) {
        const secret = privateAccount.data();
        validPassword = verifyPasswordHash(password,secret);
      } else if(env.ALLOW_LEGACY_PLAINTEXT_LOGIN==='true'||(env.NODE_ENV!=='production'&&env.ALLOW_LEGACY_PLAINTEXT_LOGIN!=='false'))validPassword = equalPassword(password, data?.password);
    }
    const status = String(data?.status || "active").toLowerCase();
    if (!validPassword || data?.disabled === true || ["inactive", "noaktiv", "off", "disabled"].includes(status)) return null;
    // Canonical role and id come from the server-selected collection/doc, not submitted IDs.
    const sessionVersion = await securityVersion(`${role}:${matched.id}`, db);
    return { id: matched.id, role, sessionVersion, login: String(data.login).trim(), name: String(data.fullName || data.name || login).slice(0, 128) };
  };
}

export function sessionFromVerifiedClaims(claims) {
  const role = claims?.role;
  const id = claims?.accountId;
  if (!["admin", "usta", "asisten"].includes(role) || typeof id !== "string" || !id || claims.uid !== `${role}:${id}`) return null;
  if (role === "usta" && claims.workerId !== id) return null;
  if (role === "asisten" && claims.assistantId !== id) return null;
  return { role, login: String(claims.login || ""), name: String(claims.name || ""),
    ...(role === "usta" ? { workerId: id } : {}), ...(role === "asisten" ? { assistantId: id } : {}) };
}
