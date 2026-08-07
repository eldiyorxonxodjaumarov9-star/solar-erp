import { NavLink } from "react-router-dom";
import { USTA_PANEL_NAV } from "../navConfig";

function navClass({ isActive }) {
  return [
    "flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium tracking-tight transition-all duration-200 ease-out",
    isActive
      ? "bg-brand-600 text-white shadow-md ring-1 ring-brand-700/20"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:shadow-sm active:scale-[0.99]",
  ].join(" ");
}

const logoutRowClass =
  "flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium tracking-tight text-slate-600 transition-all duration-200 ease-out hover:bg-slate-100 hover:text-slate-900 hover:shadow-sm active:scale-[0.99]";

function userInitial(login, name) {
  const raw = (name || login || "U").trim();
  return raw ? raw.charAt(0).toUpperCase() : "U";
}

export default function UstaSidebar({
  onNavigate,
  login,
  name,
  onLogout,
  onSwitchAccount,
}) {
  const displayLogin = (login || "").trim() || "—";
  const displayName = (name || "").trim();

  const handleLogout = () => {
    onNavigate?.();
    onLogout?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-slate-200/75 bg-white/92 shadow-soft-md backdrop-blur-xl supports-[backdrop-filter]:bg-white/85">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100/90 px-5 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-cyan-500 text-sm font-bold text-white shadow-soft-lg ring-1 ring-white/20">
          SE
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-semibold tracking-tight text-slate-900">
            Solar ERP
          </p>
          <p className="text-xs text-slate-500">Menyu</p>
        </div>
      </div>

      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-4 md:pb-4 md:pt-5"
        aria-label="Usta navigatsiyasi"
      >
        <ul className="flex flex-col gap-1">
          {USTA_PANEL_NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={Boolean(item.end)}
                onClick={onNavigate}
                className={navClass}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={handleLogout} className={logoutRowClass}>
              Chiqish
            </button>
          </li>
        </ul>
      </nav>

      <div className="shrink-0 border-t border-slate-200/80 bg-white/95 px-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-cyan-500 text-sm font-bold text-white shadow-soft-md ring-2 ring-white"
            aria-hidden
          >
            {userInitial(displayLogin, displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {displayLogin}
            </p>
            {displayName && displayName !== displayLogin ? (
              <p className="truncate text-xs text-slate-600">{displayName}</p>
            ) : null}
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Usta
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            onSwitchAccount?.();
          }}
          className="mt-3 w-full rounded-xl px-3 py-2 text-center text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          Akkauntni almashtirish
        </button>
      </div>
    </div>
  );
}
