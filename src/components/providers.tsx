'use client';
import { I18nProvider } from '@/lib/i18n';
import { CurrencyProvider } from '@/lib/currency-provider';
import { AppTheme, AppThemeProvider } from '@/lib/theme';
import { ToastProvider } from './ui';

export function Providers({lang,theme,children}:{lang:'en'|'ar';theme:AppTheme;children:React.ReactNode}){
  return <AppThemeProvider initialTheme={theme}>
    <I18nProvider initialLang={lang}><CurrencyProvider><ToastProvider>{children}</ToastProvider></CurrencyProvider></I18nProvider>
  </AppThemeProvider>;
}
