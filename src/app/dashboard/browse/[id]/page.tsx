'use client';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Check, ChevronDown, Fuel, Gauge, MapPin, ShieldCheck, Sparkles, Star, UserRound } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookingModal } from '@/components/booking-modal';
import { VehicleImageCarousel } from '@/components/vehicle-image-carousel';
import { Skeleton, StatusBadge } from '@/components/ui';
import { api } from '@/lib/client-api';
import { dateTime } from '@/lib/format';
import { formatVehicleMoney } from '@/lib/currencies';
import { useCurrency } from '@/lib/currency-provider';
import { useI18n } from '@/lib/i18n';

type Spec = { key: string; label: string; value: string; icon: 'gauge' | 'fuel' | 'seats' | 'body' | 'drivetrain' | 'mileage' | 'cities' | 'sites' | 'year' | 'color' | 'plate' | 'odo' | 'excess' | 'insurance' };

const SPEC_ICONS: Record<Spec['icon'], any> = {
  gauge: Gauge, fuel: Fuel, seats: UserRound, body: Sparkles, drivetrain: Gauge, mileage: Gauge,
  cities: MapPin, sites: MapPin, year: CalendarDays, color: Sparkles, plate: ShieldCheck,
  odo: Gauge, excess: Gauge, insurance: ShieldCheck,
};

const SPECS_VISIBLE_COUNT = 6;
const FEATURES_VISIBLE_COUNT = 6;

