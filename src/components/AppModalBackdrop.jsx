import { useModalOverlayLock } from "../contexts/GlobalModalOverlayContext";

export default function AppModalBackdrop({
  children,
  onClose,
  panelMaxWidthClass = "max-w-md",
}) {
  useModalOverlayLock(true);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Yopish"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />
      <div className={`relative z-[101] w-full ${panelMaxWidthClass}`}>
        {children}
      </div>
    </div>
  );
}
