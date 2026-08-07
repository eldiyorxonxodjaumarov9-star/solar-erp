import { useCallback, useEffect, useMemo, useState } from "react";
import MonthlyReportFilters from "../components/reports/MonthlyReportFilters";
import MonthlyReportKpis from "../components/reports/MonthlyReportKpis";
import MonthlyProjectsChart from "../components/reports/MonthlyProjectsChart";
import MonthlyProjectsTable from "../components/reports/MonthlyProjectsTable";
import ReportExportButtons from "../components/reports/ReportExportButtons";
import {
  MonthsBreakdownTable,
  PowerRangeReport,
  SystemTypeReport,
} from "../components/reports/PowerRangeReport";
import { defaultReportYear } from "../reports/monthly/dateHelpers";
import { fetchAllProjectsForReport } from "../reports/monthly/monthlyReportService";
import {
  buildMonthlyBreakdown,
  buildPowerRangeBreakdown,
  buildSystemTypeBreakdown,
  computeKpis,
  filterProjects,
  sortAndSearchProjects,
} from "../reports/monthly/reportCalculations";
import { downloadMonthlyReportExcel } from "../reports/monthly/reportExcelService";
import { downloadMonthlyReportPdf } from "../reports/monthly/reportPdfService";

const PAGE_SIZE = 25;

export default function MonthlyReportsPage() {
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  const [year, setYear] = useState(() => defaultReportYear());
  const [month, setMonth] = useState(/** @type {number | 'all'} */ ("all"));
  const [systemType, setSystemType] = useState("Barchasi");
  const [status, setStatus] = useState("Barchasi");
  const [region, setRegion] = useState("Barchasi");
  const [district, setDistrict] = useState("Barchasi");

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState(/** @type {'date'|'power'|'name'} */ ("date"));
  const [sortDir, setSortDir] = useState(/** @type {'asc' | 'desc'} */ ("desc"));
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchAllProjectsForReport();
      setAllProjects(list);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Loyihalarni yuklashda xatolik");
      setAllProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dynamicSystemTypes = useMemo(() => {
    const set = new Set();
    for (const p of allProjects) {
      if (p.systemType) set.add(p.systemType);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "uz"));
  }, [allProjects]);

  const baseFilters = useMemo(
    () => ({ year, month, systemType, status, region, district }),
    [year, month, systemType, status, region, district],
  );

  const filtered = useMemo(
    () => filterProjects(allProjects, baseFilters),
    [allProjects, baseFilters],
  );

  /** Oylar jadvali / chart — tanlangan oy filtri o‘chirilgan (to‘liq yil) */
  const yearScoped = useMemo(
    () =>
      filterProjects(allProjects, {
        ...baseFilters,
        month: "all",
      }),
    [allProjects, baseFilters],
  );

  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const monthly = useMemo(() => buildMonthlyBreakdown(yearScoped), [yearScoped]);
  const powerRanges = useMemo(
    () => buildPowerRangeBreakdown(filtered),
    [filtered],
  );
  const systemTypes = useMemo(
    () => buildSystemTypeBreakdown(filtered),
    [filtered],
  );

  const tableProjects = useMemo(
    () => sortAndSearchProjects(filtered, search, sortBy, sortDir),
    [filtered, search, sortBy, sortDir],
  );

  useEffect(() => {
    setPage(1);
  }, [year, month, systemType, status, region, district, search, sortBy, sortDir]);

  const onFilterChange = (patch) => {
    if (patch.year != null) setYear(Number(patch.year));
    if (patch.month !== undefined) setMonth(patch.month);
    if (patch.systemType != null) setSystemType(String(patch.systemType));
    if (patch.status != null) setStatus(String(patch.status));
    if (patch.region != null) setRegion(String(patch.region));
    if (patch.district != null) setDistrict(String(patch.district));
  };

  const onSort = (by) => {
    if (sortBy === by) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(by);
      setSortDir(by === "name" ? "asc" : "desc");
    }
  };

  const exportPayload = () => ({
    year,
    month,
    kpis,
    monthly,
    powerRanges,
    systemTypes,
    projects: tableProjects,
  });

  const onPdf = async () => {
    setExportBusy(true);
    try {
      await downloadMonthlyReportPdf(exportPayload());
    } catch (e) {
      alert(e?.message || "PDF yaratishda xatolik");
    } finally {
      setExportBusy(false);
    }
  };

  const onExcel = () => {
    setExportBusy(true);
    try {
      downloadMonthlyReportExcel(exportPayload());
    } catch (e) {
      alert(e?.message || "Excel yaratishda xatolik");
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-[1.375rem] border border-slate-200/90 bg-gradient-to-br from-white via-sky-50/40 to-white px-5 py-6 shadow-sm sm:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
              Sunnur Energy Tech
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Oylik hisobot
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Firestore’dagi barcha real loyihalar asosida oylar, kW va sistema turi
              kesimidagi tahlil. KPI, grafik, PDF va Excel — to‘liq ro‘yxat bo‘yicha.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Yuklangan loyihalar:{" "}
              <strong className="text-slate-700">{allProjects.length}</strong>
              {loading ? " (yuklanmoqda…)" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Yangilash
            </button>
            <ReportExportButtons
              busy={exportBusy || loading}
              onPdf={onPdf}
              onExcel={onExcel}
              loadedCount={tableProjects.length}
            />
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Filtrlar</h2>
        <MonthlyReportFilters
          year={year}
          month={month}
          systemType={systemType}
          status={status}
          region={region}
          district={district}
          dynamicSystemTypes={dynamicSystemTypes}
          onChange={onFilterChange}
        />
      </section>

      <MonthlyReportKpis kpis={kpis} />

      <MonthlyProjectsChart
        monthly={monthly}
        systemTypes={systemTypes}
        powerRanges={powerRanges}
      />

      <MonthsBreakdownTable rows={monthly} />
      <PowerRangeReport rows={powerRanges} />
      <SystemTypeReport rows={systemTypes} />

      <MonthlyProjectsTable
        projects={tableProjects}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        page={page}
        pageSize={PAGE_SIZE}
        onSearch={setSearch}
        onSort={onSort}
        onPage={setPage}
      />
    </div>
  );
}
