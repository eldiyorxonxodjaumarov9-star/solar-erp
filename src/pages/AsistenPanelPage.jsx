import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const TILES = [
  {
    to: "/asisten-panel/loyihalar",
    title: "Loyihalar",
    description: "Faol va yakunlangan loyihalar ro‘yxati, holati va tafsilotlari.",
    accent: "from-sky-500/10 to-blue-50 ring-sky-200/60",
  },
  {
    to: "/asisten-panel/ish-vaqti",
    title: "Ish vaqti",
    description: "Keldi-ketdi: yuz surati, yo‘riqnoma imzosi va GPS manzil (ustalar kabi).",
    accent: "from-emerald-500/10 to-green-50 ring-emerald-200/60",
  },
  {
    to: "/asisten-panel/rasmlar",
    title: "Rasmlar",
    description: "Ob‘yekt va bosqich rasmlari, filtrlash va ko‘rish.",
    accent: "from-amber-500/10 to-orange-50 ring-amber-200/60",
  },
];

export default function AsistenPanelPage() {
  const { session } = useAuth();
  const name =
    session?.role === "asisten"
      ? String(session.name || session.login || "Asisten").trim()
      : "Asisten";
  const masterName =
    session?.role === "asisten"
      ? String(session.masterName || "Administrator").trim()
      : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Asisten paneli
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Xush kelibsiz, <span className="font-semibold text-slate-900">{name}</span>
          {masterName ? (
            <span className="text-slate-500"> · Master: {masterName}</span>
          ) : null}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className={`group rounded-2xl border border-slate-200/90 bg-gradient-to-br p-5 shadow-soft-md ring-1 transition-all hover:-translate-y-0.5 hover:shadow-lg ${tile.accent}`}
          >
            <h2 className="text-lg font-semibold text-slate-900 group-hover:text-brand-700">
              {tile.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{tile.description}</p>
            <span className="mt-4 inline-flex text-sm font-semibold text-brand-600">
              Ochish →
            </span>
          </Link>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200/85 bg-white p-5 text-sm text-slate-600 shadow-soft-md">
        <p>
          Boshqa bo‘limlar keyinroq qo‘shiladi. Hozircha loyihalar, ish vaqti va rasmlarni
          ko‘rishingiz mumkin.
        </p>
      </section>
    </div>
  );
}
