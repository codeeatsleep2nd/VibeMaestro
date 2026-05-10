import { useCallback, useEffect, useState } from "react";

export type Theme = "terminal-dark" | "paper-light";

const STORAGE_KEY = "vm:theme";

function readInitial(): Theme {
  if (typeof document === "undefined") return "terminal-dark";
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "paper-light" ? "paper-light" : "terminal-dark";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage may be unavailable in some Electron sandboxes; not critical.
    }
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((prev) => (prev === "terminal-dark" ? "paper-light" : "terminal-dark"));
  }, []);

  return [theme, cycle];
}
