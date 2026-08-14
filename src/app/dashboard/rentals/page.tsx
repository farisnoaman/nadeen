'use client';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, Clock3, Download, FileText, Mail, Pencil, Printer, ReceiptText, Search, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCurrentUser } from '@/components/dashboard-shell';
import { Empty, Modal, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { money, shortDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export default function RentalsPage() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [billing, setBilling] = useState<any>(null);
  useEffect(() => { api('/rentals').then((data: any) => setRows(data.rentals)).catch(error => toast(error.message, true)).finally(() => setLoading(false)); }, [toast]);
  const shown = useMemo(() => rows.filter(row => (tab === 'all' || row.status === tab) && `${row.make} ${row.model} ${row.customer} ${row.companyName}`.toLowerCase().includes(search.toLowerCase())), [rows, tab, search]);
  const transition = async (rental: any, action: string) => {
    const status = action === 'confirm' ? 'active' : action === 'complete' ? 'completed' : 'cancelled';
    const old = rows; setRows(items => items.map(item => item.id === rental.id ? { ...item, status } : item));
    try { await api(`/rentals/${rental.id}`, { method: 'PATCH', body: JSON.stringify({ action }) }); toast(t('saved')); }
    catch (error: any) { setRows(old); toast(error.message, true); }
  };
  const billUrl = (rental: any) => `/invoice/${rental.id}?token=${encodeURIComponent(rental.invoiceToken)}`;
  const title = user?.role === 'company' ? t('rentalPipeline') : t('historyTitle');
  const text = user?.role === 'company' ? t('rentalPipelineText') : t('historyText');
  return <><div className="page-heading"><div><h2>{title}</h2><p>{text}</p></div><button className="btn secondary"><Download />{t('exportCsv')}</button></div>
    <div className="schedule-policy"><Clock3 /><div><strong>{t('turnaroundTitle')}</strong><span>{t('turnaroundText')}</span></div></div>
    <div className="rental-tabs">{['all', 'pending', 'active', 'completed', 'cancelled'].map(key => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{t(key)}<span>{key === 'all' ? rows.length : rows.filter(row => row.status === key).length}</span></button>)}</div>
    <div className="filterbar rental-filter"><label><Search /><input placeholder={t('searchReservations')} value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    <section className="panel rentals-table">{loading ? <Skeleton rows={6} /> : shown.length === 0 ? <Empty icon={CalendarDays} title={t('noRentals')} text={t('noRentalsText')} /> : <div className="responsive-table"><table><thead><tr><th>{t('reservation')}</th><th>{t('vehicle')}</th><th>{user?.role === 'company' ? t('customer') : t('company')}</th><th>{t('dates')}</th><th>{t('duration')}</th><th>{t('total')}</th><th>{t('status')}</th><th>{t('billActions')}</th></tr></thead><tbody>{shown.map(rental => <tr key={rental.id}><td><strong>#FF-{String(rental.id).padStart(4, '0')}</strong><small>{shortDate(rental.createdAt)}</small></td><td><div className="table-car"><img src={rental.image} /><span><strong>{rental.make} {rental.model}</strong><small>{rental.licensePlate}</small></span></div></td><td><strong>{user?.role === 'company' ? rental.customer : rental.companyName}</strong><small>{user?.role === 'company' ? rental.customerEmail : rental.pickupLocation}</small></td><td>{shortDate(rental.startsAt)}<small>{t('to')} {shortDate(rental.endsAt)}</small></td><td>{rental.quantity} {t(rental.rateType)}</td><td><strong>{money(rental.total)}</strong>{rental.services?.length > 0 && <small className="services-summary">+ {rental.services.length} {t(rental.services.length > 1 ? 'premiumServicesCount' : 'premiumService')}</small>}{(rental.discount + rental.extraDiscount) > 0 && <small className="discount-text">−{money(rental.discount + rental.extraDiscount)} {t('discounts')}</small>}</td><td><StatusBadge status={rental.status} /></td><td><div className="pipeline-actions bill-actions"><Link href={billUrl(rental)} target="_blank" className="action-bill"><ReceiptText />{t(rental.status === 'pending' ? 'proposal' : 'bill')}</Link>{user?.role === 'company' && rental.status !== 'cancelled' && <button className="action-edit" onClick={() => setBilling(rental)}><Pencil />{t('adjust')}</button>}{user?.role === 'company' && rental.status === 'pending' && <button className="action-confirm" onClick={() => transition(rental, 'confirm')}><CheckCircle2 />{t('confirm')}</button>}{user?.role === 'company' && rental.status === 'active' && <button className="action-confirm" onClick={() => transition(rental, 'complete')}><CheckCircle2 />{t('complete')}</button>}{['pending', 'active'].includes(rental.status) && <button className="action-cancel" onClick={() => transition(rental, 'cancel')}><XCircle /></button>}</div></td></tr>)}</tbody></table></div>}</section>
    <BillingEditor rental={billing} onClose={() => setBilling(null)} onSaved={(updated: any) => { setRows(items => items.map(item => item.id === updated.id ? { ...item, ...updated } : item)); setBilling(null); toast(t('billUpdated')); }} />
  </>;
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
