export function formatSom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0 so'm";
  return `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
}
