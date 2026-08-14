'use client';
import { ThemeProvider } from 'next-themes';
import { I18nProvider } from '@/lib/i18n';
import { ToastProvider } from './ui';

export function Providers({lang,children}:{lang:'en'|'ar';children:React.ReactNode}){
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <I18nProvider initialLang={lang}><ToastProvider>{children}</ToastProvider></I18nProvider>
  </ThemeProvider>;
}
