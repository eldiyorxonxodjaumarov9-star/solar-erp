import { SYSTEM_POWER_OPTIONS } from "../heatPumpForms/heatPumpFormLayout.js";

/**
 * @param {Object} props
 * @param {Record<string, number>} props.counts
 * @param {(counts: Record<string, number>) => void} props.onChange
 */
export default function SystemPowerSelector({ counts, onChange }) {
  const setCount = (option, next) => {
    onChange({
      ...counts,
      [option]: Math.max(0, Math.floor(Number(next) || 0)),
    });
  };

  return (
    <div className="heat-pump-options heat-pump-options--grid heat-pump-power-grid">
      {SYSTEM_POWER_OPTIONS.map((opt) => {
        const count = Number(counts?.[opt]) || 0;
        return (
          <div key={opt} className="heat-pump-power-row">
            <button
              type="button"
              className="heat-pump-option heat-pump-power-label"
              onClick={() => setCount(opt, count > 0 ? 0 : 1)}
            >
              <span className="heat-pump-box" aria-hidden>
                {count > 0 ? "✓" : ""}
              </span>
              <span>{opt}</span>
            </button>
            <div className="heat-pump-power-qty">
              <button
                type="button"
                className="heat-pump-qty-btn"
                aria-label={`${opt} kamaytirish`}
                disabled={count <= 0}
                onClick={() => setCount(opt, count - 1)}
              >
                −
              </button>
              <span className="heat-pump-qty-value" aria-live="polite">
                {count}
              </span>
              <button
                type="button"
                className="heat-pump-qty-btn"
                aria-label={`${opt} qo'shish`}
                onClick={() => setCount(opt, count + 1)}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
