'use client';
import { CarFront, Check, CircleDollarSign, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Empty, Modal, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

const tiers = ['basic', 'pro', 'premium', 'full'];
const coverageCodes = ['TPL', 'CDW', 'LDW', 'SCDW', 'TP', 'PAI', 'RSA', 'GLASS_TYRES'];
const tierDefaults:Record<string,string[]> = {
  basic:['TPL'], pro:['TPL','CDW'], premium:['TPL','CDW','TP','PAI','RSA'],
  full:['TPL','LDW','SCDW','TP','PAI','RSA','GLASS_TYRES'],
};
const blank = { name:'', tier:'basic', description:'', dailyPrice:0, deductible:5000, coverage:['TPL'], appliesTo:'all', vehicleIds:[] as number[], active:true };

export default function InsurancePackagesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const searchParams = useSearchParams();
  const requestedPackage = Number(searchParams.get('package'));
  const [packages, setPackages] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    Promise.all([api('/insurance-packages'), api('/vehicles')]).then(([packageData, vehicleData]:any[]) => {
      setPackages(packageData.packages); setVehicles(vehicleData.vehicles);
    }).catch(error => toast(error.message, true)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (requestedPackage > 0 && packages.some(pkg => pkg.id === requestedPackage)) {
      requestAnimationFrame(() => document.getElementById(`insurance-package-${requestedPackage}`)?.scrollIntoView({ behavior:'smooth', block:'center' }));
    }
  }, [requestedPackage, packages]);

  const saved = (pkg:any) => {
    setPackages(rows => editing ? rows.map(row => row.id === pkg.id ? pkg : row) : [pkg, ...rows]);
    setOpen(false); setEditing(null); toast(t('insurancePackageSaved'));
  };
  const toggle = async (pkg:any) => {
    const old = packages;
    setPackages(rows => rows.map(row => row.id === pkg.id ? { ...row, active:!row.active } : row));
    try {
      const data:any = await api(`/insurance-packages/${pkg.id}`, { method:'PATCH', body:JSON.stringify({ active:!pkg.active }) });
      setPackages(rows => rows.map(row => row.id === pkg.id ? data.package : row));
      toast(t('insurancePackageSaved'));
    } catch (error:any) { setPackages(old); toast(error.message, true); }
  };
  const remove = async (pkg:any) => {
    if (!confirm(`${t('delete')} ${pkg.name}? ${t('insurancePackageHistoryHint')}`)) return;
    const old = packages; setPackages(rows => rows.filter(row => row.id !== pkg.id));
    try { await api(`/insurance-packages/${pkg.id}`, { method:'DELETE' }); toast(t('insurancePackageDeleted')); }
    catch (error:any) { setPackages(old); toast(error.message, true); }
  };

  return <>
    <div className="page-heading"><div><span className="eyebrow"><ShieldCheck />{t('insuranceCatalog')}</span><h2>{t('insurancePackages')}</h2><p>{t('insurancePackagesPageText')}</p></div><button className="btn primary" onClick={() => setOpen(true)}><Plus />{t('newInsurancePackage')}</button></div>
    <div className="insurance-policy-banner"><ShieldCheck /><div><strong>{t('ksaProtectionCatalogTitle')}</strong><span>{t('ksaProtectionCatalogText')}</span></div></div>
    {loading ? <Skeleton cards={6} /> : packages.length === 0
      ? <Empty icon={ShieldCheck} title={t('newInsurancePackage')} text={t('insurancePackagesPageText')} action={() => setOpen(true)} label={t('newInsurancePackage')} />
      : <div className="insurance-package-grid">{packages.map(pkg => <article id={`insurance-package-${pkg.id}`} className={`insurance-package-card ${pkg.active ? '' : 'inactive'} ${requestedPackage === pkg.id ? 'search-target' : ''}`} key={pkg.id}>
        <header><span className={`insurance-tier ${pkg.tier}`}><ShieldCheck />{t(`protection_${pkg.tier}`)}</span><label className="service-switch"><input type="checkbox" checked={pkg.active} onChange={() => toggle(pkg)} /><i /></label></header>
        <h3>{pkg.name}</h3><p>{pkg.description || t('insurancePackageDefaultDescription')}</p>
        <div className="insurance-package-price"><span><small>{t('pricePerDay')}</small><strong>{money(pkg.dailyPrice)}</strong></span><span><small>{t('deductible')}</small><strong>{money(pkg.deductible)}</strong></span></div>
        <div className="insurance-coverage-list">{pkg.coverage.map((code:string) => <span key={code}><Check />{t(`coverage_${code}`)}</span>)}</div>
        <div className="insurance-package-scope"><CarFront /><span><strong>{pkg.appliesTo === 'all' ? t('wholeFleet') : `${pkg.vehicleIds.length} ${t('selectedVehicles')}`}</strong><small>{pkg.appliesTo === 'all' ? t('everyAvailableVehicle') : t('insuranceSelectedScope')}</small></span></div>
        <footer><span>{pkg.active ? t('visibleRenters') : t('packagePaused')}</span><button onClick={() => { setEditing(pkg); setOpen(true); }}><Pencil />{t('edit')}</button><button className="danger" onClick={() => remove(pkg)} aria-label={t('delete')}><Trash2 /></button></footer>
      </article>)}</div>}
    <InsurancePackageForm open={open} pkg={editing} vehicles={vehicles} onClose={() => { setOpen(false); setEditing(null); }} onSaved={saved} />
  </>;
}

