'use client';
import { CalendarDays, Check, ChevronDown, Copy, Fuel, Gauge, MapPin, ShieldCheck, Sparkles, Star, Tag, UserRound, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VehicleImageCarousel } from './vehicle-image-carousel';
import { Skeleton, StatusBadge } from './ui';
import { api } from '@/lib/client-api';
import { dateTime } from '@/lib/format';
import { formatVehicleMoney } from '@/lib/currencies';
import { useCurrency } from '@/lib/currency-provider';
import { useI18n } from '@/lib/i18n';
import { useWhatsApp } from './whatsapp-float';

type Spec = { key: string; label: string; value: string; icon: 'gauge' | 'fuel' | 'seats' | 'body' | 'drivetrain' | 'mileage' | 'cities' | 'sites' | 'year' | 'color' | 'plate' | 'odo' | 'excess' | 'insurance' };
const SPEC_ICONS: Record<Spec['icon'], any> = {
  gauge: Gauge, fuel: Fuel, seats: UserRound, body: Sparkles, drivetrain: Gauge, mileage: Gauge,
  cities: MapPin, sites: MapPin, year: CalendarDays, color: Sparkles, plate: ShieldCheck,
  odo: Gauge, excess: Gauge, insurance: ShieldCheck,
};
const SPECS_VISIBLE = 6;
const FEATURES_VISIBLE = 6;

