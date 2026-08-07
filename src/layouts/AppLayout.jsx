import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Sidebar from "../components/Sidebar";
import { useModalOverlayLock } from "../contexts/GlobalModalOverlayContext";

function MenuIcon({ open }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
        <>
          <path d="M18 6 6 18M6 6l12 12" />
        </>
      ) : (
        <>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </>
      )}
    </svg>
  );
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { logout, switchAccount } = useAuth();
  const navigate = useNavigate();

  const goToLogin = () => {
    navigate("/login", { replace: true });
  };

  const handleLogout = () => {
    logout();
    goToLogin();
  };

  const handleSwitchAccount = () => {
    switchAccount();
    goToLogin();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useModalOverlayLock(sidebarOpen);

  return (
    <div className="min-h-screen text-slate-900">
      <div className="flex min-h-screen">
        {/* Mobile drawer backdrop */}
        <button
          type="button"
          aria-label="Menyuni yopish"
          className={`fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[2px] transition-opacity duration-200 md:hidden ${
            sidebarOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        <aside
          id="app-sidebar-panel"
          className={`fixed bottom-0 left-0 top-0 z-50 w-[min(17.5rem,85vw)] transition-transform duration-300 ease-out md:sticky md:top-0 md:z-0 md:flex md:h-screen md:w-60 md:shrink-0 md:translate-x-0 lg:w-64 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <div className="flex h-full min-h-0 flex-col pt-[calc(env(safe-area-inset-top,0px)+12px)] md:pt-0">
            <Sidebar
              onNavigate={() => setSidebarOpen(false)}
              onSwitchAccount={handleSwitchAccount}
              onLogout={handleLogout}
            />
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl supports-[backdrop-filter]:bg-white/75">
            <div
              className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] sm:px-6 sm:pt-[calc(env(safe-area-inset-top,0px)+18px)] lg:px-8 md:pt-4"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-700 shadow-sm transition-all duration-200 ease-out hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:scale-[0.97] md:hidden"
                  aria-expanded={sidebarOpen}
                  aria-controls="app-sidebar-panel"
                  onClick={() => setSidebarOpen((o) => !o)}
                >
                  <MenuIcon open={sidebarOpen} />
                </button>

                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-cyan-500 text-sm font-bold text-white shadow-soft-lg ring-1 ring-white/25">
                    SE
                  </div>
                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                      Solar ERP
                    </h1>
                    <p className="truncate text-xs text-slate-500">
                      Quyosh energiyasi boshqaruvi
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  className="hidden rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98] md:inline-flex sm:px-4 sm:text-sm"
                >
                  Akkauntni almashtirish
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="hidden rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98] md:inline-flex sm:px-4 sm:text-sm"
                >
                  Chiqish
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-soft-md transition-all duration-200 ease-out hover:bg-slate-800 hover:shadow-soft-lg focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 active:scale-[0.98]"
                >
                  Admin Panel
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
