import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'qehwa-theme';

function resolveInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('theme-light', theme === 'light');
  document.documentElement.classList.toggle('theme-dark', theme === 'dark');
  // P1: keeps native form controls, scrollbars and the UA stylesheet on
  // the same theme as the app (also set pre-paint by index.html).
  document.documentElement.style.colorScheme = theme;
}

interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // P1: with no stored preference, follow the OS theme if it changes
  // while the app is open. Once the user picks a theme (stored in
  // localStorage by the effect above) the stored choice wins.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(STORAGE_KEY) !== null) return;
      setTheme(event.matches ? 'light' : 'dark');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
      setTheme,
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
