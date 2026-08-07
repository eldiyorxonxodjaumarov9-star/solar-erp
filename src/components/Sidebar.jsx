import { NavLink } from "react-router-dom";
import { MAIN_NAV } from "../navConfig";

function NavIcon({ name, active }) {
  if (name !== "supply") return null;
  return (
    <svg
      width="18"
      height="18"
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

export default function Sidebar({
  onNavigate,
  onSwitchAccount,
  onLogout,
}) {
  const handleDisabledItemClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.alert("Bu bo‘lim hozircha aktiv emas");
  };

  const handleSwitchAccount = () => {
    onNavigate?.();
    onSwitchAccount?.();
  };

  const handleLogout = () => {
    onNavigate?.();
    onLogout?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-slate-200/75 bg-white/92 shadow-soft-md backdrop-blur-xl supports-[backdrop-filter]:bg-white/85">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100/90 px-5 py-5 md:hidden">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-cyan-500 text-sm font-bold text-white shadow-soft-lg ring-1 ring-white/20">
          SE
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-slate-900">
            Solar ERP
          </p>
          <p className="text-xs text-slate-500">Menyu</p>
        </div>
      </div>

      <nav
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-4 md:pb-6 md:pt-6"
        aria-label="Asosiy navigatsiya"
      >
        <ul className="flex flex-col gap-1">
          {MAIN_NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={item.isDisabled ? handleDisabledItemClick : onNavigate}
                className={({ isActive }) =>
                  [
                    "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium tracking-tight transition-all duration-200 ease-out",
                    item.isDisabled
                      ? "cursor-not-allowed opacity-50 pointer-events-auto text-slate-600"
                      : isActive
                        ? "bg-slate-900 text-white shadow-md ring-1 ring-slate-800/20"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:shadow-sm active:scale-[0.99]",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex min-w-0 items-center gap-2.5">
                      {item.icon ? (
                        <NavIcon name={item.icon} active={isActive && !item.isDisabled} />
                      ) : null}
                      <span>{item.label}</span>
                    </span>
                    {item.isDisabled ? (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                        Tez orada
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {onSwitchAccount && onLogout ? (
        <div className="md:hidden shrink-0 border-t border-slate-200/80 bg-white/95 px-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98]"
            >
              Akkauntni almashtirish
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md active:scale-[0.98]"
            >
              Chiqish
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