function InsurancePackageForm({ open, pkg, vehicles, onClose, onSaved }: { open:boolean; pkg:any; vehicles:any[]; onClose:()=>void; onSaved:(pkg:any)=>void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<any>(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm(pkg ? { ...pkg, coverage:[...pkg.coverage], vehicleIds:[...pkg.vehicleIds] } : { ...blank, coverage:[...blank.coverage], vehicleIds:[] }); }, [open, pkg]);
  const set = (key:string, value:any) => setForm((current:any) => ({ ...current, [key]:value }));
  const setTier = (tier:string) => setForm((current:any) => ({ ...current, tier, coverage:[...tierDefaults[tier]] }));
  const toggleCoverage = (code:string) => {
    if (code === 'TPL') return;
    set('coverage', form.coverage.includes(code) ? form.coverage.filter((item:string) => item !== code) : [...form.coverage, code]);
  };
  const toggleVehicle = (id:number) => set('vehicleIds', form.vehicleIds.includes(id) ? form.vehicleIds.filter((item:number) => item !== id) : [...form.vehicleIds, id]);
  const submit = async (event:React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const data:any = await api(pkg ? `/insurance-packages/${pkg.id}` : '/insurance-packages', { method:pkg ? 'PATCH' : 'POST', body:JSON.stringify(form) });
      onSaved(data.package);
    } catch (error:any) { toast(error.message, true); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title={pkg ? t('editInsurancePackage') : t('newInsurancePackage')} subtitle={t('insurancePackageFormText')} wide>
    <form className="insurance-package-form" onSubmit={submit}>
      <div className="form-grid"><label>{t('packageName')}<input value={form.name} onChange={event => set('name', event.target.value)} placeholder={t('packageNamePlaceholder')} required /></label><label>{t('packageTier')}<select value={form.tier} onChange={event => setTier(event.target.value)}>{tiers.map(tier => <option value={tier} key={tier}>{t(`protection_${tier}`)}</option>)}</select></label><label className="span-2">{t('description')}<textarea value={form.description} onChange={event => set('description', event.target.value)} placeholder={t('insurancePackageDescriptionPlaceholder')} /></label><label>{t('pricePerDay')}<div className="money-field"><CircleDollarSign /><input type="number" min="0" step="0.01" value={form.dailyPrice} onChange={event => set('dailyPrice', Number(event.target.value))} /></div></label><label>{t('deductible')}<div className="money-field"><CircleDollarSign /><input type="number" min="0" step="0.01" value={form.deductible} onChange={event => set('deductible', Number(event.target.value))} /></div></label></div>
      <section className="insurance-coverage-editor"><h3>{t('includedCoverage')}</h3><p>{t('includedCoverageHint')}</p><div>{coverageCodes.map(code => <button type="button" className={form.coverage.includes(code) ? 'active' : ''} onClick={() => toggleCoverage(code)} key={code} disabled={code === 'TPL'}><span>{form.coverage.includes(code) && <Check />}</span><div><strong>{code}</strong><small>{t(`coverage_${code}`)}</small></div></button>)}</div></section>
      <section className="applies"><h3>{t('applies')}</h3><div className="apply-options"><button type="button" className={form.appliesTo === 'all' ? 'active' : ''} onClick={() => set('appliesTo', 'all')}><span>{form.appliesTo === 'all' && <Check />}</span><div><strong>{t('wholeFleet')}</strong><small>{t('insuranceAllVehiclesHint')}</small></div></button><button type="button" className={form.appliesTo === 'selected' ? 'active' : ''} onClick={() => set('appliesTo', 'selected')}><span>{form.appliesTo === 'selected' && <Check />}</span><div><strong>{t('selectedVehicles')}</strong><small>{t('chooseSpecificVehicles')}</small></div></button></div>{form.appliesTo === 'selected' && <div className="select-vehicles">{vehicles.map(vehicle => <button type="button" className={form.vehicleIds.includes(vehicle.id) ? 'active' : ''} onClick={() => toggleVehicle(vehicle.id)} key={vehicle.id}><img src={vehicle.image} alt="" /><span><strong>{vehicle.make} {vehicle.model}</strong><small>{vehicle.licensePlate}</small></span><i>{form.vehicleIds.includes(vehicle.id) && <Check />}</i></button>)}</div>}</section>
      <footer><button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button><button className="btn primary" disabled={busy}>{busy ? t('saving') : t('save')}</button></footer>
    </form>
  </Modal>;
}
