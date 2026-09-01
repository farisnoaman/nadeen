'use client';
import Link from 'next/link';
import { ArrowRight, CarFront, Fuel, Gauge, Heart, MapPin, Search, SlidersHorizontal, Star, UserRound, X, Zap } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LanguageToggle, ThemeToggle, CurrencyToggle } from '@/components/theme-controls';
import { Empty, Skeleton } from '@/components/ui';
import { api } from '@/lib/client-api';
import { money } from '@/lib/format';
import { formatVehicleMoney } from '@/lib/currencies';
import { useCurrency } from '@/lib/currency-provider';
import { useI18n } from '@/lib/i18n';
import { VehicleImageCarousel } from '@/components/vehicle-image-carousel';
import { BookingModal } from '@/components/booking-modal';
import { CitySearch } from '@/components/city-search';

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
  const [account, setAccount] = useState<any>(null);
  const [booking, setBooking] = useState<any>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  // Load favorites from local storage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ff_favorites');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFavorites(new Set<number>(parsed));
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Toggle favorite & sync with local storage
  const toggleFavorite = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem('ff_favorites', JSON.stringify(Array.from(next)));
      } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    api('/vehicles').then((data:any) => setVehicles(data.vehicles)).finally(() => setLoading(false));
    api('/auth/me?optional=1').then((data:any) => setAccount(data.user)).catch(() => undefined);
  }, []);

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
  }).sort((a,b) => {
    if (sort === 'price') return a[fields[rate]] - b[fields[rate]];
    if (sort === 'odometer') return Number(a.odometer || 0) - Number(b.odometer || 0);
    if (sort === 'fuelConsumption') return (a.fuelConsumption ?? Infinity) - (b.fuelConsumption ?? Infinity);
    if (sort === 'name') return `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`);
    return b.year - a.year;
  }), [vehicles, category, filters, search, sort, rate, requestedPromotion, requestedCompany]);

  const clearAll = () => { setFilters(emptyFilters); setCategory('All'); setSearch(''); if (linkedFilter) router.replace('/browse'); };

  const openRent = (e: React.MouseEvent, vehicle: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!account || account.role !== 'renter') {
      router.push('/login?role=renter&next=' + encodeURIComponent('/dashboard/browse/' + vehicle.id + '?rent=1'));
      return;
    }
    setBooking(vehicle);
  };

  return <div className="public-marketplace">
    <header className="landing-nav"><Link href="/" className="logo"><span><CarFront/></span>FleetFlow</Link><nav><Link href="/browse">{t('marketplace')}</Link></nav><div className="nav-actions"><LanguageToggle/><ThemeToggle/><CurrencyToggle/>{account?<Link className="btn primary" href={account.role==='renter'?'/dashboard/browse':'/dashboard'}>{t('dashboard')}</Link>:<><Link className="btn ghost" href="/login">{t('signIn')}</Link><Link className="btn primary" href="/register?role=renter">{t('getStarted')}</Link></>}</div></header>
    <main className="public-marketplace-content">
    <section className="browse-hero"><div><span className="eyebrow">{vehicles.length} {t('liveVehicles')}</span><h2>{t('findDrive')}</h2><p>{t('findDriveText')}</p></div><div className="browse-location"><MapPin/><label><small>{t('pickupCity')}</small><CitySearch cities={pickupCities} value={filters.city} onChange={value=>setFilter('city',value)} allLabel={t('allPickupCities')} placeholder={t('searchCars')} /></label><label className="browse-sort"><small>{t('sortByLabel')}</small><select value={sort} onChange={event => setSort(event.target.value)}><option value="price">{t('priceLow')}</option><option value="year">{t('newest')}</option><option value="odometer">{t('sortOdometer')}</option><option value="fuelConsumption">{t('sortFuelRate')}</option><option value="name">{t('sortName')}</option></select></label></div></section>
    <div className="category-scroll">{categories.map(item => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{t(item)}</button>)}</div>
    <div className="market-filter"><label className="browse-search"><Search/><input placeholder={t('searchCars')} value={search} onChange={event => setSearch(event.target.value)}/><button type="button" className={`filter-toggle filter-inline ${filtersOpen ? 'active' : ''}`} onClick={() => setFiltersOpen(value => !value)} aria-label={t('filters')}><SlidersHorizontal/>{activeFilters > 0 && <span>{activeFilters}</span>}</button></label><div><div className="rate-switch">{(['hour','day','week','month'] as Rate[]).map(item => <button className={rate === item ? 'active' : ''} onClick={() => setRate(item)} key={item}>{t(item)}</button>)}</div></div></div>
    {filtersOpen && <><div className="sheet-scrim" onClick={() => setFiltersOpen(false)} /><section className="advanced-vehicle-filters panel"><div className="sheet-handle" /><header><div><h3>{t('vehicleFilters')}</h3><p>{t('vehicleFiltersText')}</p></div>{activeFilters > 0 && <button onClick={clearAll}><X/>{t('clearFilters')}</button>}</header><div className="sheet-quick mobile-only">
      <div className="sheet-quick-row"><span>{t('rateTypeLabel')}</span><div className="rate-switch">{(['hour','day','week','month'] as Rate[]).map(item => <button className={rate === item ? 'active' : ''} onClick={() => setRate(item)} key={item}>{t(item)}</button>)}</div></div>
    </div><div className="vehicle-filter-grid">
      <label>{t('pickupCity')}<select value={filters.city} onChange={event=>setFilter('city',event.target.value)}><option value="All">{t('allPickupCities')}</option>{pickupCities.map(city=><option value={city} key={city}>{city}</option>)}</select></label>
      <label>{t('make')}<select value={filters.make} onChange={event => chooseMake(event.target.value)}><option value="All">{t('allMakes')}</option>{makes.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>{t('model')}<select value={filters.model} onChange={event => chooseModel(event.target.value)} disabled={filters.make === 'All'}><option value="All">{t('allModels')}</option>{models.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>{t('trim')}<select value={filters.trim} onChange={event => setFilter('trim', event.target.value)} disabled={filters.model === 'All'}><option value="All">{t('allTrims')}</option>{trims.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      {(['fuel','bodyType','gearbox','drivetrain','steeringType','color'] as const).map(key => <label key={key}>{t(key)}<select value={filters[key]} onChange={event => setFilter(key,event.target.value)}><option value="All">{t(`all_${key}`)}</option>{optionValues[key].map(value => <option value={value} key={value}>{t(value)}</option>)}</select></label>)}
      <fieldset><legend>{t('yearRange')}</legend><input type="number" min="1990" max="2100" placeholder={t('fromYear')} value={filters.yearFrom} onChange={event => setFilter('yearFrom',event.target.value)}/><span>—</span><input type="number" min="1990" max="2100" placeholder={t('toYear')} value={filters.yearTo} onChange={event => setFilter('yearTo',event.target.value)}/></fieldset>
      <fieldset><legend>{t('estimatedPrice')} · {t(rate)}</legend><input type="number" min="0" placeholder={t('minimumPrice')} value={filters.priceMin} onChange={event => setFilter('priceMin',event.target.value)}/><span>—</span><input type="number" min="0" placeholder={t('maximumPrice')} value={filters.priceMax} onChange={event => setFilter('priceMax',event.target.value)}/></fieldset>
    </div><button type="button" className="btn primary sheet-apply" onClick={() => setFiltersOpen(false)}>{t('showResults')} ({shown.length})</button></section></>}
    <div className="filter-results"><span>{shown.length} {t('vehiclesFound')}</span>{activeFilters > 0 && <button onClick={clearAll}>{t('clearAll')}</button>}</div>
    {loading ? <Skeleton cards={6}/> : shown.length === 0 ? <Empty icon={CarFront} title={t('noCars')} text={t('tryDifferentFilters')} action={clearAll} label={t('clearFilters')}/> : <div className="vehicle-grid browse-grid">{shown.map(vehicle => (
      <article className="vehicle-card marketplace-card" key={vehicle.id} role="link" tabIndex={0} aria-label={`${vehicle.make} ${vehicle.model} — ${t('viewDetails')}`} onClick={() => router.push(`/browse/${vehicle.id}`)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/browse/${vehicle.id}`); } }}>

        <div className="vehicle-photo">
          <div style={{ position: 'relative', zIndex: 50 }}>
            <VehicleImageCarousel image={vehicle.image} images={vehicle.images} variant="card" alt={`${vehicle.make} ${vehicle.model}`}/>
          </div>
          <button
            type="button"
            className={`save-car${favorites.has(vehicle.id) ? ' active' : ''}`}
            aria-pressed={favorites.has(vehicle.id)}
            aria-label={favorites.has(vehicle.id) ? 'Remove from favorites' : 'Add to favorites'}
            onClick={(e) => toggleFavorite(e, vehicle.id)}
            style={{ position: 'absolute', zIndex: 60 }}
          >
            {favorites.has(vehicle.id) ? <Heart fill="currentColor" /> : <Heart />}
          </button>
          <span className="rating-badge"><Star fill="currentColor"/>{vehicle.rating}</span>
          {vehicle.promotions?.[0] && <span className="promo-tag"><Zap/>{vehicle.promotions[0].type === 'percentage' ? `${vehicle.promotions[0].value}% ${t('off')}` : `${formatVehicleMoney(vehicle.promotions[0].value, vehicle.companyCurrency, currency, lang)} ${t('off')}`}</span>}
        </div>

        {/* NEW FIX: Lifts the body content above the .card-stretch layer */}
        <div className="vehicle-body" style={{ position: 'relative', zIndex: 2 }}>
          <small>{vehicle.companyName}</small>
          <div className="vehicle-title">
            <div>
              <h3>{vehicle.make} {vehicle.model}</h3>
              <p>{vehicle.year} · {vehicle.trim} · {t(vehicle.bodyType || vehicle.category)}</p>
            </div>
          </div>
          <div className="car-specs">
            <span><Fuel/>{t(vehicle.fuel)}</span>
            <span><UserRound/>{vehicle.seats} {t('seats')}</span>
            <span><Gauge/>{t(vehicle.gearbox)}</span>
            <span><Gauge/>{Number(vehicle.dailyKilometerAllowance).toLocaleString()} {t('kilometers')}/{t('day')}</span>
          </div>
          <div className="marketplace-locations">
            <MapPin/>
            <span>{[...new Set((vehicle.pickupLocations||[]).map((location:any)=>location.city))].join(' · ')}</span>
            <small>{(vehicle.pickupLocations||[]).length} {t('pickupSites')}</small>
          </div>

          <footer style={{ position: 'relative', zIndex: 3 }}>
            <span className="card-price"><small>{t('from')}</small><div><strong>{formatVehicleMoney(vehicle[fields[rate]], vehicle.companyCurrency, currency, lang)}</strong><em>/{t(rate)}</em></div></span>
            <div style={{ position: 'relative', zIndex: 99, display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn primary small"
                onClick={(e) => openRent(e, vehicle)}
              >
                {t('rentNow')}
              </button>
            </div>
          </footer>
        </div>
      </article>
    ))}</div>}
    </main>
    {booking && <BookingModal vehicle={booking} onClose={() => setBooking(null)} />}
  </div>;
}
