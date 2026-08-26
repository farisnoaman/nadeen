'use client';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';

type Period = {
  startsAt: string;
  endsAt: string;
  blockedFrom?: string;
  blockedUntil?: string;
  status: string;
};

type Props = {
  busyPeriods: Period[];
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  onInvalid?: (message: string) => void;
};

const dayMs = 86_400_000;
const keyOf = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const localDate = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const addDays = (date: Date, count: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);

export function AvailabilityCalendar({ busyPeriods, startDate, endDate, onChange, onInvalid }: Props) {
  const { lang, t } = useI18n();
  const initial = startDate ? localDate(startDate) : new Date();
  const [cursor, setCursor] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const months = useMemo(() => [cursor, new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)], [cursor]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stateFor = (date: Date) => {
    const dayStart = date.getTime();
    const dayEnd = dayStart + dayMs;
    const reserved = busyPeriods.some((period) =>
      dayStart < new Date(period.endsAt).getTime() && dayEnd > new Date(period.startsAt).getTime()
    );
    const turnaround = !reserved && busyPeriods.some((period) => {
      const from = new Date(period.blockedFrom || period.startsAt).getTime();
      const until = new Date(period.blockedUntil || period.endsAt).getTime();
      return dayStart < until && dayEnd > from;
    });
    return { reserved, turnaround, past: dayStart < today.getTime() };
  };

  const select = (date: Date) => {
    const state = stateFor(date);
    if (state.past || state.reserved) return;
    const key = keyOf(date);
    if (!startDate || endDate || key < startDate) {
      onChange(key, '');
      return;
    }
    let walker = localDate(startDate);
    while (walker <= date) {
      if (stateFor(walker).reserved) {
        onInvalid?.(t('rangeCrossesReservation'));
        return;
      }
      walker = addDays(walker, 1);
    }
    onChange(startDate, key);
  };

  const renderMonth = (month: Date) => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let day = 1; day <= count; day++) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
    while (cells.length % 7) cells.push(null);
    const week = lang === 'ar' ? ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    return <section className="calendar-month" key={month.toISOString()}>
      <h4>{new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-US', { month: 'long', year: 'numeric' }).format(month)}</h4>
      <div className="weekdays">{week.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="calendar-days">{cells.map((date, index) => {
        if (!date) return <span className="blank" key={`blank-${index}`} />;
        const key = keyOf(date);
        const state = stateFor(date);
        const selected = key === startDate || key === endDate;
        const inRange = !!startDate && !!endDate && key > startDate && key < endDate;
        return <button type="button" key={key} disabled={state.past || state.reserved}
          className={`${selected ? 'selected' : ''} ${inRange ? 'in-range' : ''} ${state.reserved ? 'reserved' : ''} ${state.turnaround ? 'turnaround' : ''}`}
          onClick={() => select(date)} aria-label={key}>
          <span>{date.getDate()}</span>{state.turnaround && <i />}
        </button>;
      })}</div>
    </section>;
  };

  return <div className="availability-calendar">
    <header>
      <div><CalendarDays /><span><strong>{t('calendarSelectDates')}</strong><small>{t('calendarReservedHint')}</small></span></div>
      <div><button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft /></button><button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight /></button></div>
    </header>
    <div className="calendar-months">{months.map(renderMonth)}</div>
    <footer className="calendar-legend">
      <span><i className="open" />{t('open')}</span>
      <span><i className="selected" />{t('selected')}</span>
      <span><i className="reserved" />{t('reserved')}</span>
      <span><i className="buffer" /><Clock3 />{t('turnaround')}</span>
    </footer>
  </div>;
}
