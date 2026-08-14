'use client';
import { AlertTriangle, ArrowRight, Baby, BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, Minus, Plus, ShieldCheck, Tag, UserRound, Wifi } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AvailabilityCalendar } from './availability-calendar';
import { Modal, StatusBadge, useToast } from './ui';
import { api } from '@/lib/client-api';
import { dateTime, money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

const dayMs = 86_400_000;
const keyOf = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const localDate = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const combine = (key: string, time: string) => {
  const date = localDate(key);
  const [hours, minutes] = time.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
};
const addDays = (key: string, days: number) => {
  const date = localDate(key);
  date.setDate(date.getDate() + days);
  return keyOf(date);
};
const serviceIcons: Record<string, any> = { driver: UserRound, luggage: BriefcaseBusiness, 'child-seat': Baby, wifi: Wifi };

export function BookingModal({ vehicle, onClose }: { vehicle: any; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const tomorrow = new Date(Date.now() + dayMs);
  const [details, setDetails] = useState<any>(null);
  const [serviceCatalog, setServiceCatalog] = useState<any[]>([]);
  const [serviceDays, setServiceDays] = useState<Record<number, number>>({});
  const [type, setType] = useState<'hour' | 'day' | 'week' | 'month'>('day');
  const [quantity, setQuantity] = useState(3);
  const [startDate, setStartDate] = useState(keyOf(tomorrow));
  const [endDate, setEndDate] = useState(keyOf(new Date(tomorrow.getTime() + 2 * dayMs)));
  const [pickupTime, setPickupTime] = useState('10:00');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [code, setCode] = useState('');
  const [promo, setPromo] = useState<any>(null);
  const [conflict, setConflict] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (vehicle) Promise.all([api(`/vehicles/${vehicle.id}`), api(`/services?vehicleId=${vehicle.id}`)])
      .then(([vehicleData, serviceData]: any[]) => { setDetails(vehicleData); setServiceCatalog(serviceData.services); });
  }, [vehicle]);
  useEffect(() => setPromo(null), [type, quantity]);

  const rates: any = { hour: vehicle.hourlyRate, day: vehicle.dailyRate, week: vehicle.weeklyRate, month: vehicle.monthlyRate };
  const startsAt = useMemo(() => combine(startDate, pickupTime), [startDate, pickupTime]);
  const calculatedEnd = useMemo(() => {
    const value = new Date(startsAt);
    if (type === 'hour') value.setHours(value.getHours() + quantity);
    if (type === 'day') value.setDate(value.getDate() + quantity);
    if (type === 'week') value.setDate(value.getDate() + quantity * 7);
    if (type === 'month') value.setMonth(value.getMonth() + quantity);
    return value;
  }, [startsAt, type, quantity]);

  const availability = useMemo(() => {
    if (!details?.busyPeriods) return null;
    const startMs = startsAt.getTime();
    const containing = details.busyPeriods.find((period: any) =>
      startMs >= new Date(period.blockedFrom).getTime() && startMs < new Date(period.blockedUntil).getTime()
    );
    if (containing) return { unavailable: true, nextAvailableAt: new Date(periodEnd(containing) + 3_600_000) };
    const next = details.busyPeriods.find((period: any) => new Date(period.startsAt).getTime() > startMs);
    if (!next) return { unavailable: false, availableUntil: null, availableMs: null, days: null };
    const availableUntil = new Date(new Date(next.startsAt).getTime() - 3_600_000);
    const availableMs = Math.max(0, availableUntil.getTime() - startMs);
    return { unavailable: false, availableUntil, availableMs, days: Math.ceil(availableMs / dayMs), next };
  }, [details, startsAt]);

  // If a full rate period touches the next booking, shorten only by the protected one-hour turnaround.
  const returnAt = useMemo(() => {
    if (!availability?.availableUntil) return calculatedEnd;
    const difference = calculatedEnd.getTime() - availability.availableUntil.getTime();
    if (difference > 0 && difference <= 3_660_000) return availability.availableUntil;
    return calculatedEnd;
  }, [availability, calculatedEnd]);
  const subtotal = rates[type] * quantity;
  const rentalDays = Math.max(1, Math.ceil((returnAt.getTime() - startsAt.getTime()) / dayMs));
  const selectedServices = serviceCatalog.filter(service => serviceDays[service.id] > 0).map(service => ({
    ...service, days: Math.min(rentalDays, serviceDays[service.id]), lineTotal: service.dailyPrice * Math.min(rentalDays, serviceDays[service.id]),
  }));
  const servicesTotal = selectedServices.reduce((sum, service) => sum + service.lineTotal, 0);
  const proposalTotal = subtotal + servicesTotal - (promo?.discount || 0);
  const requestedConflict = availability?.unavailable ||
    (!!availability?.availableUntil && returnAt.getTime() > availability.availableUntil.getTime());

  const changeQuantity = (next: number) => {
    const value = Math.max(1, next);
    setQuantity(value);
    if (type === 'hour') setEndDate(startDate);
    if (type === 'day') setEndDate(addDays(startDate, value - 1));
    if (type === 'week') setEndDate(addDays(startDate, value * 7 - 1));
    if (type === 'month') {
      const end = localDate(startDate);
      end.setMonth(end.getMonth() + value);
      end.setDate(end.getDate() - 1);
      setEndDate(keyOf(end));
    }
  };
  const changeRate = (next: 'hour' | 'day' | 'week' | 'month') => {
    setType(next);
    const value = next === 'hour' ? 4 : next === 'day' ? 3 : 1;
    setQuantity(value);
    if (next === 'hour') setEndDate(startDate);
    if (next === 'day') setEndDate(addDays(startDate, value - 1));
    if (next === 'week') setEndDate(addDays(startDate, 6));
    if (next === 'month') {
      const end = localDate(startDate); end.setMonth(end.getMonth() + 1); end.setDate(end.getDate() - 1); setEndDate(keyOf(end));
    }
  };
  const onRangeChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setConflict(null);
    if (!end) return;
    const calendarDays = Math.round((localDate(end).getTime() - localDate(start).getTime()) / dayMs) + 1;
    if (type === 'hour') setQuantity(Math.max(1, calendarDays * 24));
    if (type === 'day') setQuantity(calendarDays);
    if (type === 'week') setQuantity(Math.max(1, Math.ceil(calendarDays / 7)));
    if (type === 'month') setQuantity(Math.max(1, Math.ceil(calendarDays / 30)));
  };

  const toggleService = (serviceId: number) => {
    setServiceDays(current => ({ ...current, [serviceId]: current[serviceId] ? 0 : Math.min(1, rentalDays) }));
  };
  const changeServiceDays = (serviceId: number, days: number) => {
    setServiceDays(current => ({ ...current, [serviceId]: Math.max(1, Math.min(rentalDays, days)) }));
  };

  const apply = async () => {
    try {
      const data: any = await api(`/promotions/validate?code=${encodeURIComponent(code)}&vehicleId=${vehicle.id}&base=${subtotal}&quantity=${quantity}`);
      setPromo(data); toast(t('promoApplied'));
    } catch (error: any) { setPromo(null); toast(error.message, true); }
  };
  const book = async () => {
    if (!endDate) return toast('Choose a start and end date from the availability calendar.', true);
    if (requestedConflict) return toast('The selected range reaches a reserved period. Choose an earlier return date.', true);
    setBusy(true); setConflict(null);
    try {
      await api('/rentals', { method: 'POST', body: JSON.stringify({
        vehicleId: vehicle.id, rateType: type, quantity,
        startsAt: startsAt.toISOString(), endsAt: returnAt.toISOString(), promoCode: promo?.promotion.code,
        services: selectedServices.map(service => ({ serviceId: service.id, days: service.days })),
      }) });
      toast('Rental proposal and PDF bill issued successfully');
      onClose(); router.push('/dashboard/rentals');
    } catch (error: any) {
      setConflict(error);
      toast(error.message, true);
    } finally { setBusy(false); }
  };

  return <Modal open={!!vehicle} onClose={onClose} title={t('bookTitle')} subtitle={`${vehicle.make} ${vehicle.model} · ${vehicle.companyName}`} wide>
    <div className="booking-modal enhanced-booking">
      <section>
        <img className="booking-image" src={vehicle.image} />
        <div className="booking-car-title"><div><span>{vehicle.category}</span><h3>{vehicle.make} {vehicle.model}</h3></div><strong>{money(rates[type])}<small>/{t(type)}</small></strong></div>
        <div className="turnaround-policy"><ShieldCheck /><div><strong>Protected vehicle turnaround</strong><span>FleetFlow keeps 1 hour between every two reservations for inspection, cleaning, maintenance, and fueling.</span></div></div>
        <div className="busy-periods"><h4><CalendarDays />{t('busyPeriods')}</h4><p>{t('busyHint')}</p>{details?.busyPeriods?.length ? <div>{details.busyPeriods.map((period: any) => <span key={period.id}>{dateTime(period.startsAt)} → {dateTime(period.endsAt)} <StatusBadge status={period.status} /></span>)}</div> : <small>No upcoming busy periods</small>}</div>
      </section>
      <section className="booking-fields">
        <label>{t('pickRate')}</label>
        <div className="rate-tabs">{(['hour', 'day', 'week', 'month'] as const).map(rate => <button type="button" className={type === rate ? 'active' : ''} onClick={() => changeRate(rate)} key={rate}>{t(rate)}<strong>{money(rates[rate])}</strong></button>)}</div>
        <label>Rental dates</label>
        <button type="button" className="date-range-trigger" onClick={() => setCalendarOpen(!calendarOpen)}>
          <CalendarDays /><span><small>Pick-up</small><strong>{startDate || 'Choose date'}</strong></span><ArrowRight /><span><small>Return date</small><strong>{endDate || 'Choose date'}</strong></span>
        </button>
        {calendarOpen && <AvailabilityCalendar busyPeriods={details?.busyPeriods || []} startDate={startDate} endDate={endDate} onChange={onRangeChange} onInvalid={(message) => toast(message, true)} />}
        <div className="form-grid compact-fields"><label>Pick-up time<input type="time" value={pickupTime} onChange={event => setPickupTime(event.target.value)} /></label><label>{t('quantity')}<input type="number" min="1" value={quantity} onChange={event => changeQuantity(Number(event.target.value))} /></label></div>
        {availability?.unavailable ? <div className="availability-warning danger"><AlertTriangle /><div><strong>Unavailable at the selected pick-up time</strong><span>Next ready after the protected turnaround: {dateTime(availability.nextAvailableAt!)}</span></div></div> : availability?.availableUntil ? <div className={`availability-warning ${requestedConflict ? 'danger' : ''}`}><Clock3 /><div><strong>{availability.days} calendar day{availability.days === 1 ? '' : 's'} open before the next reservation</strong><span>Vehicle must return by {dateTime(availability.availableUntil)} so the company receives its 1-hour service window.</span></div></div> : <div className="availability-warning success"><CheckCircle2 /><div><strong>Your selected window is open</strong><span>No later reservation currently limits this booking.</span></div></div>}
        <div className="return-box"><Clock3 /><span>{t('returnTime')}<strong>{dateTime(returnAt)}</strong>{returnAt.getTime() !== calculatedEnd.getTime() && <small>Adjusted by 1 hour for turnaround</small>}</span></div>
        {conflict?.code === 'RESERVATION_OVERLAP' && <div className="overlap-result"><AlertTriangle /><div><strong>Reservation overlap detected</strong><span>{conflict.message}</span>{conflict.availability?.availableUntil && <button type="button" onClick={() => { const limit = new Date(conflict.availability.availableUntil); onRangeChange(startDate, keyOf(new Date(limit.getTime() - dayMs))); setConflict(null); }}>Use available range ending {dateTime(conflict.availability.availableUntil)}</button>}</div></div>}
        <section className="booking-services"><header><div><span>Premium services</span><strong>Customize your trip</strong></div><small>You can adjust service days only</small></header><div>{serviceCatalog.map(service => { const Icon = serviceIcons[service.key] || Tag; const days = serviceDays[service.id] || 0; return <article className={days ? 'selected' : ''} key={service.id}><button type="button" className="service-select" onClick={() => toggleService(service.id)}><span><Icon /></span><div><strong>{service.name}</strong><small>{service.description}</small></div><em>{money(service.dailyPrice)}<small>/day</small></em></button>{days > 0 && <div className="service-days"><span>Number of days</span><div><button type="button" onClick={() => changeServiceDays(service.id, days - 1)} disabled={days <= 1}><Minus /></button><strong>{days}</strong><button type="button" onClick={() => changeServiceDays(service.id, days + 1)} disabled={days >= rentalDays}><Plus /></button></div><em>{money(service.dailyPrice * days)}</em></div>}</article>; })}</div></section>
        <label>{t('promoOptional')}<div className="promo-input"><Tag /><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="SUMMER20" /><button type="button" onClick={apply} disabled={!code}>{t('apply')}</button></div></label>
        {promo && <div className="promo-success"><CheckCircle2 /><span><strong>{promo.promotion.name}</strong>{t('promoApplied')}</span><em>−{money(promo.discount)}</em></div>}
        <div className="proposal-breakdown"><header><span>Rental proposal</span><small>A detailed PDF bill will be issued after confirmation</small></header><div><span>{vehicle.make} {vehicle.model} · {quantity} {t(type)}{quantity > 1 ? 's' : ''}</span><strong>{money(subtotal)}</strong></div>{selectedServices.map(service => <div key={service.id}><span>{service.name}<small>{service.days} day{service.days > 1 ? 's' : ''} × {money(service.dailyPrice)}</small></span><strong>{money(service.lineTotal)}</strong></div>)}{promo && <div className="discount"><span>{t('discount')} · {promo.promotion.code}</span><strong>−{money(promo.discount)}</strong></div>}<div className="grand-total"><span>{t('total')}</span><strong>{money(proposalTotal)}</strong></div></div>
        <button className="btn primary booking-submit" onClick={book} disabled={busy || requestedConflict || !endDate}>{busy ? t('loading') : <>{t('confirmBooking')}<ArrowRight /></>}</button>
      </section>
    </div>
  </Modal>;
}

function periodEnd(period: any) {
  return new Date(period.endsAt).getTime();
}
