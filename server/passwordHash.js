/** Server-only password hashing. Salt encoding preserves the existing staff hashes. */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SCRYPT_OPTIONS } from './accountSecurity.js';
export function hashPassword(password) {
  if(typeof password!=='string'||!password||password.length>1024)throw new Error('Invalid credential');
  const salt=randomBytes(16).toString('hex');
  return {algorithm:'scrypt',salt,hash:scryptSync(password,salt,64,SCRYPT_OPTIONS).toString('hex')};
}
export function verifyPasswordHash(password, record) {
  if(typeof password!=='string'||!password||password.length>1024||record?.algorithm!=='scrypt'
    ||!/^[a-f0-9]{128}$/.test(record.hash||'')||!/^[a-f0-9]{32}$/.test(record.salt||''))return false;
  return timingSafeEqual(scryptSync(password,record.salt,64,SCRYPT_OPTIONS),Buffer.from(record.hash,'hex'));
}
