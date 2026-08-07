import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import UstaSidebar from "../components/UstaSidebar";
import UstaMobileExtraMenu from "../components/UstaMobileExtraMenu";
import UstaNotificationBell from "../components/UstaNotificationBell";
import UstaPointsBadge from "../components/UstaPointsBadge";
import { USTA_MOBILE_BOTTOM_NAV } from "../navConfig";
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

function bottomNavItemClass({ isActive }) {
  return [
    "flex min-h-0 flex-1 flex-col items-center justify-center rounded-[14px] px-1 py-1 text-center text-[11px] font-semibold leading-tight tracking-tight transition-all duration-200 ease-out",
    isActive
      ? "bg-brand-600 text-white shadow-md"
      : "text-slate-600 hover:bg-slate-100 active:scale-[0.98]",
  ].join(" ");
}

const bottomNavChrome = {
  boxShadow: "0 12px 35px rgba(0, 0, 0, 0.35)",
  bottom: "calc(env(safe-area-inset-bottom, 0px) + 70px)",
};

export default function UstaLayout() {
  const [extraMenuOpen, setExtraMenuOpen] = useState(false);
  const { session, logout, switchAccount } = useAuth();
  const navigate = useNavigate();

  const goToLogin = () => navigate("/login", { replace: true });

  const handleLogout = () => {
    logout();
    goToLogin();
  };

  const handleSwitchAccount = () => {
    switchAccount();
    goToLogin();
  };

  const ustaLogin =
    session?.role === "usta" ? (session.login || "").trim() || "Usta" : "";
  const ustaName =
    session?.role === "usta" ? (session.name || "").trim() : "";

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setExtraMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useModalOverlayLock(extraMenuOpen);

  return (
    <div className="min-h-screen min-h-[100dvh] text-slate-900">
      <div className="flex min-h-screen min-h-[100dvh]">
        {/* Mobile: backdrop for extras drawer only */}
        <button
          type="button"
          aria-label="Menyuni yopish"
          className={`fixed inset-0 z-[998] bg-slate-900/35 backdrop-blur-[2px] transition-opacity duration-200 md:hidden ${
            extraMenuOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={() => setExtraMenuOpen(false)}
        />

        {/* Mobile: slide-out Qo‘shimcha menyu (not primary navigation) */}
        <aside
          id="usta-extra-menu-panel"
          className={`fixed bottom-0 left-0 top-0 z-[1000] flex w-[min(17.5rem,85vw)] transition-transform duration-300 ease-out md:hidden ${
            extraMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full min-h-0 flex-1 flex-col pt-[calc(env(safe-area-inset-top,0px)+12px)]">
            <UstaMobileExtraMenu
              onNavigate={() => setExtraMenuOpen(false)}
              login={ustaLogin}
              name={ustaName}
              onSwitchAccount={handleSwitchAccount}
            />
          </div>
        </aside>

        {/* Desktop: full sidebar */}
        <aside className="hidden md:sticky md:top-0 md:z-0 md:flex md:h-[100dvh] md:w-60 md:shrink-0 lg:w-64">
          <UstaSidebar
            onNavigate={() => {}}
            login={ustaLogin}
            name={ustaName}
            onLogout={handleLogout}
            onSwitchAccount={handleSwitchAccount}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl supports-[backdrop-filter]:bg-white/75">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] sm:px-6 sm:pt-[calc(env(safe-area-inset-top,0px)+18px)] lg:px-8 md:pt-4">
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-700 shadow-sm transition-all duration-200 ease-out hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:scale-[0.97] md:hidden"
                aria-expanded={extraMenuOpen}
                aria-controls="usta-extra-menu-panel"
                onClick={() => setExtraMenuOpen((o) => !o)}
              >
                <MenuIcon open={extraMenuOpen} />
              </button>
              <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800 sm:text-base">
                Solar ERP ga xush kelibsiz,{" "}
                <span className="font-semibold text-slate-900">{ustaLogin}</span>
              </p>
              <UstaPointsBadge />
              <UstaNotificationBell />
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-[170px] pt-8 sm:px-6 md:pb-8 md:pt-8 lg:px-8">
            <Outlet />
          </main>
        </div>

        {/* Mobile: floating bottom navigation (primary) */}
        <nav
          className="mobile-bottom-nav fixed left-4 right-4 z-[999] flex h-[58px] items-stretch gap-1 rounded-[18px] border border-slate-200/90 bg-white/96 p-1 backdrop-blur-xl supports-[backdrop-filter]:bg-white/92 md:hidden"
          style={bottomNavChrome}
          aria-label="Usta pastki navigatsiya"
        >
          {USTA_MOBILE_BOTTOM_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={bottomNavItemClass}
            >
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            className={`${bottomNavItemClass({ isActive: false })} border-0 bg-transparent`}
          >
            Chiqish
          </button>
        </nav>
      </div>
    </div>
  );
}
