import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  APP_THEME_KEY,
  loadAppTheme,
  persistAppTheme,
} from "./appThemeStorage";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => loadAppTheme());

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-app-theme", theme);
  }, [theme]);

  useEffect(() => {
    const sync = () => {
      const next = loadAppTheme();
      setThemeState(next);
      document.documentElement.setAttribute("data-app-theme", next);
    };
    const onStorage = (e) => {
      if (e.key === APP_THEME_KEY && e.newValue) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("solar-erp-app-theme-changed", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("solar-erp-app-theme-changed", sync);
    };
  }, []);

  const setTheme = useCallback((next) => {
    persistAppTheme(next);
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
