'use client';
import { Baby, BriefcaseBusiness, Check, DollarSign, Plus, Save, Sparkles, Trash2, UserRound, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n';

const icons: Record<string, any> = { driver: UserRound, luggage: BriefcaseBusiness, 'child-seat': Baby, wifi: Wifi };
export default function ServicesPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => { api('/services').then((data: any) => setServices(data.services)).finally(() => setLoading(false)); }, []);
  const patch = async (service: any, changes: any) => {
    const old = services;
    setServices(rows => rows.map(row => row.id === service.id ? { ...row, ...changes } : row));
    try {
      const data: any = await api(`/services/${service.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      setServices(rows => rows.map(row => row.id === service.id ? data.service : row)); toast(t('serviceUpdated'));
    } catch (error: any) { setServices(old); toast(error.message, true); }
  };
  const remove = async (service: any) => {
    if (!confirm(`${t('delete')} ${t(service.name)}? ${t('removeServiceConfirm')}`)) return;
    const old = services; setServices(rows => rows.filter(row => row.id !== service.id));
    try { await api(`/services/${service.id}`, { method: 'DELETE' }); toast(t('serviceRemoved')); }
    catch (error: any) { setServices(old); toast(error.message, true); }
  };
  return <><div className="page-heading"><div><span className="eyebrow"><Sparkles />{t('servicesEyebrow')}</span><h2>{t('premiumServices')}</h2><p>{t('servicesPageText')}</p></div><button className="btn primary" onClick={() => setOpen(true)}><Plus />{t('addService')}</button></div>
    <div className="service-policy"><Sparkles /><div><strong>{t('pricingControlTitle')}</strong><span>{t('pricingControlText')}</span></div></div>
    {loading ? <Skeleton cards={4} /> : <div className="admin-service-grid">{services.map(service => <ServiceCard key={service.id} service={service} onPatch={patch} onDelete={remove} />)}</div>}
    <NewService open={open} onClose={() => setOpen(false)} onSaved={(service: any) => { setServices(rows => [...rows, service]); setOpen(false); toast(t('serviceAdded')); }} />
  </>;
}
function ServiceCard({ service, onPatch, onDelete }: any) {
  const { t } = useI18n();
  const Icon = icons[service.key] || Sparkles;
  const [price, setPrice] = useState(service.dailyPrice);
  useEffect(() => setPrice(service.dailyPrice), [service.dailyPrice]);
  return <article className={`admin-service-card ${service.active ? '' : 'inactive'}`}><header><span><Icon /></span><label className="service-switch"><input type="checkbox" checked={service.active} onChange={event => onPatch(service, { active: event.target.checked })} /><i /></label></header><h3>{t(service.name)}</h3><p>{icons[service.key] ? t(service.key === 'child-seat' ? 'childSeatDescription' : `${service.key}Description`) : service.description}</p><div className="service-price-editor"><label>{t('pricePerServiceDay')}<div><DollarSign /><input type="number" min="0" value={price} onChange={event => setPrice(Number(event.target.value))} /><span>/{t('day')}</span></div></label><button onClick={() => onPatch(service, { dailyPrice: price })}><Save />{t('save')}</button></div><footer><span>{service.active ? <><Check />{t('visibleRenters')}</> : t('servicePaused')}</span><button onClick={() => onDelete(service)}><Trash2 /></button></footer></article>;
}
function NewService({ open, onClose, onSaved }: any) {
  const toast = useToast();
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', key: '', description: '', dailyPrice: 25 });
  const submit = async (event: React.FormEvent) => { event.preventDefault(); try { const data: any = await api('/services', { method: 'POST', body: JSON.stringify(form) }); onSaved(data.service); } catch (error: any) { toast(error.message, true); } };
  return <Modal open={open} onClose={onClose} title={t('addPremiumService')} subtitle={t('addServiceText')}><form className="simple-modal-form" onSubmit={submit}><label>{t('serviceName')}<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value, key: event.target.value })} placeholder={t('serviceNamePlaceholder')} required /></label><label>{t('description')}<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder={t('serviceDescriptionPlaceholder')} /></label><label>{t('pricePerDay')}<div className="money-field"><DollarSign /><input type="number" min="0" value={form.dailyPrice} onChange={event => setForm({ ...form, dailyPrice: Number(event.target.value) })} /></div></label><footer><button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button><button className="btn primary">{t('addService')}</button></footer></form></Modal>;
}
