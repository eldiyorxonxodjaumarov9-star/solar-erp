export default function OfferTypeSelector({ onSelect }) {
  return (
    <div className="heat-pump-no-print mx-auto max-w-lg px-2 py-8 text-center">
      <h2 className="text-lg font-bold text-black sm:text-xl">
        Siz qaysi turdagi tijoriy taklif yaratmoqchisiz?
      </h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelect("heat_pump")}
          className="border-2 border-black bg-white px-6 py-10 text-base font-bold text-black transition hover:bg-neutral-100"
        >
          Issiqlik nasosi
        </button>
        <button
          type="button"
          onClick={() => onSelect("solar_panel")}
          className="border-2 border-black bg-white px-6 py-10 text-base font-bold text-black transition hover:bg-neutral-100"
        >
          Quyosh paneli
        </button>
      </div>
    </div>
  );
}