export function VehicleDetailContent({ data, variant = 'public', onRent, onBookingOpen }: {
  data: any;
  variant?: 'public' | 'dashboard';
  onRent?: () => void;
  onBookingOpen?: () => void;
}) {
  const v = data.vehicle;
  const { t, lang } = useI18n();
  const { currency } = useCurrency();
  const router = useRouter();
  const { setWhatsApp } = useWhatsApp();
  const [showAllSpecs, setShowAllSpecs] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);

  const promotions = (data.promotions || []).filter((p: any) => p && typeof p.value === 'number' && p.value > 0);
  const busyPeriods = data.busyPeriods || [];

  useEffect(() => {
    setWhatsApp(v.whatsappNumbers || [], v.companyName);
    return () => setWhatsApp([]);
  }, [v.whatsappNumbers, v.companyName, setWhatsApp]);

  const cities = [...new Set((v.pickupLocations || []).map((l: any) => l.city))];
  const sites = (v.pickupLocations || []).length;
  const dailyKm = Number(v.dailyKilometerAllowance || 0).toLocaleString();
  const excessKm = v.excessKilometerRate
    ? `${formatVehicleMoney(v.excessKilometerRate, v.companyCurrency, currency, lang)}/${t('kilometers')}`
    : t('included');

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

  const specsHidden = Math.max(0, specs.length - SPECS_VISIBLE);
  const visibleSpecs = showAllSpecs ? specs : specs.slice(0, SPECS_VISIBLE);
  const features = v.features || [];
  const featuresHidden = Math.max(0, features.length - FEATURES_VISIBLE);
  const visibleFeatures = showAllFeatures ? features : features.slice(0, FEATURES_VISIBLE);

  function applyPromotion(promo: any) {
    setAppliedPromo(promo.code);
    if (variant === 'dashboard') {
      router.push(`/dashboard/browse/${v.id}?rent=1&promo=${encodeURIComponent(promo.code)}`);
    } else {
      router.push(`/dashboard/browse/${v.id}?rent=1&promo=${encodeURIComponent(promo.code)}`);
    }
  }

  return (
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
          {specsHidden > 0 && (
            <button type="button" className="vehicle-specs-show-more" onClick={() => setShowAllSpecs(v => !v)} aria-expanded={showAllSpecs}>
              {showAllSpecs ? t('showLessSpecs') : t('showMoreSpecs')}
              <span className="vehicle-specs-show-more-count">{specsHidden}</span>
              <ChevronDown className={showAllSpecs ? 'rotated' : ''} />
            </button>
          )}
        </section>

        <section className="panel pickup-sites-panel">
          <h3><MapPin />{t('availablePickupSites')}</h3>
          <div>{(v.pickupLocations || []).map((loc: any) => (
            <span key={`${loc.city}-${loc.site}`}><strong>{loc.city}</strong>{loc.site}</span>
          ))}</div>
        </section>

        <section className="panel included">
          <header className="vehicle-features-header">
            <div>
              <span className="eyebrow"><Check />{t('includedFeaturesTitle')}</span>
              <p>{t('includedFeaturesText')}</p>
            </div>
            <em>{v.features?.length || 0}</em>
          </header>
          {v.features?.length ? (
            <>
              <div className="vehicle-features-grid">
                {visibleFeatures.map((f: string) => (
                  <div className="vehicle-feature" key={f}>
                    <span className="vehicle-feature-icon"><Check /></span>
                    <span>{t(f)}</span>
                  </div>
                ))}
              </div>
              {featuresHidden > 0 && (
                <button type="button" className="vehicle-features-show-more" onClick={() => setShowAllFeatures(v => !v)} aria-expanded={showAllFeatures}>
                  {showAllFeatures ? t('showLessFeatures') : t('showMoreFeatures')}
                  <span className="vehicle-features-show-more-count">{featuresHidden}</span>
                  <ChevronDown className={showAllFeatures ? 'rotated' : ''} />
                </button>
              )}
            </>
          ) : (
            <p className="vehicle-features-empty">{t('noFeaturesListed')}</p>
          )}
        </section>

        {v.protectionPackages?.length > 0 && (
          <section className="panel protection-overview public-protection">
            <header className="protection-overview-header">
              <div>
                <span className="eyebrow"><ShieldCheck />{t('insurancePackages')}</span>
                <p>{t(v.insuranceCoverage)}</p>
              </div>
            </header>
            <div className="protection-packages-grid">
              {v.protectionPackages.map((pkg: any) => (
                <article key={pkg.id || pkg.tier} className={`protection-package-card tier-${pkg.tier}`}>
                  <div className="protection-package-tier">{t(pkg.tier)}</div>
                  <strong className="protection-package-name">{pkg.name}</strong>
                  <div className="protection-package-price">
                    <span>{formatVehicleMoney(pkg.dailyPrice, v.companyCurrency, currency, lang)}<small>/{t('day')}</small></span>
                  </div>
                  <div className="protection-package-deductible">
                    <ShieldCheck />
                    <span>{t('deductible')} {formatVehicleMoney(pkg.deductible, v.companyCurrency, currency, lang)}</span>
                  </div>
                  {pkg.description && <p className="protection-package-desc">{pkg.description}</p>}
                </article>
              ))}
            </div>
          </section>
        )}
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
          {variant === 'dashboard' ? (
            <button className="btn primary big" onClick={onBookingOpen}>{t('rentNow')}</button>
          ) : (
            <button className="btn primary big" onClick={onRent}>{t('rentNow')}</button>
          )}
          <small>{t('protectedBooking')}</small>
        </section>

        <section className="panel vehicle-trust highlighted">
          <h3><ShieldCheck />{t('protectedBooking')}</h3>
          <ul>
            <li><Check />{t('ksaProtectionDisclosure').split('.')[0]}.</li>
            <li><Check />{t('turnaroundTitle')}.</li>
            <li><Check />{t('protectedBooking')}.</li>
          </ul>
        </section>

        {promotions.length > 0 && (
          <section className="panel promotions-panel">
            <header className="promotions-header">
              <div>
                <span className="eyebrow"><Tag />{t('availablePromotionsTitle')}</span>
                <p>{t('availablePromotionsText')}</p>
              </div>
            </header>
            <div className="promotions-list">
              {promotions.map((promo: any) => {
                const discount = promo.type === 'percent'
                  ? t('discountPercent').replace('%s', String(promo.value))
                  : t('discountFixed').replace('%s', formatVehicleMoney(promo.value, v.companyCurrency, currency, lang));
                return (
                  <article key={promo.id || promo.code} className="promotion-card compact">
                    <div className="promotion-card-header">
                      <span className="promotion-discount"><Zap />{discount}</span>
                    </div>
                    <div className="promotion-card-body">
                      <strong>{promo.name}</strong>
                    </div>
                    <div className="promo-code-row">
                      <code>{promo.code}</code>
                      <button type="button" className="btn ghost small" onClick={() => { navigator.clipboard.writeText(promo.code); }} aria-label={t('copyCode')}><Copy /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {busyPeriods.length > 0 && (
          <section className="panel busy-periods-panel">
            <header className="busy-periods-header">
              <div>
                <span className="eyebrow"><CalendarDays />{t('busyPeriods')}</span>
                <p>{t('busyHint')}</p>
              </div>
            </header>
            <div className="busy-periods-list">
              {busyPeriods.map((period: any, i: number) => (
                <div key={`${period.id || i}-${period.startsAt}`} className="busy-period-item">
                  <div className="busy-period-dates">
                    <span className="busy-period-from">{dateTime(period.startsAt)}</span>
                    <span className="busy-period-arrow">→</span>
                    <span className="busy-period-to">{dateTime(period.endsAt)}</span>
                  </div>
                  <StatusBadge status={period.status} />
                </div>
              ))}
            </div>
          </section>
        )}
      </aside>

    </div>
  );
}
