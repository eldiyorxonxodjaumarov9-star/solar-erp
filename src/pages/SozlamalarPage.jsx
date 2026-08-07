import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { SECTION_COPY } from "../navConfig";
import { APP_THEME_IDS, APP_THEME_LABELS } from "../theme/appThemeStorage";
import { useTheme } from "../theme/ThemeContext";

const TAB_BTN =
  "rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200";

export default function SozlamalarPage() {
  const { theme, setTheme } = useTheme();
  const { changeAdminCredentials } = useAuth();
  const copy = SECTION_COPY.sozlamalar;
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextLogin, setNextLogin] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setStatus("");
    setError("");
    const res = changeAdminCredentials({
      currentPassword,
      nextLogin,
      nextPassword,
    });
    if (!res?.ok) {
      setError(res?.error || "Saqlashda xatolik");
      return;
    }
    setCurrentPassword("");
    setNextPassword("");
    setStatus("Admin login/paroli yangilandi.");
  };

  return (
    <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {copy.title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
        {copy.description}
      </p>

      <div className="mt-6 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500 sm:px-6">
        <p className="text-sm font-semibold text-slate-800">
          Interfeys mavzusi
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500 sm:text-sm">
          Tanlangan mavzu Login, Admin va Usta paneliga qo‘llanadi. Standart:{" "}
          <span className="font-medium text-slate-700">Yashil</span>.
        </p>

        <div
          className="mx-auto mt-6 flex max-w-lg flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center"
          role="group"
          aria-label="Mavzu tanlash"
        >
          {APP_THEME_IDS.map((id) => {
            const active = theme === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                className={`${TAB_BTN} ${
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-900 shadow-sm ring-2 ring-brand-400/30"
                    : "border-slate-200/90 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md active:scale-[0.98]"
                }`}
              >
                {APP_THEME_LABELS[id]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-[1rem] border border-slate-200/90 bg-white px-4 py-6 sm:px-6">
        <p className="text-sm font-semibold text-slate-800">Admin login va parol</p>
        <p className="mt-2 text-xs text-slate-500 sm:text-sm">
          Bu yerda admin akkaunt ma'lumotlarini o'zgartirishingiz mumkin.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-left text-xs font-medium text-slate-600 sm:col-span-2">
            Joriy parol
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={`${TAB_BTN} mt-1.5 w-full border-slate-200/90 bg-white text-slate-800`}
              required
            />
          </label>
          <label className="text-left text-xs font-medium text-slate-600">
            Yangi login
            <input
              type="text"
              value={nextLogin}
              onChange={(e) => setNextLogin(e.target.value)}
              className={`${TAB_BTN} mt-1.5 w-full border-slate-200/90 bg-white text-slate-800`}
              required
            />
          </label>
          <label className="text-left text-xs font-medium text-slate-600">
            Yangi parol
            <input
              type="password"
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
              className={`${TAB_BTN} mt-1.5 w-full border-slate-200/90 bg-white text-slate-800`}
              required
            />
          </label>
          {error ? <p className="text-left text-xs text-red-600 sm:col-span-2">{error}</p> : null}
          {status ? <p className="text-left text-xs text-emerald-700 sm:col-span-2">{status}</p> : null}
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Saqlash
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
