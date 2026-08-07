import { INVERTERS } from "../services/inverterService.js";
import InverterCard from "./InverterCard.jsx";

/**
 * @param {Object} props
 * @param {string} [props.selectedInverterType]
 * @param {(inverter: import("../services/inverterService.js").Inverter) => void} props.onSelect
 */
export default function InverterSelector({ selectedInverterType, onSelect }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {INVERTERS.map((inverter) => (
        <InverterCard
          key={inverter.id}
          inverter={inverter}
          selected={selectedInverterType === inverter.name}
          onSelect={() => onSelect(inverter)}
        />
      ))}
    </div>
  );
}
