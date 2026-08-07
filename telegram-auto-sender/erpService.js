import axios from "axios";

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (Array.isArray(payload)) {
    const valid = payload
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        if (!item.id || !item.image) return null;
        return { id: String(item.id), image: String(item.image) };
      })
      .filter(Boolean);

    if (valid.length === 0) return null;
    return valid[valid.length - 1];
  }

  if (!payload.id || !payload.image) {
    return null;
  }

  return {
    id: String(payload.id),
    image: String(payload.image),
  };
}

/**
 * @param {string} erpApiUrl
 * @returns {Promise<{id:string, image:string}|null>}
 */
export async function fetchLatestImage(erpApiUrl) {
  const response = await axios.get(erpApiUrl, {
    timeout: 30000,
    headers: { Accept: "application/json" },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`ERP HTTP ${response.status}`);
  }

  return normalizePayload(response.data);
}
