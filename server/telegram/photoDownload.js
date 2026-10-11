import jpeg from 'jpeg-js';
export const MAX_TELEGRAM_IMAGE = 10 * 1024 * 1024;
export function validateTelegramImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_TELEGRAM_IMAGE || buffer.length < 4 ||
      buffer[0] !== 255 || buffer[1] !== 216 || buffer.at(-2) !== 255 || buffer.at(-1) !== 217) throw new Error('Invalid image');
  const image = jpeg.decode(buffer, { useTArray: true, maxResolutionInMP: 20, maxMemoryUsageInMB: 64 });
  if (!image.width || !image.height) throw new Error('Invalid image');
  return { buffer, contentType: 'image/jpeg', extension: 'jpg' };
}
async function boundedBody(response, maximum) {
  if (!response.ok || Number(response.headers.get('content-length')) > maximum || !response.body) throw new Error('Media unavailable');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > maximum) throw new Error('Media too large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
// Telegram is the sole network origin. Never log token-bearing request URLs or SDK errors.
export function createTelegramPhotoDownloader({ env = process.env, fetchImpl = fetch } = {}) {
  return async photo => {
    const token = env.TELEGRAM_BOT_TOKEN;
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token || '') || typeof photo?.file_id !== 'string' || photo.file_id.length > 256 ||
        (photo.file_size != null && (!Number.isSafeInteger(photo.file_size) || photo.file_size > MAX_TELEGRAM_IMAGE))) throw new Error('Media unavailable');
    const options = { signal: AbortSignal.timeout(20000), redirect: 'error' };
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/getFile`, { ...options, method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: photo.file_id }) });
    const file = JSON.parse((await boundedBody(response, 65536)).toString());
    const filePath = file.result?.file_path;
    if (!file.ok || typeof filePath !== 'string' || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|jpeg)$/i.test(filePath) ||
        (file.result.file_size != null && (!Number.isSafeInteger(file.result.file_size) || file.result.file_size > MAX_TELEGRAM_IMAGE))) throw new Error('Invalid media path');
    const download = await fetchImpl(`https://api.telegram.org/file/bot${token}/${filePath}`, options);
    return validateTelegramImage(await boundedBody(download, MAX_TELEGRAM_IMAGE));
  };
}
