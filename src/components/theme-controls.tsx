'use client';

import { Languages, Moon, Sun } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n';
import { useAppTheme } from '@/lib/theme';

export function ThemeToggle({ label = false }: { label?: boolean }) {
  const { theme, setTheme } = useAppTheme();
  const { t } = useI18n();
  const next = theme === 'dark' ? 'light' : 'dark';
  const Icon = theme === 'dark' ? Moon : Sun;
  const changeTheme = () => {
    setTheme(next);
    if (location.pathname.startsWith('/dashboard')) {
      api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'preferences', theme: next }),
      }).catch(() => undefined);
    }
  };
  return (
    <button type="button" className={`theme-toggle ${label ? 'with-label' : ''}`} onClick={changeTheme} aria-label={`${t('theme')}: ${t(theme)}`} title={`${t('theme')}: ${t(next)}`}>
      <Icon size={17} />
      {label && <span>{t(theme)}</span>}
    </button>
  );
}

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  const next = lang === 'en' ? 'ar' : 'en';
  const changeLanguage = () => {
    setLang(next);
    if (location.pathname.startsWith('/dashboard')) {
      api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'preferences', language: next }),
      }).catch(() => undefined);
    }
  };
  return (
    <button type="button" className="lang-toggle" onClick={changeLanguage} aria-label={t('language')} title={t('language')}>
      <Languages size={16} /><span>{lang === 'en' ? 'ع' : 'EN'}</span>
    </button>
  );
}
