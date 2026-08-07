import { useEffect, useMemo, useState } from "react";
import { SECTION_COPY } from "../navConfig";
import { workerProjectAggregates } from "../projects/projectStorage";
import { isLoginTaken, workerDisplayName } from "../workers/workerStorage";
import {
  SALARY_INPUT_PLACEHOLDER,
  calcDailySalary,
  formatCurrency,
  formatSalaryInputDisplay,
  parseSalaryNumber,
  salaryDigitsFromInput,
} from "../workers/salaryUtils";
import { useWorkers } from "../hooks/useWorkers";
import { useProjects } from "../hooks/useProjects";
import { useWorkerPoints } from "../hooks/usePoints";
import WorkerPointsSummary from "../components/WorkerPointsSummary";
import AppModalBackdrop from "../components/AppModalBackdrop";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

function formatTajribaDisplay(value) {
  const raw = String(value ?? "").trim();
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || raw === "") return "0 yil";
  return `${n} yil`;
}

function formatReytingDisplay(value) {
  const raw = String(value ?? "").trim();
  if (raw === "") return "0/5";
  const n = parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n)) return "0/5";
  const clamped = Math.min(5, Math.max(0, n));
  const label = Number.isInteger(clamped)
    ? String(clamped)
    : String(Math.round(clamped * 10) / 10).replace(/\.0$/, "");
  return `${label}/5`;
}

function formatKwDisplay(kw) {
  if (!Number.isFinite(kw) || kw <= 0) return "0 kW";
  const rounded = kw >= 100 ? Math.round(kw) : Math.round(kw * 10) / 10;
  const str = rounded % 1 === 0 ? String(rounded) : String(rounded);
  return `${str} kW`;
}

function userInitial(fullName, login) {
  const raw = (fullName || login || "?").trim();
  return raw ? raw.charAt(0).toUpperCase() : "?";
}

function ModalBackdrop({ children, onClose }) {
  return <AppModalBackdrop onClose={onClose}>{children}</AppModalBackdrop>;
}

