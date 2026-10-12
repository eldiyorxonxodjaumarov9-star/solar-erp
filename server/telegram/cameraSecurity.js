import { createHmac, timingSafeEqual } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
export const CAMERA_MAX_BYTES = 10 * 1024 * 1024;
const fail = () => { throw new Error('Camera authorization unavailable'); };
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
export function verifyMiniAppInitData(value, token, now = Date.now()) {
  if (typeof value !== 'string' || !value || value.length > 8192 || !token) return fail();
  const fields = new URLSearchParams(value), keys = [...fields.keys()];
  if (new Set(keys).size !== keys.length) return fail();
  const hash = fields.get('hash'); if (!/^[a-f0-9]{64}$/i.test(hash || '')) return fail();
  fields.delete('hash');
  const data = [...fields.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${k}=${v}`).join('\n');
  const expected = hmac(hmac('WebAppData', token), data);
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return fail();
  const authDate = Number(fields.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate * 1000 > now + 30000 || now - authDate * 1000 > 5 * 60 * 1000) return fail();
  let user; try { user = JSON.parse(fields.get('user')); } catch { return fail(); }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0 || user.is_bot) return fail();
  return String(user.id);
}
const ticketKey = token => hmac('SolarERP camera browser session', token);
export function cameraTicket(identity, token, now = Date.now()) {
  const value = Buffer.from(JSON.stringify({ ...identity, expiresAt: now + 5 * 60 * 1000 })).toString('base64url');
  return value + '.' + hmac(ticketKey(token), value).toString('base64url');
}
export function verifyCameraTicket(value, token, now = Date.now()) {
  if (!token || typeof value !== 'string' || value.length > 2048) return fail();
  const [body, sig, extra] = value.split('.'); if (!body || !sig || extra) return fail();
  const expected = hmac(ticketKey(token), body), actual = Buffer.from(sig, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return fail();
  let identity; try { identity = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return fail(); }
  if (!/^\d+$/.test(identity.telegramUserId || '') || !Number.isSafeInteger(identity.expiresAt) || identity.expiresAt < now || identity.expiresAt > now + 5 * 60 * 1000) return fail();
  return identity;
}
export function validateCameraImage(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > CAMERA_MAX_BYTES) throw new Error('Invalid camera image');
  if (mime === 'image/jpeg') {
    if (buffer[0] !== 255 || buffer[1] !== 216 || buffer.at(-2) !== 255 || buffer.at(-1) !== 217) throw new Error('Invalid camera image');
    const image = jpeg.decode(buffer, { useTArray: true, maxResolutionInMP: 20, maxMemoryUsageInMB: 64 });
    if (!image.width || !image.height) throw new Error('Invalid camera image');
    // Re-encode pixels: discard EXIF, appended files, scripts and other input metadata.
    return { buffer: jpeg.encode(image, 85).data, contentType: mime, extension: 'jpg' };
  }
  if (mime === 'image/png') {
    if (!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || buffer.length < 33 || buffer.toString('ascii',12,16) !== 'IHDR') throw new Error('Invalid camera image');
    const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
    if (!width || !height || width * height > 16000000) throw new Error('Invalid camera image');
    // pngjs uses an unbounded inflater for interlaced input. Preflight its exact
    // compressed data with an output ceiling before allowing the normal decoder.
    if (buffer[28] !== 0) {
      const parts=[];let offset=8;
      while(offset+12<=buffer.length){const length=buffer.readUInt32BE(offset);if(offset+length+12>buffer.length)throw new Error('Invalid camera image');if(buffer.toString('ascii',offset+4,offset+8)==='IDAT')parts.push(buffer.subarray(offset+8,offset+8+length));offset+=length+12;}
      inflateSync(Buffer.concat(parts),{maxOutputLength:width*height*8+height*7+1024});
    }
    const image = PNG.sync.read(buffer, { checkCRC: true });
    return { buffer: PNG.sync.write(image), contentType: mime, extension: 'png' };
  }
  throw new Error('Invalid camera image');
}
