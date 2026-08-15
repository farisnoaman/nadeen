'use client';
import { createContext, useContext, useEffect, useState } from 'react';

export type AppTheme = 'light' | 'dark';
type ThemeContextValue = { theme: AppTheme; setTheme: (theme: AppTheme) => void };
const ThemeContext = createContext<ThemeContextValue>({ theme:'light', setTheme:()=>{} });

function applyTheme(theme: AppTheme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export function AppThemeProvider({ initialTheme, children }: { initialTheme: AppTheme; children: React.ReactNode }) {
  const [theme, setState] = useState<AppTheme>(initialTheme);

  useEffect(() => {
    const saved = localStorage.getItem('ff_theme') || localStorage.getItem('theme');
    const next: AppTheme = saved === 'dark' ? 'dark' : saved === 'light' ? 'light' : initialTheme;
    setState(next);
    applyTheme(next);
  }, [initialTheme]);

  const setTheme = (next: AppTheme) => {
    setState(next);
    applyTheme(next);
    localStorage.setItem('ff_theme', next);
    localStorage.removeItem('theme');
    const cookieSecurity = location.protocol === 'https:' ? ';samesite=none;secure;partitioned' : ';samesite=lax';
    document.cookie = `ff_theme=${next};path=/;max-age=31536000${cookieSecurity}`;
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useAppTheme = () => useContext(ThemeContext);
