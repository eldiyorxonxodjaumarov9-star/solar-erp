import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  calculateSupplyOnServer,
  deleteSupplyCalculation,
  downloadSupplyPdf,
  fetchSupplyCatalog,
  formatPhoneUz,
  formatUsd,
  formatUzs,
  inverterLabel,
  isValidPhoneUz,
  listSupplyCalculations,
  panelLabel,
  quoteToStoragePayload,
  reloadSupplyCatalog,
  saveSupplyCalculation,
  storageRowToQuote,
  suggestInverters,
} from "../services/supplyCalculation/index.js";

const STEPS = [
  { id: "power", label: "Quvvat" },
  { id: "panel", label: "Panel" },
  { id: "invType", label: "Inverter turi" },
  { id: "inverter", label: "Inverter" },
  { id: "battery", label: "Akkumulyator" },
  { id: "metal", label: "Metall" },
  { id: "client", label: "Mijoz" },
  { id: "result", label: "Natija" },
];

const emptyForm = () => ({
  requestedSystemKw: "",
  panelId: "",
  inverterType: "",
  inverterId: "",
  metalConstructionRequired: null,
  batteryRequired: null,
  batteryId: "",
  batteryBackupHours: 4,
  clientName: "",
  phone: "",
});

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("uz-UZ");
}

