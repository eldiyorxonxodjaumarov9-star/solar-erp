/** Qurilma / brauzer (Oddiy aniqlash). */
export function getDeviceInfo() {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const platform =
    typeof navigator !== "undefined" ? navigator.platform || "" : "";

  let browser = "Noma'lum";
  const ua = userAgent;
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  return { userAgent, platform, browser };
}

/** Jadval uchun qisqa yozuv */
export function shortDeviceLabel(info) {
  if (!info || typeof info !== "object") return "—";
  const b = info.browser || "—";
  const pl = (info.platform || "").slice(0, 22) || "—";
  return `${b} · ${pl}`;
}
