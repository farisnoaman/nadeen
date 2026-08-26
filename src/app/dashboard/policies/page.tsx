'use client';
import { CarFront, Check, CircleDollarSign, Gauge, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty, Modal, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

const blank = { name:'', description:'', dailyKilometerAllowance:250, excessKilometerRate:1, appliesTo:'all', vehicleIds:[] as number[], active:true };

export default function KilometerPoliciesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [policies,setPolicies] = useState<any[]>([]);
  const [vehicles,setVehicles] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  const [open,setOpen] = useState(false);
  const [editing,setEditing] = useState<any>(null);
  useEffect(() => {
    Promise.all([api('/kilometer-policies'),api('/vehicles')]).then(([policyData,vehicleData]:any[]) => {
      setPolicies(policyData.policies); setVehicles(vehicleData.vehicles);
    }).catch(error => toast(error.message,true)).finally(() => setLoading(false));
  },[]);
  const saved = (policy:any) => {
    setPolicies(rows => editing ? rows.map(row => row.id === policy.id ? policy : row) : [policy,...rows]);
    setOpen(false); setEditing(null); toast(t('kilometerPolicySaved'));
  };
  const toggle = async (policy:any) => {
    const previous=policies;
    setPolicies(rows => rows.map(row => row.id === policy.id ? { ...row,active:!row.active } : row));
    try {
      const data:any=await api(`/kilometer-policies/${policy.id}`,{method:'PATCH',body:JSON.stringify({active:!policy.active})});
      setPolicies(rows => rows.map(row => row.id === policy.id ? data.policy : row)); toast(t('kilometerPolicySaved'));
    } catch(error:any) { setPolicies(previous); toast(error.message,true); }
  };
  const remove = async (policy:any) => {
    if(!confirm(`${t('delete')} ${policy.name}? ${t('kilometerPolicyDeleteHint')}`))return;
    const previous=policies; setPolicies(rows => rows.filter(row => row.id !== policy.id));
    try { await api(`/kilometer-policies/${policy.id}`,{method:'DELETE'}); toast(t('kilometerPolicyDeleted')); }
    catch(error:any) { setPolicies(previous); toast(error.message,true); }
  };
  return <>
    <div className="page-heading"><div><span className="eyebrow"><Gauge/>{t('rentalControls')}</span><h2>{t('kilometerPolicies')}</h2><p>{t('kilometerPoliciesPageText')}</p></div><button className="btn primary" onClick={()=>setOpen(true)}><Plus/>{t('newKilometerPolicy')}</button></div>
    <div className="insurance-policy-banner mileage-policy-banner"><Gauge/><div><strong>{t('automaticExcessBilling')}</strong><span>{t('automaticExcessBillingText')}</span></div></div>
    {loading?<Skeleton cards={6}/>:policies.length===0
      ?<Empty icon={Gauge} title={t('newKilometerPolicy')} text={t('kilometerPoliciesPageText')} action={()=>setOpen(true)} label={t('newKilometerPolicy')}/>
      :<div className="insurance-package-grid mileage-policy-grid">{policies.map(policy=><article className={`insurance-package-card mileage-policy-card ${policy.active?'':'inactive'}`} key={policy.id}>
        <header><span className="insurance-tier pro"><Gauge/>{t('mileagePolicy')}</span><label className="service-switch"><input type="checkbox" checked={policy.active} onChange={()=>toggle(policy)}/><i/></label></header>
        <h3>{policy.name}</h3><p>{policy.description||t('kilometerPolicyDefaultDescription')}</p>
        <div className="insurance-package-price"><span><small>{t('dailyKilometerAllowance')}</small><strong>{Number(policy.dailyKilometerAllowance).toLocaleString()} {t('kilometers')}</strong></span><span><small>{t('excessKilometerRate')}</small><strong>{money(policy.excessKilometerRate)}/{t('kilometers')}</strong></span></div>
        <div className="mileage-formula"><Gauge/><span><small>{t('completionFormula')}</small><strong>{t('excessFormula')}</strong></span></div>
        <div className="insurance-package-scope"><CarFront/><span><strong>{policy.appliesTo==='all'?t('wholeFleetDefault'):`${policy.vehicleIds.length} ${t('selectedVehicles')}`}</strong><small>{policy.appliesTo==='all'?t('selectedPoliciesOverride'):t('kilometerSelectedScope')}</small></span></div>
        <footer><span>{policy.active?t('policyAppliedFutureBookings'):t('policyPaused')}</span><button onClick={()=>{setEditing(policy);setOpen(true)}}><Pencil/>{t('edit')}</button><button className="danger" onClick={()=>remove(policy)} aria-label={t('delete')}><Trash2/></button></footer>
      </article>)}</div>}
    <KilometerPolicyForm open={open} policy={editing} policies={policies} vehicles={vehicles} onClose={()=>{setOpen(false);setEditing(null)}} onSaved={saved}/>
  </>;
}

