'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, MapPin } from 'lucide-react';

export function CitySearch({
  cities,
  value,
  onChange,
  allLabel,
  placeholder,
}: {
  cities: string[];
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAll = value === 'All';
  const displayText = isAll ? allLabel : value;

  const filtered = useMemo(() => {
    if (!search.trim()) return cities;
    const q = search.toLowerCase();
    return cities.filter(c => c.toLowerCase().includes(q));
  }, [cities, search]);

  const computePosition = () => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 8;
    const menuW = rect.width;
    let left = rect.left;
    if (left + menuW > vw - margin) left = vw - menuW - margin;
    if (left < margin) left = margin;
    setPos({ top: rect.bottom + 4, left, width: menuW });
  };

  const handleOpen = () => {
    if (open) return;
    setSearch('');
    setOpen(true);
    computePosition();
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    const repos = () => computePosition();
    window.addEventListener('scroll', repos, true);
    window.addEventListener('resize', repos);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', repos, true);
      window.removeEventListener('resize', repos);
    };
  }, [open]);

  useEffect(() => {
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, []);

  const select = (v: string) => { onChange(v); setOpen(false); };

  const menu = open && pos ? (
    <>
      <div className="cs-scrim" onMouseDown={() => setOpen(false)} />
      <div className="cs-menu" style={{ top: pos.top, left: pos.left, width: pos.width }}>
        <button
          type="button"
          className={`cs-item ${isAll ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); select('All'); }}
        >
          <span className="cs-item-icon"><MapPin size={14} /></span>
          <div className="cs-item-info"><strong>{allLabel}</strong><small>{cities.length} cities</small></div>
          {isAll && <Check size={14} />}
        </button>
        {filtered.map(city => (
          <button
            key={city}
            type="button"
            className={`cs-item ${city === value ? 'active' : ''}`}
            onMouseDown={e => { e.preventDefault(); select(city); }}
          >
            <span className="cs-item-icon"><MapPin size={14} /></span>
            <div className="cs-item-info"><strong>{city}</strong></div>
            {city === value && <Check size={14} />}
          </button>
        ))}
        {filtered.length === 0 && <div className="cs-empty">No cities found</div>}
      </div>
    </>
  ) : null;

  return (
    <div className={`cs-wrap ${open ? 'open' : ''}`} ref={wrapRef}>
      {open ? (
        <div className="cs-input-row">
          <input
            ref={inputRef}
            type="text"
            className="cs-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={placeholder || 'Search city...'}
            onKeyDown={e => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && filtered.length === 1) select(filtered[0]);
            }}
            onBlur={() => {
              closeTimer.current = setTimeout(() => setOpen(false), 150);
            }}
          />
          <ChevronDown size={12} className="cs-chevron" />
        </div>
      ) : (
        <div className="cs-display" onClick={handleOpen}>
          <span className="cs-display-text">{displayText}</span>
          <ChevronDown size={12} className="cs-chevron" />
        </div>
      )}
      {typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </div>
  );
}
