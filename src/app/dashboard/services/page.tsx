'use client';
import { Baby, BriefcaseBusiness, Check, DollarSign, Plus, Save, Sparkles, Trash2, UserRound, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { money } from '@/lib/format';

const icons: Record<string, any> = { driver: UserRound, luggage: BriefcaseBusiness, 'child-seat': Baby, wifi: Wifi };
export default function ServicesPage() {
  const toast = useToast();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => { api('/services').then((data: any) => setServices(data.services)).finally(() => setLoading(false)); }, []);
  const patch = async (service: any, changes: any) => {
    const old = services;
    setServices(rows => rows.map(row => row.id === service.id ? { ...row, ...changes } : row));
    try {
      const data: any = await api(`/services/${service.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      setServices(rows => rows.map(row => row.id === service.id ? data.service : row)); toast('Service pricing updated');
    } catch (error: any) { setServices(old); toast(error.message, true); }
  };
  const remove = async (service: any) => {
    if (!confirm(`Delete ${service.name}? Existing bills will keep their saved service details.`)) return;
    const old = services; setServices(rows => rows.filter(row => row.id !== service.id));
    try { await api(`/services/${service.id}`, { method: 'DELETE' }); toast('Service removed'); }
    catch (error: any) { setServices(old); toast(error.message, true); }
  };
  return <><div className="page-heading"><div><span className="eyebrow"><Sparkles />Rental add-ons</span><h2>Premium services</h2><p>Set the daily price and availability. Renters can select only how many days they need.</p></div><button className="btn primary" onClick={() => setOpen(true)}><Plus />Add service</button></div>
    <div className="service-policy"><Sparkles /><div><strong>You control pricing and discounts</strong><span>Catalog prices are copied into each proposal. Company admins can later adjust service days, daily prices, line discounts, and an additional bill discount. Renters can change days only.</span></div></div>
    {loading ? <Skeleton cards={4} /> : <div className="admin-service-grid">{services.map(service => <ServiceCard key={service.id} service={service} onPatch={patch} onDelete={remove} />)}</div>}
    <NewService open={open} onClose={() => setOpen(false)} onSaved={(service: any) => { setServices(rows => [...rows, service]); setOpen(false); toast('Premium service added'); }} />
  </>;
}
function ServiceCard({ service, onPatch, onDelete }: any) {
  const Icon = icons[service.key] || Sparkles;
  const [price, setPrice] = useState(service.dailyPrice);
  useEffect(() => setPrice(service.dailyPrice), [service.dailyPrice]);
  return <article className={`admin-service-card ${service.active ? '' : 'inactive'}`}><header><span><Icon /></span><label className="service-switch"><input type="checkbox" checked={service.active} onChange={event => onPatch(service, { active: event.target.checked })} /><i /></label></header><h3>{service.name}</h3><p>{service.description}</p><div className="service-price-editor"><label>Price per service day<div><DollarSign /><input type="number" min="0" value={price} onChange={event => setPrice(Number(event.target.value))} /><span>/day</span></div></label><button onClick={() => onPatch(service, { dailyPrice: price })}><Save />Save</button></div><footer><span>{service.active ? <><Check />Visible to renters</> : 'Paused'}</span><button onClick={() => onDelete(service)}><Trash2 /></button></footer></article>;
}
function NewService({ open, onClose, onSaved }: any) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', key: '', description: '', dailyPrice: 25 });
  const submit = async (event: React.FormEvent) => { event.preventDefault(); try { const data: any = await api('/services', { method: 'POST', body: JSON.stringify(form) }); onSaved(data.service); } catch (error: any) { toast(error.message, true); } };
  return <Modal open={open} onClose={onClose} title="Add premium service" subtitle="Create another daily add-on for your renters"><form className="simple-modal-form" onSubmit={submit}><label>Service name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value, key: event.target.value })} placeholder="Airport meet & greet" required /></label><label>Description<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Describe what the renter receives" /></label><label>Price per day<div className="money-field"><DollarSign /><input type="number" min="0" value={form.dailyPrice} onChange={event => setForm({ ...form, dailyPrice: Number(event.target.value) })} /></div></label><footer><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary">Add service</button></footer></form></Modal>;
}
