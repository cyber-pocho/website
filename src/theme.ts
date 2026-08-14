export type Theme = "light" | "dark";

const STORAGE_KEY = "tty-theme";

export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing: the theme just won't persist across reloads.
  }
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/**
 * Follow the OS until the visitor picks a theme themselves. The initial
 * stamp happens in an inline <head> script to avoid a flash of the wrong
 * theme; this only wires up the ongoing listener.
 */
export function followSystemUntilOverridden(): void {
  let overridden = false;
  try {
    overridden = localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // Storage blocked; treat every visit as a fresh, OS-following one.
  }
  if (overridden) return;

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    document.documentElement.dataset.theme = e.matches ? "dark" : "light";
  });
}
