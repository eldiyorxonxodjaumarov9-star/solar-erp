const sentIds = new Set();

export function hasSentId(id) {
  return sentIds.has(String(id));
}

export function markSentId(id) {
  sentIds.add(String(id));
}
