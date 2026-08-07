import { METAL_CONSTRUCTIONS } from "../services/metalConstructionService.js";
import MetalConstructionCard from "./MetalConstructionCard.jsx";

/**
 * @param {Object} props
 * @param {string} [props.selectedConstructionType]
 * @param {(construction: import("../services/metalConstructionService.js").MetalConstruction) => void} props.onSelect
 */
export default function MetalConstructionSelector({
  selectedConstructionType,
  onSelect,
}) {
  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {METAL_CONSTRUCTIONS.map((construction) => (
        <MetalConstructionCard
          key={construction.id}
          construction={construction}
          selected={selectedConstructionType === construction.name}
          onSelect={() => onSelect(construction)}
        />
      ))}
    </div>
  );
}
