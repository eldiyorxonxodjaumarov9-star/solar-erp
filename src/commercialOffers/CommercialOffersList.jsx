import { useMemo } from "react";
import { formatSystemPowerSummary, normalizeSystemPowerCounts } from "../heatPumpForms/heatPumpSystemPower.js";

const TYPE_LABELS = {
  heat_pump: "Issiqlik nasosi",
  solar_panel: "Quyosh paneli",
};

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizePhone(q) {
  return String(q || "").replace(/\D/g, "");
}

/**
 * @param {Array} heatPumpRows
 * @param {Array} solarRows
 */
export function mergeOfferRows(heatPumpRows, solarRows) {
  const heat = (heatPumpRows || []).map((r) => ({
    ...r,
    offerType: "heat_pump",
    collection: "heatPumpForms",
    displayPower:
      Array.isArray(r.systemPowerList) && r.systemPowerList.length
        ? r.systemPowerList.join(", ")
        : formatSystemPowerSummary(normalizeSystemPowerCounts(r)),
    displayPhase: "—",
  }));
  const solar = (solarRows || []).map((r) => ({
    ...r,
    offerType: "solar_panel",
    collection: "commercialOffers",
    displayPower: r.stationPower ? `${r.stationPower} kV` : "—",
    displayPhase: r.phase || "—",
  }));
  return [...heat, ...solar].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime(),
  );
}

export default function CommercialOffersList({
  rows,
  loading,
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  activeEditId = "",
  activeEditCollection = "",
  onOpen,
  onPdf,
  onDelete,
}) {
  const filtered = useMemo(() => {
    let list = [...rows];
    if (typeFilter !== "all") {
      list = list.filter((r) => r.offerType === typeFilter);
    }
    const q = String(search || "").trim().toLowerCase();
    const qDigits = normalizePhone(q);
    if (q) {
      list = list.filter((r) => {
        const name = String(r.clientName || "").toLowerCase();
        const phone = String(r.phone || "").toLowerCase();
        const phoneDigits = normalizePhone(r.phone);
        return (
          name.includes(q) ||
          phone.includes(q) ||
          (qDigits.length > 0 && phoneDigits.includes(qDigits))
        );
      });
    }
    return list;
  }, [rows, search, typeFilter]);

  return (
    <section className="heat-pump-no-print border border-black bg-white p-4 sm:p-6">
      <h3 className="text-center text-base font-bold text-black">Tijoriy takliflar ro‘yxati</h3>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-center">
        <div className="sm:min-w-[200px]">
          <label className="block text-xs font-bold text-black">Qidiruv</label>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Mijoz yoki telefon"
            className="mt-1 w-full border-b border-black bg-transparent px-1 py-1 text-sm outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-black">Tur</label>
          <select
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value)}
            className="mt-1 border-b border-black bg-transparent px-1 py-1 text-sm outline-none"
          >
            <option value="all">Hammasi</option>
            <option value="heat_pump">Issiqlik nasosi</option>
            <option value="solar_panel">Quyosh paneli</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-center text-sm text-neutral-600">Yuklanmoqda…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-center text-sm text-neutral-600">Taklif topilmadi.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="px-2 py-2 font-bold">Tur</th>
                <th className="px-2 py-2 font-bold">Mijoz</th>
                <th className="px-2 py-2 font-bold">Telefon</th>
                <th className="px-2 py-2 font-bold">Quvvat</th>
                <th className="px-2 py-2 font-bold">Fazasi</th>
                <th className="px-2 py-2 font-bold">Sana</th>
                <th className="px-2 py-2 text-right font-bold">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isActive =
                  activeEditId &&
                  activeEditCollection &&
                  String(row.id) === String(activeEditId) &&
                  row.collection === activeEditCollection;

                return (
                <tr
                  key={`${row.collection}-${row.id}`}
                  className={`border-b border-neutral-300 ${isActive ? "bg-amber-50" : ""}`}
                >
                  <td className="px-2 py-2">{TYPE_LABELS[row.offerType] || row.offerType}</td>
                  <td className="px-2 py-2">{row.clientName}</td>
                  <td className="px-2 py-2">{row.phone || "—"}</td>
                  <td className="px-2 py-2">{row.displayPower}</td>
                  <td className="px-2 py-2">{row.displayPhase}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {fmtDate(row.updatedAt || row.createdAt)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      className="mr-2 font-semibold underline"
                      onClick={() => onOpen(row)}
                    >
                      Ochish
                    </button>
                    <button
                      type="button"
                      className="mr-2 font-semibold underline"
                      onClick={() => onPdf(row)}
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      className="font-semibold text-red-800 underline"
                      onClick={() => onDelete(row)}
                    >
                      O‘chirish
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
