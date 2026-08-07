import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "../hooks/useProjects";
import {
  buildContactsFromProjects,
  copyPhoneToClipboard,
  filterContacts,
  formatContactDate,
} from "../services/contacts.js";

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25 sm:max-w-xs";

function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("tugall") || s.includes("yakun")) {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }
  if (s.includes("jarayon") || s.includes("faol")) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default function ContactsPage() {
  const navigate = useNavigate();
  const { projects, refresh } = useProjects();
  const [search, setSearch] = useState("");
  const [kvSort, setKvSort] = useState("newest");
  const [error, setError] = useState("");
  const [copyNote, setCopyNote] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const allContacts = useMemo(() => buildContactsFromProjects(projects), [projects]);

  const contacts = useMemo(
    () => filterContacts(allContacts, { search, kvSort }),
    [allContacts, search, kvSort],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await refresh();
    } catch (e) {
      setError(e?.message || "Ma'lumotlarni yangilab bo'lmadi");
    } finally {
      setRefreshing(false);
    }
  };

  const openProject = (projectId) => {
    if (!projectId) return;
    navigate(`/loyihalar?project=${encodeURIComponent(projectId)}`);
  };

  const handleCopy = async (phone, e) => {
    e?.stopPropagation();
    const ok = await copyPhoneToClipboard(phone);
    if (ok) {
      setCopyNote(phone);
      window.setTimeout(() => setCopyNote(""), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[1.375rem] border border-slate-200/85 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-soft-lg ring-1 ring-slate-900/[0.03] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Contactlar
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Loyihalardagi mijozlar ro‘yxati — ma’lumotlar avtomatik ravishda{" "}
              <span className="font-medium">projects</span> kolleksiyasidan olinadi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshing ? "Yangilanmoqda…" : "Yangilash"}
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800 ring-1 ring-red-200">
            {error}
          </p>
        ) : null}
        {copyNote ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
            Nusxalandi: {copyNote}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <label htmlFor="contacts-search" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Qidiruv
            </label>
            <input
              id="contacts-search"
              type="search"
              placeholder="Mijoz ismi yoki telefon…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${INPUT_CLASS} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="contacts-kv-sort" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              kV bo‘yicha
            </label>
            <select
              id="contacts-kv-sort"
              value={kvSort}
              onChange={(e) => setKvSort(e.target.value)}
              className={`${INPUT_CLASS} mt-1 sm:min-w-[180px]`}
            >
              <option value="newest">Yangi qo‘shilganlar</option>
              <option value="asc">kV — o‘sish</option>
              <option value="desc">kV — kamayish</option>
            </select>
          </div>
        </div>

        {refreshing && allContacts.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-500">Yuklanmoqda…</p>
        ) : contacts.length === 0 ? (
          <div className="mt-8 rounded-[1rem] border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-14 text-center">
            <p className="text-base font-medium text-slate-700">Hali contactlar mavjud emas</p>
            <p className="mt-2 text-sm text-slate-500">
              {allContacts.length === 0
                ? "Loyiha qo‘shilganda contact avtomatik paydo bo‘ladi."
                : "Qidiruv yoki filter bo‘yicha natija topilmadi."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="mt-6 hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">№</th>
                    <th className="px-3 py-3">Mijoz ismi</th>
                    <th className="px-3 py-3">Telefon raqami</th>
                    <th className="px-3 py-3">Stansiya quvvati</th>
                    <th className="px-3 py-3">Loyiha holati</th>
                    <th className="px-3 py-3">Yaratilgan sana</th>
                    <th className="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, idx) => (
                    <tr
                      key={c.projectId}
                      className="cursor-pointer border-t border-slate-100 text-slate-700 transition hover:bg-slate-50/80"
                      onClick={() => openProject(c.projectId)}
                    >
                      <td className="px-3 py-3 text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-3 font-medium text-slate-900">{c.clientName}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2">
                          {c.phone}
                          {c.phone !== "—" ? (
                            <button
                              type="button"
                              onClick={(e) => void handleCopy(c.phone, e)}
                              className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-white"
                            >
                              Copy
                            </button>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {c.stationPower != null ? `${c.stationPower} kV` : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${statusBadgeClass(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatContactDate(c.createdAt)}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openProject(c.projectId);
                            }}
                            className="font-semibold text-brand-700 hover:underline"
                          >
                            Loyiha
                          </button>
                          {c.phone !== "—" ? (
                            <button
                              type="button"
                              onClick={(e) => void handleCopy(c.phone, e)}
                              className="font-semibold text-slate-600 hover:underline"
                            >
                              Copy
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="mt-6 grid gap-3 md:hidden">
              {contacts.map((c, idx) => (
                <li
                  key={c.projectId}
                  className="cursor-pointer rounded-[1.125rem] border border-slate-200/85 bg-white p-4 shadow-soft-md ring-1 ring-slate-900/[0.03] transition active:scale-[0.99]"
                  onClick={() => openProject(c.projectId)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-400">№ {idx + 1}</p>
                      <p className="truncate text-base font-bold text-slate-900">{c.clientName}</p>
                    </div>
                    <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${statusBadgeClass(c.status)}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-500">Telefon:</span>
                      {c.phone}
                      {c.phone !== "—" ? (
                        <button
                          type="button"
                          onClick={(e) => void handleCopy(c.phone, e)}
                          className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600"
                        >
                          Copy
                        </button>
                      ) : null}
                    </p>
                    <p>
                      <span className="text-slate-500">Quvvat:</span>{" "}
                      {c.stationPower != null ? `${c.stationPower} kV` : "—"}
                    </p>
                    <p>
                      <span className="text-slate-500">Sana:</span> {formatContactDate(c.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openProject(c.projectId);
                    }}
                    className="mt-4 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Loyiha ichiga kirish
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Jami: {contacts.length} ta contact
          {allContacts.length !== contacts.length ? ` (${allContacts.length} dan)` : ""}
        </p>
      </section>
    </div>
  );
}
