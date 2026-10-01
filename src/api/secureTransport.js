/** Never send credentials/tokens to a public plaintext API. Loopback stays available. */
export function assertSecureApiTransport(base, { dev = false, origin = 'https://relative.invalid' } = {}) {
  const url = new URL(base || origin, origin);
  const loopback = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || dev))) {
    throw Object.assign(new Error('Production API must use HTTPS.'), { code: 'INSECURE_TRANSPORT' });
  }
}
