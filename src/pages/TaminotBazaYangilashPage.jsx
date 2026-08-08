import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  createAdminSupplyProduct,
  deleteAdminSupplyProduct,
  fetchAdminSupplyCatalog,
  reloadSupplyCatalog,
  updateAdminSupplyProduct,
} from "../services/supplyCalculation/catalogApi.js";
import { formatUsd, formatUzs } from "../services/supplyCalculation/pricingCalculator.js";

const TABS = [
  { id: "panels", label: "Panellar", category: "panel" },
  { id: "inverters", label: "Inverterlar", category: "inverter" },
  { id: "batteries", label: "Akkumulyatorlar", category: "battery" },
  { id: "accessories", label: "Aksessuarlar", category: "accessory" },
  { id: "breakers", label: "Avtomatlar", category: "breaker" },
  { id: "cables", label: "Kabel", category: "cable" },
  { id: "metal", label: "Metall", category: "metal" },
];

/** Tab bo‘yicha forma maydonlari */
const FORM_FIELDS = {
  panel: [
    { key: "name", label: "Nomi", type: "text", required: true },
    { key: "powerW", label: "Quvvat (W)", type: "number", required: true },
    { key: "price", label: "Narx (USD)", type: "number", required: true },
  ],
  inverter: [
    { key: "name", label: "Nomi", type: "text", required: true },
    { key: "powerKw", label: "Quvvat (kW)", type: "number", required: true },
    { key: "type", label: "Tur (ongrid/hybrid/offgrid/chastotnik)", type: "text", required: true },
    { key: "maxPvInputKw", label: "Max PV (kW)", type: "number" },
    { key: "price", label: "Narx (USD)", type: "number", required: true },
  ],
  battery: [
    { key: "name", label: "Nomi", type: "text", required: true },
    { key: "capacityKwh", label: "Sig‘im (kWh)", type: "number" },
    { key: "batteryCountHint", label: "Batareya soni", type: "number" },
    { key: "price", label: "Narx (USD)", type: "number", required: true },
  ],
  accessory: [
    { key: "name", label: "Nomi", type: "text", required: true },
    { key: "unit", label: "Birlik", type: "text" },
    { key: "price", label: "Narx (USD)", type: "number", required: true },
  ],
  breaker: [
    { key: "name", label: "Nomi", type: "text", required: true },
    { key: "unit", label: "Birlik", type: "text" },
    { key: "price", label: "Narx (USD)", type: "number", required: true },
  ],
  cable: [
    { key: "name", label: "Nomi", type: "text", required: true },
    { key: "unit", label: "Birlik", type: "text" },
    { key: "price", label: "Narx (USD)", type: "number", required: true },
  ],
  metal: [
    { key: "name", label: "Nomi", type: "text", required: true },
    { key: "unit", label: "Birlik", type: "text" },
    { key: "price", label: "Narx (USD)", type: "number", required: true },
  ],
};

function priceOf(row) {
  const n = Number(row?.priceUsd ?? row?.price);
  return Number.isFinite(n) ? n : null;
}

function rowToForm(category, row) {
  if (!row) {
    const empty = { category };
    for (const f of FORM_FIELDS[category] || []) empty[f.key] = "";
    if (category === "accessory" || category === "breaker") empty.unit = "dona";
    if (category === "cable" || category === "metal") empty.unit = "metr";
    if (category === "inverter") empty.type = "ongrid";
    if (category === "battery") empty.batteryCountHint = 1;
    return empty;
  }
  return {
    category,
    name: row.name || row.model || "",
    powerW: row.powerW ?? "",
    powerKw: row.powerKw ?? (row.powerW ? Number(row.powerW) / 1000 : ""),
    type: row.type || row.subtype || "",
    maxPvInputKw: row.maxPvInputKw ?? "",
    capacityKwh: row.capacityKwh ?? "",
    batteryCountHint: row.batteryCountHint ?? "",
    unit: row.unit || "",
    price: priceOf(row) ?? "",
  };
}

