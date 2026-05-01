const stats = [
  {
    title: "Loyihalar",
    value: "24",
    note: "4 ta loyiha bu oy boshlandi",
    trend: "+12%",
  },
  {
    title: "Ishchilar",
    value: "158",
    note: "Yangi 9 ta mutaxassis qo'shildi",
    trend: "+6%",
  },
  {
    title: "Daromad",
    value: "2.8 mlrd so'm",
    note: "O'tgan oyga nisbatan o'sish",
    trend: "+18%",
  },
];

const mobileNavItems = ["Loyihalar", "Xarajatlar", "Ish vaqti", "Chiqish"];

function App() {
  return (
    <div className="min-h-screen text-slate-900">
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-cyan-500 text-sm font-bold text-white shadow-soft">
              SE
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                Solar ERP
              </h1>
              <p className="text-xs text-slate-500">Quyosh energiyasi boshqaruvi</p>
            </div>
          </div>

          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
          >
            Admin Panel
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 pb-32 sm:px-6 sm:pb-8 lg:px-8">
        <section className="rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 p-6 text-white shadow-soft sm:p-8">
          <p className="text-sm text-white/80">Boshqaruv paneli</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Xush kelibsiz, Solar ERP tizimi
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-white/90 sm:text-base">
            Loyihalar, xodimlar va moliyaviy ko'rsatkichlarni bir joyda zamonaviy
            boshqaruv paneli orqali kuzating.
          </p>
        </section>

        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-500">{card.title}</p>
                <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600">
                  {card.trend}
                </span>
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
                {card.value}
              </p>
              <p className="mt-2 text-sm text-slate-500">{card.note}</p>
            </article>
          ))}
        </section>
      </main>

      <nav
        className="fixed inset-x-4 bottom-0 z-40 rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-xl backdrop-blur-xl sm:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
        aria-label="Pastki navigatsiya"
      >
        <ul className="grid grid-cols-4 gap-1">
          {mobileNavItems.map((item, index) => (
            <li key={item}>
              <button
                type="button"
                className={`w-full rounded-xl px-2 py-2 text-center text-[11px] font-medium transition ${
                  index === 0
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default App;
