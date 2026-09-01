'use client';
import { useI18n } from '@/lib/i18n';

const dayMs = 86_400_000;

type Props = {
  date: string;
  startISO: string;
  endISO: string;
  periods: any[];
  onPick?: (time: string) => void;
};

type Block = 'open' | 'booked' | 'buffer' | 'selected' | 'past';

/** Hourly availability strip for one day: open / booked / turnaround buffer / selected. */
export function DayTimeline({ date, startISO, endISO, periods, onPick }: Props) {
  const { lang, t } = useI18n();
  const [year, month, day] = date.split('-').map(Number);
  const dayStart = new Date(year, month - 1, day).getTime();
  const dayEnd = dayStart + dayMs;
  const now = Date.now();

  const windows = (periods || []).map((period: any) => ({
    from: new Date(period.startsAt ?? period.blockedFrom).getTime(),
    until: new Date(period.endsAt ?? period.blockedUntil).getTime(),
    bufferFrom: new Date(period.blockedFrom || period.startsAt).getTime(),
    bufferUntil: new Date(period.blockedUntil || period.endsAt).getTime(),
  }));
  const selStart = new Date(startISO).getTime();
  const selEnd = new Date(endISO).getTime();

  const firstHour = 6;
  const lastHour = 23;
  const hourFormatter = new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-US', { hour: 'numeric' });

  const blocks = [];
  for (let hour = firstHour; hour <= lastHour; hour++) {
    const from = dayStart + hour * 3_600_000;
    const until = from + 3_600_000;
    if (from >= dayEnd) break;
    let state: Block = 'open';
    const booked = windows.some((w) => from < w.until && until > w.from);
    const buffered = windows.some((w) => from < w.bufferUntil && until > w.bufferFrom);
    if (booked) state = 'booked';
    else if (buffered) state = 'buffer';
    if (from < selEnd && until > selStart) state = 'selected';
    if (until < now) state = 'past';
    blocks.push({ hour, state });
  }

  const pick = (state: Block, hour: number) => {
    if (state !== 'open' || !onPick) return;
    onPick(`${String(hour).padStart(2, '0')}:00`);
  };

  return <div className="day-timeline">
    <header><strong>{t('dayTimelineTitle')}</strong><small>{t('partiallyBookedHint')}</small></header>
    <div className="day-timeline-track">
      {blocks.map(({ hour, state }) => (
        <button
          type="button"
          key={hour}
          disabled={state !== 'open'}
          className={`tl-block tl-${state}`}
          onClick={() => pick(state, hour)}
          aria-label={`${hour}:00`}
        >
          <span>{hourFormatter.format(new Date(dayStart + hour * 3_600_000))}</span>
        </button>
      ))}
    </div>
    <footer className="day-timeline-legend">
      <span><i className="open" />{t('open')}</span>
      <span><i className="booked" />{t('reserved')}</span>
      <span><i className="buffer" />{t('turnaround')}</span>
      <span><i className="selected" />{t('selected')}</span>
    </footer>
  </div>;
}
