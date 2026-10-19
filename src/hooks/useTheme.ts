import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'pulse-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const CHROME_COLOR = { dark: '#0A0E17', light: '#F4F6FA' };

export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    /* storage can be blocked; fall through to following the browser */
  }
  return 'system';
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Puts the resolved theme on <html>: a class for the CSS, color-scheme for native controls */
export function applyThemePreference(preference: ThemePreference) {
  const theme = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', CHROME_COLOR[theme]);
}

/** Theme preference that defaults to the browser's setting and follows it live while on "system" */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    applyThemePreference(preference);
    if (preference !== 'system') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => applyThemePreference('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies for this visit */
    }
    setPreferenceState(next);
  }, []);

  return { preference, resolved: resolveTheme(preference), setPreference };
}
