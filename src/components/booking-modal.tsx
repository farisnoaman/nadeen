'use client';
import { AlertTriangle, ArrowRight, Award, Baby, BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, Copy, MapPin, Minus, Plus, ShieldCheck, Tag, UserRound, Wifi, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AvailabilityCalendar } from './availability-calendar';
import { Modal, StatusBadge, useToast } from './ui';
import { VehicleImageCarousel } from './vehicle-image-carousel';
import { api } from '@/lib/client-api';
import { dateTime } from '@/lib/format';
import { formatVehicleMoney } from '@/lib/currencies';
import { useCurrency } from '@/lib/currency-provider';
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
  const { t, lang } = useI18n();
  const { currency } = useCurrency();
  const toast = useToast();
  const router = useRouter();
  const tomorrow = new Date(Date.now() + dayMs);
  const [details, setDetails] = useState<any>(null);
  const [serviceCatalog, setServiceCatalog] = useState<any[]>([]);
  const [serviceDays, setServiceDays] = useState<Record<number, number>>({});
  const [protectionPackageId, setProtectionPackageId] = useState<number | string | null>(null);
  const [type, setType] = useState<'hour' | 'day' | 'week' | 'month'>('day');
  const [quantity, setQuantity] = useState(3);
  const [startDate, setStartDate] = useState(keyOf(tomorrow));
  const [endDate, setEndDate] = useState(keyOf(new Date(tomorrow.getTime() + 2 * dayMs)));
  const [pickupTime, setPickupTime] = useState('10:00');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [code, setCode] = useState('');
  const [pickupKey, setPickupKey] = useState('');
  const [returnSameAsPickup, setReturnSameAsPickup] = useState(true);
  const [returnCity, setReturnCity] = useState('');
  const [returnLocation, setReturnLocation] = useState('');
  const [appliedPromos, setAppliedPromos] = useState<any[]>([]);
  const [conflict, setConflict] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (vehicle) Promise.all([api(`/vehicles/${vehicle.id}`), api(`/services?vehicleId=${vehicle.id}`)])
      .then(([vehicleData, serviceData]: any[]) => {
        setDetails(vehicleData);
        const firstPickup = vehicleData.vehicle?.pickupLocations?.[0]
          || vehicle.pickupLocations?.[0]
          || { city: vehicleData.vehicle?.location || vehicle.location || '', site: vehicleData.vehicle?.location || vehicle.location || '' };
        setPickupKey(`${firstPickup.city}\u0000${firstPickup.site}`);
        setReturnSameAsPickup(true);
        setReturnCity(firstPickup.city);
        setReturnLocation(firstPickup.site);
        setServiceCatalog(serviceData.services);
        const firstPackage = (vehicleData.vehicle?.protectionPackages || []).find((item: any) => item.active !== false);
        setProtectionPackageId(firstPackage?.id || firstPackage?.tier || null);
      });
  }, [vehicle]);
  useEffect(() => setAppliedPromos([]), [type, quantity]);

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
    if (containing) return { unavailable: true, nextAvailableAt: new Date(containing.blockedUntil || periodEnd(containing) + 3_600_000) };
    const next = details.busyPeriods.find((period: any) => new Date(period.blockedFrom || period.startsAt).getTime() > startMs);
    if (!next) return { unavailable: false, availableUntil: null, availableMs: null, days: null };
    const availableUntil = new Date(next.blockedFrom || new Date(next.startsAt).getTime() - 3_600_000);
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
  const protectionPackages = (details?.vehicle?.protectionPackages || vehicle.protectionPackages || []).filter((item: any) => item.active);
  const selectedProtection = protectionPackages.find((item: any) => item.id === protectionPackageId || (!item.id && item.tier === protectionPackageId)) || protectionPackages[0];
  const protectionTotal = Number(selectedProtection?.dailyPrice || 0) * rentalDays;
  const loyalty = details?.loyalty?.enabled ? details.loyalty : null;
  const totalPromoDiscount = appliedPromos.reduce((sum: number, p: any) => sum + Number(p.discount || 0), 0);
  const loyaltyDiscount = loyalty ? Math.min(
    Math.max(0, subtotal - totalPromoDiscount),
    subtotal * Number(loyalty.currentLevel?.discountPercentage || 0) / 100,
  ) : 0;
  const proposalTotal = subtotal + servicesTotal + protectionTotal - totalPromoDiscount - loyaltyDiscount;
  const estimatedLoyaltyPoints = loyalty ? Math.max(0, Math.floor(proposalTotal * Number(loyalty.pointsPerCurrency || 0))) : 0;
  const pickupLocations = details?.vehicle?.pickupLocations || vehicle.pickupLocations || [];
  const selectedPickup = pickupLocations.find((location:any) => `${location.city}\u0000${location.site}` === pickupKey)
    || pickupLocations[0];
  useEffect(() => {
    if (!returnSameAsPickup || !selectedPickup) return;
    setReturnCity(selectedPickup.city);
    setReturnLocation(selectedPickup.site);
  }, [returnSameAsPickup, selectedPickup?.city, selectedPickup?.site]);
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
      if (appliedPromos.some((p: any) => p.promotion.code === data.promotion.code)) { toast(t('appliedPromotion')); return; }
      setAppliedPromos(prev => [...prev, data]); setCode(''); toast(t('promoApplied'));
    } catch (error: any) { toast(error.message, true); }
  };
  const togglePromo = async (promo: any) => {
    const existing = appliedPromos.find((p: any) => p.promotion.code === promo.code);
    if (existing) { setAppliedPromos(prev => prev.filter((p: any) => p.promotion.code !== promo.code)); return; }
    try {
      const data: any = await api(`/promotions/validate?code=${encodeURIComponent(promo.code)}&vehicleId=${vehicle.id}&base=${subtotal}&quantity=${quantity}`);
      setAppliedPromos(prev => [...prev, data]); toast(t('promoApplied'));
    } catch (error: any) { toast(error.message, true); }
  };
  const book = async () => {
    if (!endDate) return toast(t('chooseRange'), true);
    if (requestedConflict) return toast(t('rangeReserved'), true);
    setBusy(true); setConflict(null);
    try {
      await api('/rentals', { method: 'POST', body: JSON.stringify({
        vehicleId: vehicle.id, rateType: type, quantity,
        currency,
        startsAt: startsAt.toISOString(), endsAt: returnAt.toISOString(), promoCodes: appliedPromos.map((p: any) => p.promotion.code),
        protectionPackageId: selectedProtection?.id || null,
        protectionTier: selectedProtection?.tier || 'basic',
        pickupCity: selectedPickup?.city,
        pickupLocation: selectedPickup?.site,
        returnCity, returnLocation,
        services: selectedServices.map(service => ({ serviceId: service.id, days: service.days })),
      }) });
      toast(t('bookingSent'));
      onClose(); router.push('/dashboard/rentals');
    } catch (error: any) {
      setConflict(error);
      toast(error.message, true);
    } finally { setBusy(false); }
  };

  return <Modal open={!!vehicle} onClose={onClose} title={t('bookTitle')} subtitle={`${vehicle.make} ${vehicle.model} · ${vehicle.companyName}`} wide>
    <div className="booking-modal enhanced-booking">
      <section>
        <VehicleImageCarousel className="booking-image" image={vehicle.image} images={vehicle.images} variant="modal" alt={`${vehicle.make} ${vehicle.model}`} />
        <div className="booking-car-title"><div><span>{t(vehicle.category)}</span><h3>{vehicle.make} {vehicle.model}</h3></div><strong>{formatVehicleMoney(rates[type], vehicle.companyCurrency, currency, lang)}<small>/{t(type)}</small></strong></div>
        <div className="turnaround-policy"><ShieldCheck /><div><strong>{t('protectedTurnaround')}</strong><span>{t('protectedTurnaroundText')}</span></div></div>
        <div className="busy-periods"><h4><CalendarDays />{t('busyPeriods')}</h4><p>{t('busyHint')}</p>{details?.busyPeriods?.length ? <div>{details.busyPeriods.map((period: any, index: number) => <span key={`${period.id}-${period.startsAt}-${period.endsAt}-${index}`}>{dateTime(period.startsAt)} → {dateTime(period.endsAt)} <StatusBadge status={period.status} /></span>)}</div> : <small>{t('noBusyPeriods')}</small>}</div>
        <div className="desktop-booking-summary">
          <div className="booking-odometer-ack"><ShieldCheck /><div><small>{t('quotationOdometerNotice')}</small><strong>{t('pickupOdometerFinalized')}</strong><p>{t('pickupSignatureRequired')}</p></div></div>
          {loyalty&&<section className={`booking-loyalty loyalty-rank-${loyalty.currentLevel?.rank||0}`}><span><Award /></span><div><small>{t('yourLoyaltyLevel')}</small><strong>{loyalty.currentLevel?.name} · {Number(loyalty.points).toLocaleString()} {t('points')}</strong><p>{loyalty.currentLevel?.discountPercentage>0?t('loyaltyDiscountAppliedText').replace('{discount}',String(loyalty.currentLevel.discountPercentage)):t('earnPointsThisRental')} · <b>+{estimatedLoyaltyPoints} {t('estimatedPoints')}</b></p>{loyalty.nextLevel&&<em><i style={{width:`${loyalty.progress}%`}} />{Number(loyalty.pointsToNext).toLocaleString()} {t('pointsTo')} {loyalty.nextLevel.name}</em>}</div><aside><strong>{loyalty.currentLevel?.discountPercentage||0}%</strong><small>{t('automaticDiscount')}</small></aside></section>}
          <div className="protection-contract-facts"><span><small>{t('dailyKilometerAllowance')}</small><strong>{Number(details?.vehicle?.dailyKilometerAllowance || vehicle.dailyKilometerAllowance || 0).toLocaleString()} {t('kilometers')}</strong></span><span><small>{t('allowedKilometers')}</small><strong>{((details?.vehicle?.dailyKilometerAllowance || vehicle.dailyKilometerAllowance || 0) * rentalDays).toLocaleString()} {t('kilometers')}</strong></span><span><small>{t('excessKilometerRate')}</small><strong>{formatVehicleMoney(details?.vehicle?.excessKilometerRate || vehicle.excessKilometerRate || 0, vehicle.companyCurrency, currency, lang)}/{t('kilometers')}</strong></span><span><small>{t('fuelPolicy')}</small><strong>{t(details?.vehicle?.fuelPolicy || vehicle.fuelPolicy || 'same_to_same')}</strong></span></div>
        </div>
      </section>
      <section className="booking-fields">
        <label>{t('pickRate')}</label>
        <div className="rate-tabs">{(['hour', 'day', 'week', 'month'] as const).map(rate => <button type="button" className={type === rate ? 'active' : ''} onClick={() => changeRate(rate)} key={rate}>{t(rate)}<strong>{formatVehicleMoney(rates[rate], vehicle.companyCurrency, currency, lang)}</strong></button>)}</div>
        <label>{t('rentalDates')}</label>
        <button type="button" className="date-range-trigger" onClick={() => setCalendarOpen(!calendarOpen)}>
          <CalendarDays /><span><small>{t('pickup')}</small><strong>{startDate || t('chooseDate')}</strong></span><ArrowRight /><span><small>{t('returnDate')}</small><strong>{endDate || t('chooseDate')}</strong></span>
        </button>
        {calendarOpen && <AvailabilityCalendar busyPeriods={details?.busyPeriods || []} startDate={startDate} endDate={endDate} onChange={onRangeChange} onInvalid={(message) => toast(message, true)} />}
        <div className="form-grid compact-fields"><label>{t('pickupTime')}<input type="time" value={pickupTime} onChange={event => setPickupTime(event.target.value)} /></label><label>{t('quantity')}<input type="number" min="1" value={quantity} onChange={event => changeQuantity(Number(event.target.value))} /></label></div>
        {availability?.unavailable ? <div className="availability-warning danger"><AlertTriangle /><div><strong>{t('unavailableTime')}</strong><span>{t('nextReady')} {dateTime(availability.nextAvailableAt!)}</span></div></div> : availability?.availableUntil ? <div className={`availability-warning ${requestedConflict ? 'danger' : ''}`}><Clock3 /><div><strong>{availability.days} {t('calendarDaysOpen')}</strong><span>{t('mustReturnBy')} {dateTime(availability.availableUntil)} {t('serviceWindow')}</span></div></div> : <div className="availability-warning success"><CheckCircle2 /><div><strong>{t('windowOpen')}</strong><span>{t('noLaterReservation')}</span></div></div>}
        <div className="return-box"><Clock3 /><span>{t('returnTime')}<strong>{dateTime(returnAt)}</strong>{returnAt.getTime() !== calculatedEnd.getTime() && <small>{t('adjustedTurnaround')}</small>}</span></div>
        <div className="booking-contract-inputs">
          <label className="span-2">{t('pickupSite')}<div className="telemetry-input"><MapPin /><select required value={pickupKey} onChange={event => setPickupKey(event.target.value)}>{pickupLocations.map((location:any) => <option key={`${location.city}-${location.site}`} value={`${location.city}\u0000${location.site}`}>{location.city} — {location.site}</option>)}</select></div><small>{t('pickupSiteHint')}</small></label>
          <label className="same-return-site span-2"><input type="checkbox" checked={returnSameAsPickup} onChange={event => setReturnSameAsPickup(event.target.checked)} /><span><strong>{t('returnSameAsPickup')}</strong><small>{t('returnSameAsPickupHint')}</small></span></label>
          <label>{t('returnCity')}<div className="telemetry-input"><MapPin /><input required disabled={returnSameAsPickup} maxLength={80} value={returnCity} onChange={event => setReturnCity(event.target.value)} placeholder={t('returnCityPlaceholder')} /></div></label>
          <label>{t('returnSite')}<div className="telemetry-input"><MapPin /><input required disabled={returnSameAsPickup} maxLength={120} value={returnLocation} onChange={event => setReturnLocation(event.target.value)} placeholder={t('returnSitePlaceholder')} /></div><small>{returnSameAsPickup ? t('returnSameAsPickupConfirmed') : t('returnSiteHint')}</small></label>
          <div className="booking-odometer-ack span-2"><ShieldCheck /><div><small>{t('quotationOdometerNotice')}</small><strong>{t('pickupOdometerFinalized')}</strong><p>{t('pickupSignatureRequired')}</p></div></div>
        </div>
        {conflict?.code === 'RESERVATION_OVERLAP' && <div className="overlap-result"><AlertTriangle /><div><strong>{t('overlapDetected')}</strong><span>{conflict.message}</span>{conflict.availability?.availableUntil && <button type="button" onClick={() => { const limit = new Date(conflict.availability.availableUntil); onRangeChange(startDate, keyOf(new Date(limit.getTime() - dayMs))); setConflict(null); }}>{t('useAvailableRange')} {dateTime(conflict.availability.availableUntil)}</button>}</div></div>}
        {loyalty&&<section className={`booking-loyalty loyalty-rank-${loyalty.currentLevel?.rank||0}`}><span><Award /></span><div><small>{t('yourLoyaltyLevel')}</small><strong>{loyalty.currentLevel?.name} · {Number(loyalty.points).toLocaleString()} {t('points')}</strong><p>{loyalty.currentLevel?.discountPercentage>0?t('loyaltyDiscountAppliedText').replace('{discount}',String(loyalty.currentLevel.discountPercentage)):t('earnPointsThisRental')} · <b>+{estimatedLoyaltyPoints} {t('estimatedPoints')}</b></p>{loyalty.nextLevel&&<em><i style={{width:`${loyalty.progress}%`}} />{Number(loyalty.pointsToNext).toLocaleString()} {t('pointsTo')} {loyalty.nextLevel.name}</em>}</div><aside><strong>{loyalty.currentLevel?.discountPercentage||0}%</strong><small>{t('automaticDiscount')}</small></aside></section>}
        <section className="protection-picker"><header><div><span><ShieldCheck />{t('rentalProtection')}</span><small>{t('ksaProtectionDisclosure')}</small></div><em>{t(vehicle.insuranceCoverage || details?.vehicle?.insuranceCoverage || 'third_party')}</em></header><div>{protectionPackages.map((item: any) => <button type="button" key={item.id || item.tier} className={(item.id ? selectedProtection?.id === item.id : selectedProtection?.tier === item.tier) ? 'active' : ''} onClick={() => setProtectionPackageId(item.id || item.tier)}><span><strong>{item.name || t(`protection_${item.tier}`)}</strong><small>{t(`protection_${item.tier}`)} · {item.coverage.map((code: string) => t(`coverage_${code}`)).join(' · ')}</small></span><span><strong>{item.dailyPrice > 0 ? formatVehicleMoney(item.dailyPrice, vehicle.companyCurrency, currency, lang) : t('included')}</strong><small>{t('deductible')}: {formatVehicleMoney(item.deductible, vehicle.companyCurrency, currency, lang)}</small></span></button>)}</div></section>        <div className="protection-contract-facts"><span><small>{t('dailyKilometerAllowance')}</small><strong>{Number(details?.vehicle?.dailyKilometerAllowance || vehicle.dailyKilometerAllowance || 0).toLocaleString()} {t('kilometers')}</strong></span><span><small>{t('allowedKilometers')}</small><strong>{((details?.vehicle?.dailyKilometerAllowance || vehicle.dailyKilometerAllowance || 0) * rentalDays).toLocaleString()} {t('kilometers')}</strong></span><span><small>{t('excessKilometerRate')}</small><strong>{formatVehicleMoney(details?.vehicle?.excessKilometerRate || vehicle.excessKilometerRate || 0, vehicle.companyCurrency, currency, lang)}/{t('kilometers')}</strong></span><span><small>{t('fuelPolicy')}</small><strong>{t(details?.vehicle?.fuelPolicy || vehicle.fuelPolicy || 'same_to_same')}</strong></span></div>
        {(details?.promotions || []).filter((p: any) => p && typeof p.value === 'number' && p.value > 0).length > 0 && (
          <section className="booking-promotions"><header><div><span><Zap />{t('availablePromotionsTitle')}</span></div></header><div className="booking-promotions-list">{(details?.promotions || []).filter((p: any) => p && typeof p.value === 'number' && p.value > 0).map((promo: any) => {
            const discount = promo.type === 'percent'
              ? `${t('discountPercent').replace('%s', String(promo.value))} · ${t('percentage')}`
              : `${t('discountFixed').replace('%s', formatVehicleMoney(promo.value, vehicle.companyCurrency, currency, lang))} · ${t('fixed')}`;
            const isApplied = appliedPromos.some((p: any) => p.promotion.code === promo.code);
            return <article key={promo.id || promo.code} className={`booking-promo-row ${isApplied ? 'applied' : ''}`}>
              <span className="booking-promo-discount"><Zap />{discount}</span>
              <span className="booking-promo-code">{promo.code}</span>
              <button type="button" className={`btn ${isApplied ? 'applied' : 'primary'} small`} onClick={() => togglePromo(promo)}>{isApplied ? t('appliedPromotion') : t('applyPromotion')}</button>
            </article>;
          })}</div></section>
        )}
        <section className="booking-services"><header><div><span>{t('premiumServices')}</span><strong>{t('customizeTrip')}</strong></div><small>{t('renterDaysOnly')}</small></header><div>{serviceCatalog.map(service => { const Icon = serviceIcons[service.key] || Tag; const days = serviceDays[service.id] || 0; return <article className={days ? 'selected' : ''} key={service.id}><button type="button" className="service-select" onClick={() => toggleService(service.id)}><span><Icon /></span><div><strong>{t(service.name)}</strong><small>{t(service.key === 'child-seat' ? 'childSeatDescription' : `${service.key}Description`)}</small></div><em>{formatVehicleMoney(service.dailyPrice, vehicle.companyCurrency, currency, lang)}<small>/{t('day')}</small></em></button>{days > 0 && <div className="service-days"><span>{t('numberDays')}</span><div><button type="button" onClick={() => changeServiceDays(service.id, days - 1)} disabled={days <= 1}><Minus /></button><strong>{days}</strong><button type="button" onClick={() => changeServiceDays(service.id, days + 1)} disabled={days >= rentalDays}><Plus /></button></div><em>{formatVehicleMoney(service.dailyPrice * days, vehicle.companyCurrency, currency, lang)}</em></div>}</article>; })}</div></section>
        <label>{t('promoOptional')}<div className="promo-input"><Tag /><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="SUMMER20" /><button type="button" onClick={apply} disabled={!code}>{t('apply')}</button></div></label>
        {appliedPromos.length > 0 && <div className="promo-success"><CheckCircle2 /><span><strong>{appliedPromos.map((p: any) => p.promotion.code).join(', ')}</strong>{t('promoApplied')}</span><em>−{formatVehicleMoney(totalPromoDiscount, vehicle.companyCurrency, currency, lang)}</em></div>}
        <div className="proposal-breakdown"><header><span>{t('rentalProposal')}</span><small>{t('pdfAfterConfirmation')}</small></header><div><span>{vehicle.make} {vehicle.model} · {quantity} {t(type)}{quantity > 1 ? 's' : ''}</span><strong>{formatVehicleMoney(subtotal, vehicle.companyCurrency, currency, lang)}</strong></div>{selectedProtection && <div><span>{selectedProtection.name || t(`protection_${selectedProtection.tier}`)}<small>{rentalDays} {t(rentalDays > 1 ? 'days' : 'day')} × {formatVehicleMoney(selectedProtection.dailyPrice, vehicle.companyCurrency, currency, lang)}</small></span><strong>{formatVehicleMoney(protectionTotal, vehicle.companyCurrency, currency, lang)}</strong></div>}{selectedServices.map(service => <div key={service.id}><span>{t(service.name)}<small>{service.days} {t(service.days > 1 ? 'days' : 'day')} × {formatVehicleMoney(service.dailyPrice, vehicle.companyCurrency, currency, lang)}</small></span><strong>{formatVehicleMoney(service.lineTotal, vehicle.companyCurrency, currency, lang)}</strong></div>)}{appliedPromos.map((p: any) => <div className="discount" key={p.promotion.code}><span>{t('discount')} · {p.promotion.code}<small>{p.promotion.type === 'percent' ? `${p.promotion.value}% (${t('percentage')})` : `${t('fixed')}`}</small></span><strong>−{formatVehicleMoney(p.discount, vehicle.companyCurrency, currency, lang)}</strong></div>)}{loyalty&&loyaltyDiscount>0&&<div className="discount loyalty-discount"><span>{t('loyaltyDiscount')} · {loyalty.currentLevel.name}<small>{loyalty.currentLevel.discountPercentage}% · {t('estimatedPointsEarned')}: +{estimatedLoyaltyPoints}</small></span><strong>−{formatVehicleMoney(loyaltyDiscount, vehicle.companyCurrency, currency, lang)}</strong></div>}<div className="grand-total"><span>{t('total')}</span><strong>{formatVehicleMoney(proposalTotal, vehicle.companyCurrency, currency, lang)}</strong></div></div>
        <button className="btn primary booking-submit" onClick={book} disabled={busy || requestedConflict || !endDate || !selectedPickup || returnCity.trim().length < 2 || returnLocation.trim().length < 2}>{busy ? t('loading') : <>{t('confirmBooking')}<ArrowRight /></>}</button>
      </section>
    </div>
  </Modal>;
}

function periodEnd(period: any) {
  return new Date(period.endsAt).getTime();
}
