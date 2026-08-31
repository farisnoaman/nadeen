'use client';

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Fuel,
  Gauge,
  KeyRound,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  PenLine,
  ReceiptText,
  Search,
  XCircle,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCurrentUser } from '@/components/dashboard-shell';
import { Empty, Modal, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { money, shortDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { rentalDocumentStage, roundMoney, type RentalDocumentStage } from '@/lib/rental-document';

type RentalView = 'table' | 'grid';
type RentalAction = 'confirm' | 'handover' | 'complete' | 'cancel';

type RentalService = {
  serviceId: number;
  name: string;
  days: number;
  unitPrice: number;
  discount: number;
};

type Rental = {
  id: number;
  status: string;
  rateType: string;
  quantity: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  subtotal: number;
  discount: number;
  loyaltyLevelName: string | null;
  loyaltyDiscountPercentage: number;
  loyaltyDiscount: number;
  loyaltyPointsRate: number;
  loyaltyPointsEarned: number;
  extrasSubtotal: number;
  extraDiscount: number;
  protectionPackageId: number | null;
  protectionTier: 'basic' | 'pro' | 'premium' | 'full';
  protectionName: string;
  protectionSubtotal: number;
  protectionDeductible: number;
  protectionCoverage: string[];
  fuelCharge: number;
  bookingOdometer: number;
  renterOdometerAcknowledged: boolean;
  confirmedAt: string | null;
  renterSignatureName: string | null;
  renterSignedAt: string | null;
  handoverByRole: 'renter' | 'company' | null;
  handoverByUserId: number | null;
  invoiceIssuedAt: string | null;
  paidAt: string | null;
  pickupOdometer: number | null;
  returnOdometer: number | null;
  pickupFuelLevel: number | null;
  returnFuelLevel: number | null;
  vehicleId: number;
  vehicleOdometer: number;
  vehicleFuelLevel: number;
  fuelPolicy: string;
  dailyKilometerAllowance: number;
  allowedKilometers: number | null;
  excessKilometerRate: number;
  excessDistanceCharge: number;
  total: number;
  invoiceToken: string;
  pickupCity: string;
  pickupLocation: string;
  returnCity: string;
  returnLocation: string;
  make: string;
  model: string;
  year: number;
  image: string;
  licensePlate: string;
  category: string;
  companyName: string;
  customer: string;
  customerEmail: string;
  services: RentalService[];
};

function DocumentStageBadge({ stage }:{ stage:RentalDocumentStage }) {
  const { t } = useI18n();
  return <span className={`document-stage-badge document-stage-${stage}`}><i />{t(`documentStage_${stage}`)}</span>;
}

function RentalStatusBadges({ rental }:{ rental:Rental }) {
  const { t } = useI18n();
  return <div className="rental-status-stack"><StatusBadge status={rental.status} /><DocumentStageBadge stage={rentalDocumentStage(rental)} />{rental.status==='active'&&rental.confirmedAt&&<span className="request-confirmed-badge"><CheckCircle2/>{t('requestConfirmed')}</span>}</div>;
}

export default function RentalsPage() {
  const { lang, t } = useI18n();
  const user = useCurrentUser();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [rows, setRows] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<RentalView>('table');
  const [isMobile, setIsMobile] = useState(false);
  const [billing, setBilling] = useState<Rental | null>(null);
  const [handover, setHandover] = useState<{ rental: Rental; action: 'handover' | 'complete' } | null>(null);
  const requestedBooking = Number(searchParams.get('booking'));

  useEffect(() => {
    const saved = localStorage.getItem('ff_rental_view');
    if (saved === 'grid' || saved === 'table') setView(saved);

    api('/rentals')
      .then((data: any) => setRows(data.rentals))
      .catch(error => toast(error.message, true))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 750px)');
    const updateIsMobile = () => setIsMobile(mql.matches);
    updateIsMobile();
    mql.addEventListener('change', updateIsMobile);
    return () => mql.removeEventListener('change', updateIsMobile);
  }, []);

  const effectiveView: RentalView = isMobile ? 'grid' : view;

  useEffect(() => {
    let alive = true;
    const synchronizeHandoverState = () => api('/rentals')
      .then((data:any) => { if (alive) setRows(data.rentals); })
      .catch(() => { /* The next interval or focus event retries silently. */ });
    const timer = window.setInterval(synchronizeHandoverState, 10_000);
    window.addEventListener('focus', synchronizeHandoverState);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', synchronizeHandoverState);
    };
  }, []);

  useEffect(() => {
    if (requestedBooking > 0) {
      setTab('all');
      setSearch(String(requestedBooking));
    }
  }, [requestedBooking]);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(rental => (
      (tab === 'all' || rental.status === tab)
      && `${rental.id} ${rental.make} ${rental.model} ${rental.customer} ${rental.companyName} ${rental.licensePlate} ${rental.pickupCity} ${rental.pickupLocation} ${rental.returnCity} ${rental.returnLocation} ${rental.bookingOdometer}`
        .toLowerCase()
        .includes(query)
    ));
  }, [rows, search, tab]);

  const switchView = (next: RentalView) => {
    setView(next);
    localStorage.setItem('ff_rental_view', next);
  };

  const transition = async (rental: Rental, action: RentalAction, readings: Record<string, unknown> = {}) => {
    const status = action === 'complete' ? 'completed' : action === 'cancel' ? 'cancelled' : 'active';
    const previousRows = rows;
    setRows(items => items.map(item => item.id === rental.id ? { ...item, status } : item));
    try {
      const data: any = await api(`/rentals/${rental.id}`, { method: 'PATCH', body: JSON.stringify({ action, ...readings }) });
      setRows(items => items.map(item => item.id === rental.id ? { ...item, ...data.rental } : item));
      setHandover(null); toast(t('saved'));
    } catch (error: any) {
      setRows(previousRows); toast(error.message, true); throw error;
    }
  };

  const billUrl = (rental: Rental) => `/invoice/${rental.id}?token=${encodeURIComponent(rental.invoiceToken)}`;
  const title = user?.role === 'company' ? t('rentalPipeline') : t('historyTitle');
  const text = user?.role === 'company' ? t('rentalPipelineText') : t('historyText');
  const partnerLabel = user?.role === 'company' ? t('customer') : t('company');
  const partnerName = (rental: Rental) => user?.role === 'company' ? rental.customer : rental.companyName;
  const durationLabel = (rental: Rental) => `${rental.quantity} ${t(`${rental.rateType}${rental.quantity === 1 ? '' : 's'}`)}`;
  const discountTotal = (rental: Rental) => Number(rental.discount || 0) + Number(rental.loyaltyDiscount || 0) + Number(rental.extraDiscount || 0);
  const servicesLabel = (rental: Rental) => rental.services.length
    ? rental.services.map(service => t(service.name)).join(', ')
    : t('noExtraServices');
  const dateAndTime = (value: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));

  const exportCsv = () => {
    const header = [
      t('reservation'), t('vehicle'), partnerLabel, t('pickup'), t('returnDate'),
      t('pickupCity'), t('pickupSite'), t('returnCity'), t('returnSite'), t('duration'), t('bookingOdometer'),
      t('dailyKilometerAllowance'), t('allowedKilometers'), t('excessKilometerRate'),
      t('vehicleRental'), t('premiumServices'), t('discounts'), t('total'), t('status'),
    ];
    const lines = shown.map(rental => [
      `FF-${String(rental.id).padStart(4, '0')}`,
      `${rental.make} ${rental.model} (${rental.licensePlate})`,
      partnerName(rental),
      new Date(rental.startsAt).toISOString(),
      new Date(rental.endsAt).toISOString(),
      rental.pickupCity,
      rental.pickupLocation,
      rental.returnCity,
      rental.returnLocation,
      durationLabel(rental),
      rental.bookingOdometer,
      rental.dailyKilometerAllowance,
      rental.allowedKilometers,
      rental.excessKilometerRate,
      rental.subtotal,
      servicesLabel(rental),
      discountTotal(rental),
      rental.total,
      t(rental.status),
    ]);
    const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [header, ...lines].map(line => line.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fleetflow-rentals.csv';
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const rentalActions = (rental: Rental) => {
    const stage = rentalDocumentStage(rental);
    const documentLabel = t(stage === 'quotation' ? 'proposal' : stage === 'paid' ? 'finalWaybill' : 'bill');
    return (
      <div className="pipeline-actions bill-actions">
        <a href={billUrl(rental)} className="action-bill" aria-label={`${documentLabel} FF-${rental.id}`}>
          <ReceiptText />
          <span>{documentLabel}</span>
        </a>
        {user?.role === 'company' && !['cancelled','completed'].includes(rental.status) && (
          <button type="button" className="action-edit" onClick={() => setBilling(rental)} title={t('adjust')} aria-label={t('adjust')}>
            <Pencil />
            <span>{t('adjust')}</span>
          </button>
        )}
        {user?.role === 'company' && rental.status === 'pending' && (
          <button type="button" className="action-confirm" onClick={() => void transition(rental, 'confirm').catch(()=>undefined)} title={t('confirm')} aria-label={t('confirm')}>
            <CheckCircle2 />
            <span>{t('confirm')}</span>
          </button>
        )}
        {rental.status === 'active' && rental.confirmedAt && rental.pickupOdometer==null && (
          <button type="button" className="action-handover" onClick={() => setHandover({ rental, action:'handover' })} title={t(user?.role==='company'?'handover':'pickupVehicle')} aria-label={t(user?.role==='company'?'handover':'pickupVehicle')}>
            <KeyRound />
            <span>{t(user?.role==='company'?'handover':'pickupVehicle')}</span>
          </button>
        )}
        {user?.role === 'company' && rental.status === 'active' && rental.confirmedAt && (
          <button type="button" className="action-confirm" disabled={rental.pickupOdometer==null} onClick={() => setHandover({ rental, action:'complete' })} title={rental.pickupOdometer==null?t('pickupRequiredBeforeReturn'):t('complete')} aria-label={rental.pickupOdometer==null?t('pickupRequiredBeforeReturn'):t('complete')}>
            <CheckCircle2 />
            <span>{t('complete')}</span>
          </button>
        )}
        {['pending', 'active'].includes(rental.status) && rental.pickupOdometer==null && (
          <button
            type="button"
            className="action-cancel"
            onClick={() => void transition(rental, 'cancel').catch(()=>undefined)}
            title={t('cancelRental')}
            aria-label={t('cancelRental')}
          >
            <XCircle />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
        <button type="button" className="btn secondary" onClick={exportCsv} disabled={!shown.length}>
          <Download />
          {t('exportCsv')}
        </button>
      </div>

      <div className="schedule-policy">
        <Clock3 />
        <div>
          <strong>{t('turnaroundTitle')}</strong>
          <span>{t('turnaroundText')}</span>
        </div>
      </div>

      <div className="rental-tabs">
        {['all', 'pending', 'active', 'completed', 'cancelled'].map(key => (
          <button type="button" key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {t(key)}
            <span>{key === 'all' ? rows.length : rows.filter(rental => rental.status === key).length}</span>
          </button>
        ))}
      </div>

      <div className="filterbar rental-filter">
        <label>
          <Search />
          <input
            aria-label={t('searchReservations')}
            placeholder={t('searchReservations')}
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>
        <div className="rental-view-control">
          <span className="rental-result-count"><strong>{shown.length}</strong> {t('reservationsFound')}</span>
          <div className="rental-view-switch" role="group" aria-label={t('viewMode')}>
            <button
              type="button"
              className={effectiveView === 'table' ? 'active' : ''}
              onClick={() => switchView('table')}
              aria-pressed={effectiveView === 'table'}
              title={t('tableView')}
            >
              <List />
              <span>{t('tableView')}</span>
            </button>
            <button
              type="button"
              className={effectiveView === 'grid' ? 'active' : ''}
              onClick={() => switchView('grid')}
              aria-pressed={effectiveView === 'grid'}
              title={t('gridView')}
            >
              <LayoutGrid />
              <span>{t('gridView')}</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <section className="panel rentals-loading"><Skeleton rows={6} /></section>
      ) : shown.length === 0 ? (
        <section className="panel"><Empty icon={CalendarDays} title={t('noRentals')} text={t('noRentalsText')} /></section>
      ) : effectiveView === 'table' ? (
        <section className="panel rentals-table enhanced-rentals-table">
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>{t('reservation')}</th>
                  <th>{t('vehicle')}</th>
                  <th>{partnerLabel}</th>
                  <th>{t('dates')}</th>
                  <th>{t('duration')}</th>
                  <th>{t('total')}</th>
                  <th>{t('status')}</th>
                  <th>{t('billActions')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(rental => (
                  <tr key={rental.id}>
                    <td data-label={t('reservation')}>
                      <div className="rental-reference">
                        <strong dir="ltr">#FF-{String(rental.id).padStart(4, '0')}</strong>
                        <small>{t('created')} {shortDate(rental.createdAt)}</small>
                      </div>
                    </td>
                    <td data-label={t('vehicle')}>
                      <div className="table-car rental-table-car">
                        <img src={rental.image} alt={`${rental.make} ${rental.model}`} loading="lazy" />
                        <span>
                          <strong>{rental.make} {rental.model}</strong>
                          <small>{rental.year} · {rental.licensePlate}</small>
                        </span>
                      </div>
                    </td>
                    <td data-label={partnerLabel}>
                      <div className="rental-partner">
                        <strong>{partnerName(rental)}</strong>
                        <small>{user?.role === 'company' ? rental.customerEmail : rental.companyName}</small>
                      </div>
                    </td>
                    <td data-label={t('dates')}>
                      <div className="rental-table-dates">
                        <span><i />{dateAndTime(rental.startsAt)}</span>
                        <span><i />{dateAndTime(rental.endsAt)}</span>
                        <small><MapPin />{rental.pickupLocation}, {rental.pickupCity} → {rental.returnLocation}, {rental.returnCity}</small>
                      </div>
                    </td>
                    <td data-label={t('duration')}><span className="duration-chip">{durationLabel(rental)}</span></td>
                    <td data-label={t('total')}>
                      <div className="rental-table-total">
                        <strong>{money(rental.total)}</strong>
                        <small title={servicesLabel(rental)}>
                          {rental.protectionName || t(`protection_${rental.protectionTier}`)} · {rental.services.length
                            ? `+ ${rental.services.length} ${t(rental.services.length > 1 ? 'premiumServicesCount' : 'premiumService')}`
                            : t('noExtraServices')}
                        </small>
                        {discountTotal(rental) > 0 && (
                          <small className="discount-text">−{money(discountTotal(rental))} {t('discounts')}</small>
                        )}
                      </div>
                    </td>
                    <td data-label={t('status')}><RentalStatusBadges rental={rental} /></td>
                    <td data-label={t('billActions')}>{rentalActions(rental)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rental-card-grid">
          {shown.map(rental => (
            <article className="rental-view-card" key={rental.id}>
              <header>
                <div>
                  <span>{t('reservation')}</span>
                  <strong dir="ltr">#FF-{String(rental.id).padStart(4, '0')}</strong>
                  <small>{t('created')} {shortDate(rental.createdAt)}</small>
                </div>
<RentalStatusBadges rental={rental} />
              </header>

              <div className="rental-card-vehicle">
                <img src={rental.image} alt={`${rental.make} ${rental.model}`} loading="lazy" />
                <div>
                  <span>{user?.role === 'company' ? t(rental.category) : rental.companyName}</span>
                  <h3>{rental.make} {rental.model}</h3>
                  <small>{rental.year} · {rental.licensePlate}</small>
                </div>
              </div>

              <div className="rental-card-partner">
                <span>{partnerLabel}</span>
                <strong>{partnerName(rental)}</strong>
                <small>{user?.role === 'company' ? rental.customerEmail : rental.companyName}</small>
              </div>

              <div className="rental-card-schedule">
                <div>
                  <span>{t('pickup')}</span>
                  <strong>{dateAndTime(rental.startsAt)}</strong>
                </div>
                <div>
                  <span>{t('returnDate')}</span>
                  <strong>{dateAndTime(rental.endsAt)}</strong>
                </div>
                <p><MapPin />{rental.pickupLocation}, {rental.pickupCity} → {rental.returnLocation}, {rental.returnCity}</p>
              </div>

              <div className="rental-card-financial">
                <div>
                  <span>{t('duration')}</span>
                  <strong>{durationLabel(rental)}</strong>
                </div>
                <div>
                  <span>{t('total')}</span>
                  <strong>{money(rental.total)}</strong>
                </div>
              </div>

              <div className="rental-card-services">
                <span title={servicesLabel(rental)}><strong>{rental.protectionName || t(`protection_${rental.protectionTier}`)}</strong> · {servicesLabel(rental)}</span>
                {discountTotal(rental) > 0 && <em>−{money(discountTotal(rental))} {t('discounts')}</em>}
              </div>

              <footer>{rentalActions(rental)}</footer>
            </article>
          ))}
        </section>
      )}

      <HandoverModal handover={handover} onClose={() => setHandover(null)} onSubmit={transition} />
      <BillingEditor
        rental={billing}
        onClose={() => setBilling(null)}
        onSaved={(updated: Rental) => {
          setRows(items => items.map(item => item.id === updated.id ? { ...item, ...updated } : item));
          setBilling(null);
          toast(t('billUpdated'));
        }}
      />
    </>
  );
}

function HandoverModal({ handover, onClose, onSubmit }: { handover: { rental: Rental; action: 'handover' | 'complete' } | null; onClose: () => void; onSubmit: (rental: Rental, action: RentalAction, readings?: Record<string, unknown>) => Promise<void> }) {
  const { lang, t } = useI18n();
  const user = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [latestOdometer, setLatestOdometer] = useState(0);
  const [form, setForm] = useState({ odometer:0, fuelLevel:100, fuelCharge:0, odometerConfirmed:false, renterSignatureName:'', renterAgreementAccepted:false, paymentConfirmed:false });

  useEffect(() => {
    if (!handover) return;
    const rental = handover.rental;
    const pickup = handover.action === 'handover';
    const alreadyRecorded = pickup && rental.pickupOdometer != null;
    const fallback = pickup
      ? Math.max(Number(rental.pickupOdometer ?? 0), Number(rental.vehicleOdometer || 0), Number(rental.bookingOdometer || 0))
      : Math.max(Number(rental.vehicleOdometer || 0), Number(rental.pickupOdometer || 0));
    setLatestOdometer(fallback);
    setForm({
      odometer:alreadyRecorded ? Number(rental.pickupOdometer) : fallback,
      fuelLevel:Number(alreadyRecorded ? rental.pickupFuelLevel : rental.vehicleFuelLevel ?? rental.pickupFuelLevel ?? 100),
      fuelCharge:Number(rental.fuelCharge || 0), odometerConfirmed:alreadyRecorded,
      renterSignatureName:alreadyRecorded ? rental.renterSignatureName || rental.customer : user?.role === 'renter' ? user.name : '',
      renterAgreementAccepted:alreadyRecorded, paymentConfirmed:false,
    });
    if (alreadyRecorded || user?.role !== 'company') {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    api(`/vehicles/${rental.vehicleId}/telemetry`).then((data:any) => {
      const latest = Math.max(Number(data.vehicle?.odometer || 0), Number(rental.pickupOdometer || 0));
      setLatestOdometer(latest);
      setForm(current => ({ ...current, odometer:latest, fuelLevel:Number(data.vehicle?.fuelLevel ?? current.fuelLevel), odometerConfirmed:false }));
    }).catch(() => { /* The lifecycle API validates the latest reading again atomically. */ })
      .finally(() => setRefreshing(false));
  }, [handover, user?.id, user?.role]);

  if (!handover) return null;
  const rental = handover.rental;
  const pickup = handover.action === 'handover';
  const alreadyRecorded = pickup && rental.pickupOdometer != null;
  if (alreadyRecorded) {
    const invoiceUrl = `/invoice/${rental.id}?token=${encodeURIComponent(rental.invoiceToken)}`;
    return <Modal open onClose={onClose} title={t('pickupHandover')} subtitle={<><span dir="ltr">#FF-{String(rental.id).padStart(4,'0')}</span> · {rental.make} {rental.model}</>}><div className="recorded-handover"><header><span><CheckCircle2/></span><div><h3>{t('pickupAlreadyConfirmed')}</h3><p>{t('pickupRemainsAvailable')}</p></div></header><section><div><small>{t('pickupOdometer')}</small><strong>{Number(rental.pickupOdometer).toLocaleString()} {t('kilometers')}</strong></div><div><small>{t('pickupFuel')}</small><strong>{rental.pickupFuelLevel}%</strong></div></section><article><PenLine/><div><small>{t(rental.handoverByRole==='company'?'companyAssistedHandover':rental.handoverByRole==='renter'?'renterConfirmedHandover':'odoAcceptedBySignature')}</small><strong>{rental.renterSignatureName||rental.customer}</strong><span>{rental.renterSignedAt?dateAndTimeValue(rental.renterSignedAt,lang):'—'}</span></div></article><footer><button type="button" className="btn secondary" onClick={onClose}>{t('close')}</button><a className="btn primary" href={invoiceUrl}><ReceiptText/>{t('openIssuedInvoice')}</a></footer></div></Modal>;
  }

  const traveledKilometers = pickup ? 0 : Math.max(0, Number(form.odometer) - Number(rental.pickupOdometer || form.odometer));
  const excessKilometers = pickup ? 0 : Math.max(0, traveledKilometers - Number(rental.allowedKilometers || 0));
  const projectedExcessCharge = roundMoney(excessKilometers * Number(rental.excessKilometerRate || 0));
  const projectedFinalTotal = roundMoney(Math.max(0,
    rental.subtotal - rental.discount - Number(rental.loyaltyDiscount || 0) + Number(rental.extrasSubtotal || 0)
    + Number(rental.protectionSubtotal || 0) + Number(form.fuelCharge || 0) + projectedExcessCharge - Number(rental.extraDiscount || 0),
  ));
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try { await onSubmit(rental, handover.action, form); } catch { /* Parent restores the previous row and shows the error. */ }
    finally { setSaving(false); }
  };
  const confirmationText = pickup
    ? user?.role === 'renter' ? t('renterOdometerConfirmation') : t('companyOdometerConfirmation')
    : t('companyOdometerConfirmation');
  const signatureText = user?.role === 'renter' ? t('renterPickupSignatureText') : t('staffPickupSignatureText');
  const submitText = pickup
    ? user?.role === 'renter' ? t('confirmPickup') : t('recordHandover')
    : t('completeRental');

  return <Modal open onClose={onClose} title={t(pickup?'pickupHandover':'returnInspection')} subtitle={<><span dir="ltr">#FF-{String(rental.id).padStart(4,'0')}</span> · {rental.make} {rental.model}</>}><form className="simple-modal-form handover-form" onSubmit={save}><div className="handover-notice"><Gauge/><div><strong>{t('recordConditionRequired')}</strong><span>{t(pickup?'ksaPickupFuelRule':'returnReadingHint')}</span></div></div><div className="form-grid"><label>{t('odometer')} ({t('kilometers')})<div className="telemetry-input"><Gauge/><input required type="number" min={latestOdometer} value={form.odometer} onChange={event=>setForm({...form,odometer:Number(event.target.value),odometerConfirmed:false})}/></div></label><label>{t('fuelLevel')}<div className="telemetry-input"><Fuel/><input required type="number" min={pickup?25:0} max="100" value={form.fuelLevel} onChange={event=>setForm({...form,fuelLevel:Number(event.target.value)})}/><span>%</span></div></label>{!pickup&&<label className="span-2">{t('fuelCharge')}<input type="number" min="0" step="0.01" value={form.fuelCharge} onChange={event=>setForm({...form,fuelCharge:Number(event.target.value)})}/><small>{t('fuelChargeHint')}</small></label>}</div><label className="handover-confirmation"><input required type="checkbox" checked={form.odometerConfirmed} onChange={event=>setForm({...form,odometerConfirmed:event.target.checked})}/><span>{confirmationText}<small>{refreshing?t('refreshingTelemetry'):`${t('lastSystemOdometer')}: ${latestOdometer.toLocaleString()} ${t('kilometers')}`}</small></span></label>{pickup&&<section className="pickup-signature-panel"><header><PenLine/><div><strong>{t('renterSignatureTitle')}</strong><span>{signatureText}</span></div></header><label>{t('signedFullName')}<input required minLength={2} maxLength={120} autoComplete="off" value={form.renterSignatureName} onChange={event=>setForm({...form,renterSignatureName:event.target.value,renterAgreementAccepted:false})} placeholder={rental.customer}/></label><label className="handover-confirmation renter-agreement"><input required type="checkbox" checked={form.renterAgreementAccepted} onChange={event=>setForm({...form,renterAgreementAccepted:event.target.checked})}/><span>{t('renterAgreementConfirmation')}<small>{t('deemedOdometerAcknowledgment')}</small></span></label></section>}{!pickup&&<div className="handover-comparison"><div><span>{t('pickup')}</span><strong>{rental.pickupOdometer?.toLocaleString()} {t('kilometers')}</strong><small>{t('fuelLevel')}: {rental.pickupFuelLevel}%</small></div><div><span>{t('fuelPolicy')}</span><strong>{t(rental.fuelPolicy)}</strong><small>{t('allowedKilometers')}: {rental.allowedKilometers?.toLocaleString() || '—'} · {money(rental.excessKilometerRate)}/{t('kilometers')}</small></div></div>}{!pickup&&<div className="return-charge-preview"><span><small>{t('distanceTraveled')}</small><strong>{traveledKilometers.toLocaleString()} {t('kilometers')}</strong></span><span><small>{t('excessKilometers')}</small><strong>{excessKilometers.toLocaleString()} {t('kilometers')}</strong></span><span className="charge-due"><small>{t('projectedExcessCharge')}</small><strong>{money(projectedExcessCharge)}</strong></span><span className="final-due"><small>{t('finalAmountDue')}</small><strong>{money(projectedFinalTotal)}</strong></span></div>}{!pickup&&<label className="handover-confirmation payment-confirmation"><input required type="checkbox" checked={form.paymentConfirmed} onChange={event=>setForm({...form,paymentConfirmed:event.target.checked})}/><span>{t('paymentSettlementConfirmation')}<small>{t('paymentSettlementHint')}</small></span></label>}<footer><button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button><button className="btn primary" disabled={saving||refreshing||!form.odometerConfirmed||(pickup&&(!form.renterAgreementAccepted||form.renterSignatureName.trim().length<2))||(!pickup&&!form.paymentConfirmed)}>{saving?t('saving'):submitText}</button></footer></form></Modal>;
}

function dateAndTimeValue(value:string, lang:'en'|'ar') {
  return new Intl.DateTimeFormat(lang==='ar'?'ar':'en-US', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value));
}

function BillingEditor({ rental, onClose, onSaved }: { rental: any; onClose: () => void; onSaved: (rental: any) => void }) {
  const toast = useToast();
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<any[]>([]);
  const [lines, setLines] = useState<Record<number, { days: number; unitPrice: number; discount: number }>>({});
  const [extraDiscount, setExtraDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!rental) return;
    api('/services').then((data: any) => setCatalog(data.services));
    const initial: Record<number, any> = {};
    for (const service of rental.services || []) initial[service.serviceId] = { days: service.days, unitPrice: service.unitPrice, discount: service.discount };
    setLines(initial); setExtraDiscount(rental.extraDiscount || 0);
  }, [rental]);
  if (!rental) return null;
  const setLine = (id: number, changes: any) => setLines(current => ({ ...current, [id]: Object.assign({ days: 1, unitPrice: catalog.find(service => service.id === id)?.dailyPrice || 0, discount: 0 }, current[id] || {}, changes) }));
  const activeLines = catalog.filter(service => lines[service.id]?.days > 0).map(service => ({ serviceId: service.id, name: service.name, ...lines[service.id], subtotal: lines[service.id].days * lines[service.id].unitPrice }));
  const extras = activeLines.reduce((sum, line) => sum + line.subtotal - Math.min(line.subtotal, line.discount), 0);
  const total = Math.max(0, rental.subtotal - rental.discount - Number(rental.loyaltyDiscount || 0) + extras + Number(rental.protectionSubtotal || 0) + Number(rental.fuelCharge || 0) + Number(rental.excessDistanceCharge || 0) - extraDiscount);
  const save = async () => { setSaving(true); try { const data: any = await api(`/rentals/${rental.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'updateBilling', extraDiscount, services: activeLines }) }); onSaved(data.rental); } catch (error: any) { toast(error.message, true); } finally { setSaving(false); } };
  return <Modal open={!!rental} onClose={onClose} title={t('adjustBill')} subtitle={<><span dir="ltr">#FF-{String(rental.id).padStart(4, '0')}</span> · {rental.customer}</>} wide><div className="billing-editor"><section><header><div><FileText /><span><strong>{t('premiumServiceLines')}</strong><small>{t('adminAdjustHint')}</small></span></div></header><div className="billing-service-lines">{catalog.map(service => { const selected = lines[service.id]?.days > 0; const line = lines[service.id] || { days: 1, unitPrice: service.dailyPrice, discount: 0 }; return <article className={selected ? 'selected' : ''} key={service.id}><label><input type="checkbox" checked={selected} onChange={event => setLine(service.id, { days: event.target.checked ? 1 : 0 })} /><span><strong>{t(service.name)}</strong><small>{t('catalogPrice')}: {money(service.dailyPrice)}/{t('day')}</small></span></label>{selected && <div><label>{t('days')}<input type="number" min="1" value={line.days} onChange={event => setLine(service.id, { days: Number(event.target.value) })} /></label><label>{t('priceDay')}<input type="number" min="0" value={line.unitPrice} onChange={event => setLine(service.id, { unitPrice: Number(event.target.value) })} /></label><label>{t('lineDiscount')}<input type="number" min="0" value={line.discount} onChange={event => setLine(service.id, { discount: Number(event.target.value) })} /></label><strong>{money(line.days * line.unitPrice - line.discount)}</strong></div>}</article>; })}</div></section><aside><h3>{t('billSummary')}</h3><div><span>{t('vehicleRental')}</span><strong>{money(rental.subtotal)}</strong></div>{rental.discount > 0 && <div className="discount"><span>{t('promotion')} {rental.promoCode}</span><strong>−{money(rental.discount)}</strong></div>}{rental.loyaltyDiscount>0&&<div className="discount"><span>{t('loyaltyDiscount')} · {rental.loyaltyLevelName}</span><strong>−{money(rental.loyaltyDiscount)}</strong></div>}<div><span>{t('premiumServices')}</span><strong>{money(extras)}</strong></div><div><span>{t('protectionPackage')} · {rental.protectionName || t(`protection_${rental.protectionTier}`)}</span><strong>{money(rental.protectionSubtotal||0)}</strong></div>{rental.fuelCharge>0&&<div><span>{t('fuelCharge')}</span><strong>{money(rental.fuelCharge)}</strong></div>}{rental.excessDistanceCharge>0&&<div><span>{t('excessDistanceCharge')}</span><strong>{money(rental.excessDistanceCharge)}</strong></div>}<label>{t('additionalBillDiscount')}<input type="number" min="0" value={extraDiscount} onChange={event => setExtraDiscount(Number(event.target.value))} /></label><div className="billing-grand"><span>{t('updatedTotal')}</span><strong>{money(total)}</strong></div><p>{t('updatedPdfHint')}</p></aside></div><div className="billing-editor-actions"><button className="btn secondary" onClick={onClose}>{t('cancel')}</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? t('saving') : t('saveIssueBill')}</button></div></Modal>;
}
