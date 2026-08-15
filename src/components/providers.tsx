'use client';
import { I18nProvider } from '@/lib/i18n';
import { AppTheme, AppThemeProvider } from '@/lib/theme';
import { ToastProvider } from './ui';

export function Providers({lang,theme,children}:{lang:'en'|'ar';theme:AppTheme;children:React.ReactNode}){
  return <AppThemeProvider initialTheme={theme}>
    <I18nProvider initialLang={lang}><ToastProvider>{children}</ToastProvider></I18nProvider>
  </AppThemeProvider>;
}
