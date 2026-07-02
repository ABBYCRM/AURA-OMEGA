import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "aura-omega-theme";

type Theme = "light" | "dark";

function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "dark" || t === "light") return t;
  } catch { /* storage unavailable */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Apply the stored theme before React renders, so there's no flash. */
export function initTheme(): void {
  applyTheme(readStoredTheme());
}

/** Light/dark theme with persistence — drives the drawer's Light/Dark toggle. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage unavailable */ }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}
