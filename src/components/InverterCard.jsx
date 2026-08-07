/**
 * @param {import("../services/inverterService.js").Inverter} inverter
 * @param {boolean} selected
 * @param {() => void} onSelect
 */
export default function InverterCard({ inverter, selected, onSelect }) {
  const showLogo = Boolean(inverter.logo);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "group relative flex w-full flex-col overflow-hidden rounded-xl border-2 p-4 text-left transition-all duration-200",
        "cursor-pointer hover:scale-[1.03] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2",
        selected
          ? "border-[#F5A623] bg-[#FFF8ED] shadow-md"
          : "border-neutral-200 bg-white hover:border-neutral-300",
      ].join(" ")}
    >
      <div className="relative flex aspect-[4/3] w-full flex-col overflow-hidden rounded-lg bg-neutral-50">
        {showLogo ? (
          <div className="flex shrink-0 items-center justify-center border-b border-neutral-100 bg-white px-4 py-3">
            <img
              src={inverter.logo}
              alt={`${inverter.name} logo`}
              loading="lazy"
              decoding="async"
              className="h-8 max-w-full object-contain sm:h-10"
            />
          </div>
        ) : null}
        <div className="flex flex-1 items-center justify-center p-2">
          <img
            src={inverter.image}
            alt={inverter.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
          />
        </div>
      </div>

      <p className="mt-3 text-center text-sm font-bold uppercase tracking-wide text-neutral-900 sm:text-base">
        {inverter.name}
      </p>

      <div className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-neutral-700">
        <span
          className={[
            "inline-flex h-4 w-4 items-center justify-center rounded-full border-2",
            selected ? "border-[#F5A623] bg-[#F5A623]" : "border-neutral-400 bg-white",
          ].join(" ")}
          aria-hidden
        >
          {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
        </span>
        <span>{selected ? "Tanlandi" : "Tanlash"}</span>
      </div>

      {selected ? (
        <span className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-[#F5A623] px-3 py-1.5 text-xs font-bold text-white">
          ✔ Tanlandi
        </span>
      ) : null}
    </button>
  );
}
