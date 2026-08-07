import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SECTION_COPY } from "../navConfig";
import { brigadeProjectAggregates } from "../projects/projectStorage";
import { workersForBrigade } from "../workers/workerStorage";
import { useBrigades } from "../hooks/useBrigades";
import { useWorkers } from "../hooks/useWorkers";
import { useProjects } from "../hooks/useProjects";
import AppModalBackdrop from "../components/AppModalBackdrop";

const SELECTED_BRIGADE_KEY = "selectedBrigadeId";

function formatRating(value) {
  if (value == null || Number.isNaN(value)) return "0.0";
  return value.toFixed(1);
}

function averageRating(crew) {
  const nums = crew
    .map((w) => Number.parseFloat(String(w.rating ?? "").replace(",", ".")))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return 0;
  const total = nums.reduce((acc, n) => acc + n, 0);
  return total / nums.length;
}

function formatKw(kw) {
  const n = Number(kw) || 0;
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function responsibleText(brigadePhone, crew) {
  if (crew.length > 0) return crew[0].fullName;
  return brigadePhone || "Mas’ul belgilanmagan";
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "U";
  return parts.map((p) => p[0].toUpperCase()).join("");
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-slate-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.61 2.62a2 2 0 0 1-.45 2.11L8 9.99a16 16 0 0 0 6 6l1.54-1.27a2 2 0 0 1 2.11-.45c.85.28 1.72.49 2.62.61A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function StatusDotIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 10 10" className="h-2.5 w-2.5 fill-emerald-500">
      <circle cx="5" cy="5" r="4" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ModalBackdrop({ children, onClose }) {
  return <AppModalBackdrop onClose={onClose}>{children}</AppModalBackdrop>;
}

function BrigadeFormModal({ mode, initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(initial?.name ?? "");
    setPhone(initial?.phone ?? "");
    setError("");
  }, [initial, mode]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const n = name.trim();
    const p = phone.trim();
    if (!n || !p) {
      setError("Brigada nomi va telefon raqami majburiy.");
      return;
    }
    setError("");
    onSave({ name: n, phone: p });
    onClose();
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="brigade-modal-title"
        className="mb-[env(safe-area-inset-bottom,0px)] max-h-[90dvh] overflow-y-auto rounded-t-[1.25rem] border border-slate-200/90 bg-white shadow-soft-xl ring-1 ring-slate-900/[0.04] sm:mb-0 sm:rounded-[1.25rem]"
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <h3
            id="brigade-modal-title"
            className="text-lg font-semibold tracking-tight text-slate-900"
          >
            {mode === "edit" ? "Brigadani tahrirlash" : "Yangi brigada"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Nom va telefon ma&apos;lumotlarini kiriting.
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 pt-5 pb-4">
            <div>
              <label htmlFor="brigade-name" className="block text-sm font-medium text-slate-700">
                Brigada nomi
              </label>
              <input
                id="brigade-name"
                type="text"
                autoComplete="organization"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25"
                placeholder="Masalan: Toshkent montaj brigadasi"
              />
            </div>
            <div>
              <label htmlFor="brigade-phone" className="block text-sm font-medium text-slate-700">
                Telefon raqami
              </label>
              <input
                id="brigade-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25"
                placeholder="+998 90 123 45 67"
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

function DeleteConfirmModal({ brigadeName, onClose, onConfirm }) {
  return (
    <ModalBackdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        className="mb-[env(safe-area-inset-bottom,0px)] rounded-t-[1.25rem] border border-slate-200/90 bg-white shadow-soft-xl ring-1 ring-slate-900/[0.04] sm:mb-0 sm:rounded-[1.25rem]"
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 id="delete-modal-title" className="text-lg font-semibold tracking-tight text-slate-900">
            Brigadani o&apos;chirish
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            <span className="font-medium text-slate-800">{brigadeName}</span>{" "}
            brigadasini o&apos;chirishni tasdiqlaysizmi? Bu amalni qaytarib bo&apos;lmaydi.
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
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all duration-200 hover:bg-red-700 active:scale-[0.98]"
          >
            Ha, o&apos;chirish
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

function BrigadeDeleteBlockedModal({ onClose }) {
  return (
    <ModalBackdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="brigade-blocked-title"
        className="mb-[env(safe-area-inset-bottom,0px)] rounded-t-[1.25rem] border border-slate-200/90 bg-white shadow-soft-xl ring-1 ring-slate-900/[0.04] sm:mb-0 sm:rounded-[1.25rem]"
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 id="brigade-blocked-title" className="text-lg font-semibold tracking-tight text-slate-900">
            Brigadani o‘chirib bo‘lmaydi
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Bu brigadada ustalar bor. Avval ustalarni boshqa brigadaga o‘tkazing yoki o‘chiring.
          </p>
        </div>
        <div className="px-6 py-5 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all duration-200 hover:bg-slate-800 sm:w-auto"
          >
            Tushundim
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

export default function BrigadalarPage() {
  const navigate = useNavigate();
  const { brigades, addBrigade, updateBrigade, deleteBrigade } = useBrigades();
  const { workers, setAndPersist: persistWorkers } = useWorkers();
  const { projects } = useProjects();
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBlockedOpen, setDeleteBlockedOpen] = useState(false);
  const [selectedBrigadeId, setSelectedBrigadeId] = useState(() => {
    return localStorage.getItem(SELECTED_BRIGADE_KEY) || "";
  });

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

  useEffect(() => {
    if (!deleteBlockedOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setDeleteBlockedOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteBlockedOpen]);

  const openCreate = () => {
    setFormMode("create");
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (b) => {
    setFormMode("edit");
    setEditingId(b.id);
    setFormOpen(true);
  };

  const editingBrigade =
    formMode === "edit" ? brigades.find((x) => x.id === editingId) : undefined;

  const handleSaveForm = async ({ name, phone }) => {
    const n = name.trim();
    const p = phone.trim();

    try {
      if (formMode === "edit" && editingId) {
        await updateBrigade(editingId, {
          name: n,
          phone: p,
        });

        persistWorkers(
          workers.map((w) => (w.brigadeId === editingId ? { ...w, brigadeName: n } : w)),
        );
      } else {
        await addBrigade({
          name: n,
          phone: p,
        });
      }

      alert("Brigada saqlandi");
    } catch (err) {
      console.error("Brigade save error:", err);
      alert("Brigadani saqlashda xatolik bo‘ldi. Qayta urinib ko‘ring.");
    }
  };

  const requestDeleteBrigade = (b) => {
    const crew = workersForBrigade(b.id, workers);
    if (crew.length > 0) {
      setDeleteBlockedOpen(true);
      return;
    }
    setDeleteTarget(b);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;

    try {
      await deleteBrigade(id);

      if (selectedBrigadeId === id) {
        setSelectedBrigadeId("");
        localStorage.removeItem(SELECTED_BRIGADE_KEY);
      }
    } catch (err) {
      console.error("Brigade delete error:", err);
      alert("Brigadani serverdan o‘chirishda xatolik bo‘ldi.");
    }
  };

  const brigadeCards = useMemo(() => {
    return brigades.map((b) => {
      const crew = workersForBrigade(b.id, workers);
      const { projectCount, totalKw } = brigadeProjectAggregates(b.id, projects);
      return {
        ...b,
        crew,
        workersCount: crew.length,
        projectsCount: projectCount,
        totalKw,
        avgRating: averageRating(crew),
        responsible: responsibleText(b.phone, crew),
      };
    });
  }, [brigades, workers, projects]);

  const selectedBrigade = useMemo(() => {
    return brigadeCards.find((b) => b.id === selectedBrigadeId) || null;
  }, [brigadeCards, selectedBrigadeId]);

  useEffect(() => {
    if (!selectedBrigadeId) return;
    if (!selectedBrigade) {
      setSelectedBrigadeId("");
      localStorage.removeItem(SELECTED_BRIGADE_KEY);
    }
  }, [selectedBrigadeId, selectedBrigade]);

  const openDetail = (brigadeId) => {
    setSelectedBrigadeId(brigadeId);
    localStorage.setItem(SELECTED_BRIGADE_KEY, brigadeId);
  };

  const closeDetail = () => {
    setSelectedBrigadeId("");
    localStorage.removeItem(SELECTED_BRIGADE_KEY);
  };

  const copy = SECTION_COPY.brigadalar;

  return (
    <>
      {!selectedBrigade ? (
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
              Yangi brigada
            </button>
          </div>

          {brigades.length === 0 ? (
            <div className="mt-8 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-14 text-center shadow-inner">
              <p className="text-base font-medium text-slate-700">Hozircha brigadalar yo&apos;q</p>
              <p className="mt-2 text-sm text-slate-500">
                Yangi brigada qo&apos;shish uchun yuqoridagi tugmani bosing.
              </p>
            </div>
          ) : (
            <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {brigadeCards.map((b) => (
                <li
                  key={b.id}
                  onClick={() => openDetail(b.id)}
                  className="cursor-pointer rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold tracking-tight text-slate-900">{b.name}</p>
                      <p className="mt-1 truncate text-sm text-slate-600">{b.responsible}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                      {b.workersCount} usta
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                    <PhoneIcon />
                    <span>{b.phone || "Telefon kiritilmagan"}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                    <div>
                      <p className="text-[11px] font-medium text-slate-500">Loyiha</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{b.projectsCount}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-slate-500">Jami kW</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{formatKw(b.totalKw)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-slate-500">O‘rt. reyting</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{formatRating(b.avgRating)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(b);
                      }}
                      className="flex-1 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
                    >
                      Tahrirlash
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDeleteBrigade(b);
                      }}
                      className="flex-1 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700 shadow-sm transition-all hover:bg-red-100 active:scale-[0.98]"
                    >
                      O&apos;chirish
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                onClick={closeDetail}
                className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <BackIcon />
                Orqaga
              </button>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {selectedBrigade.name}
              </h2>
              <p className="mt-2 text-sm text-slate-600">Brigada tafsilotlari</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openEdit(selectedBrigade)}
                className="rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50"
              >
                Tahrirlash
              </button>
              <button
                type="button"
                onClick={() => requestDeleteBrigade(selectedBrigade)}
                className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm transition-all hover:bg-red-100"
              >
                O‘chirish
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <article className="rounded-xl border border-slate-200/85 bg-white p-4">
              <p className="text-xs text-slate-500">A’zolar</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{selectedBrigade.workersCount}</p>
            </article>
            <article className="rounded-xl border border-slate-200/85 bg-white p-4">
              <p className="text-xs text-slate-500">Loyihalar</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{selectedBrigade.projectsCount}</p>
            </article>
            <article className="rounded-xl border border-slate-200/85 bg-white p-4">
              <p className="text-xs text-slate-500">Total kW</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{formatKw(selectedBrigade.totalKw)}</p>
            </article>
            <article className="rounded-xl border border-slate-200/85 bg-white p-4">
              <p className="text-xs text-slate-500">Reyting</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{formatRating(selectedBrigade.avgRating)}</p>
            </article>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200/85 bg-white p-4">
            <p className="text-xs text-slate-500">Brigada boshlig‘i</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{selectedBrigade.responsible}</p>
            <p className="mt-3 text-xs text-slate-500">Telefon</p>
            <p className="mt-1 text-sm text-slate-700">{selectedBrigade.phone || "Kiritilmagan"}</p>
          </div>

          <div className="mt-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">A’zolar</h3>
                <p className="mt-1 text-sm text-slate-600">Faol a’zolar ({selectedBrigade.workersCount})</p>
              </div>
              <button
                type="button"
                onClick={() => navigate("/ustalar")}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-soft-md transition-all hover:bg-slate-800"
              >
                A’zo qo‘shish
              </button>
            </div>

            {selectedBrigade.crew.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
                Bu brigadaga hali a’zo biriktirilmagan.
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {selectedBrigade.crew.map((w) => (
                  <li key={w.id} className="rounded-xl border border-slate-200/85 bg-white p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                        {initials(w.fullName)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{w.fullName}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            {w.position || "Lavozim yo‘q"}
                          </span>
                          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            Faol
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <StatusDotIcon />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <p>Telefon: {w.phone || "—"}</p>
                      <p>Tajriba: {w.experienceYears || "0"} yil</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {formOpen ? (
        <BrigadeFormModal
          mode={formMode}
          initial={editingBrigade}
          onClose={() => setFormOpen(false)}
          onSave={handleSaveForm}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteConfirmModal
          brigadeName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      {deleteBlockedOpen ? (
        <BrigadeDeleteBlockedModal onClose={() => setDeleteBlockedOpen(false)} />
      ) : null}
    </>
  );
}
