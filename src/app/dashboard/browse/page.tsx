'use client';
import Link from 'next/link';
import { CarFront, Eye, Fuel, Gauge, Heart, MapPin, Search, SlidersHorizontal, Star, UserRound, X, Zap } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { VehicleImageCarousel } from '@/components/vehicle-image-carousel';
import { Empty, Skeleton } from '@/components/ui';
import { BookingModal } from '@/components/booking-modal';
import { api } from '@/lib/client-api';
import { money } from '@/lib/format';
import { formatVehicleMoney } from '@/lib/currencies';
import { useCurrency } from '@/lib/currency-provider';
import { useI18n } from '@/lib/i18n';

type Rate = 'hour' | 'day' | 'week' | 'month';
type Filters = {
  city: string; make: string; model: string; trim: string; fuel: string; bodyType: string;
  gearbox: string; drivetrain: string; steeringType: string; color: string;
  yearFrom: string; yearTo: string; priceMin: string; priceMax: string;
};
const emptyFilters: Filters = { city:'All', make:'All', model:'All', trim:'All', fuel:'All', bodyType:'All', gearbox:'All', drivetrain:'All', steeringType:'All', color:'All', yearFrom:'', yearTo:'', priceMin:'', priceMax:'' };
const fields: Record<Rate, string> = { hour:'hourlyRate', day:'dailyRate', week:'weeklyRate', month:'monthlyRate' };
const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b));

