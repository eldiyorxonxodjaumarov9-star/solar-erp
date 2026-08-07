import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { homePathForRole } from "../auth/roleHome";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-slate-900/[0.04] transition-all placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

export default function LoginPage() {
  const { session, loginAdmin, loginUsta, loginAsisten } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("admin");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (session) {
      setError("");
    }
  }, [session]);

  if (session) {
    return <Navigate to={homePathForRole(session.role)} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    let res;
    if (tab === "admin") {
      res = loginAdmin(login, password);
    } else if (tab === "asisten") {
      res = await loginAsisten(login, password);
    } else {
      res = await loginUsta(login, password);
    }
    if (res.ok) {
      const nextPath =
        tab === "admin" ? "/" : tab === "asisten" ? "/asisten-panel" : "/usta-panel";
      navigate(nextPath, { replace: true });
      return;
    }
    setError(res.error || "Xatolik yuz berdi.");
  };

  const tabClass = (key) =>
    `flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-all sm:text-sm ${
      tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
    }`;

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col justify-center px-4 py-10 pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+2.5rem)]">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-cyan-500 text-base font-bold text-white shadow-soft-lg ring-1 ring-white/25">
            SE
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Solar ERP</h1>
          <p className="mt-1 text-sm text-slate-500">Tizimga kirish</p>
        </div>

        <div className="rounded-[1.375rem] border border-slate-200/85 bg-white p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
          <div className="flex rounded-xl bg-slate-100/90 p-1">
            <button type="button" onClick={() => { setTab("admin"); setError(""); }} className={tabClass("admin")}>
              Admin
            </button>
            <button type="button" onClick={() => { setTab("master"); setError(""); }} className={tabClass("master")}>
              Master
            </button>
            <button type="button" onClick={() => { setTab("asisten"); setError(""); }} className={tabClass("asisten")}>
              Asisten
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
            <div>
              <label htmlFor="auth-login" className="block text-sm font-medium text-slate-700">
                Login
              </label>
              <input
                id="auth-login"
                type="text"
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700">
                Parol
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            {error ? (
              <p className="text-sm font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-soft-md transition-all hover:bg-slate-800 active:scale-[0.98]"
            >
              Kirish
            </button>
          </form>

          {tab === "admin" ? (
            <p className="mt-4 text-center text-xs text-slate-500">Administrator paneli.</p>
          ) : tab === "asisten" ? (
            <p className="mt-4 text-center text-xs text-slate-500">
              Asisten profili admin tomonidan «Asistenlar» bo‘limida yaratiladi.
            </p>
          ) : (
            <p className="mt-4 text-center text-xs text-slate-500">
              Master login va parol «Masterlar» bo‘limida yaratiladi.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