function IconEdit({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconTrash({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function WorkerFormModal({ mode, initial, allWorkers, excludeWorkerId, onClose, onSave }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [rating, setRating] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  /** Faqat raqamlar (DB’ga shu ketadi). */
  const [salaryDigits, setSalaryDigits] = useState("0");
  const [telegramUserId, setTelegramUserId] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [status, setStatus] = useState("active");
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) {
      setFullName(initial.fullName ?? "");
      setPhone(initial.phone ?? "");
      setPosition(initial.position ?? "");
      setExperienceYears(initial.experienceYears != null ? String(initial.experienceYears) : "");
      setRating(initial.rating != null ? String(initial.rating) : "");
      setLogin(initial.login ?? "");
      setPassword("");
      setSalaryDigits(String(parseSalaryNumber(initial.salary)));
      setTelegramUserId(String(initial.telegramUserId || "").trim());
      setTelegramUsername(String(initial.telegramUsername || "").trim().replace(/^@/, ""));
      setStatus(String(initial.status || "active").trim() || "active");
    } else {
      setFullName("");
      setPhone("");
      setPosition("");
      setExperienceYears("");
      setRating("");
      setLogin("");
      setPassword("");
      setSalaryDigits("0");
      setTelegramUserId("");
      setTelegramUsername("");
      setStatus("active");
    }
    setError("");
  }, [initial, mode]);

  const dailyPreview = calcDailySalary(salaryDigits);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const fn = fullName.trim();
    const ph = phone.trim();
    const pos = position.trim();
    const lg = login.trim();
    const pw = password;
    const expRaw = experienceYears.trim();
    const rateRaw = rating.trim();
    const salaryRaw = salaryDigitsFromInput(salaryDigits);

    if (!fn || !ph || !pos || !lg) {
      setError("Ism familiya, telefon, lavozim va login majburiy.");
      return;
    }

    if (salaryRaw === "") {
      setError("Oylik majburiy. 0 yoki undan katta raqam kiriting.");
      return;
    }

    const salary = parseSalaryNumber(salaryRaw);
    if (!Number.isFinite(salary) || salary < 0) {
      setError("Oylik faqat raqam bo‘lishi va 0 dan kichik bo‘lmasligi kerak.");
      return;
    }

    let finalPassword;
    if (mode === "edit" && initial && !pw.trim()) {
      finalPassword = initial.password;
    } else {
      finalPassword = pw.trim();
    }

    if (!finalPassword) {
      setError("Parol majburiy.");
      return;
    }

    if (isLoginTaken(lg, allWorkers, excludeWorkerId)) {
      setError("Bu login band. Boshqa login tanlang.");
      return;
    }

    const expNum = expRaw === "" ? "" : String(Math.max(0, parseInt(expRaw, 10) || 0));
    let rateNormalized = "";
    if (rateRaw !== "") {
      const r = parseFloat(rateRaw.replace(",", "."));
      if (Number.isFinite(r)) {
        rateNormalized = String(Math.min(5, Math.max(0, r)));
      }
    }

    const dailySalary = calcDailySalary(salary);

    setError("");

    await onSave({
      fullName: fn,
      phone: ph,
      position: pos,
      brigadeId: "",
      brigadeName: "",
      experienceYears: expNum,
      rating: rateNormalized,
      login: lg,
      password: finalPassword,
      salary,
      dailySalary,
      telegramUserId: String(telegramUserId || "").trim(),
      telegramUsername: String(telegramUsername || "")
        .trim()
        .replace(/^@/, ""),
      status: String(status || "active").trim() || "active",
    });

    onClose();
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-modal-title"
        className="mb-[env(safe-area-inset-bottom,0px)] max-h-[90dvh] overflow-y-auto rounded-t-[1.25rem] border border-slate-200/90 bg-white shadow-soft-xl ring-1 ring-slate-900/[0.04] sm:mb-0 sm:rounded-[1.25rem]"
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 id="worker-modal-title" className="text-lg font-semibold tracking-tight text-slate-900">
            {mode === "edit" ? "Masterni tahrirlash" : "Yangi master"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">Ma’lumotlar serverga saqlanadi.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 pb-4 pt-5">
            <div>
              <label htmlFor="w-fullname" className="block text-sm font-medium text-slate-700">
                Ism familiya
              </label>
              <input id="w-fullname" type="text" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={INPUT_CLASS} />
            </div>

            <div>
              <label htmlFor="w-phone" className="block text-sm font-medium text-slate-700">
                Telefon
              </label>
              <input id="w-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT_CLASS} />
            </div>

            <div>
              <label htmlFor="w-position" className="block text-sm font-medium text-slate-700">
                Lavozim
              </label>
              <input id="w-position" type="text" autoComplete="organization-title" value={position} onChange={(e) => setPosition(e.target.value)} className={INPUT_CLASS} />
            </div>

            <div>
              <label htmlFor="w-salary" className="block text-sm font-medium text-slate-700">
                Oylik
              </label>
              <input
                id="w-salary"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={SALARY_INPUT_PLACEHOLDER}
                value={formatSalaryInputDisplay(salaryDigits)}
                onChange={(e) => setSalaryDigits(salaryDigitsFromInput(e.target.value))}
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-slate-500">
                Kunlik (avtomatik):{" "}
                <span className="font-medium text-slate-700">{formatCurrency(dailyPreview)}</span>
                {" "}· oylik / 30
              </p>
            </div>

            <div>
              <label htmlFor="w-exp" className="block text-sm font-medium text-slate-700">
                Tajriba (yil)
              </label>
              <input id="w-exp" type="number" min={0} step={1} inputMode="numeric" placeholder="Masalan: 3" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} className={INPUT_CLASS} />
            </div>

            <div>
              <label htmlFor="w-rating" className="block text-sm font-medium text-slate-700">
                Reyting (0–5)
              </label>
              <input id="w-rating" type="number" min={0} max={5} step={0.5} inputMode="decimal" placeholder="Masalan: 4.5" value={rating} onChange={(e) => setRating(e.target.value)} className={INPUT_CLASS} />
            </div>

            <div>
              <label htmlFor="w-tg-id" className="block text-sm font-medium text-slate-700">
                Telegram ID
              </label>
              <input
                id="w-tg-id"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Masalan: 123456789"
                value={telegramUserId}
                onChange={(e) => setTelegramUserId(e.target.value.replace(/[^\d]/g, ""))}
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="w-tg-user" className="block text-sm font-medium text-slate-700">
                Telegram username
              </label>
              <input
                id="w-tg-user"
                type="text"
                autoComplete="off"
                placeholder="azizbek"
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value.replace(/^@/, ""))}
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-slate-500">
                Faqat Admin to‘ldiradi. Master APK yangilanishi shart emas.
              </p>
            </div>

            <div>
              <label htmlFor="w-status" className="block text-sm font-medium text-slate-700">
                Holati
              </label>
              <select
                id="w-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="active">Faol (active)</option>
                <option value="inactive">Nofaol</option>
              </select>
            </div>

            <div>
              <label htmlFor="w-login" className="block text-sm font-medium text-slate-700">
                Login
              </label>
              <input id="w-login" type="text" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} className={INPUT_CLASS} />
            </div>

            <div>
              <label htmlFor="w-password" className="block text-sm font-medium text-slate-700">
                Parol
              </label>
              <input id="w-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT_CLASS} placeholder={mode === "edit" ? "Bo‘sh qoldirsangiz, eski parol saqlanadi" : ""} />
              {mode === "edit" ? (
                <p className="mt-1 text-xs text-slate-500">Parolni o‘zgartirmasangiz, maydonni bo‘sh qoldiring.</p>
              ) : null}
            </div>

            {error ? (
              <p className="text-sm font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="sticky bottom-0 z-[1] flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98]">
              Bekor qilish
            </button>
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all duration-200 hover:bg-slate-800 hover:shadow-soft-lg active:scale-[0.98]">
              Saqlash
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

function DeleteConfirmModal({ label, onClose, onConfirm }) {
  return (
    <ModalBackdrop onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="worker-delete-title" className="mb-[env(safe-area-inset-bottom,0px)] rounded-t-[1.25rem] border border-slate-200/90 bg-white shadow-soft-xl ring-1 ring-slate-900/[0.04] sm:mb-0 sm:rounded-[1.25rem]">
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 id="worker-delete-title" className="text-lg font-semibold tracking-tight text-slate-900">
            Ustani o&apos;chirish
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            <span className="font-medium text-slate-800">{label}</span> ustasini o&apos;chirishni tasdiqlaysizmi?
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 px-6 py-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98]">
            Bekor qilish
          </button>
          <button type="button" onClick={async () => { await onConfirm(); onClose(); }} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all duration-200 hover:bg-red-700 active:scale-[0.98]">
            Ha, o&apos;chirish
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

function WorkerCard({ worker, agg, onEdit, onDelete }) {
  const points = useWorkerPoints(worker.id);
  return (
    <li className="flex flex-col rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] sm:p-5">
      <div className="flex gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-cyan-500 text-sm font-bold text-white shadow-soft-md ring-2 ring-white" aria-hidden>
          {userInitial(worker.fullName, worker.login)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold tracking-tight text-slate-900">{workerDisplayName(worker)}</p>
              <p className="mt-0.5 text-sm text-slate-600">{worker.position}</p>
              <p className="mt-1 text-sm text-slate-600">{worker.phone}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => onEdit(worker)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-[0.97]" aria-label="Ustani tahrirlash">
                <IconEdit />
              </button>
              <button type="button" onClick={() => onDelete(worker)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 shadow-sm transition-all hover:bg-red-100 hover:text-red-700 active:scale-[0.97]" aria-label="Ustani o‘chirish">
                <IconTrash />
              </button>
            </div>
          </div>
          <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Login</dt>
              <dd className="truncate font-medium text-slate-800">{worker.login}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-[14px] border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tajriba</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatTajribaDisplay(worker.experienceYears)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reyting</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatReytingDisplay(worker.rating)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Loyiha</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">{agg.projectCount}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Quvvat</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{formatKwDisplay(agg.totalKw)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Oylik</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 tabular-nums">
            {formatCurrency(worker.salary)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Kunlik</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 tabular-nums">
            {formatCurrency(calcDailySalary(worker.salary))}
          </p>
        </div>
      </div>

      <div className="mt-2">
        <WorkerPointsSummary points={points} compact />
      </div>
    </li>
  );
}

export default function UstalarPage() {
  const { workers, addWorker, updateWorker, deleteWorker } = useWorkers();
  const { projects } = useProjects();
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  const workersSorted = useMemo(
    () =>
      [...workers].sort((a, b) =>
        workerDisplayName(a).localeCompare(workerDisplayName(b), "uz"),
      ),
    [workers],
  );


  const openCreate = () => {
    setFormMode("create");
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (w) => {
    setFormMode("edit");
    setEditingId(w.id);
    setFormOpen(true);
  };

  const editingWorker = formMode === "edit" ? workers.find((x) => x.id === editingId) : undefined;

  const handleSave = async (payload) => {
    try {
      const workerPayload = {
        ...payload,
        loginLower: String(payload.login || "").trim().toLowerCase(),
      };

      if (formMode === "edit" && editingId) {
        await updateWorker(editingId, workerPayload);
      } else {
        await addWorker(workerPayload);
      }

      alert("Usta saqlandi");
    } catch (err) {
      console.error("Worker save error:", err);
      alert("Serverga saqlashda xatolik bo‘ldi.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;

    try {
      await deleteWorker(id);
    } catch (err) {
      console.error("Worker delete error:", err);
      alert("Serverdan o‘chirishda xatolik bo‘ldi.");
    }
  };

  const copy = SECTION_COPY.ustalar;

  return (
    <>
      <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{copy.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">{copy.description}</p>
          </div>
          <button type="button" onClick={openCreate} className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all duration-200 hover:bg-slate-800 hover:shadow-soft-lg active:scale-[0.98] sm:mt-1">
            Yangi master
          </button>
        </div>

        {workers.length === 0 ? (
          <div className="mt-8 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-14 text-center shadow-inner">
            <p className="text-base font-medium text-slate-700">Hozircha masterlar yo&apos;q</p>
            <p className="mt-2 text-sm text-slate-500">Yangi master qo&apos;shish uchun yuqoridagi tugmani bosing.</p>
          </div>
        ) : (
          <div className="mt-8">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Barcha masterlar</h3>
              <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-0.5 text-xs font-semibold text-brand-800 ring-1 ring-brand-900/10">
                {workers.length} ta
              </span>
            </div>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {workersSorted.map((w) => (
                <WorkerCard
                  key={w.id}
                  worker={w}
                  agg={workerProjectAggregates(w.id, "", projects)}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </ul>
          </div>
        )}
      </section>

      {formOpen ? (
        <WorkerFormModal
          mode={formMode}
          initial={editingWorker}
          allWorkers={workers}
          excludeWorkerId={formMode === "edit" ? editingId : null}
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteConfirmModal
          label={deleteTarget.fullName}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      ) : null}
    </>
  );
}
