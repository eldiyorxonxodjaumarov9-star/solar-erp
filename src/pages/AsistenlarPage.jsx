import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAssistants } from "../hooks/useAssistants";
import { isAssistantLoginTaken } from "../assistants/assistantStorage";
import AppModalBackdrop from "../components/AppModalBackdrop";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

function ModalBackdrop({ children, onClose }) {
  return <AppModalBackdrop onClose={onClose}>{children}</AppModalBackdrop>;
}

function AssistantFormModal({ mode, initial, allAssistants, excludeId, onClose, onSave }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setFullName(initial.fullName ?? "");
      setPhone(initial.phone ?? "");
      setLogin(initial.login ?? "");
      setPassword("");
    } else {
      setFullName("");
      setPhone("");
      setLogin("");
      setPassword("");
    }
    setError("");
  }, [initial, mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const fd = new FormData(e.currentTarget);
    const fn = String(fd.get("fullName") ?? fullName).trim();
    const ph = String(fd.get("phone") ?? phone).trim();
    const lg = String(fd.get("login") ?? login).trim();
    const pw = String(fd.get("password") ?? password).trim();

    if (!fn || !ph || !lg) {
      setError("Ism, telefon va login majburiy.");
      return;
    }

    let finalPassword = pw;
    if (mode === "edit" && initial && !pw) {
      finalPassword = initial.password;
    }
    if (!finalPassword) {
      setError("Parol majburiy.");
      return;
    }

    if (isAssistantLoginTaken(lg, allAssistants, excludeId)) {
      setError("Bu login band.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        fullName: fn,
        phone: ph,
        login: lg,
        password: finalPassword,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saqlashda xatolik");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="mb-[env(safe-area-inset-bottom,0px)] max-h-[90dvh] overflow-y-auto rounded-t-[1.25rem] border border-slate-200/90 bg-white shadow-soft-xl sm:mb-0 sm:rounded-[1.25rem]"
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 className="text-lg font-semibold text-slate-900">
            {mode === "edit" ? "Asisten tahrirlash" : "Yangi asisten"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">Admin yordamchisi profili.</p>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-4 px-6 py-5">
            <div>
              <label htmlFor="asisten-fullname" className="block text-sm font-medium text-slate-700">
                Ism familiya
              </label>
              <input
                id="asisten-fullname"
                name="fullName"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onInput={(e) => setFullName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="asisten-phone" className="block text-sm font-medium text-slate-700">
                Telefon
              </label>
              <input
                id="asisten-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onInput={(e) => setPhone(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="asisten-login" className="block text-sm font-medium text-slate-700">
                Login
              </label>
              <input
                id="asisten-login"
                name="login"
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                onInput={(e) => setLogin(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="asisten-password" className="block text-sm font-medium text-slate-700">
                Parol
              </label>
              <input
                id="asisten-password"
                name="password"
                type="password"
                autoComplete={mode === "edit" ? "new-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onInput={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
                placeholder={mode === "edit" ? "Bo‘sh — eski parol saqlanadi" : ""}
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm">
              Bekor
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saqlanmoqda…" : "Saqlash"}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

export default function AsistenlarPage() {
  const { assistants, addAssistant, updateAssistant, deleteAssistant } = useAssistants();
  const { switchToAsistenProfile } = useAuth();
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const openCreate = () => setModal({ mode: "create" });
  const openEdit = (assistant) => setModal({ mode: "edit", assistant });

  const handleEnterProfile = (assistant) => {
    const res = switchToAsistenProfile(assistant);
    if (res?.ok) {
      navigate("/asisten-panel", { replace: true });
      return;
    }
    alert(res?.error || "Profilga kirib bo‘lmadi");
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Asistenlar</h2>
          <p className="mt-1 text-sm text-slate-600">
            Admin yordamchilari. Profil ochiladi — hozircha ichida bo‘sh panel.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-700"
        >
          + Yangi asisten
        </button>
      </div>

      {assistants.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Hali asisten yo‘q. «Yangi asisten» tugmasini bosing.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assistants.map((a) => (
            <li
              key={a.id}
              className="flex flex-col rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md"
            >
              <p className="font-semibold text-slate-900">{a.fullName}</p>
              <p className="mt-1 text-sm text-slate-600">{a.phone}</p>
              <p className="mt-2 text-xs text-slate-500">Login: {a.login}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleEnterProfile(a)}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Profilga kirish
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  Tahrirlash
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(a)}
                  className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                >
                  O‘chirish
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal ? (
        <AssistantFormModal
          mode={modal.mode}
          initial={modal.assistant}
          allAssistants={assistants}
          excludeId={modal.assistant?.id}
          onClose={() => setModal(null)}
          onSave={async (payload) => {
            try {
              if (modal.mode === "edit" && modal.assistant) {
                await updateAssistant(modal.assistant.id, payload);
              } else {
                await addAssistant(payload);
              }
            } catch (err) {
              console.error("Asisten saqlash:", err);
              throw err;
            }
          }}
        />
      ) : null}

      {deleteTarget ? (
        <ModalBackdrop onClose={() => setDeleteTarget(null)}>
          <div className="rounded-[1.25rem] border bg-white p-6 shadow-xl">
            <p className="font-semibold text-slate-900">{deleteTarget.fullName} o‘chirilsinmi?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border px-3 py-2 text-sm">
                Bekor
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteAssistant(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white"
              >
                O‘chirish
              </button>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </section>
  );
}
