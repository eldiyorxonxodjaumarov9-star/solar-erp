import { randomBytes } from 'node:crypto';
import { getServerAdminDb, getServerAdminAuth } from './firebaseAdminAuth.js';
export const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function activeAccount(data) {
  return !!data && data.disabled !== true && !['inactive','noaktiv','off','disabled'].includes(String(data.status || 'active').toLowerCase());
}
export async function securityVersion(uid, db) {
  const snapshot = await db.collection('accountSecurity').doc(uid).get();
  const data = snapshot.exists ? snapshot.data() : {};
  if (data.disabled === true) throw new Error('Session unavailable');
  if(snapshot.exists && !Object.hasOwn(data,'sessionVersion'))throw new Error('Session unavailable');
  if(!snapshot.exists)return 0;
  if((typeof data.sessionVersion==='string' && data.sessionVersion.length>0) || (Number.isSafeInteger(data.sessionVersion) && data.sessionVersion>=0))return data.sessionVersion;
  throw new Error('Session unavailable');
}
export async function assertAccountSession(claims, { getDb = getServerAdminDb, env = process.env } = {}) {
  const db = await getDb();
  if ((claims.sessionVersion || 0) !== await securityVersion(claims.uid, db)) throw new Error('Session unavailable');
  if (claims.role === 'admin') {
    if ((claims.adminSessionVersion || 0) !== Number(env.ADMIN_SESSION_VERSION || 0)) throw new Error('Session unavailable');
    return;
  }
  const names = claims.role === 'usta' ? ['workers','users'] : ['assistants'];
  let account;
  for (const name of names) {
    const snapshot = await db.collection(name).doc(claims.accountId).get();
    if (snapshot.exists) { account = snapshot.data(); break; }
  }
  if (!activeAccount(account)) throw new Error('Session unavailable');
}
export async function revokeAccountSessions(uid) {
  try { await (await getServerAdminAuth()).revokeRefreshTokens(uid); }
  catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
}

export function newSessionVersion() { return randomBytes(16).toString('hex'); }

/** Internal rotation operation: call only from an authorized server maintenance process. */
export async function rotateAdminSessions({getDb=getServerAdminDb,revoke=revokeAccountSessions}={}) {
 const db=await getDb();
 await db.collection('accountSecurity').doc('admin:primary').set({sessionVersion:newSessionVersion(),disabled:false,updatedAt:new Date().toISOString()},{merge:true});
 await revoke('admin:primary');
}
