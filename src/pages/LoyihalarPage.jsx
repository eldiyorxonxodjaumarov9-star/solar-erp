import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SECTION_COPY } from "../navConfig";
import { projectCrewIds } from "../lib/monthlyReport";
import {
  PROJECT_HOLAT_OPTIONS,
  formatSomWithSpaces,
  projectNumberKey,
  somDigitsOnly,
  sortProjectsForList,
} from "../projects/projectStorage";
import { useProjects } from "../hooks/useProjects";
import { useWorkers } from "../hooks/useWorkers";
import {
  assignableWorkersForProjects,
  workerDisplayName,
} from "../workers/workerStorage";
import AppModalBackdrop from "../components/AppModalBackdrop";
import {
  REGIONS,
  REGION_DISTRICTS,
  canonicalDistrict,
  districtOptionsForRegion,
  normalizeRegionLabel,
} from "../data/regionDistricts.js";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

const SYSTEM_TYPE_OPTIONS = [
  "On grid",
  "Of grid",
  "Gibrid",
  "Issiqlik nasosi",
  "Elektra zaryad stansiya",
];

function parseAddressToRegionDistrict(addressRaw) {
  const address = String(addressRaw || "").trim();
  if (!address) return { region: "", district: "" };
  const [regionPart, districtPart] = address.split(",").map((x) => normalizeRegionLabel(x));
  const regionKey = normalizeRegionLabel(regionPart);
  const districtKey = normalizeRegionLabel(districtPart);
  if (REGION_DISTRICTS[regionKey]?.includes(districtKey)) {
    return { region: regionKey, district: districtKey };
  }
  const canonical = canonicalDistrict(districtKey);
  if (REGION_DISTRICTS[regionKey]?.includes(canonical)) {
    return { region: regionKey, district: canonical };
  }
  for (const region of REGIONS) {
    const districts = REGION_DISTRICTS[region] || [];
    if (districts.includes(districtKey)) {
      return { region, district: districtKey };
    }
    if (districts.includes(normalizeRegionLabel(address))) {
      return { region, district: normalizeRegionLabel(address) };
    }
  }
  if (regionKey && districtKey) return { region: regionKey, district: districtKey };
  return { region: "", district: "" };
}

