import { PANELS } from "../services/panelService.js";
import PanelCard from "./PanelCard.jsx";

/**
 * @param {Object} props
 * @param {string} [props.selectedPanelType]
 * @param {(panel: import("../services/panelService.js").Panel) => void} props.onSelect
 */
export default function PanelSelector({ selectedPanelType, onSelect }) {
  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
      {PANELS.map((panel) => (
        <PanelCard
          key={panel.id}
          panel={panel}
          selected={selectedPanelType === panel.name}
          onSelect={() => onSelect(panel)}
        />
      ))}
    </div>
  );
}
