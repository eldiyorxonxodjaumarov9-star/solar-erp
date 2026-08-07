export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function calculateTotals({
  panelTotalUsd = 0,
  inverterUsd = 0,
  metalUsd = 0,
  breakersUsd = 0,
  accessoriesUsd = 0,
  batteryTotalUsd = 0,
  exchangeRate,
}) {
  if (exchangeRate == null || !Number.isFinite(Number(exchangeRate))) {
    return { ok: false, error: "Valyuta kursi bazada topilmadi" };
  }
  const totalUsd = roundMoney(
    panelTotalUsd +
      inverterUsd +
      metalUsd +
      breakersUsd +
      accessoriesUsd +
      batteryTotalUsd,
  );
  const rate = Number(exchangeRate);
  const totalUzs = Math.round(totalUsd * rate);
  return { ok: true, totalUsd, exchangeRate: rate, totalUzs };
}

export function formatUsd(n) {
  const v = roundMoney(n);
  return `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$`;
}

export function formatUzs(n) {
  const v = Math.round(Number(n) || 0);
  return `${v.toLocaleString("uz-UZ").replace(/[\u00A0\u202F,]/g, " ")} so‘m`;
}