function OptionCard({ selected, onClick, title, lines = [] }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
        selected
          ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="font-semibold text-slate-900">{title}</div>
      {lines.filter(Boolean).length ? (
        <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
          {lines.filter(Boolean).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 text-xs font-semibold text-emerald-700">Tanlash</div>
    </button>
  );
}

function panelCardLines(p) {
  return [
    p.powerW ? `Quvvat: ${p.powerW} W` : null,
    p.warrantyYears != null ? `Kafolat: ${p.warrantyYears} yil` : null,
    p.brand ? `Brend: ${p.brand}` : null,
  ];
}

function inverterCardLines(inv) {
  return [
    inv.powerKw != null ? `Quvvat: ${inv.powerKw} kW` : null,
    inv.phase != null ? `Faza: ${inv.phase}` : null,
    inv.type || inv.subtype ? `Turi: ${inv.type || inv.subtype}` : null,
    inv.warrantyYears != null ? `Kafolat: ${inv.warrantyYears} yil` : null,
  ];
}

function batteryCardLines(b) {
  return [
    b.capacityKwh != null && b.capacityKwh !== ""
      ? `Sig‘im: ${b.capacityKwh} kWh`
      : b.capacityAh != null
        ? `Sig‘im: ${b.capacityAh} Ah`
        : null,
    b.voltage ? `Volt: ${b.voltage}` : null,
    b.chemistry ? `Texnologiya: ${b.chemistry}` : null,
    b.warrantyYears != null ? `Kafolat: ${b.warrantyYears} yil` : null,
  ];
}

function PrimaryBtn({ children, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function toLocalPricing(report) {
  if (!report?.ok && report?.totalUsd == null) return null;
  return {
    totalUsd: report.totalUsd,
    totalUzs: report.totalUzs,
    exchangeRate: report.exchangeRate,
    panel: report.panel
      ? {
          name: report.panel.name,
          count: report.panel.count,
          unitPrice: report.panel.unitPrice,
          total: report.panel.total,
        }
      : null,
    inverter: report.inverter
      ? {
          name: report.inverter.name,
          unitPrice: report.inverter.unitPrice,
          total: report.inverter.total,
        }
      : null,
    metal: report.metal?.required
      ? {
          meters: report.metal.meters,
          unitPrice: report.metal.unitPrice,
          total: report.metal.total,
        }
      : null,
    breakers: report.breakers || [],
    accessories: report.accessories || [],
    battery: report.battery
      ? {
          name: report.battery.name,
          quantity: report.battery.quantity,
          unitPrice: report.battery.unitPrice,
          total: report.battery.total,
        }
      : null,
  };
}

function ResultView({ quote, pricing, isAdmin }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  if (!quote) return null;
  const text = quote.telegramText;
  return (
    <div className="space-y-3">
      {text ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-4 font-mono text-[13px] leading-relaxed text-slate-800 sm:p-5">
          {text}
        </pre>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          Hisobot matni yo‘q
        </div>
      )}
      {isAdmin ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
          >
            {showBreakdown ? "Ichki breakdown yashirish" : "Ichki breakdown (admin)"}
          </button>
          {showBreakdown && pricing ? (
            <div className="overflow-x-auto rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-sm text-slate-800">
              <p className="font-semibold">Unit price / ichki breakdown</p>
              <ul className="mt-2 space-y-1 font-mono text-xs">
                {pricing.panel ? (
                  <li>
                    Panel: {pricing.panel.count} × {pricing.panel.unitPrice}$ ={" "}
                    {pricing.panel.total}$
                  </li>
                ) : null}
                {pricing.metal ? (
                  <li>
                    Metal: {pricing.metal.meters} × {pricing.metal.unitPrice}$ ={" "}
                    {pricing.metal.total}$
                  </li>
                ) : null}
                {pricing.inverter ? (
                  <li>
                    Inverter: {pricing.inverter.unitPrice}$ = {pricing.inverter.total}$
                  </li>
                ) : null}
                {(pricing.breakers || []).map((b, i) => (
                  <li key={`b-${i}`}>
                    {b.name}: {b.quantity} × {b.unitPrice}$ = {b.total}$
                  </li>
                ))}
                {(pricing.accessories || []).map((a, i) => (
                  <li key={`a-${i}`}>
                    {a.name}: {a.quantity} × {a.unitPrice}$ = {a.total}$
                  </li>
                ))}
                {pricing.battery ? (
                  <li>
                    Battery: {pricing.battery.quantity} × {pricing.battery.unitPrice}$ ={" "}
                    {pricing.battery.total}$
                  </li>
                ) : null}
                <li className="pt-1 font-semibold">
                  Jami: {pricing.totalUsd}$ / {pricing.totalUzs} so&apos;m (kurs{" "}
                  {pricing.exchangeRate})
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function TaminotPage() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";

  const [tab, setTab] = useState("new");
  const [catalog, setCatalog] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [quote, setQuote] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [reloading, setReloading] = useState(false);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setError("");
    const data = await fetchSupplyCatalog();
    setCatalog(data);
    setCatalogLoading(false);
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await listSupplyCalculations());
    } catch (e) {
      setError(e?.message || "Tarix yuklanmadi");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab, loadHistory]);

  const panels = catalog?.panels || [];
  const batteries = catalog?.batteries || [];
  const inverterTypes = catalog?.inverterTypes || [];
  const dbReady = Boolean(catalog?.ok);

  const compatibleInverters = useMemo(() => {
    if (!dbReady || !form.inverterType || !form.requestedSystemKw) return [];
    return suggestInverters(
      catalog,
      form.inverterType,
      Number(form.requestedSystemKw),
    );
  }, [catalog, dbReady, form.inverterType, form.requestedSystemKw]);

  const needsBattery = /^(hybrid|offgrid)$/i.test(
    String(form.inverterType || ""),
  );

  const resetWizard = () => {
    setForm(emptyForm());
    setQuote(null);
    setPricing(null);
    setSavedId(null);
    setStepIdx(0);
    setStarted(false);
    setError("");
  };

  const startWizard = () => {
    if (!dbReady) {
      setError(
        catalog?.errorKind === "network"
          ? "Taminot serveriga ulanib bo‘lmadi. Internet aloqasini tekshiring yoki qayta urinib ko‘ring."
          : "Taminot ma’lumotlar bazasi topilmadi",
      );
      return;
    }
    setForm(emptyForm());
    setQuote(null);
    setPricing(null);
    setSavedId(null);
    setStepIdx(0);
    setStarted(true);
    setError("");
  };

  const handleReloadDb = async () => {
    if (!isAdmin) return;
    setReloading(true);
    setError("");
    try {
      await reloadSupplyCatalog(session);
      await loadCatalog();
      alert("Taminot bazasi yangilandi");
    } catch (e) {
      setError(e?.message || "Yangilash xatosi");
    } finally {
      setReloading(false);
    }
  };

  const validateStep = () => {
    const step = STEPS[stepIdx]?.id;
    const kw = Number(form.requestedSystemKw);
    if (step === "power") {
      if (!Number.isFinite(kw) || kw < 1 || kw > 100) {
        return "Quvvat 1 dan 100 kW gacha bo‘lishi kerak";
      }
    }
    if (step === "panel" && !form.panelId) return "Panel turini tanlang";
    if (step === "invType" && !form.inverterType) return "Inverter turini tanlang";
    if (step === "inverter" && !form.inverterId) return "Inverter modelini tanlang";
    if (step === "metal" && form.metalConstructionRequired == null) {
      return "Metall konstruksiya kerakligini tanlang";
    }
    if (step === "battery" && needsBattery) {
      if (form.batteryRequired == null) return "Akkumulyator kerakligini tanlang";
      if (form.batteryRequired && !form.batteryId) return "Akkumulyator modelini tanlang";
    }
    if (step === "client") {
      if (!String(form.clientName || "").trim()) return "Ismingizni kiriting";
      if (!isValidPhoneUz(form.phone)) return "Telefon formati: +998 XX XXX XX XX";
    }
    return "";
  };

  const runCalculate = async () => {
    setCalcBusy(true);
    setError("");
    try {
      const res = await calculateSupplyOnServer(
        {
          requestedSystemKw: Number(form.requestedSystemKw),
          panelId: form.panelId,
          inverterId: form.inverterId,
          metalConstructionRequired: Boolean(form.metalConstructionRequired),
          batteryRequired: needsBattery && Boolean(form.batteryRequired),
          batteryId: form.batteryId,
          batteryLoadKw: Number(form.requestedSystemKw),
          batteryBackupHours: Number(form.batteryBackupHours) || 4,
          clientName: form.clientName.trim(),
          phone: formatPhoneUz(form.phone),
        },
        { includePrices: true, session },
      );
      const report = res?.report || res?.quote || res?.fullQuote;
      if (!res?.ok || !report) {
        setError(res?.error || "Hisob xatosi");
        return false;
      }
      setQuote(report);
      setPricing(res.pricing || toLocalPricing(report));
      return true;
    } finally {
      setCalcBusy(false);
    }
  };

  const goNext = async () => {
    if (!dbReady) {
      setError(
        catalog?.errorKind === "network"
          ? "Taminot serveriga ulanib bo‘lmadi. Internet aloqasini tekshiring yoki qayta urinib ko‘ring."
          : "Taminot ma’lumotlar bazasi topilmadi",
      );
      return;
    }
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }

    let next = stepIdx + 1;
    // Telegram tartibi: inverter → (akkumulyator?) → metall
    if (STEPS[stepIdx]?.id === "inverter" && !needsBattery) {
      next = STEPS.findIndex((s) => s.id === "metal");
    }

    if (STEPS[next]?.id === "result" || next >= STEPS.length - 1) {
      const ok = await runCalculate();
      if (!ok) return;
      setStepIdx(STEPS.findIndex((s) => s.id === "result"));
      return;
    }
    setStepIdx(next);
  };

  const goBack = () => {
    setError("");
    if (STEPS[stepIdx]?.id === "result") {
      setStepIdx(STEPS.findIndex((s) => s.id === "client"));
      return;
    }
    // Akkumulyator kerak bo‘lmasa metall → inverter
    if (STEPS[stepIdx]?.id === "metal" && !needsBattery) {
      setStepIdx(STEPS.findIndex((s) => s.id === "inverter"));
      return;
    }
    if (stepIdx <= 0) {
      setStarted(false);
      return;
    }
    setStepIdx((i) => i - 1);
  };

  const handleSave = async () => {
    if (!quote) return;
    setSaving(true);
    setError("");
    try {
      const createdBy =
        session?.login || session?.username || session?.uid || session?.id || "";
      const payload = quoteToStoragePayload(quote, { createdBy });
      const saved = await saveSupplyCalculation(payload, savedId);
      if (saved?.id) setSavedId(saved.id);
      alert("Hisob saqlandi");
    } catch (e) {
      setError(e?.message || "Saqlashda xato");
    } finally {
      setSaving(false);
    }
  };

  const handlePdf = async (data = quote) => {
    if (!data) return;
    setPdfBusy(true);
    try {
      await downloadSupplyPdf(data);
    } catch (e) {
      setError(e?.message || "PDF xatosi");
    } finally {
      setPdfBusy(false);
    }
  };

  const openFromHistory = (row) => {
    setTab("new");
    setStarted(true);
    setSavedId(row.id);
    setForm({
      requestedSystemKw: row.requestedSystemKw ?? "",
      panelId: row.panelId || "",
      inverterType: row.inverterType || "",
      inverterId: row.inverterId || "",
      metalConstructionRequired: Boolean(row.metalConstructionRequired),
      batteryRequired: Boolean(row.batteryRequired),
      batteryId: row.batteryConfig?.id || "",
      batteryBackupHours: 4,
      clientName: row.clientName || "",
      phone: row.phone || "",
    });
    setQuote(storageRowToQuote(row));
    setPricing(toLocalPricing(storageRowToQuote(row)));
    setStepIdx(STEPS.findIndex((s) => s.id === "result"));
    setError("");
  };

  const duplicateRow = (row) => {
    openFromHistory({ ...row, id: undefined });
    setSavedId(null);
  };

  const deleteRow = async (row) => {
    if (!window.confirm("Ushbu hisobni o‘chirasizmi?")) return;
    try {
      await deleteSupplyCalculation(row.id);
      await loadHistory();
    } catch (e) {
      setError(e?.message || "O‘chirishda xato");
    }
  };

  const step = STEPS[stepIdx];

  if (catalogLoading) {
    return (
      <section className="rounded-[1.375rem] border border-slate-200/85 bg-white p-6 shadow-soft-lg">
        <p className="text-sm text-slate-500">Taminot katalogi yuklanmoqda…</p>
      </section>
    );
  }

  if (!dbReady) {
    const isNetwork = catalog?.errorKind === "network";
    const title = isNetwork
      ? "Taminot serveriga ulanib bo‘lmadi"
      : "Taminot ma’lumotlar bazasi topilmadi";
    const detail = isNetwork
      ? "Internet aloqasini tekshiring yoki qayta urinib ko‘ring."
      : catalog?.error ||
        "Serverda data/supply (database.db) topilmadi. Administratorga murojaat qiling.";
    return (
      <section className="rounded-[1.375rem] border border-rose-200 bg-rose-50/60 p-6 shadow-soft-lg sm:p-8">
        <h2 className="text-xl font-semibold text-rose-900">{title}</h2>
        <p className="mt-2 text-sm text-rose-800">{catalog?.error || detail}</p>
        {!isNetwork ? (
          <p className="mt-1 text-xs text-rose-700">{detail}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryBtn onClick={loadCatalog}>Qayta urinish</PrimaryBtn>
          {isAdmin ? (
            <GhostBtn disabled={reloading} onClick={handleReloadDb}>
              {reloading ? "…" : "Taminot bazasini yangilash"}
            </GhostBtn>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-5 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-7">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
          <button
            type="button"
            onClick={() => setTab("new")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              tab === "new" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            Yangi hisob
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              tab === "history" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            Hisoblar tarixi
          </button>
          {isAdmin ? (
            <button
              type="button"
              disabled={reloading}
              onClick={handleReloadDb}
              className="ml-auto rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-800 disabled:opacity-40"
            >
              {reloading ? "Yangilanmoqda…" : "Taminot bazasini yangilash"}
            </button>
          ) : null}
        </div>

        {tab === "history" ? (
          <div className="mt-5">
            <h2 className="text-xl font-semibold text-slate-900">Hisoblar tarixi</h2>
            {historyLoading ? (
              <p className="mt-3 text-sm text-slate-500">Yuklanmoqda…</p>
            ) : history.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Hali saqlangan hisob yo‘q.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Mijoz</th>
                      <th className="px-2 py-2 font-medium">Telefon</th>
                      <th className="px-2 py-2 font-medium">kW</th>
                      <th className="px-2 py-2 font-medium">Panel</th>
                      <th className="px-2 py-2 font-medium">Inverter</th>
                      {isAdmin ? (
                        <>
                          <th className="px-2 py-2 font-medium">USD</th>
                          <th className="px-2 py-2 font-medium">UZS</th>
                        </>
                      ) : null}
                      <th className="px-2 py-2 font-medium">Sana</th>
                      <th className="px-2 py-2 font-medium">Amallar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">{row.clientName || "—"}</td>
                        <td className="whitespace-nowrap px-2 py-2">{row.phone || "—"}</td>
                        <td className="px-2 py-2">{row.requestedSystemKw}</td>
                        <td className="max-w-[10rem] truncate px-2 py-2">{row.panelName}</td>
                        <td className="max-w-[10rem] truncate px-2 py-2">{row.inverterName}</td>
                        {isAdmin ? (
                          <>
                            <td className="whitespace-nowrap px-2 py-2">
                              {row.totalUsd != null ? formatUsd(row.totalUsd) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              {row.totalUzs != null ? formatUzs(row.totalUzs) : "—"}
                            </td>
                          </>
                        ) : null}
                        <td className="whitespace-nowrap px-2 py-2 text-xs">
                          {fmtDate(row.createdAt)}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold"
                              onClick={() => openFromHistory(row)}
                            >
                              Ochish
                            </button>
                            <button
                              type="button"
                              className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold"
                              onClick={() => handlePdf(storageRowToQuote(row))}
                            >
                              PDF
                            </button>
                            <button
                              type="button"
                              className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold"
                              onClick={() => duplicateRow(row)}
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                              onClick={() => deleteRow(row)}
                            >
                              O‘chirish
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          </div>
        ) : !started ? (
          <div className="mt-6 max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Taminot hisob-kitobi
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              Quyosh paneli va inverter tizimini hisoblash
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Katalog: {panels.length} panel · {catalog.inverters?.length || 0} inverter ·{" "}
              {batteries.length} akkumulyator
              {catalog.sources?.length ? ` · ${catalog.sources.join(", ")}` : ""}
            </p>
            <div className="mt-6">
              <PrimaryBtn onClick={startWizard}>Hisoblashni boshlash</PrimaryBtn>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <div className="mb-5 flex flex-wrap gap-1.5">
              {STEPS.map((s, i) => {
                if (s.id === "battery" && !needsBattery) return null;
                const active = i === stepIdx;
                const done = i < stepIdx;
                return (
                  <span
                    key={s.id}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      active
                        ? "bg-emerald-600 text-white"
                        : done
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {s.label}
                  </span>
                );
              })}
            </div>

            <h3 className="text-lg font-semibold text-slate-900">{step?.label}</h3>

            <div className="mt-4 space-y-3">
              {step?.id === "power" && (
                <>
                  <p className="text-sm text-slate-600">
                    O‘rnatmoqchi bo‘lgan quyosh panellari quvvatini kiriting
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={form.requestedSystemKw}
                      onChange={(e) => setField("requestedSystemKw", e.target.value)}
                      className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-base"
                      placeholder="20"
                    />
                    <span className="text-sm font-medium text-slate-600">kW</span>
                  </div>
                </>
              )}

              {step?.id === "panel" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {panels.map((p) => (
                    <OptionCard
                      key={p.id}
                      selected={form.panelId === p.id}
                      onClick={() => setField("panelId", p.id)}
                      title={panelLabel(p)}
                      lines={panelCardLines(p)}
                    />
                  ))}
                </div>
              )}

              {step?.id === "invType" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {inverterTypes.map((t) => (
                    <OptionCard
                      key={t.id}
                      selected={form.inverterType === t.id}
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          inverterType: t.id,
                          inverterId: "",
                          batteryRequired: null,
                          batteryId: "",
                        }));
                        setError("");
                      }}
                      title={t.label}
                    />
                  ))}
                </div>
              )}

              {step?.id === "inverter" && (
                <>
                  <p className="text-sm text-slate-600">
                    Mos inverterlar (quvvat ≥ {form.requestedSystemKw} kW)
                  </p>
                  {compatibleInverters.length === 0 ? (
                    <p className="text-sm text-amber-700">Mos inverter topilmadi.</p>
                  ) : (
                    <div className="grid max-h-[70vh] gap-2 overflow-y-auto sm:grid-cols-2">
                      {compatibleInverters.map((inv) => (
                        <OptionCard
                          key={inv.id}
                          selected={form.inverterId === inv.id}
                          onClick={() => setField("inverterId", inv.id)}
                          title={inverterLabel(inv)}
                          lines={inverterCardLines(inv)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {step?.id === "metal" && (
                <>
                  <p className="text-sm text-slate-600">
                    Quyosh panellari uchun metall konstruksiya kerakmi?
                  </p>
                  <div className="grid max-w-md grid-cols-2 gap-2">
                    <OptionCard
                      selected={form.metalConstructionRequired === true}
                      onClick={() => setField("metalConstructionRequired", true)}
                      title="Ha"
                    />
                    <OptionCard
                      selected={form.metalConstructionRequired === false}
                      onClick={() => setField("metalConstructionRequired", false)}
                      title="Yo‘q"
                    />
                  </div>
                </>
              )}

              {step?.id === "battery" && needsBattery && (
                <>
                  <p className="text-sm text-slate-600">Akkumulyator kerakmi?</p>
                  <div className="grid max-w-md grid-cols-2 gap-2">
                    <OptionCard
                      selected={form.batteryRequired === true}
                      onClick={() => setField("batteryRequired", true)}
                      title="Ha"
                    />
                    <OptionCard
                      selected={form.batteryRequired === false}
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          batteryRequired: false,
                          batteryId: "",
                        }))
                      }
                      title="Yo‘q"
                    />
                  </div>
                  {form.batteryRequired ? (
                    <div className="mt-4 space-y-3">
                      <label className="block text-sm text-slate-600">
                        Zaxira vaqti (soat)
                        <input
                          type="number"
                          min={1}
                          max={48}
                          value={form.batteryBackupHours}
                          onChange={(e) => setField("batteryBackupHours", e.target.value)}
                          className="mt-1 w-32 rounded-xl border border-slate-200 px-3 py-2"
                        />
                      </label>
                      <div className="grid max-h-[70vh] gap-2 overflow-y-auto sm:grid-cols-2">
                        {batteries.map((b) => (
                          <OptionCard
                            key={b.id}
                            selected={form.batteryId === b.id}
                            onClick={() => setField("batteryId", b.id)}
                            title={b.name || `${b.brand} ${b.model}`}
                            lines={batteryCardLines(b)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {step?.id === "client" && (
                <div className="max-w-md space-y-4">
                  <label className="block text-sm text-slate-600">
                    Ismingizni kiriting
                    <input
                      type="text"
                      value={form.clientName}
                      onChange={(e) => setField("clientName", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm text-slate-600">
                    Telefon raqamingizni kiriting
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setField("phone", formatPhoneUz(e.target.value))}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                      placeholder="+998 XX XXX XX XX"
                    />
                  </label>
                </div>
              )}

              {step?.id === "result" && quote ? (
                <ResultView quote={quote} pricing={pricing} isAdmin={isAdmin} />
              ) : null}
            </div>

            {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

            <div className="mt-6 flex flex-wrap gap-2">
              {step?.id !== "result" ? (
                <>
                  <GhostBtn onClick={goBack}>Orqaga</GhostBtn>
                  <PrimaryBtn disabled={calcBusy} onClick={goNext}>
                    {calcBusy ? "Hisob…" : "Davom etish"}
                  </PrimaryBtn>
                </>
              ) : (
                <>
                  <GhostBtn onClick={goBack}>Orqaga</GhostBtn>
                  <PrimaryBtn disabled={saving} onClick={handleSave}>
                    {saving ? "Saqlanmoqda…" : "Saqlash"}
                  </PrimaryBtn>
                  <PrimaryBtn disabled={pdfBusy} onClick={() => handlePdf()}>
                    {pdfBusy ? "PDF…" : "PDF yuklab olish"}
                  </PrimaryBtn>
                  <GhostBtn onClick={resetWizard}>Yangi hisob</GhostBtn>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
