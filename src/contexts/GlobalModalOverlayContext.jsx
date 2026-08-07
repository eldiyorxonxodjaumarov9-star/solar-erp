import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";

const GlobalModalOverlayContext = createContext(null);

let overlayLockCount = 0;

function syncOverlayClasses() {
  const active = overlayLockCount > 0;
  document.documentElement.classList.toggle("modal-open", active);
  document.body.classList.toggle("modal-open", active);
}

export function GlobalModalOverlayProvider({ children }) {
  const acquire = useCallback(() => {
    overlayLockCount += 1;
    syncOverlayClasses();
  }, []);

  const release = useCallback(() => {
    overlayLockCount = Math.max(0, overlayLockCount - 1);
    syncOverlayClasses();
  }, []);

  const value = useMemo(() => ({ acquire, release }), [acquire, release]);

  return (
    <GlobalModalOverlayContext.Provider value={value}>
      {children}
    </GlobalModalOverlayContext.Provider>
  );
}

/** Increments global modal overlay lock while `active` is true (stacking-safe). */
export function useModalOverlayLock(active) {
  const ctx = useContext(GlobalModalOverlayContext);
  if (!ctx) {
    throw new Error(
      "useModalOverlayLock must be used within GlobalModalOverlayProvider",
    );
  }
  const { acquire, release } = ctx;
  useEffect(() => {
    if (!active) return undefined;
    acquire();
    return () => release();
  }, [active, acquire, release]);
}
