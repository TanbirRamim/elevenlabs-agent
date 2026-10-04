"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyThemePref,
  type ResolvedTheme,
  readThemePref,
  resolveTheme,
  type ThemePref,
  toggledPref,
} from "./theme";

/** Current theme preference and a toggle. Server render assumes "system". */
export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
} {
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setPrefState(readThemePref());
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    applyThemePref(p);
    setPrefState(p);
  }, []);

  const toggle = useCallback(() => {
    setPref(toggledPref(readThemePref(), systemDark));
  }, [setPref, systemDark]);

  return { pref, resolved: resolveTheme(pref, systemDark), setPref, toggle };
}
