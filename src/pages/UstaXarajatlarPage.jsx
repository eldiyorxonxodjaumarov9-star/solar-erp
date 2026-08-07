import { useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/http";
import { sendMessageDirect, sendPhotoDirect } from "../telegram/clientTelegram";
import { logTelegramEventClient } from "../telegram/telegramEventLog";
import { expenseTelegramEvent } from "../telegram/buildTelegramEvent";
import { sumExpenseAmounts } from "../expenses/expenseStorage";
import { useExpenses } from "../hooks/useExpenses";
import { useProjects } from "../hooks/useProjects";
import { useWorkers } from "../hooks/useWorkers";
import {
  formatSomDisplay,
  formatSomWithSpaces,
  projectNumberKey,
  somDigitsOnly,
} from "../projects/projectStorage";
import { appendUserActionLog } from "../activity/userActionsLogsStorage";
import { awardPoint } from "../points/pointsAward";
import { useModalOverlayLock } from "../contexts/GlobalModalOverlayContext";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25";

const EXPENSE_TYPES = ["Mehmonxona", "Mashina gazi", "Ovqatlanish", "Zapchastlar"];

function todayYmd() {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateShort(ymd) {
  if (!ymd) return "—";
  try {
    const d = new Date(`${ymd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium" }).format(d);
  } catch {
    return ymd;
  }
}

function projectLabel(p) {
  const num = projectNumberKey(p?.projectNumber);
  const hash = num ? `#${num}` : "—";
  const client = (p?.clientName || p?.name || "").trim() || "—";
  return `${hash} — ${client}`;
}

function getProjectClient(p) {
  return (p?.clientName || p?.name || p?.projectName || "Noma’lum loyiha").trim();
}

function getProjectStatus(p) {
  return p?.status || p?.holat || "Jarayonda";
}

function isProjectClosed(project) {
  const status = String(getProjectStatus(project) || "")
    .trim()
    .toLowerCase();
  return (
    status.includes("tugall") ||
    status.includes("yakun") ||
    status.includes("closed") ||
    status.includes("complete") ||
    status.includes("finished")
  );
}

function getProjectAddress(p) {
  return p?.address || p?.manzil || "—";
}

function getProjectKw(p) {
  return p?.powerKw || p?.power || p?.kw || p?.quvvat || "0";
}

function getProjectSystemType(p) {
  return p?.systemType || p?.tizimTuri || p?.type || "—";
}

function isProjectAssignedToUsta(project, ustaId) {
  const crew = Array.isArray(project?.assignedWorkerIds)
    ? project.assignedWorkerIds.map((x) => String(x))
    : [];
  return (
    String(project?.ustaId || "") === String(ustaId) ||
    String(project?.workerId || "") === String(ustaId) ||
    String(project?.assignedUstaId || "") === String(ustaId) ||
    crew.includes(String(ustaId))
  );
}

function isExpenseOwnedByUsta(expense, { ustaId, ustaName, worker }) {
  const expenseUstaId = String(expense?.ustaId || "").trim();
  const expenseUstaName = String(expense?.ustaName || "").trim().toLowerCase();
  const idMatch = expenseUstaId && expenseUstaId === String(ustaId || "").trim();
  if (idMatch) return true;

  const names = [
    String(ustaName || "").trim(),
    String(worker?.fullName || "").trim(),
    String(worker?.name || "").trim(),
  ]
    .filter(Boolean)
    .map((x) => x.toLowerCase());

  return names.some((n) => n && expenseUstaName === n);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function UstaXarajatlarPage() {
  const { session } = useAuth();
  const ustaId = session?.role === "usta" ? session.workerId : "";
  const ustaName = session?.role === "usta" ? session.name : "";

  const { workers } = useWorkers();
  const { projects } = useProjects();
  const { expenses, addExpense, deleteExpense, refresh } = useExpenses();

  const fileInputRef = useRef(null);

  const worker = useMemo(
    () => workers.find((w) => String(w.id) === String(ustaId)),
    [workers, ustaId],
  );

  const myProjects = useMemo(() => {
    return projects
      .filter((p) => isProjectAssignedToUsta(p, ustaId))
      .sort((a, b) => projectLabel(a).localeCompare(projectLabel(b), "uz"));
  }, [projects, ustaId]);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const selectedProject = useMemo(
    () => myProjects.find((p) => String(p.id) === String(selectedProjectId)) || null,
    [myProjects, selectedProjectId],
  );

  const activeProjects = useMemo(
    () => myProjects.filter((p) => !isProjectClosed(p)),
    [myProjects],
  );
  const closedProjects = useMemo(
    () => myProjects.filter((p) => isProjectClosed(p)),
    [myProjects],
  );
  const selectedProjectClosed = isProjectClosed(selectedProject);

  const selectedProjectExpenses = useMemo(() => {
    if (!selectedProject) return [];
    return expenses
      .filter((e) => String(e.projectId) === String(selectedProject.id))
      .filter((e) =>
        isExpenseOwnedByUsta(e, {
          ustaId,
          ustaName,
          worker,
        }),
      )
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [expenses, selectedProject, ustaId, ustaName, worker]);

  const [modalOpen, setModalOpen] = useState(false);
  useModalOverlayLock(modalOpen);

  const [date, setDate] = useState(todayYmd);
  const [type, setType] = useState("");
  const [amountDigits, setAmountDigits] = useState("");
  const [comment, setComment] = useState("");
  const [receiptImageData, setReceiptImageData] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canAdd =
    Boolean(ustaId && worker && selectedProject) &&
    Boolean(date) &&
    Boolean(type) &&
    Boolean(somDigitsOnly(amountDigits));

  const resetForm = () => {
    setDate(todayYmd());
    setType("");
    setAmountDigits("");
    setComment("");
    setReceiptImageData("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const handleReceiptChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setReceiptImageData(dataUrl);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canAdd || !worker || !selectedProject || isSubmitting) return;
    setIsSubmitting(true);

    const newExpense = {
      projectId: selectedProject.id,
      projectName: projectLabel(selectedProject),
      ustaId,
      ustaName: ustaName || worker.fullName || worker.name || ustaId,
      brigadeId: selectedProject.brigadeId || worker.brigadeId || "",
      brigadeName: selectedProject.brigadeName || worker.brigadeName || "",
      type,
      amount: somDigitsOnly(amountDigits),
      date,
      comment: comment.trim(),
      receiptImageData,
      createdAt: new Date().toISOString(),
    };

    try {
      let botSent = false;
      try {
        await api.post("/api/telegram/expense-log", {
          workerId: ustaId,
          workerLogin: session?.login || "",
          workerName: newExpense.ustaName,
          projectName: newExpense.projectName,
          amount: newExpense.amount,
          type: newExpense.type,
          date: newExpense.date,
          comment: newExpense.comment,
          receiptImageData: newExpense.receiptImageData || "",
        });
        botSent = true;
      } catch (error) {
        console.error("Expense bot send error, to‘g‘ridan urinilmoqda:", error);
        try {
          const text =
            `💰 Yangi xarajat\n` +
            `Usta: ${newExpense.ustaName}\n` +
            `Loyiha: ${newExpense.projectName}\n` +
            `Turi: ${newExpense.type || "—"}\n` +
            `Summa: ${newExpense.amount || "—"} so'm\n` +
            `Sana: ${newExpense.date || "—"}\n` +
            `Izoh: ${newExpense.comment || "—"}`;
          if (newExpense.receiptImageData) {
            await sendPhotoDirect({
              caption: text,
              image: newExpense.receiptImageData,
              fileName: "xarajat-chek.jpg",
            });
          } else {
            await sendMessageDirect(text);
          }
          await logTelegramEventClient(
            expenseTelegramEvent({
              workerId: ustaId,
              workerLogin: session?.login || "",
              workerName: newExpense.ustaName,
              projectName: newExpense.projectName,
              amount: newExpense.amount,
              type: newExpense.type,
              date: newExpense.date,
            }),
          );
          botSent = true;
        } catch (directError) {
          console.error("Expense to‘g‘ridan ham yuborilmadi:", directError);
          const detail =
            directError instanceof Error && directError.message
              ? directError.message
              : "Botga yuborilmadi.";
          alert(
            `${detail}\n\nEslatma: npm run dev endi Vite bilan birga API (5000-port) ham ishga tushadi; faqat frontend bo‘lsa Telegram ishlamaydi.`,
          );
        }
      }

      const created = await addExpense(newExpense);
      const savedForAdmin = Boolean(created?.id);

      if (savedForAdmin) {
        void awardPoint(ustaId, "xarajat");
      }

      if (botSent && savedForAdmin) {
        await refresh();
        appendUserActionLog({
          ustaId,
          ustaName: newExpense.ustaName,
          actionType: "expense",
          projectName: newExpense.projectName,
        });
        closeModal();
      } else if (botSent && !savedForAdmin) {
        alert("Botga yuborildi, lekin adminga saqlanmadi.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    const ok = window.confirm("Ushbu xarajat o‘chirilsinmi?");
    if (!ok) return;
    await deleteExpense(expenseId);
  };

  const workerMissing = Boolean(ustaId) && !worker;

  if (selectedProject) {
    const projectTotal = sumExpenseAmounts(selectedProjectExpenses);

    return (
      <>
        <section className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setSelectedProjectId("")}
                className="mt-1 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                ←
              </button>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  {getProjectClient(selectedProject)}
                </h2>
                <p className="mt-1 text-sm text-slate-600">Loyiha xarajatlari</p>
              </div>
            </div>
            <button
              type="button"
              onClick={openModal}
              disabled={workerMissing || selectedProjectClosed}
              className="rounded-xl border border-amber-500 bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-amber-300 disabled:pointer-events-none disabled:opacity-50"
            >
              ⊕ Xarajat qo‘shish
            </button>
          </div>

          {selectedProjectClosed ? (
            <div className="rounded-[1rem] border border-slate-300/90 bg-slate-100 px-4 py-3 text-sm text-slate-700">
              Bu loyiha tugatilgan. Endi bu loyiha bo‘yicha xarajat qo‘shish yoki o‘chirish mumkin emas.
            </div>
          ) : null}

          <div className="rounded-[1rem] border border-amber-100 bg-amber-50/80 px-5 py-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              <span className="rounded-md bg-white px-2.5 py-1 font-medium text-slate-700">
                {getProjectStatus(selectedProject)}
              </span>
              <span>📍 {getProjectAddress(selectedProject)}</span>
              <span className="font-semibold text-amber-700">⚡ {getProjectKw(selectedProject)} kW</span>
              <span className="rounded-md bg-white px-2.5 py-1 text-slate-600">
                {getProjectSystemType(selectedProject)}
              </span>
            </div>
          </div>

          <div className="rounded-[1rem] border border-red-100 bg-red-50/80 px-5 py-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-red-100 text-xl">
                  💵
                </div>
                <div>
                  <p className="text-sm text-slate-600">Ushbu loyiha bo‘yicha jami xarajat</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatSomDisplay(String(projectTotal))}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Yozuvlar</p>
                <p className="text-2xl font-bold text-slate-900">
                  {selectedProjectExpenses.length} ta
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-base font-semibold text-slate-900">
              Xarajatlar ro‘yxati
            </h3>

            {selectedProjectExpenses.length === 0 ? (
              <div className="rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-12 text-center text-sm text-slate-600">
                Bu loyiha bo‘yicha xarajat yo‘q
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {selectedProjectExpenses.map((ex) => (
                  <li
                    key={ex.id}
                    className="rounded-[1rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-100 text-red-600">
                          💵
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800">
                              {ex.type}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-500">
                            🗓 {formatDateShort(ex.date)}
                            {ex.receiptImageData ? (
                              <span className="ml-3 text-blue-600">📎 Chek</span>
                            ) : null}
                          </p>
                          {ex.comment?.trim() ? (
                            <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                              {ex.comment}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <p className="text-lg font-bold text-red-600">
                          -{formatSomDisplay(ex.amount)}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(ex.id)}
                          disabled={selectedProjectClosed}
                          className="rounded-lg px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
                          title="O‘chirish"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {modalOpen ? (
          <ExpenseModal
            selectedProject={selectedProject}
            worker={worker}
            ustaName={ustaName}
            date={date}
            setDate={setDate}
            type={type}
            setType={setType}
            amountDigits={amountDigits}
            setAmountDigits={setAmountDigits}
            comment={comment}
            setComment={setComment}
            receiptImageData={receiptImageData}
            handleReceiptChange={handleReceiptChange}
            fileInputRef={fileInputRef}
            canAdd={canAdd}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            onClose={closeModal}
          />
        ) : null}
      </>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Xarajatlar
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Loyihalar bo‘yicha xarajat kiritish
        </p>
      </div>

      {workerMissing ? (
        <p className="rounded-[1rem] border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
          Profilingiz topilmadi. Administrator bilan bog‘laning — xarajat qo‘sha olmaysiz.
        </p>
      ) : null}

      <div>
        <p className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Faol loyihalar{" "}
          <span className="text-slate-400">({activeProjects.length})</span>
        </p>

        {activeProjects.length === 0 ? (
          <div className="rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-14 text-center text-sm text-slate-600">
            Sizga biriktirilgan loyiha yo‘q
          </div>
        ) : (
          <div className="space-y-3">
            {activeProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProjectId(p.id)}
                className="w-full rounded-[1.125rem] border border-slate-200/85 bg-white p-4 text-left shadow-soft-md ring-1 ring-slate-900/[0.03] transition hover:-translate-y-0.5 hover:shadow-soft-lg"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-xl text-amber-700">
                      ⚡
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-slate-900">
                        {getProjectClient(p)}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5">
                          {getProjectStatus(p)}
                        </span>
                        <span className="font-medium text-amber-700">⚡ {getProjectKw(p)} kW</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">📍 {getProjectAddress(p)}</p>
                    </div>
                  </div>
                  <span className="hidden rounded-xl border border-amber-500 bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 sm:inline-flex">
                    Xarajat kiritish ›
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {closedProjects.length > 0 ? (
        <div>
          <p className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-500">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            Yopilgan loyihalar{" "}
            <span className="text-slate-400">({closedProjects.length})</span>
          </p>
          <div className="space-y-3">
            {closedProjects.map((p) => (
              <div
                key={p.id}
                className="w-full rounded-[1.125rem] border border-slate-300/80 bg-slate-100 p-4 text-left opacity-60"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-200 text-xl text-slate-600">
                      ⚡
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-slate-700">
                        {getProjectClient(p)}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                        <span className="rounded-md bg-slate-200 px-2 py-0.5">
                          {getProjectStatus(p)}
                        </span>
                        <span>⚡ {getProjectKw(p)} kW</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">📍 {getProjectAddress(p)}</p>
                    </div>
                  </div>
                  <span className="hidden rounded-xl border border-slate-300 bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 sm:inline-flex">
                    Yopilgan
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ExpenseModal({
  selectedProject,
  worker,
  ustaName,
  date,
  setDate,
  type,
  setType,
  amountDigits,
  setAmountDigits,
  comment,
  setComment,
  receiptImageData,
  handleReceiptChange,
  fileInputRef,
  canAdd,
  isSubmitting,
  onSubmit,
  onClose,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="usta-xarajat-title"
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-[1.25rem] border border-slate-200/90 bg-white shadow-soft-lg">
        <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-3">
          <h3 id="usta-xarajat-title" className="text-xl font-semibold text-slate-900">
            Xarajat qo‘shish
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-3">
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              ⚡ {getProjectClient(selectedProject)} &nbsp; {getProjectKw(selectedProject)} kW
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-slate-600">Usta</p>
                <p className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-800">
                  {ustaName || worker?.fullName || worker?.name || "—"}
                </p>
              </div>
              <div>
                <label htmlFor="ux-date" className="text-xs font-medium text-slate-600">
                  Sana <span className="text-red-500">*</span>
                </label>
                <input
                  id="ux-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label htmlFor="ux-type" className="text-xs font-medium text-slate-600">
                Xarajat turi <span className="text-red-500">*</span>
              </label>
              <select
                id="ux-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                required
                className={INPUT_CLASS}
              >
                <option value="">Turini tanlang</option>
                {EXPENSE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ux-sum" className="text-xs font-medium text-slate-600">
                Summa (so‘m) <span className="text-red-500">*</span>
              </label>
              <input
                id="ux-sum"
                inputMode="numeric"
                autoComplete="off"
                value={formatSomWithSpaces(amountDigits)}
                onChange={(e) => setAmountDigits(somDigitsOnly(e.target.value))}
                placeholder="0"
                required
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="ux-comment" className="text-xs font-medium text-slate-600">
                Izoh
              </label>
              <textarea
                id="ux-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className={`${INPUT_CLASS} resize-y`}
              />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700">
                Chek yoki rasm (ixtiyoriy)
              </p>
              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center transition hover:bg-slate-100">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleReceiptChange}
                  className="hidden"
                />
                {receiptImageData ? (
                  <img
                    src={receiptImageData}
                    alt="Chek"
                    className="h-32 w-24 rounded-lg object-cover"
                  />
                ) : (
                  <>
                    <span className="text-2xl">📎</span>
                    <span className="mt-2 text-sm font-medium text-slate-600">
                      Chek rasmini yuklang
                    </span>
                    <span className="text-xs text-slate-400">
                      Kamera yoki galereyadan tanlang
                    </span>
                  </>
                )}
              </label>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={!canAdd || isSubmitting}
              className="rounded-xl border border-amber-500 bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-amber-300 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? "Yuborilmoqda..." : "Saqlash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
