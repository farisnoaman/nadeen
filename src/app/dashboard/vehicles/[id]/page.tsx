'use client';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CarFront, CircleDollarSign, Fuel, Gauge, History, MapPin, Pencil, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { dateTime, money, shortDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { Avatar, Empty, Modal, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { VehicleImageCarousel } from '@/components/vehicle-image-carousel';

export default function VehicleDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [readingOpen, setReadingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState<any>({ eventType:'manual', odometer:0, fuelLevel:100, fuelAddedLiters:'', fuelCost:'', notes:'' });
  const load = () => api(`/vehicles/${id}`).then(setData).catch(error => toast(error.message, true));
  useEffect(() => { load(); }, [id]);
  if (!data) return <Skeleton rows={6} />;
  const v = data.vehicle;
  const openReading = () => {
    setReading({ eventType:'manual', odometer:v.odometer, fuelLevel:v.fuelLevel, fuelAddedLiters:'', fuelCost:'', notes:'' });
    setReadingOpen(true);
    api(`/vehicles/${v.id}/telemetry`).then((latest:any) => {
      setData((current:any) => ({ ...current, vehicle:{ ...current.vehicle, ...latest.vehicle }, conditionLogs:latest.logs, fuelAnalytics:latest.fuelAnalytics }));
      setReading((current:any) => ({ ...current, odometer:latest.vehicle.odometer, fuelLevel:latest.vehicle.fuelLevel }));
    }).catch((error:any) => toast(error.message, true));
  };
  const saveReading = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const result: any = await api(`/vehicles/${v.id}/telemetry`, { method:'POST', body:JSON.stringify(reading) });
      setData((current: any) => ({ ...current, vehicle:{ ...current.vehicle, ...result.vehicle }, fuelAnalytics:result.fuelAnalytics, conditionLogs:[result.log, ...(current.conditionLogs || [])] }));
      setReadingOpen(false); toast(t('readingRecorded'));
    } catch (error: any) { toast(error.message, true); }
    finally { setSaving(false); }
  };
  return <>
    <div className="detail-header">
      <Link href="/dashboard/vehicles" className="back-link"><ArrowLeft />{t('fleet')}</Link>
      <div><span className="eyebrow">{v.licensePlate}</span><h2>{v.make} {v.model}</h2><p>{v.year} · {v.trim} · {t(v.bodyType || v.category)} · {v.companyName}</p></div>
      <div><StatusBadge status={v.status}/>{data.userRole === 'company' && <button type="button" className="btn secondary" onClick={openReading}><Plus />{t('recordReading')}</button>}<Link href="/dashboard/vehicles" className="btn secondary"><Pencil />{t('edit')}</Link></div>
    </div>
    <div className="detail-grid">
      <section className="panel vehicle-hero-panel"><VehicleImageCarousel image={v.image} images={v.images}/><div className="detail-specs">{[
        [Gauge,`${v.odometer.toLocaleString()} ${t('kilometers')}`],
        [Fuel,`${v.fuelLevel}% · ${t(v.fuelPolicy)}`],
        [ShieldCheck,t(v.insuranceCoverage)],
        [MapPin,[...new Set((v.pickupLocations||[]).map((location:any)=>location.city))].join(' · ') || v.location],
      ].map(([Icon,value]:any)=><div key={value}><Icon/><span>{value}</span></div>)}</div><div className="features-list">{v.features.map((item:string)=><span key={item}>{t(item)}</span>)}</div></section>
      <aside className="detail-side">
        <div className="detail-metrics"><article><span><CircleDollarSign/></span><div><small>{t('lifetimeRevenue')}</small><strong>{money(data.analytics.revenue)}</strong></div></article><article><span><History/></span><div><small>{t('completedTrips')}</small><strong>{data.analytics.trips}</strong></div></article><article><span><CalendarDays/></span><div><small>{t('currentBookings')}</small><strong>{data.analytics.active}</strong></div></article></div>
        <section className="panel pricing-panel"><h3>{t('pricing')}</h3>{[['hour',v.hourlyRate],['day',v.dailyRate],['week',v.weeklyRate],['month',v.monthlyRate]].map(([label,value])=><div key={label}><span>{t(label as string)}</span><strong>{money(value as number)}</strong></div>)}</section>
        <section className="panel vehicle-pickup-sites"><header><MapPin/><div><h3>{t('pickupLocations')}</h3><p>{t('pickupLocationsHint')}</p></div></header><div>{(v.pickupLocations||[]).map((location:any)=><span key={`${location.city}-${location.site}`}><strong>{location.city}</strong><small>{location.site}</small></span>)}</div></section>
        <section className="panel vehicle-insurance-panel"><header><ShieldCheck/><div><h3>{t('vehicleInsurance')}</h3><p>{t('ksaVehicleCompliance')}</p></div></header><dl><div><dt>{t('insuranceCoverage')}</dt><dd>{t(v.insuranceCoverage)}</dd></div><div><dt>{t('insuranceProvider')}</dt><dd>{v.insuranceProvider || '—'}</dd></div><div><dt>{t('insurancePolicyNumber')}</dt><dd>{v.insurancePolicyNumber || '—'}</dd></div><div><dt>{t('insurancePolicyExpiry')}</dt><dd>{v.insurancePolicyExpiry ? shortDate(v.insurancePolicyExpiry) : '—'}</dd></div><div><dt>{t('deductible')}</dt><dd>{money(v.insuranceDeductible)}</dd></div></dl></section>
      </aside>
    </div>
    <section className="panel protection-overview"><header><div><h3>{t('rentalProtection')}</h3><p>{t('protectionCompanyConfig')}</p></div><ShieldCheck/></header><div>{v.protectionPackages.map((item:any)=><article key={item.id || item.tier} className={item.active?'active':'inactive'}><span>{item.name || t(`protection_${item.tier}`)}</span><strong>{item.dailyPrice ? `${money(item.dailyPrice)} / ${t('day')}` : t('included')}</strong><small>{t('deductible')}: {money(item.deductible)}</small><p>{item.coverage.map((code:string)=>t(`coverage_${code}`)).join(' · ')}</p></article>)}</div></section>
    {data.userRole === 'company' && <section className="panel condition-history"><header><div><h3>{t('odometerFuelTracking')}</h3><p>{t('conditionHistoryText')}</p></div><button type="button" className="btn secondary small" onClick={openReading}><Plus />{t('recordReading')}</button></header>{data.fuelAnalytics&&<div className={`fuel-efficiency-summary ${data.fuelAnalytics.status}`}><article><small>{t('lastSystemOdometer')}</small><strong>{Number(data.fuelAnalytics.lastRecordedOdometer).toLocaleString()} {t('kilometers')}</strong></article><article><small>{t('measuredDistance')}</small><strong>{Number(data.fuelAnalytics.totalDistance).toLocaleString()} {t('kilometers')}</strong></article><article><small>{t('fuelCostPerKm')}</small><strong>{money(data.fuelAnalytics.costPerKm)} / {t('kilometers')}</strong></article><article><small>{t('fuelConsumption')}</small><strong>{data.fuelAnalytics.litersPer100Km || '—'} {t('liters')} / 100 {t('kilometers')}</strong></article><article className="recommendation"><small>{t('efficiencyRecommendation')}</small><strong>{t(`efficiency_${data.fuelAnalytics.status}`)}</strong></article></div>}{data.conditionLogs?.length ? <div className="condition-log-list">{data.conditionLogs.map((log:any)=><article key={log.id}><span className={`condition-log-icon ${log.eventType}`}>{log.eventType==='refuel'?<Fuel/>:<Gauge/>}</span><div><strong>{t(`condition_${log.eventType}`)}</strong><small>{dateTime(log.createdAt)}{log.rentalId?` · FF-${String(log.rentalId).padStart(4,'0')}`:''}</small><p>{log.notes || t('conditionReading')}</p></div><div><strong>{Number(log.odometer).toLocaleString()} {t('kilometers')}</strong><small>{t('fuelLevel')}: {log.fuelLevel}%</small>{log.fuelAddedLiters!=null&&<small>+{log.fuelAddedLiters} {t('liters')} · {money(log.fuelCost||0)}</small>}{data.fuelAnalytics?.intervals?.[String(log.id)]&&<small className="fuel-interval">{data.fuelAnalytics.intervals[String(log.id)].distanceSincePreviousFuel.toLocaleString()} {t('kilometers')} · {money(data.fuelAnalytics.intervals[String(log.id)].costPerKm)}/{t('kilometers')} · {data.fuelAnalytics.intervals[String(log.id)].litersPer100Km} {t('liters')}/100 {t('kilometers')}</small>}</div></article>)}</div>:<Empty icon={Gauge} title={t('noConditionHistory')} text={t('conditionHistoryText')}/>}</section>}
    <section className="panel history-panel"><header><div><h3>{t('rentalHistory')}</h3><p>{t('completeVehicleRecord')}</p></div><History/></header>{data.history.length===0?<Empty icon={CarFront} title={t('noRentals')} text={t('noRentalsText')}/>:<div className="responsive-table"><table><thead><tr><th>{t('customer')}</th><th>{t('dates')}</th><th>{t('odometer')}</th><th>{t('fuelLevel')}</th><th>{t('protectionPackage')}</th><th>{t('total')}</th><th>{t('status')}</th></tr></thead><tbody>{data.history.map((r:any)=><tr key={r.id}><td><div className="table-person"><Avatar name={r.customer} initials={r.avatar} size="sm"/><span><strong>{r.customer}</strong><small>{r.customerEmail}</small></span></div></td><td>{shortDate(r.startsAt)} – {shortDate(r.endsAt)}</td><td>{r.pickupOdometer??'—'} → {r.returnOdometer??'—'}</td><td>{r.pickupFuelLevel??'—'}% → {r.returnFuelLevel??'—'}%</td><td>{r.protectionName || t(`protection_${r.protectionTier}`)}</td><td><strong>{money(r.total)}</strong></td><td><StatusBadge status={r.status}/></td></tr>)}</tbody></table></div>}</section>
    <Modal open={readingOpen} onClose={()=>setReadingOpen(false)} title={t('recordReading')} subtitle={`${v.make} ${v.model} · ${v.licensePlate}`}>
      <form className="simple-modal-form telemetry-form" onSubmit={saveReading}><label>{t('conditionEvent')}<select value={reading.eventType} onChange={event=>setReading({...reading,eventType:event.target.value})}><option value="manual">{t('condition_manual')}</option><option value="refuel">{t('condition_refuel')}</option></select></label><div className="form-grid"><label>{t('odometer')}<input required type="number" min={v.odometer} value={reading.odometer} onChange={event=>setReading({...reading,odometer:Number(event.target.value)})}/><small>{t('lastSystemOdometer')}: {Number(v.odometer).toLocaleString()} {t('kilometers')}</small></label><label>{t('fuelLevel')}<input required type="number" min="0" max="100" value={reading.fuelLevel} onChange={event=>setReading({...reading,fuelLevel:Number(event.target.value)})}/></label>{reading.eventType==='refuel'&&<><label>{t('fuelAdded')}<input required type="number" min="0.1" step="0.1" value={reading.fuelAddedLiters} onChange={event=>setReading({...reading,fuelAddedLiters:event.target.value})}/></label><label>{t('fuelCost')}<input required type="number" min="0.01" step="0.01" value={reading.fuelCost} onChange={event=>setReading({...reading,fuelCost:event.target.value})}/></label></>}</div><label>{t('notes')}<textarea value={reading.notes} onChange={event=>setReading({...reading,notes:event.target.value})}/></label><footer><button type="button" className="btn secondary" onClick={()=>setReadingOpen(false)}>{t('cancel')}</button><button className="btn primary" disabled={saving}>{saving?t('saving'):t('recordReading')}</button></footer></form>
    </Modal>
  </>;
}
