import type { ITheme } from "@xterm/xterm";

/**
 * Build an xterm theme from the live design tokens. Reads CSS custom
 * properties off the document root so the terminal matches whichever theme
 * (terminal-dark / paper-light) is active.
 */
export function buildXtermTheme(): ITheme {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string => {
    const x = root.getPropertyValue(name).trim();
    return x.length > 0 ? x : fallback;
  };
  return {
    background: v("--surface-inset", "#0e0f12"),
    foreground: v("--text-primary", "#e6e6e6"),
    cursor: v("--accent-base", "#d4a050"),
    cursorAccent: v("--surface-inset", "#0e0f12"),
    selectionBackground: v("--accent-soft", "#5a4a30"),
    selectionForeground: v("--text-primary", "#e6e6e6"),
    black: v("--text-tertiary", "#7a7a7a"),
    red: v("--status-error", "#e25960"),
    green: v("--status-running", "#7bbe6f"),
    yellow: v("--status-review", "#d4a050"),
    blue: v("--accent-base", "#76a8d8"),
    magenta: v("--status-blocked", "#d68a5a"),
    cyan: v("--accent-hover", "#84c5d4"),
    white: v("--text-primary", "#e6e6e6"),
    brightBlack: v("--text-secondary", "#a0a0a0"),
    brightRed: v("--status-error", "#ff7a80"),
    brightGreen: v("--status-running", "#9bd987"),
    brightYellow: v("--status-review", "#e8b870"),
    brightBlue: v("--accent-hover", "#94c2ed"),
    brightMagenta: v("--status-blocked", "#e9a872"),
    brightCyan: v("--accent-hover", "#a4dde7"),
    brightWhite: v("--text-primary", "#ffffff"),
  };
}