function KilometerPolicyForm({open,policy,policies,vehicles,onClose,onSaved}:{open:boolean;policy:any;policies:any[];vehicles:any[];onClose:()=>void;onSaved:(policy:any)=>void}) {
  const {t}=useI18n(); const toast=useToast();
  const [form,setForm]=useState<any>(blank); const [busy,setBusy]=useState(false);
  useEffect(()=>{if(open)setForm(policy?{...policy,vehicleIds:[...policy.vehicleIds]}:{...blank,appliesTo:policies.some(item=>item.appliesTo==='all')?'selected':'all',vehicleIds:[]})},[open,policy,policies]);
  const set=(key:string,value:any)=>setForm((current:any)=>({...current,[key]:value}));
  const toggleVehicle=(id:number)=>set('vehicleIds',form.vehicleIds.includes(id)?form.vehicleIds.filter((item:number)=>item!==id):[...form.vehicleIds,id]);
  const unavailable=new Set(policies.filter(item=>item.id!==policy?.id&&item.appliesTo==='selected').flatMap(item=>item.vehicleIds));
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);
    try { const data:any=await api(policy?`/kilometer-policies/${policy.id}`:'/kilometer-policies',{method:policy?'PATCH':'POST',body:JSON.stringify(form)});onSaved(data.policy); }
    catch(error:any){toast(error.message,true)}finally{setBusy(false)}
  };
  const fleetPolicyExists=policies.some(item=>item.appliesTo==='all'&&item.id!==policy?.id);
  return <Modal open={open} onClose={onClose} title={policy?t('editKilometerPolicy'):t('newKilometerPolicy')} subtitle={t('kilometerPolicyFormText')} wide><form className="insurance-package-form mileage-policy-form" onSubmit={submit}>
    <div className="form-grid"><label>{t('policyName')}<input value={form.name} onChange={event=>set('name',event.target.value)} placeholder={t('kilometerPolicyNamePlaceholder')} required/></label><label>{t('policyStatus')}<select value={form.active?'active':'paused'} onChange={event=>set('active',event.target.value==='active')}><option value="active">{t('active')}</option><option value="paused">{t('paused')}</option></select></label><label className="span-2">{t('description')}<textarea value={form.description} onChange={event=>set('description',event.target.value)} placeholder={t('kilometerPolicyDescriptionPlaceholder')}/></label><label>{t('dailyKilometerAllowance')}<div className="telemetry-input"><Gauge/><input type="number" min="0" step="1" value={form.dailyKilometerAllowance} onChange={event=>set('dailyKilometerAllowance',Number(event.target.value))}/><span>{t('kilometers')}</span></div></label><label>{t('excessKilometerRate')}<div className="money-field"><CircleDollarSign/><input type="number" min="0" step="0.01" value={form.excessKilometerRate} onChange={event=>set('excessKilometerRate',Number(event.target.value))}/></div></label></div>
    <section className="mileage-preview"><Gauge/><div><strong>{t('policyBillingPreview')}</strong><span>{Number(form.dailyKilometerAllowance||0).toLocaleString()} {t('kilometers')}/{t('day')} · {money(form.excessKilometerRate||0)} {t('perExcessKilometer')}</span><small>{t('policySnapshotHint')}</small></div></section>
    <section className="applies"><h3>{t('applies')}</h3><div className="apply-options"><button type="button" disabled={fleetPolicyExists} className={form.appliesTo==='all'?'active':''} onClick={()=>set('appliesTo','all')}><span>{form.appliesTo==='all'&&<Check/>}</span><div><strong>{t('wholeFleetDefault')}</strong><small>{fleetPolicyExists?t('wholeFleetPolicyExists'):t('kilometerAllVehiclesHint')}</small></div></button><button type="button" className={form.appliesTo==='selected'?'active':''} onClick={()=>set('appliesTo','selected')}><span>{form.appliesTo==='selected'&&<Check/>}</span><div><strong>{t('selectedVehicles')}</strong><small>{t('selectedPoliciesOverride')}</small></div></button></div>{form.appliesTo==='selected'&&<div className="select-vehicles">{vehicles.map(vehicle=>{const disabled=unavailable.has(vehicle.id);return <button type="button" disabled={disabled} className={form.vehicleIds.includes(vehicle.id)?'active':''} onClick={()=>toggleVehicle(vehicle.id)} key={vehicle.id}><img src={vehicle.image} alt=""/><span><strong>{vehicle.make} {vehicle.model}</strong><small>{vehicle.licensePlate}{disabled?` · ${t('assignedOtherPolicy')}`:''}</small></span><i>{form.vehicleIds.includes(vehicle.id)&&<Check/>}</i></button>})}</div>}</section>
    <footer><button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button><button className="btn primary" disabled={busy}>{busy?t('saving'):t('saveApplyPolicy')}</button></footer>
  </form></Modal>;
}
