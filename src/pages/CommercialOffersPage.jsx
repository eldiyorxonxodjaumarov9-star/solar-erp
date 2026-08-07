import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import CommercialOffersList, { mergeOfferRows } from "../commercialOffers/CommercialOffersList.jsx";
import OfferTypeSelector from "../commercialOffers/OfferTypeSelector.jsx";
import {
  deleteSolarOffer,
  listSolarOffers,
  saveSolarOffer,
  subscribeSolarOffers,
} from "../commercialOffers/services/commercialOffersService.js";
import {
  deleteHeatPumpForm,
  listHeatPumpForms,
  saveHeatPumpForm,
  subscribeHeatPumpForms,
} from "../commercialOffers/services/heatPumpFormsService.js";
import SolarOfferFormPaper from "../commercialOffers/solar/SolarOfferFormPaper.jsx";
import { DEFAULT_SOLAR_FORM } from "../commercialOffers/solar/solarOfferSchema.js";
import {
  formToSolarPayload,
  recordToSolarForm,
  validateSolarOfferForm,
} from "../commercialOffers/solar/solarOfferSchema.js";
import {
  downloadSolarOfferPdf,
  solarOfferPdfBlobUrl,
} from "../commercialOffers/solar/solarOfferPdf.js";
import HeatPumpFormPaper from "../heatPumpForms/HeatPumpFormPaper.jsx";
import { DEFAULT_HEAT_PUMP_FORM } from "../heatPumpForms/heatPumpFormSchema.js";
import {
  formToFirestorePayload,
  recordToForm,
  validateHeatPumpForm,
} from "../heatPumpForms/heatPumpFormSchema.js";
import {
  downloadHeatPumpFormPdf,
  heatPumpFormPdfBlobUrl,
} from "../heatPumpForms/heatPumpFormPdf.js";

/** @typedef {'choose' | 'form'} ScreenMode */
/** @typedef {'heat_pump' | 'solar_panel' | null} OfferType */

function FormToolbar({
  saving,
  pdfBusy,
  offerType,
  editId,
  onSave,
  onDownload,
  onPreview,
  onPrint,
  onBack,
  onNew,
}) {
  const typeLabel =
    offerType === "heat_pump"
      ? "Issiqlik nasosi"
      : offerType === "solar_panel"
        ? "Quyosh paneli"
        : "";
  const isEdit = Boolean(editId);

  return (
    <div className="heat-pump-no-print mb-4 px-2 sm:px-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="text-sm font-bold underline">
          ← Orqaga
        </button>
        <div className="text-center">
          {typeLabel ? (
            <span className="block text-sm font-bold text-black">{typeLabel}</span>
          ) : null}
          {isEdit ? (
            <span className="text-xs text-neutral-600">Tahrirlash rejimi</span>
          ) : null}
        </div>
        <button type="button" onClick={onNew} className="text-sm font-bold underline">
          + Yangi taklif
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="border border-black bg-white px-5 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          {saving ? "Saqlanmoqda…" : isEdit ? "YANGILASH" : "SAVE"}
        </button>
        <button
          type="button"
          disabled={pdfBusy}
          onClick={onDownload}
          className="border border-black bg-black px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {pdfBusy ? "PDF…" : "Download PDF"}
        </button>
        <button
          type="button"
          disabled={pdfBusy}
          onClick={onPreview}
          className="border border-black bg-white px-5 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          PDF preview
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="border border-black bg-white px-5 py-2 text-sm font-bold text-black"
        >
          Print
        </button>
      </div>
    </div>
  );
}