export default function BrowseDetail() {
  const { t, lang } = useI18n();
  const { currency } = useCurrency();
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [booking, setBooking] = useState(false);
  const [showAllSpecs, setShowAllSpecs] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  useEffect(() => {
    api(`/vehicles/${id}`).then(setData);
    if (new URLSearchParams(window.location.search).get('rent') === '1') setBooking(true);
  }, [id]);
  if (!data) return <Skeleton rows={6} />;
  const v = data.vehicle;

  const cities = [...new Set((v.pickupLocations || []).map((location: any) => location.city))];
  const sites = (v.pickupLocations || []).length;
  const dailyKm = Number(v.dailyKilometerAllowance || 0).toLocaleString();
  const excessKm = v.excessKilometerRate ? `${formatVehicleMoney(v.excessKilometerRate, v.companyCurrency, currency, lang)}/${t('kilometers')}` : t('included');

  const specs: Spec[] = [
    { key: 'transmission', label: t('specTransmission'), value: t(v.gearbox), icon: 'gauge' },
    { key: 'fuel', label: t('specFuelType'), value: t(v.fuel), icon: 'fuel' },
    { key: 'seats', label: t('specSeatsCount'), value: `${v.seats} ${t('seats')}`, icon: 'seats' },
    { key: 'mileage', label: t('specMileage'), value: `${dailyKm} ${t('kilometers')}/${t('day')}`, icon: 'mileage' },
    { key: 'drivetrain', label: t('specDrivetrain'), value: t(v.drivetrain || 'FWD'), icon: 'drivetrain' },
    { key: 'body', label: t('specBodyStyle'), value: t(v.bodyType || v.category), icon: 'body' },
    { key: 'excess', label: t('specExcessKmRate'), value: excessKm, icon: 'excess' },
    { key: 'insurance', label: t('specInsuranceCoverage'), value: t(v.insuranceCoverage || 'third_party'), icon: 'insurance' },
    { key: 'year', label: t('specYear'), value: String(v.year), icon: 'year' },
    { key: 'color', label: t('specColor'), value: v.color ? t(v.color) : '—', icon: 'color' },
    { key: 'odo', label: t('specOdometer'), value: v.odometer ? `${Number(v.odometer).toLocaleString()} ${t('kilometers')}` : '—', icon: 'odo' },
    { key: 'plate', label: t('specLicensePlate'), value: v.licensePlate || '—', icon: 'plate' },
  ];
  if (cities.length) specs.push({ key: 'cities', label: t('specPickupCities'), value: cities.join(' · '), icon: 'cities' });
  if (sites) specs.push({ key: 'sites', label: t('specPickupSiteCount'), value: `${sites} ${t('pickupSites')}`, icon: 'sites' });

  const specsHiddenCount = Math.max(0, specs.length - SPECS_VISIBLE_COUNT);
  const visibleSpecs = showAllSpecs ? specs : specs.slice(0, SPECS_VISIBLE_COUNT);
  const features = v.features || [];
  const featuresHiddenCount = Math.max(0, features.length - FEATURES_VISIBLE_COUNT);
  const visibleFeatures = showAllFeatures ? features : features.slice(0, FEATURES_VISIBLE_COUNT);

  return (
    <>
      <Link className="back-link" href="/dashboard/browse"><ArrowLeft />{t('browse')}</Link>
      <div className="market-detail">
        <section>
          <div className="detail-photo">
            <VehicleImageCarousel image={v.image} images={v.images} variant="detail" alt={`${v.make} ${v.model}`} />
            <StatusBadge status={v.status} />
            <span className="rating-badge"><Star fill="currentColor" />{v.rating}</span>
          </div>
          <div className="market-detail-title">
            <div>
              <span>{v.companyName}</span>
              <h2>{v.make} {v.model}</h2>
              <p>{v.year} · {v.trim} · {t(v.bodyType || v.category)}</p>
            </div>
            <div>
              <small>{t('from')}</small>
              <strong>{formatVehicleMoney(v.dailyRate, v.companyCurrency, currency, lang)}</strong>
              <span>/{t('day')}</span>
            </div>
          </div>

          <section className="panel vehicle-specs-panel">
            <header className="vehicle-specs-header">
              <div>
                <span className="eyebrow"><Sparkles />{t('vehicleSpecsTitle')}</span>
                <h3>{t('vehicleSpecsTitle')}</h3>
                <p>{t('vehicleSpecsText')}</p>
              </div>
            </header>
            <div className={`vehicle-specs-grid ${showAllSpecs ? 'expanded' : 'collapsed'}`}>
              {visibleSpecs.map((spec) => {
                const Icon = SPEC_ICONS[spec.icon];
                return (
                  <div className="vehicle-spec" key={spec.key}>
                    <span className="vehicle-spec-icon"><Icon /></span>
                    <div className="vehicle-spec-body">
                      <small>{spec.label}</small>
                      <strong>{spec.value}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
            {specsHiddenCount > 0 && (
              <button
                type="button"
                className="vehicle-specs-show-more"
                onClick={() => setShowAllSpecs((value) => !value)}
                aria-expanded={showAllSpecs}
              >
                {showAllSpecs ? t('showLessSpecs') : t('showMoreSpecs')}
                <span className="vehicle-specs-show-more-count">{specsHiddenCount}</span>
                <ChevronDown className={showAllSpecs ? 'rotated' : ''} />
              </button>
            )}
          </section>

          <section className="panel pickup-sites-panel">
            <h3><MapPin />{t('availablePickupSites')}</h3>
            <div>{(v.pickupLocations || []).map((location: any) => (
              <span key={`${location.city}-${location.site}`}>
                <strong>{location.city}</strong>{location.site}
              </span>
            ))}</div>
          </section>

          <section className="panel included">
            <header className="vehicle-features-header">
              <div>
                <span className="eyebrow"><Check />{t('includedFeaturesTitle')}</span>
                <h3>{t('includedFeaturesTitle')}</h3>
                <p>{t('includedFeaturesText')}</p>
              </div>
              <em>{v.features?.length || 0}</em>
            </header>
            {v.features?.length ? (
              <>
                <div className="vehicle-features-grid">
                  {visibleFeatures.map((feature: string) => (
                    <div className="vehicle-feature" key={feature}>
                      <span className="vehicle-feature-icon"><Check /></span>
                      <span>{t(feature)}</span>
                    </div>
                  ))}
                </div>
                {featuresHiddenCount > 0 && (
                  <button
                    type="button"
                    className="vehicle-features-show-more"
                    onClick={() => setShowAllFeatures((value) => !value)}
                    aria-expanded={showAllFeatures}
                  >
                    {showAllFeatures ? t('showLessFeatures') : t('showMoreFeatures')}
                    <span className="vehicle-features-show-more-count">{featuresHiddenCount}</span>
                    <ChevronDown className={showAllFeatures ? 'rotated' : ''} />
                  </button>
                )}
              </>
            ) : (
              <p className="vehicle-features-empty">{t('noFeaturesListed')}</p>
            )}
          </section>
        </section>

        <aside>
          <section className="panel booking-card">
            <h3>{t('pricing')}</h3>
            {[['hour', v.hourlyRate], ['day', v.dailyRate], ['week', v.weeklyRate], ['month', v.monthlyRate]].map(([label, value]) => (
              <div key={label as string}>
                <span>{t('per')} {t(label as string)}</span>
                <strong>{formatVehicleMoney(value as number, v.companyCurrency, currency, lang)}</strong>
              </div>
            ))}
            <button className="btn primary big" onClick={() => setBooking(true)}>{t('rentNow')}</button>
            <small>{t('protectedBooking')}</small>
          </section>
          <section className="panel vehicle-trust">
            <h3><ShieldCheck />{t('protectedBooking')}</h3>
            <ul>
              <li><Check />{t('ksaProtectionDisclosure').split('.')[0]}.</li>
              <li><Check />{t('turnaroundTitle')}.</li>
              <li><Check />{t('protectedBooking')}.</li>
            </ul>
          </section>
        </aside>
      </div>
      {booking && <BookingModal vehicle={v} onClose={() => setBooking(false)} />}
    </>
  );
}
