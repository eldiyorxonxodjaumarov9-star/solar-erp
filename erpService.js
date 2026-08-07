import axios from "axios";

const MOCK_ERP_RESPONSE = {
  id: "mock_1",
  image: "https://picsum.photos/800/600",
};

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

function getMockResponse() {
  console.log("MOCK ERP USED");
  return { ...MOCK_ERP_RESPONSE };
}

export async function fetchLatestImage(erpApiUrl) {
  if (!erpApiUrl) {
    return getMockResponse();
  }

  try {
    // Validate URL shape up front so bad values do not break cycle.
    new URL(erpApiUrl);
  } catch {
    return getMockResponse();
  }

  try {
    const response = await axios.get(erpApiUrl, {
      timeout: 30000,
      headers: { Accept: "application/json" },
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      return getMockResponse();
    }

    const normalized = normalizePayload(response.data);
    if (!normalized) {
      return getMockResponse();
    }

    console.log("REAL ERP USED");
    return normalized;
  } catch {
    return getMockResponse();
  }
}