function ProductTable({ rows, columns, onEdit, onDelete }) {
  if (!rows?.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        Ma’lumot yo‘q
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/90">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-3 py-2.5">
                {c.label}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2.5 text-right">Amallar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, idx) => (
            <tr key={row.id || `${row.name}-${idx}`} className="hover:bg-slate-50/80">
              {columns.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-3 py-2 text-slate-800">
                  {c.render ? c.render(row) : row[c.key] ?? "—"}
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-2 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(row)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductModal({ open, title, category, form, setForm, saving, error, onClose, onSave }) {
  if (!open) return null;
  const fields = FORM_FIELDS[category] || [];
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <div className="mt-4 space-y-3">
          {fields.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {f.label}
                {f.required ? " *" : ""}
              </span>
              <input
                type={f.type}
                step={f.type === "number" ? "any" : undefined}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none ring-slate-300 focus:ring-2"
              />
            </label>
          ))}
        </div>
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Bekor
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saqlanmoqda…" : "Saqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TaminotBazaYangilashPage() {
  const { session } = useAuth();
  const [tab, setTab] = useState("panels");
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [q, setQ] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const activeTab = TABS.find((t) => t.id === tab) || TABS[0];
  const category = activeTab.category;

  const load = useCallback(async () => {
    if (session?.role !== "admin") {
      setError("Faqat admin ko‘ra oladi");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminSupplyCatalog(session);
      setCatalog(data);
    } catch (e) {
      setError(e?.message || "Katalog yuklanmadi");
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReload = async () => {
    if (session?.role !== "admin") return;
    setReloading(true);
    setError("");
    setOkMsg("");
    try {
      await reloadSupplyCatalog(session);
      await load();
      setOkMsg("Taminot bazasi serverdan qayta yuklandi.");
    } catch (e) {
      setError(e?.message || "Yangilashda xato");
    } finally {
      setReloading(false);
    }
  };

  const openCreate = () => {
    setModalMode("create");
    setEditId(null);
    setForm(rowToForm(category, null));
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setModalMode("edit");
    setEditId(row.id);
    setForm(rowToForm(category, row));
    setFormError("");
    setModalOpen(true);
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`O‘chirasizmi?\n${row.name || row.model || row.id}`)) return;
    setError("");
    setOkMsg("");
    try {
      await deleteAdminSupplyProduct(session, row.id);
      await load();
      setOkMsg("O‘chirildi.");
    } catch (e) {
      setError(e?.message || "O‘chirishda xato");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError("");
    try {
      const body = { category, ...form };
      if (category === "inverter" && body.powerKw !== "" && body.powerKw != null) {
        body.powerKw = Number(body.powerKw);
        body.powerW = Math.round(Number(body.powerKw) * 1000);
      }
      if (modalMode === "create") {
        await createAdminSupplyProduct(session, body);
        setOkMsg("Qo‘shildi.");
      } else {
        await updateAdminSupplyProduct(session, editId, body);
        setOkMsg("Saqlandi.");
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(e?.message || "Saqlashda xato");
    } finally {
      setSaving(false);
    }
  };

  const exchangeRate = Number(
    catalog?.settings?.exchange_rate_usd_uzs || catalog?.settings?.usd_to_uzs || 0,
  );

  const counts = useMemo(
    () => ({
      panels: catalog?.panels?.length || 0,
      inverters: catalog?.inverters?.length || 0,
      batteries: catalog?.batteries?.length || 0,
      accessories: catalog?.accessories?.length || 0,
      breakers: catalog?.breakers?.length || 0,
      cables: catalog?.cables?.length || 0,
      metal: Array.isArray(catalog?.metal)
        ? catalog.metal.length
        : catalog?.metal
          ? 1
          : 0,
    }),
    [catalog],
  );

  const filteredRows = useMemo(() => {
    let rows = [];
    if (tab === "metal") {
      rows = Array.isArray(catalog?.metal)
        ? catalog.metal
        : catalog?.metal
          ? [catalog.metal]
          : [];
    } else {
      rows = catalog?.[tab] || [];
    }
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.id, r.brand, r.model, r.name, r.type, r.subtype, r.unit]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [catalog, tab, q]);

  const columns = useMemo(() => {
    const priceCol = {
      key: "price",
      label: "Narx (USD)",
      render: (r) => {
        const p = priceOf(r);
        return p != null ? formatUsd(p) : "—";
      },
    };
    const uzsCol = {
      key: "uzs",
      label: "Narx (so‘m)",
      render: (r) => {
        const p = priceOf(r);
        if (p == null || !exchangeRate) return "—";
        return formatUzs(p * exchangeRate);
      },
    };

    if (tab === "panels") {
      return [
        { key: "brand", label: "Brend" },
        { key: "model", label: "Model", render: (r) => r.model || r.name || "—" },
        { key: "powerW", label: "Quvvat", render: (r) => (r.powerW ? `${r.powerW} W` : "—") },
        priceCol,
        uzsCol,
      ];
    }
    if (tab === "inverters") {
      return [
        { key: "brand", label: "Brend" },
        { key: "model", label: "Model", render: (r) => r.model || r.name || "—" },
        { key: "type", label: "Tur", render: (r) => r.type || r.subtype || "—" },
        {
          key: "powerKw",
          label: "kW",
          render: (r) =>
            r.powerKw != null
              ? `${r.powerKw}`
              : r.powerW
                ? `${(Number(r.powerW) / 1000).toFixed(1)}`
                : "—",
        },
        priceCol,
        uzsCol,
      ];
    }
    if (tab === "batteries") {
      return [
        { key: "name", label: "Nomi", render: (r) => r.name || r.model || "—" },
        {
          key: "capacity",
          label: "Sig‘im",
          render: (r) => (r.capacityKwh != null ? `${r.capacityKwh} kWh` : "—"),
        },
        priceCol,
        uzsCol,
      ];
    }
    return [
      { key: "name", label: "Nomi", render: (r) => r.name || r.model || r.id || "—" },
      { key: "unit", label: "Birlik", render: (r) => r.unit || "—" },
      priceCol,
      uzsCol,
    ];
  }, [tab, exchangeRate]);

  if (loading) {
    return (
      <section className="rounded-[1.375rem] border border-slate-200/85 bg-white p-6 shadow-soft-lg">
        <p className="text-sm text-slate-500">Taminot bazasi yuklanmoqda…</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[1.375rem] border border-slate-200/85 bg-white p-5 shadow-soft-lg sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Taminot bazani yangilash
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Barcha mahsulotlar va narxlar. Qo‘shish / Edit / Delete mumkin.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reloading}
              onClick={load}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              Qayta yuklash
            </button>
            <button
              type="button"
              disabled={reloading}
              onClick={handleReload}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {reloading ? "…" : "Serverdan yangilash"}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-slate-800"
            >
              + Qo‘shish
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <span
              key={t.id}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {t.label}: <strong>{counts[t.id] ?? 0}</strong>
            </span>
          ))}
        </div>

        {okMsg ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {okMsg}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
      </div>

      <div className="rounded-[1.375rem] border border-slate-200/85 bg-white p-4 shadow-soft-lg sm:p-6">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                tab === t.id
                  ? "bg-slate-900 text-white shadow"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label} ({counts[t.id] ?? 0})
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Qidirish: brend, model, nom…"
            className="w-full max-w-md rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring-2"
          />
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + {activeTab.label} qo‘shish
          </button>
        </div>

        <div className="mt-4">
          <ProductTable
            rows={filteredRows}
            columns={columns}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        </div>
      </div>

      <ProductModal
        open={modalOpen}
        title={modalMode === "create" ? `${activeTab.label} qo‘shish` : "Tahrirlash"}
        category={category}
        form={form}
        setForm={setForm}
        saving={saving}
        error={formError}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </section>
  );
}