export default function BrowsePage() {
  const { t, lang } = useI18n();
  const { currency } = useCurrency();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedPromotion = searchParams.get('promotion');
  const requestedCompany = Number(searchParams.get('company'));
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('price');
  const [rate, setRate] = useState<Rate>('day');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [booking, setBooking] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  useEffect(() => {
    api('/vehicles').then((data:any) => setVehicles(data.vehicles)).finally(() => setLoading(false));
    api('/auth/me?optional=1').then((data:any) => {
      setAccount(data.user);
      if (data.user?.role === 'renter') {
        api('/favorites').then((fav:any) => setFavorites(new Set<number>(fav.ids))).catch(() => undefined);
      }
    }).catch(() => undefined);
  }, []);

  const toggleFavorite = async (id: number, e?: React.MouseEvent) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    if (!account || account.role !== 'renter') {
      router.push(`/login?role=renter&next=${encodeURIComponent('/dashboard/browse')}`);
      return;
    }
    const next = new Set(favorites);
    const willSave = !next.has(id);
    if (willSave) next.add(id); else next.delete(id);
    setFavorites(next);
    try {
      if (willSave) await api('/favorites', { method: 'POST', body: JSON.stringify({ vehicleId: id }) });
      else await api('/favorites', { method: 'DELETE', body: JSON.stringify({ vehicleId: id }) });
    } catch {
      setFavorites(prev => { const revert = new Set(prev); if (willSave) revert.delete(id); else revert.add(id); return revert; });
    }
  };
  const setFilter = (key: keyof Filters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const chooseMake = (make: string) => setFilters(current => ({ ...current, make, model:'All', trim:'All' }));
  const chooseModel = (model: string) => setFilters(current => ({ ...current, model, trim:'All' }));

  const categories = ['All', ...unique(vehicles.map(vehicle => vehicle.category))];
  const pickupCities = unique(vehicles.flatMap(vehicle => (vehicle.pickupLocations || []).map((location:any) => location.city)));
  const makes = unique(vehicles.map(vehicle => vehicle.make));
  const models = unique(vehicles.filter(vehicle => filters.make === 'All' || vehicle.make === filters.make).map(vehicle => vehicle.model));
  const trims = unique(vehicles.filter(vehicle => (filters.make === 'All' || vehicle.make === filters.make) && (filters.model === 'All' || vehicle.model === filters.model)).map(vehicle => vehicle.trim));
  const optionValues: Record<string, string[]> = {
    fuel: unique(vehicles.map(vehicle => vehicle.fuel)), bodyType: unique(vehicles.map(vehicle => vehicle.bodyType)),
    gearbox: unique(vehicles.map(vehicle => vehicle.gearbox)), drivetrain: unique(vehicles.map(vehicle => vehicle.drivetrain)),
    steeringType: unique(vehicles.map(vehicle => vehicle.steeringType)), color: unique(vehicles.map(vehicle => vehicle.color)),
  };
  const linkedFilter = Boolean(requestedPromotion || requestedCompany);
  const activeFilters = Object.values(filters).filter(value => value && value !== 'All').length + (linkedFilter ? 1 : 0);

  const shown = useMemo(() => vehicles.filter(vehicle => {
    const price = Number(vehicle[fields[rate]]);
    return (!requestedPromotion || vehicle.promotions?.some((promotion: any) => promotion.code === requestedPromotion))
      && (!requestedCompany || vehicle.companyId === requestedCompany)
      && (category === 'All' || vehicle.category === category)
      && (filters.city === 'All' || vehicle.pickupLocations?.some((location:any) => location.city === filters.city))
      && (filters.make === 'All' || vehicle.make === filters.make)
      && (filters.model === 'All' || vehicle.model === filters.model)
      && (filters.trim === 'All' || vehicle.trim === filters.trim)
      && (filters.fuel === 'All' || vehicle.fuel === filters.fuel)
      && (filters.bodyType === 'All' || vehicle.bodyType === filters.bodyType)
      && (filters.gearbox === 'All' || vehicle.gearbox === filters.gearbox)
      && (filters.drivetrain === 'All' || vehicle.drivetrain === filters.drivetrain)
      && (filters.steeringType === 'All' || vehicle.steeringType === filters.steeringType)
      && (filters.color === 'All' || vehicle.color === filters.color)
      && (!filters.yearFrom || vehicle.year >= Number(filters.yearFrom))
      && (!filters.yearTo || vehicle.year <= Number(filters.yearTo))
      && (!filters.priceMin || price >= Number(filters.priceMin))
      && (!filters.priceMax || price <= Number(filters.priceMax))
      && `${vehicle.make} ${vehicle.model} ${vehicle.trim} ${vehicle.companyName} ${(vehicle.pickupLocations||[]).map((location:any)=>`${location.city} ${location.site}`).join(' ')}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a,b) => sort === 'price' ? a[fields[rate]] - b[fields[rate]] : b.year - a.year), [vehicles, category, filters, search, sort, rate, requestedPromotion, requestedCompany]);

  const clearAll = () => { setFilters(emptyFilters); setCategory('All'); setSearch(''); if (linkedFilter) router.replace('/dashboard/browse'); };
  return <>
    <section className="browse-hero"><div><span className="eyebrow">{vehicles.length} {t('liveVehicles')}</span><h2>{t('findDrive')}</h2><p>{t('findDriveText')}</p></div><div className="browse-location"><MapPin/><label><small>{t('pickupCity')}</small><select value={filters.city} onChange={event=>setFilter('city',event.target.value)}><option value="All">{t('allPickupCities')}</option>{pickupCities.map(city=><option value={city} key={city}>{city}</option>)}</select></label><button type="button" aria-label={t('searchCars')}><Search/></button></div></section>
    <div className="category-scroll">{categories.map(item => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{t(item)}</button>)}</div>
    <div className="market-filter"><label><Search/><input placeholder={t('searchCars')} value={search} onChange={event => setSearch(event.target.value)}/></label><div><button className={`btn secondary filter-toggle ${filtersOpen ? 'active' : ''}`} onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal/>{t('filters')}{activeFilters > 0 && <span>{activeFilters}</span>}</button><select value={sort} onChange={event => setSort(event.target.value)}><option value="price">{t('priceLow')}</option><option value="year">{t('newest')}</option></select><div className="rate-switch">{(['hour','day','week','month'] as Rate[]).map(item => <button className={rate === item ? 'active' : ''} onClick={() => setRate(item)} key={item}>{t(item)}</button>)}</div></div></div>
    {filtersOpen && <section className="advanced-vehicle-filters panel"><header><div><h3>{t('vehicleFilters')}</h3><p>{t('vehicleFiltersText')}</p></div>{activeFilters > 0 && <button onClick={clearAll}><X/>{t('clearFilters')}</button>}</header><div className="vehicle-filter-grid">
      <label>{t('pickupCity')}<select value={filters.city} onChange={event=>setFilter('city',event.target.value)}><option value="All">{t('allPickupCities')}</option>{pickupCities.map(city=><option value={city} key={city}>{city}</option>)}</select></label>
      <label>{t('make')}<select value={filters.make} onChange={event => chooseMake(event.target.value)}><option value="All">{t('allMakes')}</option>{makes.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>{t('model')}<select value={filters.model} onChange={event => chooseModel(event.target.value)} disabled={filters.make === 'All'}><option value="All">{t('allModels')}</option>{models.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>{t('trim')}<select value={filters.trim} onChange={event => setFilter('trim', event.target.value)} disabled={filters.model === 'All'}><option value="All">{t('allTrims')}</option>{trims.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      {(['fuel','bodyType','gearbox','drivetrain','steeringType','color'] as const).map(key => <label key={key}>{t(key)}<select value={filters[key]} onChange={event => setFilter(key,event.target.value)}><option value="All">{t(`all_${key}`)}</option>{optionValues[key].map(value => <option value={value} key={value}>{t(value)}</option>)}</select></label>)}
      <fieldset><legend>{t('yearRange')}</legend><input type="number" min="1990" max="2100" placeholder={t('fromYear')} value={filters.yearFrom} onChange={event => setFilter('yearFrom',event.target.value)}/><span>—</span><input type="number" min="1990" max="2100" placeholder={t('toYear')} value={filters.yearTo} onChange={event => setFilter('yearTo',event.target.value)}/></fieldset>
      <fieldset><legend>{t('estimatedPrice')} · {t(rate)}</legend><input type="number" min="0" placeholder={t('minimumPrice')} value={filters.priceMin} onChange={event => setFilter('priceMin',event.target.value)}/><span>—</span><input type="number" min="0" placeholder={t('maximumPrice')} value={filters.priceMax} onChange={event => setFilter('priceMax',event.target.value)}/></fieldset>
    </div></section>}
    <div className="filter-results"><span>{shown.length} {t('vehiclesFound')}</span>{activeFilters > 0 && <button onClick={clearAll}>{t('clearAll')}</button>}</div>
    {loading ? <Skeleton cards={6}/> : shown.length === 0 ? <Empty icon={CarFront} title={t('noCars')} text={t('tryDifferentFilters')} action={clearAll} label={t('clearFilters')}/> : <div className="vehicle-grid browse-grid">{shown.map(vehicle => <article className="vehicle-card marketplace-card" key={vehicle.id} onClick={() => router.push(`/dashboard/browse/${vehicle.id}`)}><div className="vehicle-photo"><VehicleImageCarousel image={vehicle.image} images={vehicle.images} variant="card" alt={`${vehicle.make} ${vehicle.model}`}/><button type="button" className={`save-car${favorites.has(vehicle.id) ? ' active' : ''}`} aria-pressed={favorites.has(vehicle.id)} aria-label={favorites.has(vehicle.id) ? t('removeFromSaved') : t('addToSaved')} onClick={(e) => toggleFavorite(vehicle.id, e)}>{favorites.has(vehicle.id) ? <Heart fill="currentColor" /> : <Heart />}</button><span className="rating-badge"><Star fill="currentColor"/>{vehicle.rating}</span>{vehicle.promotions?.[0] && <span className="promo-tag"><Zap/>{vehicle.promotions[0].type === 'percentage' ? `${vehicle.promotions[0].value}% ${t('off')}` : `${formatVehicleMoney(vehicle.promotions[0].value, vehicle.companyCurrency, currency, lang)} ${t('off')}`}</span>}</div><div className="vehicle-body"><small>{vehicle.companyName}</small><div className="vehicle-title"><div><h3>{vehicle.make} {vehicle.model}</h3><p>{vehicle.year} · {vehicle.trim} · {t(vehicle.bodyType || vehicle.category)}</p></div></div><div className="car-specs"><span><Fuel/>{t(vehicle.fuel)}</span><span><UserRound/>{vehicle.seats} {t('seats')}</span><span><Gauge/>{t(vehicle.gearbox)}</span><span><Gauge/>{Number(vehicle.dailyKilometerAllowance).toLocaleString()} {t('kilometers')}/{t('day')}</span></div><div className="marketplace-locations"><MapPin/><span>{[...new Set((vehicle.pickupLocations||[]).map((location:any)=>location.city))].join(' · ')}</span><small>{(vehicle.pickupLocations||[]).length} {t('pickupSites')}</small></div><footer><span>{t('from')} <strong>{formatVehicleMoney(vehicle[fields[rate]], vehicle.companyCurrency, currency, lang)}</strong> / {t(rate)}</span><div><Link href={`/dashboard/browse/${vehicle.id}`} onClick={e => e.stopPropagation()} className="round-link" aria-label={t('viewDetails')}><Eye/></Link><button className="btn primary small" onClick={e => { e.stopPropagation(); setBooking(vehicle); }}>{t('rentNow')}</button></div></footer></div></article>)}    </div>}
    {booking && <BookingModal vehicle={booking} onClose={() => setBooking(null)} />}
  </>;
}
