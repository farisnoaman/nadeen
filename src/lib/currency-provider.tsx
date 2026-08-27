'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/client-api';

type CurrencyContextValue = {
  currency: string;
  setCurrency: (next: string) => void;
};

const CurrencyContext = createContext<CurrencyContextValue>({ currency: 'USD', setCurrency: () => {} });

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function cookieAttributes() {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? ';samesite=none;secure;partitioned' : ';samesite=lax';
  return `;path=/;max-age=31536000${secure}`;
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setState] = useState<string>(() => readCookie('ff_currency') || 'USD');

  useEffect(() => {
    document.documentElement.setAttribute('data-currency', currency);
  }, [currency]);

  const setCurrency = (next: string) => {
    document.cookie = `ff_currency=${next}${cookieAttributes()}`;
    setState(next);
    if (typeof location !== 'undefined' && location.pathname.startsWith('/dashboard')) {
      api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'preferences', currency: next }),
      }).catch(() => undefined);
    }
  };

  return <CurrencyContext.Provider value={{ currency, setCurrency }}>{children}</CurrencyContext.Provider>;
}

export const useCurrency = () => useContext(CurrencyContext);
