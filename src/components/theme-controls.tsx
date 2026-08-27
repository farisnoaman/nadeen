'use client';

import { Coins, Languages, Moon, Sun } from 'lucide-react';
import { api } from '@/lib/client-api';
import { SUPPORTED_CURRENCIES } from '@/lib/currencies';
import { useCurrency } from '@/lib/currency-provider';
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

export function CurrencyToggle({ currencies }: { currencies?: string[] }) {
  const { currency, setCurrency } = useCurrency();
  const { t } = useI18n();
  const options = currencies && currencies.length ? currencies : SUPPORTED_CURRENCIES;
  const value = options.includes(currency) ? currency : options[0];
  return (
    <label className="currency-toggle" title={t('displayCurrency')}>
      <Coins size={16} />
      <select
        value={value}
        onChange={event => setCurrency(event.target.value)}
        aria-label={t('displayCurrency')}
      >
        {options.map(code => <option key={code} value={code}>{code}</option>)}
      </select>
    </label>
  );
}
