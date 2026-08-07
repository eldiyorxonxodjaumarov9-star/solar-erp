import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ASISTEN_MOBILE_BOTTOM_NAV, ASISTEN_PANEL_NAV } from "../navConfig";

function navClass({ isActive }) {
  return [
    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
    isActive
      ? "bg-brand-600 text-white shadow-sm"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");
}

function SupplyNavIcon({ active }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${active ? "text-white" : "text-slate-500"}`}
      aria-hidden
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05" />
      <path d="M12 22.08V12" />
    </svg>
  );
}

function bottomNavClass({ isActive }) {
  return [
    "flex min-h-0 flex-1 flex-col items-center justify-center rounded-[14px] px-1 py-1 text-center text-[11px] font-semibold leading-tight",
    isActive ? "bg-brand-600 text-white shadow-md" : "text-slate-600",
  ].join(" ");
}

export default function AsistenLayout() {
  const { session, logout, switchAccount, returnToAdminProfile } = useAuth();
  const navigate = useNavigate();

  const name =
    session?.role === "asisten"
      ? String(session.name || session.login || "Asisten").trim()
      : "Asisten";
  const masterName =
    session?.role === "asisten"
      ? String(session.masterName || "Administrator").trim()
      : "";

  const goLogin = () => navigate("/login", { replace: true });

  const handleBackToAdmin = () => {
    const res = returnToAdminProfile();
    if (res?.ok) {
      navigate("/", { replace: true });
      return;
    }
    logout();
    goLogin();
  };

  const handleSwitchAccount = () => {
    switchAccount();
    goLogin();
  };

  const handleLogout = () => {
    logout();
    goLogin();
  };

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{name}</p>
            <p className="truncate text-xs text-slate-500">
              Asisten · Master: {masterName || "Admin"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {session?.impersonatedByAdmin ? (
              <button
                type="button"
                onClick={handleBackToAdmin}
                className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800"
              >
                Admin panel
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              Akuntni almashtirish
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
            >
              Chiqish
            </button>
          </div>
        </div>

        <nav
          className="mx-auto hidden max-w-5xl flex-wrap gap-1 px-4 pb-3 md:flex"
          aria-label="Asisten menyu"
        >
          {ASISTEN_PANEL_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              {({ isActive }) => (
                <>
                  {item.icon === "supply" ? <SupplyNavIcon active={isActive} /> : null}
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[calc(env(safe-area-inset-bottom,0px)+88px)] md:pb-6">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-4 left-4 right-4 z-50 flex h-[58px] items-stretch gap-1 rounded-[18px] border border-slate-200/90 bg-white/96 p-1 shadow-lg backdrop-blur-xl md:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        aria-label="Asisten pastki menyu"
      >
        {ASISTEN_MOBILE_BOTTOM_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={bottomNavClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
