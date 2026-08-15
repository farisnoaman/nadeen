'use client';

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
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

type RentalView = 'table' | 'grid';
type RentalAction = 'confirm' | 'complete' | 'cancel';

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
  extraDiscount: number;
  total: number;
  invoiceToken: string;
  pickupLocation: string;
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
  const [billing, setBilling] = useState<Rental | null>(null);
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
    if (requestedBooking > 0) {
      setTab('all');
      setSearch(String(requestedBooking));
    }
  }, [requestedBooking]);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(rental => (
      (tab === 'all' || rental.status === tab)
      && `${rental.id} ${rental.make} ${rental.model} ${rental.customer} ${rental.companyName} ${rental.licensePlate} ${rental.pickupLocation}`
        .toLowerCase()
        .includes(query)
    ));
  }, [rows, search, tab]);

  const switchView = (next: RentalView) => {
    setView(next);
    localStorage.setItem('ff_rental_view', next);
  };

  const transition = async (rental: Rental, action: RentalAction) => {
    const status = action === 'confirm' ? 'active' : action === 'complete' ? 'completed' : 'cancelled';
    const previousRows = rows;
    setRows(items => items.map(item => item.id === rental.id ? { ...item, status } : item));

    try {
      await api(`/rentals/${rental.id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
      toast(t('saved'));
    } catch (error: any) {
      setRows(previousRows);
      toast(error.message, true);
    }
  };

  const billUrl = (rental: Rental) => `/invoice/${rental.id}?token=${encodeURIComponent(rental.invoiceToken)}`;
  const title = user?.role === 'company' ? t('rentalPipeline') : t('historyTitle');
  const text = user?.role === 'company' ? t('rentalPipelineText') : t('historyText');
  const partnerLabel = user?.role === 'company' ? t('customer') : t('company');
  const partnerName = (rental: Rental) => user?.role === 'company' ? rental.customer : rental.companyName;
  const durationLabel = (rental: Rental) => `${rental.quantity} ${t(`${rental.rateType}${rental.quantity === 1 ? '' : 's'}`)}`;
  const discountTotal = (rental: Rental) => Number(rental.discount || 0) + Number(rental.extraDiscount || 0);
  const servicesLabel = (rental: Rental) => rental.services.length
    ? rental.services.map(service => t(service.name)).join(', ')
    : t('noExtraServices');
  const dateAndTime = (value: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));

  const exportCsv = () => {
    const header = [
      t('reservation'), t('vehicle'), partnerLabel, t('pickup'), t('returnDate'),
      t('pickupLocation'), t('duration'), t('vehicleRental'), t('premiumServices'),
      t('discounts'), t('total'), t('status'),
    ];
    const lines = shown.map(rental => [
      `FF-${String(rental.id).padStart(4, '0')}`,
      `${rental.make} ${rental.model} (${rental.licensePlate})`,
      partnerName(rental),
      new Date(rental.startsAt).toISOString(),
      new Date(rental.endsAt).toISOString(),
      rental.pickupLocation,
      durationLabel(rental),
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
    const documentLabel = t(rental.status === 'pending' ? 'proposal' : 'bill');
    return (
      <div className="pipeline-actions bill-actions">
        <a href={billUrl(rental)} className="action-bill" aria-label={`${documentLabel} FF-${rental.id}`}>
          <ReceiptText />
          <span>{documentLabel}</span>
        </a>
        {user?.role === 'company' && rental.status !== 'cancelled' && (
          <button type="button" className="action-edit" onClick={() => setBilling(rental)} title={t('adjust')} aria-label={t('adjust')}>
            <Pencil />
            <span>{t('adjust')}</span>
          </button>
        )}
        {user?.role === 'company' && rental.status === 'pending' && (
          <button type="button" className="action-confirm" onClick={() => transition(rental, 'confirm')} title={t('confirm')} aria-label={t('confirm')}>
            <CheckCircle2 />
            <span>{t('confirm')}</span>
          </button>
        )}
        {user?.role === 'company' && rental.status === 'active' && (
          <button type="button" className="action-confirm" onClick={() => transition(rental, 'complete')} title={t('complete')} aria-label={t('complete')}>
            <CheckCircle2 />
            <span>{t('complete')}</span>
          </button>
        )}
        {['pending', 'active'].includes(rental.status) && (
          <button
            type="button"
            className="action-cancel"
            onClick={() => transition(rental, 'cancel')}
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
              className={view === 'table' ? 'active' : ''}
              onClick={() => switchView('table')}
              aria-pressed={view === 'table'}
              title={t('tableView')}
            >
              <List />
              <span>{t('tableView')}</span>
            </button>
            <button
              type="button"
              className={view === 'grid' ? 'active' : ''}
              onClick={() => switchView('grid')}
              aria-pressed={view === 'grid'}
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
      ) : view === 'table' ? (
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
                        <strong>#FF-{String(rental.id).padStart(4, '0')}</strong>
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
                        <small><MapPin />{rental.pickupLocation}</small>
                      </div>
                    </td>
                    <td data-label={t('duration')}><span className="duration-chip">{durationLabel(rental)}</span></td>
                    <td data-label={t('total')}>
                      <div className="rental-table-total">
                        <strong>{money(rental.total)}</strong>
                        <small title={servicesLabel(rental)}>
                          {rental.services.length
                            ? `+ ${rental.services.length} ${t(rental.services.length > 1 ? 'premiumServicesCount' : 'premiumService')}`
                            : t('noExtraServices')}
                        </small>
                        {discountTotal(rental) > 0 && (
                          <small className="discount-text">−{money(discountTotal(rental))} {t('discounts')}</small>
                        )}
                      </div>
                    </td>
                    <td data-label={t('status')}><StatusBadge status={rental.status} /></td>
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
                  <strong>#FF-{String(rental.id).padStart(4, '0')}</strong>
                  <small>{t('created')} {shortDate(rental.createdAt)}</small>
                </div>
                <StatusBadge status={rental.status} />
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
                <p><MapPin />{rental.pickupLocation}</p>
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
                <span title={servicesLabel(rental)}>{servicesLabel(rental)}</span>
                {discountTotal(rental) > 0 && <em>−{money(discountTotal(rental))} {t('discounts')}</em>}
              </div>

              <footer>{rentalActions(rental)}</footer>
            </article>
          ))}
        </section>
      )}

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
  const total = Math.max(0, rental.subtotal - rental.discount + extras - extraDiscount);
  const save = async () => { setSaving(true); try { const data: any = await api(`/rentals/${rental.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'updateBilling', extraDiscount, services: activeLines }) }); onSaved(data.rental); } catch (error: any) { toast(error.message, true); } finally { setSaving(false); } };
  return <Modal open={!!rental} onClose={onClose} title={t('adjustBill')} subtitle={`#FF-${String(rental.id).padStart(4, '0')} · ${rental.customer}`} wide><div className="billing-editor"><section><header><div><FileText /><span><strong>{t('premiumServiceLines')}</strong><small>{t('adminAdjustHint')}</small></span></div></header><div className="billing-service-lines">{catalog.map(service => { const selected = lines[service.id]?.days > 0; const line = lines[service.id] || { days: 1, unitPrice: service.dailyPrice, discount: 0 }; return <article className={selected ? 'selected' : ''} key={service.id}><label><input type="checkbox" checked={selected} onChange={event => setLine(service.id, { days: event.target.checked ? 1 : 0 })} /><span><strong>{t(service.name)}</strong><small>{t('catalogPrice')}: {money(service.dailyPrice)}/{t('day')}</small></span></label>{selected && <div><label>{t('days')}<input type="number" min="1" value={line.days} onChange={event => setLine(service.id, { days: Number(event.target.value) })} /></label><label>{t('priceDay')}<input type="number" min="0" value={line.unitPrice} onChange={event => setLine(service.id, { unitPrice: Number(event.target.value) })} /></label><label>{t('lineDiscount')}<input type="number" min="0" value={line.discount} onChange={event => setLine(service.id, { discount: Number(event.target.value) })} /></label><strong>{money(line.days * line.unitPrice - line.discount)}</strong></div>}</article>; })}</div></section><aside><h3>{t('billSummary')}</h3><div><span>{t('vehicleRental')}</span><strong>{money(rental.subtotal)}</strong></div>{rental.discount > 0 && <div className="discount"><span>{t('promotion')} {rental.promoCode}</span><strong>−{money(rental.discount)}</strong></div>}<div><span>{t('premiumServices')}</span><strong>{money(extras)}</strong></div><label>{t('additionalBillDiscount')}<input type="number" min="0" value={extraDiscount} onChange={event => setExtraDiscount(Number(event.target.value))} /></label><div className="billing-grand"><span>{t('updatedTotal')}</span><strong>{money(total)}</strong></div><p>{t('updatedPdfHint')}</p></aside></div><div className="billing-editor-actions"><button className="btn secondary" onClick={onClose}>{t('cancel')}</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? t('saving') : t('saveIssueBill')}</button></div></Modal>;
}
