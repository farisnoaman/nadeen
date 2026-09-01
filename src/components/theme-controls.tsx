'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Languages, Moon, Sun } from 'lucide-react';
import { api } from '@/lib/client-api';
import { CURRENCY_META, SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/currencies';
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
    <button type="button" className="lang-toggle" onClick={changeLanguage} aria-label={`${t('language')}: ${lang === 'en' ? 'ع' : 'EN'}`} title={t('language')}>
      <Languages size={16} /><span>{lang === 'en' ? 'ع' : 'EN'}</span>
    </button>
  );
}

export function CurrencyToggle({ currencies }: { currencies?: string[] }) {
  const { currency, setCurrency } = useCurrency();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const options = currencies && currencies.length ? currencies : SUPPORTED_CURRENCIES;
  const value = options.includes(currency) ? currency : options[0];
  const meta = CURRENCY_META[value as CurrencyCode];
  const symbol = meta?.symbol ?? '$';

  const computePosition = (rect: DOMRect) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const menuW = 200;
    const estimatedH = Math.min(392, vh - margin * 2);
    let left = rect.right - menuW;
    if (left < margin) left = margin;
    if (left + menuW > vw - margin) left = vw - menuW - margin;
    let top = rect.bottom + 6;
    if (top + estimatedH > vh - margin && rect.top - estimatedH - 6 >= margin) {
      top = rect.top - estimatedH - 6;
    }
    if (top < margin) top = margin;
    if (top + estimatedH > vh - margin) {
      top = Math.max(margin, vh - margin - estimatedH);
    }
    return { top, left };
  };

  const handleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (wrapRef.current) {
      setPos(computePosition(wrapRef.current.getBoundingClientRect()));
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (wrapRef.current) setPos(computePosition(wrapRef.current.getBoundingClientRect()));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const menu = open && pos ? (
    <>
      <div className="currency-dropdown-scrim" onClick={() => setOpen(false)} />
      <div
        className="currency-dropdown-menu"
        style={{ top: pos.top, left: pos.left }}
      >
        {options.map(code => {
          const itemMeta = CURRENCY_META[code as CurrencyCode];
          const itemSymbol = itemMeta?.symbol ?? code;
          const label = lang === 'ar' ? itemMeta?.labelAr : itemMeta?.labelEn;
          return (
            <button
              key={code}
              type="button"
              className={`currency-dropdown-item ${code === value ? 'active' : ''}`}
              onClick={() => { setCurrency(code); setOpen(false); }}
            >
              <span className="currency-dropdown-item-symbol">{itemSymbol}</span>
              <div className="currency-dropdown-item-info">
                <strong>{code}</strong>
                <small>{label}</small>
              </div>
              {code === value && <Check size={14} />}
            </button>
          );
        })}
      </div>
    </>
  ) : null;

  return (
    <div className="currency-dropdown" ref={wrapRef} title={t('displayCurrency')}>
      <button
        type="button"
        className={`currency-dropdown-trigger ${open ? 'open' : ''}`}
        onClick={handleOpen}
        aria-label={`${t('displayCurrency')}: ${value}`}
        aria-expanded={open}
      >
        <span className="currency-dropdown-symbol">{symbol}</span>
        <span className="currency-dropdown-code">{value}</span>
        <ChevronDown size={12} />
      </button>
      {typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </div>
  );
}
