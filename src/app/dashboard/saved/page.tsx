'use client';
import Link from 'next/link';
import { CarFront, Fuel, Gauge, Heart, MapPin, Search, SlidersHorizontal, Star, UserRound, X, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { VehicleImageCarousel } from '@/components/vehicle-image-carousel';
import { BookingModal } from '@/components/booking-modal';
import { Empty, Skeleton } from '@/components/ui';
import { api } from '@/lib/client-api';
import { money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

type Rate = 'hour' | 'day' | 'week' | 'month';
const fields: Record<Rate, string> = { hour: 'hourlyRate', day: 'dailyRate', week: 'weeklyRate', month: 'monthlyRate' };

export default function SavedVehiclesPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [rate, setRate] = useState<Rate>('day');
  const [booking, setBooking] = useState<any>(null);

  useEffect(() => {
    api<{ ids: number[]; vehicles: any[] }>('/favorites')
      .then((data) => {
        setVehicles(data.vehicles || []);
        setFavorites(new Set<number>(data.ids || []));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const openRent = (vehicle: any, e?: React.MouseEvent) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    setBooking(vehicle);
  };

  const toggleFavorite = async (id: number, e?: React.MouseEvent) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const removed = vehicles.find((vehicle) => vehicle.id === id);
    setFavorites((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setVehicles((prev) => prev.filter((vehicle) => vehicle.id !== id));
    try {
      await api('/favorites', { method: 'DELETE', body: JSON.stringify({ vehicleId: id }) });
    } catch {
      if (removed) setVehicles((prev) => [...prev, removed]);
      setFavorites((prev) => new Set(prev).add(id));
    }
  };

  return <div className="dashboard-page saved-vehicles-page">
    <section className="page-hero">
      <div>
        <span className="eyebrow">{vehicles.length} {t('savedVehicles')}</span>
        <h2>{t('savedVehicles')}</h2>
        <p>{t('savedEmptyText')}</p>
      </div>
      <div className="rate-switch">{(['hour', 'day', 'week', 'month'] as Rate[]).map((item) => <button className={rate === item ? 'active' : ''} onClick={() => setRate(item)} key={item}>{t(item)}</button>)}</div>
    </section>
    {loading ? <Skeleton cards={6} /> : vehicles.length === 0 ? (
      <Empty icon={Heart} title={t('savedEmpty')} text={t('savedEmptyText')} action={() => router.push('/dashboard/browse')} label={t('browse')} />
    ) : (
      <div className="vehicle-grid browse-grid">
        {vehicles.map((vehicle) => (
          <article className="vehicle-card marketplace-card" key={vehicle.id} onClick={() => router.push(`/dashboard/browse/${vehicle.id}`)}>
            <div className="vehicle-photo">
              <VehicleImageCarousel image={vehicle.image} images={vehicle.images} variant="card" alt={`${vehicle.make} ${vehicle.model}`} />
              <button type="button" className={`save-car${favorites.has(vehicle.id) ? ' active' : ''}`} aria-pressed={favorites.has(vehicle.id)} aria-label={t('removeFromSaved')} onClick={(e) => toggleFavorite(vehicle.id, e)}>{favorites.has(vehicle.id) ? <Heart fill="currentColor" /> : <Heart />}</button>
              <span className="rating-badge"><Star fill="currentColor" />{vehicle.rating}</span>
              {vehicle.promotions?.[0] && <span className="promo-tag"><Zap />{vehicle.promotions[0].type === 'percentage' ? `${vehicle.promotions[0].value}% ${t('off')}` : `${money(vehicle.promotions[0].value)} ${t('off')}`}</span>}
            </div>
            <div className="vehicle-body">
              <small>{vehicle.companyName}</small>
              <div className="vehicle-title"><div><h3>{vehicle.make} {vehicle.model}</h3><p>{vehicle.year} · {vehicle.trim} · {t(vehicle.bodyType || vehicle.category)}</p></div></div>
              <div className="car-specs">
                <span><Fuel />{t(vehicle.fuel)}</span>
                <span><UserRound />{vehicle.seats} {t('seats')}</span>
                <span><Gauge />{t(vehicle.gearbox)}</span>
                <span><Gauge />{Number(vehicle.dailyKilometerAllowance).toLocaleString()} {t('kilometers')}/{t('day')}</span>
              </div>
              <div className="marketplace-locations"><MapPin /><span>{[...new Set((vehicle.pickupLocations || []).map((location: any) => location.city))].join(' · ')}</span><small>{(vehicle.pickupLocations || []).length} {t('pickupSites')}</small></div>
              <footer>
                <span className="card-price"><small>{t('from')}</small><div><strong>{money(vehicle[fields[rate]])}</strong><em>/{t(rate)}</em></div></span>
                <div>
                  <button className="btn primary small" onClick={(e) => openRent(vehicle, e)}>{t('rentNow')}</button>
                </div>
              </footer>
            </div>
          </article>
        ))}
      </div>
    )}
    {booking && <BookingModal vehicle={booking} onClose={() => setBooking(null)} />}
  </div>;
}
