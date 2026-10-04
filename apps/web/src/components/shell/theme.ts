export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "shadow-theme";

/**
 * Runs before first paint (inlined in <head> by app/layout.tsx) so a stored theme never flashes.
 * Plain ES5 on purpose: it executes as a string.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export function parseThemePref(value: unknown): ThemePref {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

/** The toggle flips what you see: from the resolved theme to its opposite. */
export function toggledPref(pref: ThemePref, systemDark: boolean): ThemePref {
  return resolveTheme(pref, systemDark) === "dark" ? "light" : "dark";
}

export function readThemePref(): ThemePref {
  try {
    return parseThemePref(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked (private mode): the theme still applies for this page view.
  }
}