function formatDateDisplay(ymd) {
  if (!ymd || typeof ymd !== "string") return "—";
  try {
    const d = new Date(`${ymd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium" }).format(d);
  } catch {
    return ymd;
  }
}

function projectNumberDisplay(p) {
  const n = projectNumberKey(p?.projectNumber);
  return n ? `#${n}` : "—";
}

function statusBadgeClass(holat) {
  const s = String(holat || "").toLowerCase();
  if (s.includes("tug")) return "bg-emerald-100 text-emerald-700";
  if (s.includes("reja")) return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}

function ModalBackdrop({ children, onClose }) {
  return (
    <AppModalBackdrop onClose={onClose} panelMaxWidthClass="max-w-lg">
      {children}
    </AppModalBackdrop>
  );
}

function dedupeWorkerIdsPreserveOrder(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const s = String(id ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function emptyFormState() {
  return {
    projectNumber: "",
    clientName: "",
    phone: "",
    address: "",
    region: "",
    district: "",
    holat: PROJECT_HOLAT_OPTIONS[0],
    stationPower: "",
    powerKw: "",
    paymentSomInput: "",
    systemType: "",
    startDate: "",
    endDate: "",
    izoh: "",
    selectedWorkerIds: [],
  };
}

function ProjectFormModal({
  mode,
  initial,
  workers,
  allProjects,
  excludeProjectId,
  onClose,
  onSave,
}) {
  const [fields, setFields] = useState(emptyFormState);
  const [error, setError] = useState("");
  const nextProjectNumber = useMemo(() => {
    const maxExisting = allProjects.reduce((maxVal, p) => {
      const n = Number.parseInt(somDigitsOnly(p.projectNumber ?? ""), 10);
      if (Number.isFinite(n)) return Math.max(maxVal, n);
      return maxVal;
    }, 999);
    return String(Math.max(1000, maxExisting + 1));
  }, [allProjects]);

  useEffect(() => {
    if (initial) {
      const pickedAddress = parseAddressToRegionDistrict(initial.address);
      const initialWorkerIds = dedupeWorkerIdsPreserveOrder(projectCrewIds(initial));
      setFields({
        projectNumber: somDigitsOnly(initial.projectNumber ?? ""),
        clientName: initial.clientName ?? "",
        phone: initial.phone ?? "",
        address: initial.address ?? "",
        region: pickedAddress.region,
        district: pickedAddress.district,
        holat: initial.holat || PROJECT_HOLAT_OPTIONS[0],
        stationPower:
          initial.stationPower ??
          initial.power ??
          initial.kw ??
          initial.powerKw ??
          "",
        powerKw: initial.powerKw ?? initial.stationPower ?? "",
        paymentSomInput: formatSomWithSpaces(initial.paymentSom ?? ""),
        systemType: initial.systemType ?? "",
        startDate: initial.startDate ?? "",
        endDate: initial.endDate ?? "",
        izoh: initial.izoh ?? "",
        selectedWorkerIds: initialWorkerIds,
      });
    } else {
      setFields({
        ...emptyFormState(),
        projectNumber: nextProjectNumber,
      });
    }
    setError("");
  }, [initial, mode, nextProjectNumber]);

  /** Barcha biriktiriladigan ustalar — ism bo‘yicha tartiblangan. */
  const workersForPick = useMemo(
    () => assignableWorkersForProjects(workers),
    [workers],
  );

  useEffect(() => {
    const allowedIds = new Set(workersForPick.map((w) => String(w.id)));
    if (allowedIds.size === 0) return;
    setFields((prev) => {
      const next = prev.selectedWorkerIds.filter((id) => allowedIds.has(String(id)));
      if (next.length === prev.selectedWorkerIds.length) return prev;
      return { ...prev, selectedWorkerIds: next };
    });
  }, [workersForPick]);

  const districtOptions = useMemo(
    () => districtOptionsForRegion(fields.region, fields.district),
    [fields.region, fields.district],
  );

  const setField = (key, value) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const projectNumber = somDigitsOnly(fields.projectNumber);
    const clientName = fields.clientName.trim();
    const phone = fields.phone.trim();
    const region = fields.region.trim();
    const district = fields.district.trim();
    const address = [region, district].filter(Boolean).join(", ");
    const holat = fields.holat.trim();
    const stationPowerRaw = String(fields.stationPower ?? "").trim();
    const stationPower = Number(stationPowerRaw);
    const powerKw = stationPowerRaw;
    const paymentRaw = somDigitsOnly(fields.paymentSomInput);
    const systemType = fields.systemType.trim();
    const startDate = fields.startDate.trim();
    const endDate = fields.endDate.trim();
    const izoh = fields.izoh.trim();

    if (
      !projectNumber ||
      !clientName ||
      !phone ||
      !region ||
      !district ||
      !holat ||
      !stationPowerRaw ||
      !paymentRaw ||
      !systemType ||
      !startDate ||
      !endDate
    ) {
      setError("Barcha majburiy maydonlarni to‘ldiring.");
      return;
    }
    if (fields.selectedWorkerIds.length === 0) {
      setError("Kamida bitta ustani tanlang (pastdagi ro‘yxatdan).");
      return;
    }
    if (!Number.isFinite(stationPower) || stationPower < 1 || stationPower > 100) {
      setError("Stansiya quvvati 1 dan 100 kV gacha bo‘lishi kerak.");
      return;
    }
    const paymentNum = Math.round(Number(paymentRaw) || 0);
    if (!Number.isFinite(paymentNum)) {
      setError("Mijoz to‘lovi raqam bo‘lishi kerak.");
      return;
    }

    const pnKey = projectNumberKey(projectNumber);
    const duplicate = allProjects.some(
      (p) =>
        p.id !== excludeProjectId && projectNumberKey(p.projectNumber) === pnKey,
    );
    if (duplicate) {
      setError("Bu loyiha raqami allaqachon mavjud.");
      return;
    }

    setError("");
    const selectedIds = dedupeWorkerIdsPreserveOrder(fields.selectedWorkerIds);
    const byWorkerId = new Map(workers.map((w) => [String(w.id), w]));
    const finalCrew = selectedIds.map((id) => byWorkerId.get(id)).filter(Boolean);
    const assignedWorkerIds = finalCrew.map((w) => String(w.id));
    if (assignedWorkerIds.length === 0) {
      setError("Tanlangan ustalar ro‘yxatda topilmadi — ro‘yxatni tekshiring.");
      return;
    }
    const assignedWorkerNames = finalCrew
      .map((w) => workerDisplayName(w))
      .filter(Boolean);
    const ustaId = assignedWorkerIds[0] || "";
    const ustaName = assignedWorkerNames[0] || "";

    onSave({
      projectNumber,
      clientName,
      phone,
      address,
      holat,
      brigadeId: "",
      brigadeName: "",
      ustaId,
      ustaName,
      assignedWorkerId: ustaId,
      assignedWorkerIds,
      ustaNames: assignedWorkerNames,
      stationPower,
      powerKw,
      paymentSom: String(Math.max(0, paymentNum)),
      systemType,
      startDate,
      endDate,
      izoh,
    });
    onClose();
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        className="mb-[env(safe-area-inset-bottom,0px)] max-h-[90dvh] overflow-y-auto rounded-t-[1.25rem] border border-slate-200/90 bg-white shadow-soft-xl ring-1 ring-slate-900/[0.04] sm:mb-0 sm:rounded-[1.25rem]"
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <h3
            id="project-modal-title"
            className="text-lg font-semibold tracking-tight text-slate-900"
          >
            {mode === "edit" ? "Loyihani tahrirlash" : "Yangi loyiha"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Loyiha ma&apos;lumotlarini kiriting.
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 pt-5 pb-4">
            <div>
              <label htmlFor="pj-num" className="block text-sm font-medium text-slate-700">
                Loyiha raqami
              </label>
              <input
                id="pj-num"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={fields.projectNumber}
                onChange={(e) => {
                  if (mode !== "create") {
                    setField("projectNumber", somDigitsOnly(e.target.value));
                  }
                }}
                disabled={mode === "create"}
                className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
                placeholder="Avtomatik"
              />
            </div>
            <div>
              <label htmlFor="pj-client" className="block text-sm font-medium text-slate-700">
                Mijoz ismi
              </label>
              <input
                id="pj-client"
                type="text"
                autoComplete="name"
                value={fields.clientName}
                onChange={(e) => setField("clientName", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="pj-phone" className="block text-sm font-medium text-slate-700">
                Telefon raqami
              </label>
              <input
                id="pj-phone"
                type="tel"
                autoComplete="tel"
                value={fields.phone}
                onChange={(e) => setField("phone", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="pj-region" className="block text-sm font-medium text-slate-700">
                Viloyat
              </label>
              <select
                id="pj-region"
                value={fields.region}
                onChange={(e) => {
                  const nextRegion = e.target.value;
                  setFields((prev) => ({
                    ...prev,
                    region: nextRegion,
                    district: "",
                    address: nextRegion || "",
                  }));
                }}
                className={INPUT_CLASS}
              >
                <option value="">Viloyatni tanlang</option>
                {REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pj-district" className="block text-sm font-medium text-slate-700">
                Tuman
              </label>
              <select
                id="pj-district"
                value={canonicalDistrict(fields.district)}
                onChange={(e) => {
                  const nextDistrict = canonicalDistrict(e.target.value);
                  setFields((prev) => ({
                    ...prev,
                    district: nextDistrict,
                    address: [prev.region, nextDistrict].filter(Boolean).join(", "),
                  }));
                }}
                disabled={!fields.region}
                className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
              >
                <option value="">
                  {fields.region ? "Tumanni tanlang" : "Avval viloyatni tanlang"}
                </option>
                {districtOptions.map(({ value, label }) => (
                  <option key={`${value}-${label}`} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pj-holat" className="block text-sm font-medium text-slate-700">
                Holat
              </label>
              <select
                id="pj-holat"
                value={fields.holat}
                onChange={(e) => setField("holat", e.target.value)}
                className={INPUT_CLASS}
              >
                {PROJECT_HOLAT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3">
              <p className="text-sm font-medium text-slate-700">
                Loyiha ustalarini tanlang <span className="text-red-600">*</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Bitta yoki bir nechta ustani belgilashingiz mumkin (takrorlanmaydi).
                {workersForPick.length > 0 ? (
                  <span className="ml-1 font-medium text-slate-600">
                    Jami: {workersForPick.length} ta
                  </span>
                ) : null}
              </p>
              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
                {workersForPick.length === 0 ? (
                  <p className="text-xs font-medium text-amber-700">
                    Ustalar ro‘yxati bo‘sh — avval ustalar qo‘shing.
                  </p>
                ) : (
                  workersForPick.map((w) => {
                    const checked = fields.selectedWorkerIds.includes(String(w.id));
                    return (
                      <label
                        key={`multi-usta-${w.id}`}
                        className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setFields((prev) => {
                              const id = String(w.id);
                              const nextSet = new Set(prev.selectedWorkerIds.map(String));
                              if (isChecked) nextSet.add(id);
                              else nextSet.delete(id);
                              return {
                                ...prev,
                                selectedWorkerIds: Array.from(nextSet),
                              };
                            });
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400/40"
                        />
                        {workerDisplayName(w)}
                        {w.login ? (
                          <span className="text-xs text-slate-400"> ({w.login})</span>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            <div>
              <label htmlFor="pj-kv" className="block text-sm font-medium text-slate-700">
                Stansiya quvvati (kV) <span className="text-red-600">*</span>
              </label>
              <input
                id="pj-kv"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                required
                value={fields.stationPower}
                onChange={(e) => setField("stationPower", e.target.value)}
                className={INPUT_CLASS}
                placeholder="Masalan: 30"
              />
            </div>
            <div>
              <label htmlFor="pj-pay" className="block text-sm font-medium text-slate-700">
                Mijoz to‘lovi (so‘m)
              </label>
              <input
                id="pj-pay"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={fields.paymentSomInput}
                onChange={(e) =>
                  setField(
                    "paymentSomInput",
                    formatSomWithSpaces(somDigitsOnly(e.target.value)),
                  )
                }
                className={INPUT_CLASS}
                placeholder="Masalan: 10 000 000"
              />
            </div>
            <div>
              <label htmlFor="pj-sys" className="block text-sm font-medium text-slate-700">
                Tizim turi
              </label>
              <select
                id="pj-sys"
                value={fields.systemType}
                onChange={(e) => setField("systemType", e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Tizim turini tanlang</option>
                {fields.systemType &&
                !SYSTEM_TYPE_OPTIONS.includes(fields.systemType) ? (
                  <option value={fields.systemType}>
                    Saqlangan qiymat: {fields.systemType}
                  </option>
                ) : null}
                {SYSTEM_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pj-start" className="block text-sm font-medium text-slate-700">
                Boshlanish sanasi
              </label>
              <input
                id="pj-start"
                type="date"
                value={fields.startDate}
                onChange={(e) => setField("startDate", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="pj-end" className="block text-sm font-medium text-slate-700">
                Tugash sanasi
              </label>
              <input
                id="pj-end"
                type="date"
                value={fields.endDate}
                onChange={(e) => setField("endDate", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="pj-izoh" className="block text-sm font-medium text-slate-700">
                Izoh
              </label>
              <textarea
                id="pj-izoh"
                rows={3}
                value={fields.izoh}
                onChange={(e) => setField("izoh", e.target.value)}
                placeholder="Buyurtma yoki loyiha bo‘yicha qo‘shimcha izoh..."
                className={`${INPUT_CLASS} min-h-[88px] resize-y py-3`}
              />
            </div>
            {error ? (
              <p className="text-sm font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="sticky bottom-0 z-[1] flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98]"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all duration-200 hover:bg-slate-800 hover:shadow-soft-lg active:scale-[0.98]"
            >
              Saqlash
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

function DeleteConfirmModal({ projectLabel, onClose, onConfirm }) {
  return (
    <ModalBackdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pj-delete-title"
        className="mb-[env(safe-area-inset-bottom,0px)] rounded-t-[1.25rem] border border-slate-200/90 bg-white shadow-soft-xl ring-1 ring-slate-900/[0.04] sm:mb-0 sm:rounded-[1.25rem]"
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <h3
            id="pj-delete-title"
            className="text-lg font-semibold tracking-tight text-slate-900"
          >
            Loyihani o‘chirish
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            <span className="font-medium text-slate-800">{projectLabel}</span>{" "}
            loyihasini o‘chirishni tasdiqlaysizmi? Bu amalni qaytarib
            bo‘lmaydi.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98]"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={async () => {
              const ok = await onConfirm();
              if (ok) onClose();
            }}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all duration-200 hover:bg-red-700 active:scale-[0.98]"
          >
            Ha, o‘chirish
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

function ProjectDetailModal({ project, workers, onClose, onUpdateProject }) {
  const [busy, setBusy] = useState(false);
  const [addWorkerId, setAddWorkerId] = useState("");

  if (!project) return null;

  const crewIds = projectCrewIds(project);
  const crewRows = crewIds.map((id) => {
    const w = workers.find((x) => String(x.id) === id);
    return { id, name: workerDisplayName(w) || id };
  });

  const appendCrewLog = (entry) => {
    const prev = Array.isArray(project.crewChangeLog) ? project.crewChangeLog : [];
    return [...prev, entry];
  };

  const persistCrew = async (nextIds, logEntry) => {
    const uniqueIds = dedupeWorkerIdsPreserveOrder(nextIds);
    const names = uniqueIds
      .map((id) => workerDisplayName(workers.find((w) => String(w.id) === id)))
      .filter(Boolean);
    const payload = {
      assignedWorkerIds: uniqueIds,
      assignedWorkerId: uniqueIds[0] || "",
      ustaId: uniqueIds[0] || "",
      ustaName: names[0] || "",
      ustaNames: names,
      crewChangeLog: logEntry ? appendCrewLog(logEntry) : project.crewChangeLog,
    };
    setBusy(true);
    try {
      await onUpdateProject(project.id, payload);
    } catch (e) {
      console.error(e);
      alert("Saqlashda xatolik. Qayta urinib ko‘ring.");
    } finally {
      setBusy(false);
    }
  };

  const removeMaster = async (workerId) => {
    const wid = String(workerId);
    if (crewIds.length <= 1) {
      alert("Loyihada kamida bitta usta qolishi kerak.");
      return;
    }
    const ok = window.confirm("Ustani loyihadan olib tashlaysizmi?");
    if (!ok) return;
    const next = crewIds.filter((x) => x !== wid);
    const w = workers.find((x) => String(x.id) === wid);
    await persistCrew(next, {
      at: new Date().toISOString(),
      workerId: wid,
      workerName: w?.fullName || "",
      action: "remove",
    });
  };

  const addMaster = async () => {
    const wid = String(addWorkerId || "").trim();
    if (!wid) {
      alert("Ustani tanlang.");
      return;
    }
    if (crewIds.includes(wid)) return;
    const w = workers.find((x) => String(x.id) === wid);
    if (!w) return;
    const next = [...crewIds, wid];
    setAddWorkerId("");
    await persistCrew(next, {
      at: new Date().toISOString(),
      workerId: wid,
      workerName: workerDisplayName(w) || "",
      action: "add",
    });
  };

  const addableWorkers = assignableWorkersForProjects(
    workers.filter((w) => !crewIds.includes(String(w.id))),
  );

  return (
    <ModalBackdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pj-detail-title"
        className="mb-[env(safe-area-inset-bottom,0px)] max-h-[90dvh] overflow-y-auto rounded-t-[1.25rem] border border-slate-200/90 bg-white shadow-soft-xl ring-1 ring-slate-900/[0.04] sm:mb-0 sm:rounded-[1.25rem]"
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 id="pj-detail-title" className="text-lg font-semibold tracking-tight text-slate-900">
            Loyiha tafsilotlari
          </h3>
        </div>
        <div className="space-y-2 px-6 py-5 text-sm text-slate-700">
          <p><span className="font-medium text-slate-900">Loyiha raqami:</span> #{projectNumberKey(project.projectNumber)}</p>
          <p><span className="font-medium text-slate-900">Mijoz ismi:</span> {project.clientName}</p>
          <p><span className="font-medium text-slate-900">Telefon:</span> {project.phone}</p>
          <p><span className="font-medium text-slate-900">Manzil:</span> {project.address}</p>
          <p><span className="font-medium text-slate-900">Holat:</span> {project.holat}</p>
          <p><span className="font-medium text-slate-900">Quvvat:</span> {project.stationPower ?? project.powerKw} kV</p>
          <p><span className="font-medium text-slate-900">Tizim turi:</span> {project.systemType}</p>
          <p><span className="font-medium text-slate-900">Boshlanish sanasi:</span> {formatDateDisplay(project.startDate)}</p>
          <p><span className="font-medium text-slate-900">Tugash sanasi:</span> {formatDateDisplay(project.endDate)}</p>
          <p><span className="font-medium text-slate-900">Izoh:</span> {project.izoh?.trim() || "—"}</p>
        </div>

        <div className="border-t border-slate-100 px-6 py-5">
          <h4 className="text-sm font-semibold text-slate-900">Loyiha ustalari (qo‘shish / olib tashlash)</h4>
          <p className="mt-1 text-xs text-slate-500">
            Deadline o‘tishi yoki boshqa loyihaga o‘tish kabi holatlarda jamoani shu yerda yangilang. Oylik hisobotda o‘zgarishlar alohida ko‘rinadi.
          </p>
          <ul className="mt-3 space-y-2">
            {crewRows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2"
              >
                <span className="font-medium text-slate-800">{row.name}</span>
                <button
                  type="button"
                  disabled={busy || crewIds.length <= 1}
                  onClick={() => void removeMaster(row.id)}
                  className="shrink-0 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-40"
                >
                  Olib tashlash
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={addWorkerId}
              onChange={(e) => setAddWorkerId(e.target.value)}
              disabled={busy}
              className="min-w-0 flex-1 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25"
            >
              <option value="">Usta qo‘shish…</option>
              {addableWorkers.map((w) => (
                <option key={w.id} value={w.id}>
                  {workerDisplayName(w)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !addWorkerId}
              onClick={() => void addMaster()}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-40"
            >
              Qo‘shish
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all hover:bg-slate-800"
          >
            Yopish
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

export default function LoyihalarPage() {
  const { projects, addProject, updateProject, deleteProject } = useProjects();
  const { workers, refresh: refreshWorkers } = useWorkers();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);

  useEffect(() => {
    if (!formOpen) return;
    void refreshWorkers();
  }, [formOpen, refreshWorkers]);

  useEffect(() => {
    if (!formOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setFormOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen]);

  useEffect(() => {
    if (!deleteTarget) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setDeleteTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const name = (p.clientName || "").toLowerCase();
      const addr = (p.address || "").toLowerCase();
      const num = projectNumberKey(p.projectNumber || "");
      const qNum = q.replace(/^#/, "").trim();
      return (
        name.includes(q) ||
        addr.includes(q) ||
        (qNum !== "" && num.includes(qNum))
      );
    });
  }, [projects, query]);

  const enriched = useMemo(() => {
    const rows = filtered.map((p) => {
      const ids = projectCrewIds(p);
      const namesFromCrew = ids
        .map((id) => workerDisplayName(workers.find((w) => String(w.id) === id)))
        .filter(Boolean);
      const ustaName =
        namesFromCrew.length > 0
          ? namesFromCrew.join(", ")
          : p.ustaName || "—";
      return {
        ...p,
        ustaId: p.ustaId || p.assignedWorkerId || "",
        ustaName,
      };
    });
    return sortProjectsForList(rows);
  }, [filtered, workers]);

  const viewProject = useMemo(() => {
    const id = viewTarget?.id;
    if (!id) return null;
    return enriched.find((p) => p.id === id) || null;
  }, [viewTarget, enriched]);

  useEffect(() => {
    const pid = searchParams.get("project");
    if (!pid || projects.length === 0) return;
    const p = projects.find((x) => String(x.id) === String(pid));
    if (p) {
      setViewTarget(p);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, projects, setSearchParams]);

  const openCreate = () => {
    setFormMode("create");
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (p) => {
    setFormMode("edit");
    setEditingId(p.id);
    setFormOpen(true);
  };

  const editingProject =
    formMode === "edit" ? projects.find((x) => x.id === editingId) : undefined;

  const handleSaveForm = async (payload) => {
    try {
      if (formMode === "edit" && editingId) {
        await updateProject(editingId, payload);
      } else {
        await addProject(payload);
      }

      alert("Loyiha saqlandi");
    } catch (err) {
      console.error("Project save error:", err);
      alert("Loyihani serverga saqlashda xatolik bo‘ldi.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;

    try {
      await deleteProject(id);
      return true;
    } catch (err) {
      console.error("Project delete error:", err);
      alert("Loyihani o‘chirishda xatolik. Qayta urinib ko‘ring.");
      return false;
    }
  };

  const copy = SECTION_COPY.loyihalar;

  return (
    <>
      <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {copy.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              {copy.description}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all duration-200 hover:bg-slate-800 hover:shadow-soft-lg active:scale-[0.98] sm:mt-1"
          >
            Yangi loyiha
          </button>
        </div>

        <div className="mt-6">
          <label htmlFor="pj-search" className="sr-only">
            Qidiruv
          </label>
          <input
            id="pj-search"
            type="search"
            placeholder="Mijoz ismi yoki manzil bo‘yicha qidirish..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25 sm:max-w-md"
          />
        </div>

        {enriched.length === 0 ? (
          <div className="mt-8 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-14 text-center shadow-inner">
            <p className="text-base font-medium text-slate-700">
              {projects.length === 0
                ? "Hozircha loyihalar yo‘q"
                : "Natija topilmadi"}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {projects.length === 0
                ? "Yangi loyiha qo‘shish uchun yuqoridagi tugmani bosing."
                : "Qidiruv so‘zini o‘zgartirib ko‘ring."}
            </p>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {enriched.map((p) => (
              <li
                key={p.id}
                className="rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-900">{p.clientName}</p>
                    <p className="mt-1 truncate text-sm text-slate-600">{p.systemType}</p>
                  </div>
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusBadgeClass(p.holat)}`}>
                    {p.holat}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  <p><span className="text-slate-500">Loyiha:</span> {projectNumberDisplay(p)}</p>
                  <p><span className="text-slate-500">Telefon:</span> {p.phone || "—"}</p>
                  <p className="line-clamp-2"><span className="text-slate-500">Manzil:</span> {p.address}</p>
                  <p><span className="text-slate-500">Tizim:</span> {p.systemType || "—"}</p>
                  <p><span className="text-slate-500">Quvvat:</span> {p.stationPower ?? p.powerKw} kV</p>
                  <p><span className="text-slate-500">Ustalar:</span> {p.ustaName}</p>
                  <p><span className="text-slate-500">Sana:</span> {formatDateDisplay(p.startDate)} — {formatDateDisplay(p.endDate)}</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setViewTarget(p)}
                    className="flex-1 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
                  >
                    Ko‘rish
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="flex-1 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
                  >
                    Tahrirlash
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(p)}
                    className="flex-1 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700 shadow-sm transition-all hover:bg-red-100 active:scale-[0.98]"
                  >
                    O‘chirish
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {formOpen ? (
        <ProjectFormModal
          mode={formMode}
          initial={editingProject}
          workers={workers}
          allProjects={projects}
          excludeProjectId={formMode === "edit" ? editingId : null}
          onClose={() => setFormOpen(false)}
          onSave={handleSaveForm}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteConfirmModal
          projectLabel={deleteTarget.clientName}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      {viewProject ? (
        <ProjectDetailModal
          project={viewProject}
          workers={workers}
          onClose={() => setViewTarget(null)}
          onUpdateProject={updateProject}
        />
      ) : null}
    </>
  );
}
