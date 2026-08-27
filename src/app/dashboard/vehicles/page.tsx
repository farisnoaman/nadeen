'use client';
import Link from 'next/link';
import {
  CarFront, Check, Fuel, Gauge, History, ImagePlus, Info, MapPin,
  Pencil, Plus, Save, Search, ShieldCheck, SlidersHorizontal, Sparkles, Star,
  Trash2, UserRound, Wand2, Wrench, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { defaultProtectionPackages } from '@/lib/insurance';
import { MAX_VEHICLE_IMAGES, normalizeVehicleImages } from '@/lib/vehicle-images';
import { Empty, Modal, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { VehicleImageCarousel } from '@/components/vehicle-image-carousel';

const blank = {
  make: '', model: '', trim: 'Standard', year: 2026, category: 'Luxury sedan', bodyType: 'Sedan',
  gearbox: 'Automatic', drivetrain: 'FWD', steeringType: 'Left-hand drive', fuel: 'Hybrid',
  fuelLevel: 100, fuelPolicy: 'same_to_same', dailyKilometerAllowance: 250, excessKilometerRate: 0,
  seats: 5, color: '', licensePlate: '', vin: '', odometer: 0, location: 'SoMa, San Francisco',
  pickupLocations: [{ city: 'San Francisco', site: 'SoMa Mobility Hub' }],
  features: ['GPS', 'Apple CarPlay'], image: '', images: [], status: 'available',
  insuranceCoverage: 'third_party', insuranceProvider: '', insurancePolicyNumber: '',
  insurancePolicyExpiry: '2027-12-31', insuranceDeductible: 5000,
  protectionPackages: defaultProtectionPackages(5000),
  hourlyRate: 18, dailyRate: 139, weeklyRate: 829, monthlyRate: 2890,
};

const FEATURE_CATEGORIES: Array<{ key: 'comfort' | 'safety' | 'tech' | 'driving'; items: string[] }> = [
  {
    key: 'comfort',
    items: ['Heated seats', 'Leather seats', 'Massage seats', 'Relaxation seats', '7 seats', 'Panoramic roof', 'Glass roof', 'Sky lounge'],
  },
  {
    key: 'safety',
    items: ['Backup camera', '360° camera', 'Parking assist', 'Blind spot assist', 'Lane assist', 'Adaptive cruise', 'Pilot assist', 'Highway assist', 'Driving assistant', 'Matrix LED'],
  },
  {
    key: 'tech',
    items: ['GPS', 'Apple CarPlay', 'Android Auto', 'CarPlay', 'Bluetooth', 'USB charging', 'Premium audio', 'BOSE audio', 'Meridian audio', 'Burmester audio', 'Bang & Olufsen', 'Harman Kardon', 'In-car Wi-Fi', 'Google built-in', 'Premium connectivity', 'Virtual cockpit'],
  },
  {
    key: 'driving',
    items: ['All-wheel drive', 'Snow tires', 'Air suspension', 'Adaptive suspension', 'Sport chrono', 'Cruise control', 'Push start', 'Keyless entry', 'Autopilot', 'Supercharger access', 'Ultra-fast charging', 'Vehicle-to-load', 'Pilot pack', 'Chauffeur package'],
  },
];

const DRAFT_KEY = 'fleetflow:vehicle-draft';

export default function VehiclesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<any>(null);
  const [create, setCreate] = useState(false);
  const load = () => api('/vehicles').then((x: any) => setVehicles(x.vehicles)).catch((e: any) => toast(e.message, true)).finally(() => setLoading(false));
  useEffect(() => {
    load();
    if (new URLSearchParams(location.search).get('new')) setCreate(true);
  }, []);
  const shown = useMemo(() => vehicles.filter((v) => (status === 'all' || v.status === status) && `${v.make} ${v.model} ${v.licensePlate} ${(v.pickupLocations || []).map((location: any) => `${location.city} ${location.site}`).join(' ')}`.toLowerCase().includes(search.toLowerCase())), [vehicles, status, search]);
  const remove = async (v: any) => {
    if (!confirm(`${t('confirmDelete')}\n${t('deleteHint')}`)) return;
    const old = vehicles;
    setVehicles((x) => x.filter((y) => y.id !== v.id));
    try { await api(`/vehicles/${v.id}`, { method: 'DELETE' }); toast(t('saved')); }
    catch (e: any) { setVehicles(old); toast(e.message, true); }
  };
  const saved = (v: any) => {
    setVehicles((x) => editing ? x.map((y) => y.id === v.id ? { ...y, ...v } : y) : [v, ...x]);
    setEditing(null);
    setCreate(false);
    toast(t('saved'));
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h2>{t('fleet')}</h2>
          <p>{t('manageFleet')}</p>
        </div>
        <button className="btn primary" onClick={() => setCreate(true)}><Plus />{t('addVehicle')}</button>
      </div>
      <div className="fleet-kpis">
        <div><span>{t('fleetSize')}</span><strong>{vehicles.length}</strong></div>
        {['available', 'maintenance', 'retired'].map((key) => (
          <div key={key}><i className={key} /><span>{t(key)}</span><strong>{vehicles.filter((v) => v.status === key).length}</strong></div>
        ))}
      </div>
      <div className="filterbar">
        <label><Search /><input placeholder={t('searchFleet')} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{t('allStatuses')}</option>
            <option value="available">{t('available')}</option>
            <option value="maintenance">{t('maintenance')}</option>
            <option value="retired">{t('retired')}</option>
          </select>
          <button className="btn secondary"><SlidersHorizontal />{t('filters')}</button>
        </div>
      </div>
      {loading ? <Skeleton cards={6} /> : shown.length === 0 ? (
        <Empty icon={CarFront} title={t('noVehicles')} text={t('noVehiclesText')} action={() => setCreate(true)} label={t('addVehicle')} />
      ) : (
        <div className="vehicle-grid">
          {shown.map((v) => (
            <article className="vehicle-card" key={v.id}>
              <div className="vehicle-photo">
                <VehicleImageCarousel image={v.image} images={v.images} variant="card" alt={`${v.make} ${v.model}`} />
                <StatusBadge status={v.status} />
                {v.promotions?.[0] && <span className="promo-tag">−{v.promotions[0].value}{v.promotions[0].type === 'percentage' ? '%' : '$'}</span>}
              </div>
              <div className="vehicle-body">
                <div className="vehicle-title">
                  <div><h3>{v.make} {v.model}</h3><p>{v.year} · {v.trim} · {t(v.bodyType || v.category)}</p></div>
                  <span><Star fill="currentColor" />{v.rating}</span>
                </div>
                <div className="car-specs">
                  <span><Gauge />{v.odometer.toLocaleString()} {t('miles')}</span>
                  <span><Fuel />{t(v.fuel)} · {v.fuelLevel}%</span>
                  <span><ShieldCheck />{t(v.insuranceCoverage)}</span>
                  <span><UserRound />{v.seats} {t('seats')}</span>
                  <span><Gauge />{Number(v.dailyKilometerAllowance).toLocaleString()} {t('kilometers')}/{t('day')}</span>
                </div>
                <div className="car-location">
                  <MapPin />{[...new Set((v.pickupLocations || []).map((location: any) => location.city))].join(' · ') || v.location}
                  <em>{(v.pickupLocations || []).length} {t('pickupSites')} · {v.licensePlate}</em>
                </div>
                <footer>
                  <span><strong>{money(v.dailyRate)}</strong> / {t('day')}</span>
                  <div className="card-actions">
                    <Link href={`/dashboard/vehicles/${v.id}`} title={t('details')}><History /></Link>
                    <button onClick={() => setEditing(v)} title={t('edit')}><Pencil /></button>
                    <Link href={`/dashboard/maintenance?vehicle=${v.id}`} title={t('maintenance')}><Wrench /></Link>
                    <button onClick={() => remove(v)} title={t('delete')} className="danger"><Trash2 /></button>
                  </div>
                </footer>
              </div>
            </article>
          ))}
        </div>
      )}
      <VehicleForm open={create || !!editing} vehicle={editing} onClose={() => { setCreate(false); setEditing(null); }} onSaved={saved} />
    </>
  );
}

function VehicleForm({ open, vehicle, onClose, onSaved }: { open: boolean; vehicle: any; onClose: () => void; onSaved: (v: any) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const isEdit = !!vehicle;
  const [form, setForm] = useState<any>(blank);
  const [saving, setSaving] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>(['', '', '', '']);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState<any | null>(null);
  const [dirty, setDirty] = useState(false);
  const initialFormRef = useRef<string>('');

  useEffect(() => {
    if (!open) return;
    let source: any;
    if (isEdit) {
      source = { ...blank, ...vehicle };
    } else {
      const savedDraft = readDraft();
      if (savedDraft?.form && savedDraft.photoUrls) {
        setHasDraft(savedDraft);
        source = { ...blank, ...savedDraft.form };
        setPhotoUrls([...savedDraft.photoUrls, '', '', '', ''].slice(0, MAX_VEHICLE_IMAGES));
        setLastSavedAt(savedDraft.savedAt ? new Date(savedDraft.savedAt) : null);
      } else {
        source = { ...blank, protectionPackages: defaultProtectionPackages(blank.insuranceDeductible) };
        setPhotoUrls(['', '', '', '']);
      }
    }
    const pickupLocations = source.pickupLocations?.length ? source.pickupLocations.map((location: any) => ({ ...location })) : [{ city: source.location || '', site: source.location || '' }];
    const normalized = {
      ...source,
      pickupLocations,
      insurancePolicyExpiry: source.insurancePolicyExpiry ? String(source.insurancePolicyExpiry).slice(0, 10) : '',
      protectionPackages: (source.protectionPackages || defaultProtectionPackages(source.insuranceDeductible)).map((item: any) => ({ ...item })),
    };
    setForm(normalized);
    initialFormRef.current = JSON.stringify(normalized);
    setDirty(false);
    if (isEdit) setLastSavedAt(null);
  }, [open, vehicle, isEdit]);

  useEffect(() => {
    if (!open || isEdit) return;
    const timer = setTimeout(() => {
      const normalized = normalizeVehicleImages(photoUrls);
      const formWithImage = { ...form, image: normalized[0] || form.image || '', images: normalized };
      setForm((current: any) => ({ ...current, image: formWithImage.image, images: formWithImage.images }));
      writeDraft({ form: { ...form, image: formWithImage.image, images: formWithImage.images }, photoUrls, savedAt: Date.now() });
      setLastSavedAt(new Date());
    }, 500);
    return () => clearTimeout(timer);
  }, [photoUrls, form, open, isEdit]);

  useEffect(() => {
    if (!open || isEdit || !initialFormRef.current) return;
    const current = JSON.stringify(form);
    if (current !== initialFormRef.current) setDirty(true);
  }, [form, open, isEdit]);

  const set = (k: string, v: any) => setForm((x: any) => ({ ...x, [k]: v }));
  const setPickup = (index: number, k: 'city' | 'site', v: string) => setForm((x: any) => {
    const list = [...(x.pickupLocations || [])];
    list[index] = { ...(list[index] || { city: '', site: '' }), [k]: v };
    return { ...x, pickupLocations: list };
  });
  const addPickup = () => setForm((x: any) => ({ ...x, pickupLocations: [...(x.pickupLocations || []), { city: '', site: '' }] }));
  const removePickup = (index: number) => setForm((x: any) => ({ ...x, pickupLocations: (x.pickupLocations || []).filter((_: any, i: number) => i !== index) }));
  const toggleFeature = (feature: string) => setForm((x: any) => ({ ...x, features: x.features.includes(feature) ? x.features.filter((f: string) => f !== feature) : [...x.features, feature] }));

  const validPhotos = useMemo(() => {
    return photoUrls.map((url) => {
      if (!url?.trim()) return { url: '', valid: false };
      try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) return { url: url.trim(), valid: false };
        return { url: url.trim(), valid: true };
      } catch {
        return { url: url.trim(), valid: false };
      }
    });
  }, [photoUrls]);

  const normalizedImages = useMemo(() => {
    const urls = validPhotos.filter((p) => p.valid).map((p) => p.url);
    return normalizeVehicleImages(urls);
  }, [validPhotos]);

  const coverImage = form.image || normalizedImages[0] || '';

  const setCover = (url: string) => set('image', url);

  const removePhoto = (index: number) => {
    setPhotoUrls((current) => current.map((value, i) => (i === index ? '' : value)));
    if (form.image === validPhotos[index]?.url) set('image', '');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const finalImages = normalizedImages.length ? normalizedImages : (form.image ? [form.image] : []);
      const payload = { ...form, images: finalImages, image: form.image || finalImages[0] || '' };
      const data: any = await api(isEdit ? `/vehicles/${vehicle.id}` : '/vehicles', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      if (!isEdit) clearDraft();
      onSaved(data.vehicle);
    } catch (err: any) {
      toast(err.message, true);
    } finally { setSaving(false); }
  };

  const askBeforeClose = useCallback((): boolean => {
    if (isEdit || !dirty) return true;
    const choice = window.confirm(t('closeWithoutSavingConfirm'));
    if (choice) { writeDraft({ form, photoUrls, savedAt: Date.now() }); setLastSavedAt(new Date()); toast(t('draftAutoSaved')); return true; }
    return false;
  }, [dirty, form, photoUrls, isEdit, t, toast]);

  const restoreDraft = () => {
    if (!hasDraft) return;
    const draft = hasDraft;
    setForm({ ...blank, ...draft.form });
    setPhotoUrls([...draft.photoUrls, '', '', '', ''].slice(0, MAX_VEHICLE_IMAGES));
    setLastSavedAt(draft.savedAt ? new Date(draft.savedAt) : new Date());
    setHasDraft(null);
    setDirty(true);
    toast(t('draftAutoSaved'));
  };

  const discardDraft = () => {
    clearDraft();
    setHasDraft(null);
    setLastSavedAt(null);
    setForm({ ...blank, protectionPackages: defaultProtectionPackages(blank.insuranceDeductible) });
    setPhotoUrls(['', '', '', '']);
  };

  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <Modal
      open={open}
      onClose={onClose}
      beforeClose={askBeforeClose}
      title={isEdit ? t('edit') : t('addVehicle')}
      subtitle={t('basicInformation')}
      wide
    >
      {hasDraft && !isEdit && (
        <div className="vehicle-draft-banner">
          <div>
            <strong><Wand2 /> {t('restoreDraftQuestion')}</strong>
            <small>{t('restoreDraftHint')} {lastSavedAt ? t('draftLastSaved').replace('{time}', formatTime(lastSavedAt)) : ''}</small>
          </div>
          <div>
            <button type="button" className="btn secondary small" onClick={discardDraft}>{t('discardDraftAction')}</button>
            <button type="button" className="btn primary small" onClick={restoreDraft}>{t('restoreDraftAction')}</button>
          </div>
        </div>
      )}

      <form className="entity-form vehicle-form" onSubmit={submit}>
        {!isEdit && lastSavedAt && (
          <div className="vehicle-draft-status">
            <Save /> <span>{t('draftAutoSaved')} · {t('draftLastSaved').replace('{time}', formatTime(lastSavedAt))}</span>
          </div>
        )}

        <section>
          <div className="form-section-title"><span>01</span><div><h3>{t('vehicleDetails')}</h3><p>{t('basicInformation')}</p></div></div>
          <div className="form-grid">
            {([['make', 'make'], ['model', 'model'], ['trim', 'trim'], ['year', 'year'], ['licensePlate', 'licensePlate'], ['vin', 'vin'], ['color', 'color'], ['odometer', 'odometer'], ['fuelLevel', 'fuelLevel']] as const).map(([key, label]) => (
              <label key={key}>{t(label)}<input type={['year', 'odometer', 'fuelLevel'].includes(key) ? 'number' : 'text'} value={form[key]} onChange={(e) => set(key, ['year', 'odometer', 'fuelLevel'].includes(key) ? Number(e.target.value) : e.target.value)} required /></label>
            ))}
            <div className="span-2 category-grid">
              <label>{t('category')}<select value={form.category} onChange={(e) => set('category', e.target.value)}>{['Luxury sedan', 'Executive', 'Premium SUV', 'Electric SUV', 'Sedan', 'Performance', 'SUV', 'Luxury SUV', 'Electric sedan'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
              <label>{t('bodyType')}<select value={form.bodyType} onChange={(e) => set('bodyType', e.target.value)}>{['Sedan', 'Hatchback', 'Coupe', 'Convertible', 'SUV', 'Pickup', 'Van'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
            </div>
          </div>
        </section>

        <section>
          <div className="form-section-title"><span>02</span><div><h3>{t('pricing')}</h3><p>{t('pricingText')}</p></div></div>
          <div className="form-grid">
            <label>{t('hour')}<input type="number" min="0" value={form.hourlyRate} onChange={(e) => set('hourlyRate', Number(e.target.value))} /></label>
            <label>{t('day')}<input type="number" min="0" value={form.dailyRate} onChange={(e) => set('dailyRate', Number(e.target.value))} required /></label>
            <label>{t('week')}<input type="number" min="0" value={form.weeklyRate} onChange={(e) => set('weeklyRate', Number(e.target.value))} /></label>
            <label>{t('month')}<input type="number" min="0" value={form.monthlyRate} onChange={(e) => set('monthlyRate', Number(e.target.value))} /></label>
          </div>
        </section>

        <section>
          <div className="form-section-title"><span>03</span><div><h3>{t('vehicleDetails')}</h3><p>{t('choosePhoto')}</p></div></div>
          <div className="vehicle-photo-section">
            <header>
              <div>
                <span className="eyebrow"><ImagePlus />{t('photoSectionTitle')}</span>
                <h4>{t('photoSectionTitle')}</h4>
                <p>{t('photoSectionText')}</p>
              </div>
            </header>
            <div className="vehicle-photo-urls">
              {photoUrls.map((url, index) => (
                <div className="vehicle-photo-url" key={index}>
                  <span className="vehicle-photo-url-index">{index + 1}</span>
                  <input
                    type="url"
                    placeholder={t('photoUrlPlaceholder')}
                    value={url}
                    onChange={(e) => setPhotoUrls((current) => current.map((value, i) => (i === index ? e.target.value : value)))}
                  />
                  {url && validPhotos[index]?.valid && (
                    <button type="button" className="vehicle-photo-set-cover" onClick={() => setCover(url)} disabled={form.image === url}>
                      {form.image === url ? t('coverBadge') : t('setAsCover')}
                    </button>
                  )}
                  {url && (
                    <button type="button" className="vehicle-photo-remove" onClick={() => removePhoto(index)} aria-label={t('removePhoto')}>
                      <X />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {normalizedImages.length > 0 ? (
              <div className="vehicle-photo-grid">
                {normalizedImages.map((url) => (
                  <div className={`vehicle-photo-tile ${form.image === url ? 'is-cover' : ''}`} key={url}>
                    <img src={url} alt="" />
                    {form.image === url ? <span className="vehicle-photo-cover-badge">{t('coverBadge')}</span> : (
                      <button type="button" onClick={() => setCover(url)}>{t('setAsCover')}</button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="vehicle-photo-empty">
                <Info />
                <p>{t('noPhotosYet')}</p>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="form-section-title"><span>04</span><div><h3>{t('featuresLabel')}</h3><p>{t('featuresSectionText')}</p></div></div>
          <div className="vehicle-features-categories">
            {FEATURE_CATEGORIES.map((category) => (
              <div className="vehicle-features-category" key={category.key}>
                <header>
                  <span><Sparkles />{t(`featuresCategory_${category.key}`)}</span>
                  <em>{category.items.filter((item) => form.features.includes(item)).length} / {category.items.length}</em>
                </header>
                <div className="vehicle-features-checkboxes">
                  {category.items.map((item) => (
                    <label key={item} className={form.features.includes(item) ? 'selected' : ''}>
                      <input type="checkbox" checked={form.features.includes(item)} onChange={() => toggleFeature(item)} />
                      <Check />
                      <span>{t(item)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="form-section-title"><span>05</span><div><h3>{t('pickupLocations')}</h3><p>{t('pickupLocationsHint')}</p></div></div>
          <div className="pickup-location-editor">
            <div>
              {(form.pickupLocations || []).map((location: any, index: number) => (
                <div className="pickup-location-row" key={index}>
                  <label>{t('pickupCity')}<input value={location.city} onChange={(e) => setPickup(index, 'city', e.target.value)} placeholder="San Francisco" required /></label>
                  <label>{t('pickupSite')}<input value={location.site} onChange={(e) => setPickup(index, 'site', e.target.value)} placeholder="SoMa Mobility Hub" required /></label>
                  <button type="button" onClick={() => removePickup(index)} disabled={(form.pickupLocations || []).length <= 1} aria-label={t('removePickupLocation')}><Trash2 /></button>
                </div>
              ))}
            </div>
            <button type="button" className="btn secondary small" onClick={addPickup}><Plus />{t('addPickupLocation')}</button>
          </div>
        </section>

        <section>
          <div className="form-section-title"><span>06</span><div><h3>{t('insuranceAndOperations')}</h3><p>{t('ksaVehicleCompliance')}</p></div></div>
          <div className="form-grid">
            <label>{t('insuranceCoverage')}<select value={form.insuranceCoverage} onChange={(e) => set('insuranceCoverage', e.target.value)}><option value="third_party">{t('third_party')}</option><option value="comprehensive">{t('comprehensive')}</option></select></label>
            <label>{t('insuranceProvider')}<input value={form.insuranceProvider} onChange={(e) => set('insuranceProvider', e.target.value)} /></label>
            <label>{t('insurancePolicyNumber')}<input value={form.insurancePolicyNumber} onChange={(e) => set('insurancePolicyNumber', e.target.value)} /></label>
            <label>{t('insurancePolicyExpiry')}<input type="date" value={form.insurancePolicyExpiry} onChange={(e) => set('insurancePolicyExpiry', e.target.value)} /></label>
            <label>{t('vehiclePolicyDeductible')}<input type="number" min="0" value={form.insuranceDeductible} onChange={(e) => set('insuranceDeductible', Number(e.target.value))} /></label>
            <label>{t('fuel')}<select value={form.fuel} onChange={(e) => set('fuel', e.target.value)}>{['Hybrid', 'Petrol', 'Diesel', 'Electric'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
            <label>{t('gearbox')}<select value={form.gearbox} onChange={(e) => set('gearbox', e.target.value)}>{['Automatic', 'Manual'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
            <label>{t('drivetrain')}<select value={form.drivetrain} onChange={(e) => set('drivetrain', e.target.value)}>{['FWD', 'RWD', 'AWD', '4WD'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
            <label>{t('steeringType')}<select value={form.steeringType} onChange={(e) => set('steeringType', e.target.value)}>{['Left-hand drive', 'Right-hand drive'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
            <label>{t('seats')}<input type="number" min="1" max="16" value={form.seats} onChange={(e) => set('seats', Number(e.target.value))} required /></label>
            <label>{t('fuelPolicy')}<select value={form.fuelPolicy} onChange={(e) => set('fuelPolicy', e.target.value)}>{[{ value: 'same_to_same', label: 'same_to_same' }, { value: 'full_to_full', label: 'full_to_full' }, { value: 'prepaid', label: 'prepaid' }].map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}</select></label>
            <label>{t('dailyKilometerAllowance')}<input type="number" min="0" value={form.dailyKilometerAllowance} onChange={(e) => set('dailyKilometerAllowance', Number(e.target.value))} /></label>
            <label>{t('excessKilometerRate')}<input type="number" min="0" step="0.01" value={form.excessKilometerRate} onChange={(e) => set('excessKilometerRate', Number(e.target.value))} /></label>
          </div>
        </section>

        <footer className="vehicle-form-footer">
          <button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button>
          {!isEdit && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => { writeDraft({ form, photoUrls, savedAt: Date.now() }); setLastSavedAt(new Date()); toast(t('draftAutoSaved')); }}
            >
              <Save />{t('saveAsDraft')}
            </button>
          )}
          <button type="submit" className="btn primary" disabled={saving}>{saving ? t('saving') : t(isEdit ? 'save' : 'create')}</button>
        </footer>
      </form>
    </Modal>
  );
}

function readDraft(): { form: any; photoUrls: string[]; savedAt: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.form || !Array.isArray(parsed.photoUrls)) return null;
    return parsed;
  } catch { return null; }
}

function writeDraft(payload: { form: any; photoUrls: string[]; savedAt: number }) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload)); } catch {}
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(DRAFT_KEY); } catch {}
}
