import { BATTERIES } from "../services/batteryService.js";
import BatteryCard from "./BatteryCard.jsx";

/**
 * @param {Object} props
 * @param {string} [props.selectedBatteryType]
 * @param {(battery: import("../services/batteryService.js").Battery) => void} props.onSelect
 */
export default function BatterySelector({ selectedBatteryType, onSelect }) {
  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
      {BATTERIES.map((battery) => (
        <BatteryCard
          key={battery.id}
          battery={battery}
          selected={selectedBatteryType === battery.name}
          onSelect={() => onSelect(battery)}
        />
      ))}
    </div>
  );
}
