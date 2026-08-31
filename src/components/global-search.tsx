'use client';

import {
  ArrowUpRight,
  BadgePercent,
  CalendarDays,
  CarFront,
  ClipboardList,
  Gauge,
  LoaderCircle,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

type SearchKind = 'vehicle' | 'rental' | 'maintenance' | 'maintenance_item' | 'insurance' | 'kilometer_policy' | 'promotion' | 'service' | 'support';
type SearchResult = {
  id: number;
  kind: SearchKind;
  code: string;
  title: string;
  subtitle: string;
  href: string;
  status?: string;
  amount?: number;
  amountType?: 'total' | 'cost' | 'perDay' | 'perKm' | 'discount';
  image?: string;
};

type SearchResponse = {
  results: SearchResult[];
  total: number;
};

const resultIcons = {
  vehicle: CarFront,
  rental: CalendarDays,
  maintenance: Wrench,
  maintenance_item: ClipboardList,
  insurance: ShieldCheck,
  kilometer_policy: Gauge,
  promotion: BadgePercent,
  service: Sparkles,
  support: MessageCircle,
};

const resultLabels: Record<SearchKind, string> = {
  vehicle: 'vehicle',
  rental: 'reservation',
  maintenance: 'maintenance',
  maintenance_item: 'maintenanceCatalog',
  insurance: 'insurancePackages',
  kilometer_policy: 'kilometerPolicies',
  promotion: 'promotion',
  service: 'premiumService',
  support: 'support',
};

export function GlobalSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (event.key === 'Escape' && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [open]);

  useEffect(() => {
    const activeResult = results[selected];
    if (open && activeResult) document.getElementById(`global-search-result-${activeResult.kind}-${activeResult.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected, results, open]);

  useEffect(() => {
    const trimmed = query.trim();
    setSelected(0);
    setFailed(false);
    if (!trimmed) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      api<SearchResponse>(`/search?q=${encodeURIComponent(trimmed)}&limit=18`, { signal: controller.signal })
        .then(data => {
          setResults(data.results);
          setTotal(data.total);
        })
        .catch(error => {
          if (error?.name !== 'AbortError') {
            setResults([]);
            setTotal(0);
            setFailed(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const openResult = (result: SearchResult) => {
    setOpen(false);
    inputRef.current?.blur();
    router.push(result.href);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected(current => results.length ? (current + 1) % results.length : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(current => results.length ? (current - 1 + results.length) % results.length : 0);
    } else if (event.key === 'Enter' && results[selected]) {
      event.preventDefault();
      openResult(results[selected]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const statusLabel = (result: SearchResult) => {
    if (!result.status) return null;
    if (result.kind === 'maintenance') return t(`maintenanceStatus_${result.status}`);
    if (result.kind === 'support') return t({ open: 'supportStatusOpen', waiting: 'supportStatusWaiting', resolved: 'supportStatusResolved' }[result.status] || result.status);
    return t(result.status);
  };

  const amountLabel = (result: SearchResult) => {
    if (result.amount === undefined) return null;
    if (result.amountType === 'perDay') return `${money(result.amount)}/${t('day')}`;
    if (result.amountType === 'perKm') return `${money(result.amount)}/${t('kilometers')}`;
    if (result.amountType === 'discount') return `${money(result.amount)} ${t('off')}`;
    return money(result.amount);
  };

  return (
    <div className={`global-search ${open ? 'open' : ''}`}>
      {open && <button type="button" className="global-search-scrim" onClick={() => setOpen(false)} aria-label={t('close')} />}
      <label className="global-search-input" htmlFor="fleetflow-global-search" onClick={() => { if (!open) { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); } }}>
        <Search />
        <input
          ref={inputRef}
          id="fleetflow-global-search"
          type="search"
          autoComplete="off"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={event => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={t('globalSearchPlaceholder')}
          aria-label={t('globalSearch')}
          role="combobox"
          aria-autocomplete="list"
          aria-controls="fleetflow-search-results"
          aria-expanded={open}
          aria-activedescendant={results[selected] ? `global-search-result-${results[selected].kind}-${results[selected].id}` : undefined}
        />
        {loading ? <LoaderCircle className="global-search-spinner" /> : query ? (
          <button type="button" onClick={event => { event.preventDefault(); setQuery(''); inputRef.current?.focus(); }} aria-label={t('globalSearchClear')}><X /></button>
        ) : <kbd>⌘ K</kbd>}
      </label>

      {open && (
        <section className="global-search-panel" aria-label={t('globalSearchResults')}>
          <header>
            <div><Search /><span><strong>{t('globalSearch')}</strong><small>{query.trim() ? t('globalSearchAcross') : t('globalSearchHint')}</small></span></div>
            {query.trim() && !loading && <em>{total} {t('globalSearchMatches')}</em>}
          </header>

          <div className="global-search-results" id="fleetflow-search-results" role={query.trim() && !loading && results.length ? 'listbox' : undefined} aria-live="polite">
            {!query.trim() ? (
              <div className="global-search-welcome">
                <span><Search /></span>
                <strong>{t('globalSearchEverything')}</strong>
                <p>{t('globalSearchHelp')}</p>
                <div>
                  <small><CarFront />{t('vehicle')}</small>
                  <small><CalendarDays />{t('reservation')}</small>
                  <small><Wrench />{t('maintenance')}</small>
                  <small><BadgePercent />{t('promotions')}</small>
                  <small><Sparkles />{t('premiumServices')}</small>
                  <small><MessageCircle />{t('support')}</small>
                </div>
              </div>
            ) : loading ? (
              <div className="global-search-loading">{[1, 2, 3, 4].map(item => <span key={item}><i /><b /><small /></span>)}</div>
            ) : failed ? (
              <div className="global-search-empty"><Search /><strong>{t('globalSearchUnavailable')}</strong><span>{t('globalSearchTryAgain')}</span></div>
            ) : results.length ? results.map((result, index) => {
              const Icon = resultIcons[result.kind];
              const amount = amountLabel(result);
              const status = statusLabel(result);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === index}
                  id={`global-search-result-${result.kind}-${result.id}`}
                  className={selected === index ? 'selected' : ''}
                  key={`${result.kind}-${result.id}`}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => openResult(result)}
                >
                  {result.image ? <img src={result.image} alt="" /> : <span className={`global-search-result-icon ${result.kind}`}><Icon /></span>}
                  <span className="global-search-result-copy">
                    <span><em>{t(resultLabels[result.kind])}</em><code>{result.code}</code>{status && <i>{status}</i>}</span>
                    <strong>{t(result.title)}</strong>
                    <small>{t(result.subtitle)}</small>
                  </span>
                  <span className="global-search-result-meta">{amount && <><small>{t(`globalSearchAmount_${result.amountType}`)}</small><strong>{amount}</strong></>}<ArrowUpRight /></span>
                </button>
              );
            }) : (
              <div className="global-search-empty"><Search /><strong>{t('globalSearchNoResults')}</strong><span>{t('globalSearchNoResultsText')}</span></div>
            )}
          </div>

          <footer>
            <span><kbd>↑</kbd><kbd>↓</kbd>{t('globalSearchNavigate')}</span>
            <span><kbd>↵</kbd>{t('globalSearchOpen')}</span>
            <span><kbd>Esc</kbd>{t('close')}</span>
          </footer>
        </section>
      )}
    </div>
  );
}