export default function CommercialOffersPage() {
  const { session } = useAuth();
  const paperRef = useRef(null);

  const [screen, setScreen] = useState("choose");
  const [offerType, setOfferType] = useState(null);

  const [heatRows, setHeatRows] = useState([]);
  const [solarRows, setSolarRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [heatForm, setHeatForm] = useState({ ...DEFAULT_HEAT_PUMP_FORM });
  const [solarForm, setSolarForm] = useState({ ...DEFAULT_SOLAR_FORM });
  const [editId, setEditId] = useState("");
  const [editCollection, setEditCollection] = useState("");

  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [previewUrl, setPreviewUrl] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const allRows = mergeOfferRows(heatRows, solarRows);

  const reload = useCallback(async () => {
    const [heat, solar] = await Promise.all([listHeatPumpForms(), listSolarOffers()]);
    setHeatRows(heat);
    setSolarRows(solar);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([listHeatPumpForms(), listSolarOffers()])
      .then(([heat, solar]) => {
        if (!active) return;
        setHeatRows(heat);
        setSolarRows(solar);
      })
      .catch((e) => active && setError(e?.message || "Yuklab bo‘lmadi"))
      .finally(() => active && setLoading(false));

    const unsubHeat = subscribeHeatPumpForms(
      (list) => setHeatRows(Array.isArray(list) ? list : []),
      (e) => setError(e?.message || "Issiqlik nasosi sinxronlash xatosi"),
    );
    const unsubSolar = subscribeSolarOffers(
      (list) => setSolarRows(Array.isArray(list) ? list : []),
      (e) => setError(e?.message || "Quyosh paneli sinxronlash xatosi"),
    );

    return () => {
      active = false;
      if (typeof unsubHeat === "function") unsubHeat();
      if (typeof unsubSolar === "function") unsubSolar();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
    setFieldErrors({});
  };

  const resetAll = () => {
    setHeatForm({ ...DEFAULT_HEAT_PUMP_FORM });
    setSolarForm({ ...DEFAULT_SOLAR_FORM });
    setEditId("");
    setEditCollection("");
    setOfferType(null);
    setScreen("choose");
    clearMessages();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setShowPreview(false);
  };

  const pickType = (type) => {
    setOfferType(type);
    setScreen("form");
    setEditId("");
    setEditCollection("");
    clearMessages();
    if (type === "heat_pump") setHeatForm({ ...DEFAULT_HEAT_PUMP_FORM });
    if (type === "solar_panel") setSolarForm({ ...DEFAULT_SOLAR_FORM });
  };

  const applyEditRecord = useCallback((type, collection, record) => {
    setOfferType(type);
    setScreen("form");
    setEditId(String(record?.id || ""));
    setEditCollection(collection);
    if (type === "heat_pump") {
      const next = recordToForm(record);
      if (next) setHeatForm(next);
    } else {
      const next = recordToSolarForm(record);
      if (next) setSolarForm(next);
    }
  }, []);

  const openRow = (row) => {
    clearMessages();
    applyEditRecord(row.offerType, row.collection, row);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setHeatField = (key, value) => {
    setHeatForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      if (key === "systemPowerCounts") {
        delete next.systemPower;
      }
      return next;
    });
    setSuccess("");
  };

  const setSolarField = (key, value) => {
    setSolarForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      if (key === "panelType" || key === "panelImage" || key === "panelLogo") {
        delete next.panelType;
      }
      if (key === "inverterType" || key === "inverterImage") {
        delete next.inverterType;
      }
      if (
        key === "hasBattery" ||
        key === "batteryType" ||
        key === "batteryImage" ||
        key === "batteryCapacity"
      ) {
        delete next.hasBattery;
        delete next.batteryType;
        delete next.batteryCapacity;
      }
      if (key === "metalConstruction" || key === "metalConstructionImage") {
        delete next.metalConstruction;
      }
      if (key === "panelPower" || key === "panelCount") {
        delete next.panelPower;
        delete next.panelCount;
      }
      return next;
    });
    setSuccess("");
  };

  const setSolarRegion = (region) => {
    setSolarForm((prev) => ({ ...prev, region, district: "" }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.region;
      delete next.district;
      return next;
    });
    setSuccess("");
  };

  const handleSave = async () => {
    const isHeat = offerType === "heat_pump";
    const errors = isHeat ? validateHeatPumpForm(heatForm) : validateSolarOfferForm(solarForm);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError("Blankani to‘liq to‘ldiring");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const createdBy = session?.login || session?.name || "user";
      if (isHeat) {
        const payload = formToFirestorePayload(heatForm, createdBy);
        const existingId =
          editCollection === "heatPumpForms" && editId ? editId : "";
        const saved = await saveHeatPumpForm(existingId, payload);
        applyEditRecord("heat_pump", "heatPumpForms", saved);
      } else {
        const payload = formToSolarPayload(solarForm, createdBy);
        const existingId =
          editCollection === "commercialOffers" && editId ? editId : "";
        const saved = await saveSolarOffer(existingId, payload);
        applyEditRecord("solar_panel", "commercialOffers", saved);
      }
      setSuccess("Saqlandi");
      await reload();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e?.message || "Saqlashda xato");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!row?.id) return;
    if (!window.confirm("O‘chirishni tasdiqlaysizmi?")) return;
    try {
      if (row.offerType === "heat_pump") {
        await deleteHeatPumpForm(row.id);
      } else {
        await deleteSolarOffer(row.id);
      }
      if (editId === row.id) resetAll();
      setSuccess("O‘chirildi");
      await reload();
    } catch (e) {
      setError(e?.message || "O‘chirib bo‘lmadi");
    }
  };

  const handleDownload = async () => {
    const isHeat = offerType === "heat_pump";
    const errors = isHeat ? validateHeatPumpForm(heatForm) : validateSolarOfferForm(solarForm);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError("PDF uchun blankani to‘ldiring");
      return;
    }
    setPdfBusy(true);
    setError("");
    try {
      let result;
      if (isHeat) {
        result = await downloadHeatPumpFormPdf(heatForm);
      } else {
        const payload = formToSolarPayload(solarForm, session?.login || "admin");
        result = await downloadSolarOfferPdf(payload);
      }
      if (result?.savedPath) {
        setSuccess(`PDF saqlandi: ${result.savedPath}`);
      }
    } catch (e) {
      setError(e?.message || "PDF xatosi");
    } finally {
      setPdfBusy(false);
    }
  };

  const handlePreview = async () => {
    const isHeat = offerType === "heat_pump";
    const errors = isHeat ? validateHeatPumpForm(heatForm) : validateSolarOfferForm(solarForm);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError("Preview uchun blankani to‘ldiring");
      return;
    }
    setPdfBusy(true);
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      let url;
      if (isHeat) {
        url = await heatPumpFormPdfBlobUrl(heatForm);
      } else {
        const payload = formToSolarPayload(solarForm, session?.login || "admin");
        url = await solarOfferPdfBlobUrl(payload);
      }
      setPreviewUrl(url);
      setShowPreview(true);
      setError("");
    } catch (e) {
      setError(e?.message || "Preview xatosi");
    } finally {
      setPdfBusy(false);
    }
  };

  const handleRowPdf = async (row) => {
    setPdfBusy(true);
    try {
      let result;
      if (row.offerType === "heat_pump") {
        const form = recordToForm(row) || row;
        result = await downloadHeatPumpFormPdf(form);
      } else {
        result = await downloadSolarOfferPdf(row);
      }
      if (result?.savedPath) {
        setSuccess(`PDF saqlandi: ${result.savedPath}`);
      }
    } catch (e) {
      setError(e?.message || "PDF xatosi");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {(error || success || Object.keys(fieldErrors).length > 0) && screen === "form" ? (
        <div className="heat-pump-no-print px-2">
          {error ? (
            <p className="mb-2 border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          {Object.keys(fieldErrors).length > 0 ? (
            <ul className="mb-2 border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
              {Object.values(fieldErrors).map((msg) => (
                <li key={msg}>• {msg}</li>
              ))}
            </ul>
          ) : null}
          {success ? (
            <p className="mb-2 border border-emerald-400 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {success}
            </p>
          ) : null}
        </div>
      ) : null}

      {screen === "choose" ? (
        <>
          <OfferTypeSelector onSelect={pickType} />
          {(error || success) && (
            <div className="heat-pump-no-print px-2 text-center text-sm">
              {error ? <p className="text-red-700">{error}</p> : null}
              {success ? <p className="text-emerald-700">{success}</p> : null}
            </div>
          )}
        </>
      ) : (
        <>
          <FormToolbar
            saving={saving}
            pdfBusy={pdfBusy}
            offerType={offerType}
            editId={editId}
            onSave={() => void handleSave()}
            onDownload={() => void handleDownload()}
            onPreview={() => void handlePreview()}
            onPrint={() => window.print()}
            onBack={() => {
              setScreen("choose");
              setOfferType(null);
              clearMessages();
            }}
            onNew={resetAll}
          />
          <div ref={paperRef} className="heat-pump-screen-wrap">
            {offerType === "heat_pump" ? (
              <HeatPumpFormPaper form={heatForm} onFieldChange={setHeatField} />
            ) : (
              <SolarOfferFormPaper
                form={solarForm}
                onFieldChange={setSolarField}
                onRegionChange={setSolarRegion}
              />
            )}
          </div>
          {showPreview && previewUrl ? (
            <div className="heat-pump-no-print mx-auto mt-4 max-w-[210mm] border border-neutral-400 bg-white">
              <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
                <span>PDF ko‘rinishi</span>
                <button type="button" onClick={() => setShowPreview(false)}>
                  Yopish
                </button>
              </div>
              <iframe title="PDF preview" src={previewUrl} className="h-[80vh] w-full" />
            </div>
          ) : null}
        </>
      )}

      <CommercialOffersList
        rows={allRows}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        activeEditId={editId}
        activeEditCollection={editCollection}
        onOpen={openRow}
        onPdf={(row) => void handleRowPdf(row)}
        onDelete={(row) => void handleDelete(row)}
      />
    </div>
  );
}
