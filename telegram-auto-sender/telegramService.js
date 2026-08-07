import axios from "axios";

/**
 * @param {{ token: string; groupId: string; imageUrl: string; caption: string }} params
 */
export async function sendPhotoToTelegram(params) {
  const { token, groupId, imageUrl, caption } = params;

  const endpoint = `https://api.telegram.org/bot${token}/sendPhoto`;
  const body = new URLSearchParams();
  body.append("chat_id", groupId);
  body.append("photo", imageUrl);
  body.append("caption", caption);

  const response = await axios.post(endpoint, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 60000,
    validateStatus: () => true,
  });

  if (response.status !== 200 || !response.data?.ok) {
    const description = response.data?.description || `HTTP ${response.status}`;
    throw new Error(description);
  }

  return response.data;
}
