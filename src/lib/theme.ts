/**
 * Light or dark (SC-3), chosen in the settings menu and kept on the device. The layout runs
 * `THEME_SCRIPT` before the first paint, so a dark device never flashes light.
 */
export const THEME_KEY = "spot.theme";

export type Theme = "light" | "dark";

/** Inline in the layout's head: sets the class from storage before anything is drawn. */
export const THEME_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage refused: the choice lasts until the page reloads.
  }
}
