import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const storageKey = "scholarlm-theme";

const ThemeContext = createContext<{
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (theme: ThemePreference) => void;
} | null>(null);

function storedPreference(): ThemePreference {
  const value = localStorage.getItem(storageKey);
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "dark";
}

function systemTheme(): ResolvedTheme {
  return matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(storedPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);
  const resolvedTheme = preference === "system" ? system : preference;

  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: light)");
    const update = () => setSystem(query.matches ? "light" : "dark");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      setPreference: (next: ThemePreference) => {
        localStorage.setItem(storageKey, next);
        setPreferenceState(next);
      },
    }),
    [preference, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
