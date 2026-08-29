'use client';

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileUp,
  Gauge,
  History,
  LayoutGrid,
  List,
  PackagePlus,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Timer,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Empty, Modal, Skeleton, useToast } from '@/components/ui';
import { api, apiFile } from '@/lib/client-api';
import { money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

type WorkOrder = {
  id: number;
  vehicleId: number;
  itemId: number | null;
  title: string;
  description: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'routine' | 'soon' | 'urgent';
  dueAt: string;
  dueOdometer: number | null;
  scheduledAt: string;
  durationHours: number;
  vendor: string | null;
  cost: number;
  notes: string | null;
  completedAt: string | null;
  completedOdometer: number | null;
  recurrenceDays: number | null;
  recurrenceKm: number | null;
  waybillName: string | null;
  hasWaybill: boolean;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  image: string;
  odometer: number;
  conflict: null | {
    rentalId: number;
    kind: 'active_rental' | 'upcoming_rental' | 'workshop_overlap';
    rentalStartsAt: string;
    rentalEndsAt: string;
    mustCompleteBy: string | null;
    suggestedAt: string;
  };
};

type CatalogItem = {
  id: number;
  key: string;
  name: string;
  description: string;
  intervalDays: number | null;
  intervalKm: number | null;
  defaultDurationHours: number;
  active: boolean;
};

type VehicleOption = {
  id: number;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  odometer: number;
  image: string;
  status: string;
};

const inputDate = (value: Date | string) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export default function MaintenancePage() {
  const { lang, t } = useI18n();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [metrics, setMetrics] = useState({ scheduled: 0, dueSoon: 0, overdue: 0, conflicts: 0, monthCost: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'schedule' | 'history' | 'catalog'>('schedule');
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<WorkOrder | 'new' | null>(null);
  const [completing, setCompleting] = useState<WorkOrder | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [openedFromVehicle, setOpenedFromVehicle] = useState(false);
  const [focusedWorkOrder, setFocusedWorkOrder] = useState(false);
  const requestedVehicleId = Number(searchParams.get('vehicle'));
  const requestedWorkOrderId = Number(searchParams.get('workOrder'));
  const requestedCatalogId = Number(searchParams.get('catalog'));

  const load = async () => {
    try {
      const data = await api<any>('/maintenance');
      setOrders(data.workOrders);
      setCatalog(data.catalog);
      setVehicles(data.vehicles);
      setMetrics(data.metrics);
    } catch (error: any) {
      toast(error.message, true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const savedView = localStorage.getItem('fleetflow-maintenance-view');
    if (savedView === 'table' || savedView === 'grid') setView(savedView);
  }, []);
  useEffect(() => {
    if (!openedFromVehicle && requestedVehicleId > 0 && vehicles.some(vehicle => vehicle.id === requestedVehicleId)) {
      setEditor('new');
      setOpenedFromVehicle(true);
    }
  }, [requestedVehicleId, vehicles, openedFromVehicle]);
  useEffect(() => {
    if (focusedWorkOrder || requestedWorkOrderId <= 0) return;
    const order = orders.find(entry => entry.id === requestedWorkOrderId);
    if (!order) return;
    setTab(['completed', 'cancelled'].includes(order.status) ? 'history' : 'schedule');
    setSearch(`MWO-${String(order.id).padStart(5, '0')}`);
    setFocusedWorkOrder(true);
  }, [requestedWorkOrderId, orders, focusedWorkOrder]);
  useEffect(() => {
    if (requestedCatalogId <= 0 || !catalog.some(item => item.id === requestedCatalogId)) return;
    setTab('catalog');
    requestAnimationFrame(() => document.getElementById(`maintenance-catalog-${requestedCatalogId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [requestedCatalogId, catalog]);

  const dateTime = (value: string | Date) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
  const downloadWaybill = async (order: WorkOrder) => {
    try {
      const blob = await apiFile(`/maintenance/${order.id}/waybill`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = order.waybillName || `maintenance-waybill-${order.id}`;
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error: any) {
      toast(error.message, true);
    }
  };
  const filtered = useMemo(() => orders.filter(order => {
    const matchesTab = tab === 'history'
      ? ['completed', 'cancelled'].includes(order.status)
      : tab === 'schedule'
        ? ['scheduled', 'in_progress'].includes(order.status)
        : true;
    const query = search.trim().toLowerCase();
    return matchesTab && `MWO-${String(order.id).padStart(5, '0')} ${order.title} ${order.make} ${order.model} ${order.licensePlate} ${order.vendor || ''}`.toLowerCase().includes(query);
  }), [orders, search, tab]);
  const isOverdue = (order: WorkOrder) => ['scheduled', 'in_progress'].includes(order.status) && (
    new Date(order.dueAt) < new Date() || Boolean(order.dueOdometer && order.odometer >= order.dueOdometer)
  );
  const changeView = (nextView: 'table' | 'grid') => {
    setView(nextView);
    localStorage.setItem('fleetflow-maintenance-view', nextView);
  };

  const startOrder = async (order: WorkOrder) => {
    try {
      await api(`/maintenance/${order.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'start' }) });
      toast(t('maintenanceStarted'));
      load();
    } catch (error: any) {
      toast(error.message, true);
    }
  };
  const cancelOrder = async (order: WorkOrder) => {
    if (!confirm(t('maintenanceCancelConfirm'))) return;
    try {
      await api(`/maintenance/${order.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'cancel' }) });
      toast(t('maintenanceCancelled'));
      load();
    } catch (error: any) {
      toast(error.message, true);
    }
  };
  const toggleCatalogItem = async (item: CatalogItem) => {
    try {
      const data = await api<{ item: CatalogItem }>(`/maintenance/items/${item.id}`, {
        method: 'PATCH', body: JSON.stringify({ active: !item.active }),
      });
      setCatalog(current => current.map(entry => entry.id === item.id ? data.item : entry));
      toast(t('saved'));
    } catch (error: any) {
      toast(error.message, true);
    }
  };
  const orderActions = (order: WorkOrder) => (
    <div className="maintenance-actions">
      {order.status === 'scheduled' && <button type="button" onClick={() => startOrder(order)} className="start"><Play /><span>{t('maintenanceStart')}</span></button>}
      {['scheduled', 'in_progress'].includes(order.status) && <button type="button" onClick={() => setCompleting(order)} className="complete"><CheckCircle2 /><span>{t('maintenanceComplete')}</span></button>}
      {order.status === 'scheduled' && <button type="button" onClick={() => setEditor(order)} title={t('edit')} aria-label={t('edit')}><Pencil /></button>}
      {['scheduled', 'in_progress'].includes(order.status) && <button type="button" onClick={() => cancelOrder(order)} className="cancel" title={t('cancel')} aria-label={t('cancel')}><XCircle /></button>}
    </div>
  );

  return (
    <>
      <div className="page-heading maintenance-page-heading">
        <div>
          <span className="eyebrow"><Wrench />{t('maintenanceOperations')}</span>
          <h2>{t('maintenanceTitle')}</h2>
          <p>{t('maintenanceText')}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setEditor('new')}><Plus />{t('maintenanceNewOrder')}</button>
      </div>

      <div className="maintenance-metrics">
        <Metric icon={CalendarClock} label={t('maintenanceScheduled')} value={metrics.scheduled} tone="green" />
        <Metric icon={Timer} label={t('maintenanceDueSoon')} value={metrics.dueSoon} tone="amber" />
        <Metric icon={AlertTriangle} label={t('maintenanceOverdue')} value={metrics.overdue} tone="red" />
        <Metric icon={ShieldCheck} label={t('maintenanceReservationConflicts')} value={metrics.conflicts} tone="blue" />
        <Metric icon={CircleDollarSign} label={t('maintenanceMonthCost')} value={money(metrics.monthCost)} tone="violet" />
      </div>

      {metrics.conflicts > 0 && (
        <div className="maintenance-conflict-banner">
          <AlertTriangle />
          <div><strong>{t('maintenanceConflictTitle')}</strong><span>{t('maintenanceConflictText')}</span></div>
          <button type="button" onClick={() => { setTab('schedule'); setSearch(''); }}>{t('maintenanceReview')}</button>
        </div>
      )}

      <div className="maintenance-toolbar">
        <div className="maintenance-tabs">
          <button type="button" className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}><CalendarClock />{t('maintenanceSchedule')}<span>{orders.filter(order => ['scheduled', 'in_progress'].includes(order.status)).length}</span></button>
          <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History />{t('maintenanceHistory')}<span>{orders.filter(order => order.status === 'completed').length}</span></button>
          <button type="button" className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}><ClipboardList />{t('maintenanceCatalog')}<span>{catalog.filter(item => item.active).length}</span></button>
        </div>
        {tab !== 'catalog' ? (
          <div className="maintenance-toolbar-controls">
            <label><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('maintenanceSearch')} /></label>
            <div className="maintenance-view-switch" role="group" aria-label={t('maintenanceViewMode')}>
              <button type="button" className={view === 'table' ? 'active' : ''} aria-pressed={view === 'table'} title={t('tableView')} onClick={() => changeView('table')}><List /><span>{t('tableView')}</span></button>
              <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} title={t('gridView')} onClick={() => changeView('grid')}><LayoutGrid /><span>{t('gridView')}</span></button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn secondary" onClick={() => setCatalogOpen(true)}><PackagePlus />{t('maintenanceAddItem')}</button>
        )}
      </div>

      {loading ? <section className="panel maintenance-loading"><Skeleton rows={7} /></section> : tab === 'catalog' ? (
        <section className="maintenance-catalog-grid">
          {catalog.map(item => (
            <article id={`maintenance-catalog-${item.id}`} className={`maintenance-catalog-card ${item.active ? '' : 'disabled'} ${requestedCatalogId === item.id ? 'search-target' : ''}`} key={item.id}>
              <header><span><Wrench /></span><button type="button" role="switch" aria-checked={item.active} className={item.active ? 'on' : ''} onClick={() => toggleCatalogItem(item)}><i /></button></header>
              <h3>{t(item.name)}</h3>
              <p>{t(item.description)}</p>
              <footer>
                <span><CalendarClock />{item.intervalDays ? `${item.intervalDays} ${t('days')}` : t('maintenanceAsNeeded')}</span>
                <span><Gauge />{item.intervalKm ? item.intervalKm.toLocaleString() : '—'} {t('miles')}</span>
                <span><Timer />{item.defaultDurationHours}h</span>
              </footer>
            </article>
          ))}
        </section>
      ) : filtered.length === 0 ? (
        <section className="panel"><Empty icon={Wrench} title={t('maintenanceEmpty')} text={t('maintenanceEmptyText')} action={() => setEditor('new')} label={t('maintenanceNewOrder')} /></section>
      ) : (
        view === 'grid' ? (
          <section className="maintenance-order-grid">
            {filtered.map(order => {
              const overdue = isOverdue(order);
              return (
                <article className={`maintenance-order-card ${order.conflict ? 'has-conflict' : ''}`} key={order.id}>
                  <div className="maintenance-card-photo">
                    <img src={order.image} alt={`${order.make} ${order.model}`} loading="lazy" />
                    <span className={`maintenance-status maintenance-status-${order.status}`}>{t(`maintenanceStatus_${order.status}`)}</span>
                    <em>{t(`maintenancePriority_${order.priority}`)}</em>
                  </div>
                  <div className="maintenance-card-body">
                    <header>
                      <div><small>MWO-{String(order.id).padStart(5, '0')}</small><h3>{t(order.title)}</h3></div>
                      <span><strong>{order.make} {order.model}</strong><small>{order.year} · {order.licensePlate}</small></span>
                    </header>
                    {order.conflict && <div className="maintenance-card-conflict"><AlertTriangle /><span>{t(order.conflict.kind === 'active_rental' ? 'maintenanceActiveRental' : 'maintenanceBeforeRental')} <span dir="ltr">#FF-{String(order.conflict.rentalId).padStart(4, '0')}</span></span></div>}
                    <div className="maintenance-card-dates">
                      <div className={overdue ? 'overdue' : ''}><span>{t('maintenanceDue')}</span><strong>{dateTime(order.dueAt)}</strong><small><Gauge />{order.dueOdometer?.toLocaleString() || '—'} {t('miles')}</small>{overdue && <em>{t('maintenanceOverdue')}</em>}</div>
                      <div><span>{t('maintenanceWorkshop')}</span><strong>{dateTime(order.scheduledAt)}</strong><small><Timer />{order.durationHours}h {order.vendor ? `· ${order.vendor}` : ''}</small></div>
                    </div>
                    <div className="maintenance-card-finance">
                      <span><small>{t('maintenanceCostWaybill')}</small><strong>{order.status === 'completed' ? money(order.cost) : '—'}</strong></span>
                      {order.hasWaybill ? <button type="button" onClick={() => downloadWaybill(order)}><Download /><span>{order.waybillName}</span></button> : <small>{t('maintenanceNoWaybill')}</small>}
                    </div>
                  </div>
                  {['scheduled', 'in_progress'].includes(order.status) && <footer>{orderActions(order)}</footer>}
                </article>
              );
            })}
          </section>
        ) : (
          <section className={`panel maintenance-table ${tab === 'history' ? 'history-table' : ''}`}>
            <div className="responsive-table">
              <table>
                <thead><tr><th>{t('vehicle')}</th><th>{t('maintenanceTask')}</th><th>{t('maintenanceDue')}</th><th>{t('maintenanceWorkshop')}</th><th>{t('status')}</th><th>{t('maintenanceCostWaybill')}</th>{tab === 'schedule' && <th>{t('billActions')}</th>}</tr></thead>
                <tbody>{filtered.map(order => {
                  const overdue = isOverdue(order);
                  return (
                    <tr key={order.id} className={order.conflict ? 'has-conflict' : ''}>
                      <td data-label={t('vehicle')}><div className="maintenance-vehicle"><img src={order.image} alt={`${order.make} ${order.model}`} loading="lazy" /><span><strong>{order.make} {order.model}</strong><small>{order.year} · {order.licensePlate}</small></span></div></td>
                      <td data-label={t('maintenanceTask')}><div className="maintenance-task"><strong>{t(order.title)}</strong><small>MWO-{String(order.id).padStart(5, '0')} · {t(`maintenancePriority_${order.priority}`)}</small>{order.conflict && <em><AlertTriangle />{t(order.conflict.kind === 'active_rental' ? 'maintenanceActiveRental' : 'maintenanceBeforeRental')} <span dir="ltr">#FF-{String(order.conflict.rentalId).padStart(4, '0')}</span></em>}</div></td>
                      <td data-label={t('maintenanceDue')}><div className={`maintenance-due ${overdue ? 'overdue' : ''}`}><strong>{dateTime(order.dueAt)}</strong><small><Gauge />{order.dueOdometer?.toLocaleString() || '—'} {t('miles')}</small>{overdue && <em>{t('maintenanceOverdue')}</em>}</div></td>
                      <td data-label={t('maintenanceWorkshop')}><div className="maintenance-workshop"><strong>{dateTime(order.scheduledAt)}</strong><small><Timer />{order.durationHours}h {order.vendor ? `· ${order.vendor}` : ''}</small></div></td>
                      <td data-label={t('status')}><span className={`maintenance-status maintenance-status-${order.status}`}>{t(`maintenanceStatus_${order.status}`)}</span></td>
                      <td data-label={t('maintenanceCostWaybill')}><div className="maintenance-finance"><strong>{order.status === 'completed' ? money(order.cost) : '—'}</strong>{order.hasWaybill ? <button type="button" onClick={() => downloadWaybill(order)}><Download />{order.waybillName}</button> : <small>{t('maintenanceNoWaybill')}</small>}</div></td>
                      {tab === 'schedule' && <td data-label={t('billActions')}>{orderActions(order)}</td>}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </section>
        )
      )}

      <WorkOrderEditor open={!!editor} order={editor === 'new' ? null : editor} initialVehicleId={requestedVehicleId > 0 ? requestedVehicleId : undefined} vehicles={vehicles} catalog={catalog.filter(item => item.active)} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />
      <CompletionModal order={completing} onClose={() => setCompleting(null)} onSaved={() => { setCompleting(null); load(); }} />
      <CatalogModal open={catalogOpen} onClose={() => setCatalogOpen(false)} onSaved={(item: CatalogItem) => { setCatalog(current => [...current, item]); setCatalogOpen(false); toast(t('maintenanceItemAdded')); }} />
    </>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Wrench; label: string; value: string | number; tone: string }) {
  return <article className="maintenance-metric"><span className={tone}><Icon /></span><div><small>{label}</small><strong>{value}</strong></div></article>;
}

function WorkOrderEditor({ open, order, initialVehicleId, vehicles, catalog, onClose, onSaved }: { open: boolean; order: WorkOrder | null; initialVehicleId?: number; vehicles: VehicleOption[]; catalog: CatalogItem[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const defaultItem = catalog[0];
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (!open) return;
    const item = order ? catalog.find(entry => entry.id === order.itemId) : defaultItem;
    const selectedVehicle = vehicles.find(vehicle => vehicle.id === initialVehicleId) || vehicles[0];
    const scheduled = new Date(Date.now() + 2 * 86_400_000);
    const due = new Date(Date.now() + 7 * 86_400_000);
    setForm(order ? {
      vehicleId: order.vehicleId, itemId: order.itemId, title: order.title, dueAt: inputDate(order.dueAt),
      dueOdometer: order.dueOdometer || '', scheduledAt: inputDate(order.scheduledAt), durationHours: order.durationHours,
      priority: order.priority, vendor: order.vendor || '', notes: order.notes || '', recurrenceDays: order.recurrenceDays || '', recurrenceKm: order.recurrenceKm || '',
    } : {
      vehicleId: selectedVehicle?.id || '', itemId: item?.id || '', title: item?.name || '', dueAt: inputDate(due),
      dueOdometer: selectedVehicle ? selectedVehicle.odometer + Number(item?.intervalKm || 10000) : '', scheduledAt: inputDate(scheduled), durationHours: item?.defaultDurationHours || 1,
      priority: 'routine', vendor: '', notes: '', recurrenceDays: item?.intervalDays || '', recurrenceKm: item?.intervalKm || '',
    });
  }, [open, order, initialVehicleId, vehicles, catalog]);
  const set = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));
  const chooseItem = (id: number) => {
    const item = catalog.find(entry => entry.id === id);
    setForm((current: any) => ({ ...current, itemId: id, title: item?.name || current.title, durationHours: item?.defaultDurationHours || 1, recurrenceDays: item?.intervalDays || '', recurrenceKm: item?.intervalKm || '' }));
  };
  const chooseVehicle = (id: number) => {
    const vehicle = vehicles.find(entry => entry.id === id);
    const item = catalog.find(entry => entry.id === Number(form.itemId));
    setForm((current: any) => ({ ...current, vehicleId: id, dueOdometer: vehicle ? vehicle.odometer + Number(item?.intervalKm || 10000) : current.dueOdometer }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      await api(order ? `/maintenance/${order.id}` : '/maintenance', { method: order ? 'PATCH' : 'POST', body: JSON.stringify(order ? { action: 'reschedule', ...form } : form) });
      toast(t(order ? 'maintenanceRescheduled' : 'maintenanceCreated'));
      onSaved();
    } catch (error: any) {
      if (error.conflict?.suggestedAt) set('scheduledAt', inputDate(error.conflict.suggestedAt));
      toast(error.message, true);
    } finally { setSaving(false); }
  };
  return <Modal open={open} onClose={onClose} title={order ? t('maintenanceEditOrder') : t('maintenanceNewOrder')} subtitle={t('maintenanceOrderHint')} wide><form className="maintenance-form" onSubmit={submit}><div className="maintenance-form-grid"><label>{t('vehicle')}<select value={form.vehicleId || ''} onChange={event => chooseVehicle(Number(event.target.value))} required>{vehicles.map(vehicle => <option value={vehicle.id} key={vehicle.id}>{vehicle.make} {vehicle.model} · {vehicle.licensePlate}</option>)}</select></label><label>{t('maintenanceTask')}<select value={form.itemId || ''} onChange={event => chooseItem(Number(event.target.value))} disabled={!!order} required>{catalog.map(item => <option value={item.id} key={item.id}>{t(item.name)}</option>)}</select></label><label className="span-2">{t('maintenanceOrderTitle')}<input value={form.title || ''} onChange={event => set('title', event.target.value)} required /></label><label>{t('maintenanceDueDate')}<input type="datetime-local" value={form.dueAt || ''} onChange={event => set('dueAt', event.target.value)} required /></label><label>{t('maintenanceDueMileage')}<input type="number" min="0" value={form.dueOdometer || ''} onChange={event => set('dueOdometer', event.target.value)} /></label><label>{t('maintenanceWorkshopDate')}<input type="datetime-local" value={form.scheduledAt || ''} onChange={event => set('scheduledAt', event.target.value)} required /></label><label>{t('maintenanceDuration')}<input type="number" min="0.5" max="72" step="0.5" value={form.durationHours || 1} onChange={event => set('durationHours', Number(event.target.value))} /></label><label>{t('maintenancePriority')}<select value={form.priority || 'routine'} onChange={event => set('priority', event.target.value)}>{['routine','soon','urgent'].map(value => <option value={value} key={value}>{t(`maintenancePriority_${value}`)}</option>)}</select></label><label>{t('maintenanceVendor')}<input value={form.vendor || ''} onChange={event => set('vendor', event.target.value)} placeholder={t('maintenanceVendorPlaceholder')} /></label><label>{t('maintenanceRepeatDays')}<input type="number" min="0" value={form.recurrenceDays || ''} onChange={event => set('recurrenceDays', event.target.value)} /></label><label>{t('maintenanceRepeatMileage')}<input type="number" min="0" value={form.recurrenceKm || ''} onChange={event => set('recurrenceKm', event.target.value)} /></label><label className="span-2">{t('maintenanceNotes')}<textarea value={form.notes || ''} onChange={event => set('notes', event.target.value)} /></label></div><div className="maintenance-form-policy"><ShieldCheck /><span><strong>{t('maintenanceProtectedScheduling')}</strong><small>{t('maintenanceProtectedSchedulingText')}</small></span></div><footer><button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button><button className="btn primary" disabled={saving}>{saving ? t('saving') : t('save')}</button></footer></form></Modal>;
}

function CompletionModal({ order, onClose, onSaved }: { order: WorkOrder | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n(); const toast = useToast();
  const [form, setForm] = useState<any>({}); const [file, setFile] = useState<File | null>(null); const [saving, setSaving] = useState(false);
  useEffect(() => { if (order) { setForm({ cost: order.cost || '', vendor: order.vendor || '', completedOdometer: order.odometer, notes: order.notes || '' }); setFile(null); } }, [order]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!order) return; setSaving(true); try { await api(`/maintenance/${order.id}`, { method:'PATCH', body:JSON.stringify({ action:'complete', ...form }) }); if (file) { const data = await readFile(file); await api(`/maintenance/${order.id}`, { method:'PATCH', body:JSON.stringify({ action:'attachWaybill', file:{ name:file.name, mime:file.type, data } }) }); } toast(t('maintenanceCompleted')); onSaved(); } catch(error:any) { toast(error.message,true); } finally { setSaving(false); } };
  return <Modal open={!!order} onClose={onClose} title={t('maintenanceCompleteTitle')} subtitle={order ? `${order.make} ${order.model} · ${t(order.title)}` : ''} wide><form className="maintenance-completion" onSubmit={submit}><div className="maintenance-completion-grid"><label>{t('maintenanceFinalCost')}<input required type="number" min="0" step="0.01" value={form.cost || ''} onChange={event => setForm((current:any)=>({...current,cost:event.target.value}))} /></label><label>{t('maintenanceCompletedMileage')}<input required type="number" min="0" value={form.completedOdometer || ''} onChange={event => setForm((current:any)=>({...current,completedOdometer:event.target.value}))} /></label><label className="span-2">{t('maintenanceVendor')}<input value={form.vendor || ''} onChange={event => setForm((current:any)=>({...current,vendor:event.target.value}))} /></label><label className="span-2">{t('maintenanceCompletionNotes')}<textarea value={form.notes || ''} onChange={event => setForm((current:any)=>({...current,notes:event.target.value}))} /></label><label className="span-2 maintenance-file"><FileUp /><span><strong>{file?.name || t('maintenanceAttachWaybill')}</strong><small>{t('maintenanceWaybillHint')}</small></span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] || null)} /></label></div><footer><button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button><button className="btn primary" disabled={saving}><CheckCircle2 />{saving?t('saving'):t('maintenanceComplete')}</button></footer></form></Modal>;
}

function CatalogModal({ open, onClose, onSaved }: { open:boolean; onClose:()=>void; onSaved:(item:CatalogItem)=>void }) {
  const {t}=useI18n(); const toast=useToast(); const[saving,setSaving]=useState(false); const[form,setForm]=useState({name:'',description:'',intervalDays:180,intervalKm:10000,defaultDurationHours:1});
  const submit=async(event:FormEvent)=>{event.preventDefault();setSaving(true);try{const data=await api<{item:CatalogItem}>('/maintenance/items',{method:'POST',body:JSON.stringify(form)});onSaved(data.item);setForm({name:'',description:'',intervalDays:180,intervalKm:10000,defaultDurationHours:1});}catch(error:any){toast(error.message,true)}finally{setSaving(false)}};
  return <Modal open={open} onClose={onClose} title={t('maintenanceAddItem')} subtitle={t('maintenanceAddItemText')}><form className="maintenance-catalog-form" onSubmit={submit}><label>{t('maintenanceItemName')}<input required minLength={3} value={form.name} onChange={event=>setForm(current=>({...current,name:event.target.value}))}/></label><label>{t('description')}<textarea value={form.description} onChange={event=>setForm(current=>({...current,description:event.target.value}))}/></label><div><label>{t('maintenanceRepeatDays')}<input type="number" min="0" value={form.intervalDays} onChange={event=>setForm(current=>({...current,intervalDays:Number(event.target.value)}))}/></label><label>{t('maintenanceRepeatMileage')}<input type="number" min="0" value={form.intervalKm} onChange={event=>setForm(current=>({...current,intervalKm:Number(event.target.value)}))}/></label></div><label>{t('maintenanceDuration')}<input type="number" min="0.5" step="0.5" value={form.defaultDurationHours} onChange={event=>setForm(current=>({...current,defaultDurationHours:Number(event.target.value)}))}/></label><footer><button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button><button className="btn primary" disabled={saving}>{saving?t('saving'):t('add')}</button></footer></form></Modal>;
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) return reject(new Error('The waybill must be smaller than 5 MB.'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Unable to read the waybill.'));
    reader.readAsDataURL(file);
  });
}
