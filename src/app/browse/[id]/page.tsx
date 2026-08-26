'use client';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CarFront, Check, Fuel, Gauge, MapPin, ShieldCheck, Star, UserRound, Zap } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LanguageToggle, ThemeToggle } from '@/components/theme-controls';
import { Skeleton, StatusBadge } from '@/components/ui';
import { api } from '@/lib/client-api';
import { dateTime, money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { VehicleImageCarousel } from '@/components/vehicle-image-carousel';

export default function PublicBrowseDetail(){
  const { t } = useI18n();
  const { id } = useParams();
  const router = useRouter();
  const [data,setData] = useState<any>(null);
  const [account,setAccount] = useState<any>(null);
  useEffect(() => {
    api(`/vehicles/${id}`).then(setData);
    api('/auth/me?optional=1').then((result:any) => setAccount(result.user)).catch(() => undefined);
  },[id]);
  const rent = () => {
    const destination = `/dashboard/browse/${id}?rent=1`;
    if (account?.role === 'renter') router.push(destination);
    else router.push(`/login?role=renter&next=${encodeURIComponent(destination)}`);
  };
  return <div className="public-marketplace">
    <header className="landing-nav"><Link href="/" className="logo"><span><CarFront/></span>FleetFlow</Link><nav><Link href="/browse">{t('marketplace')}</Link></nav><div className="nav-actions"><LanguageToggle/><ThemeToggle/>{account?<Link className="btn primary" href={account.role==='renter'?'/dashboard/browse':'/dashboard'}>{t('dashboard')}</Link>:<><Link className="btn ghost" href="/login">{t('signIn')}</Link><Link className="btn primary" href="/register?role=renter">{t('getStarted')}</Link></>}</div></header>
    <main className="public-marketplace-content">
      {!data ? <Skeleton rows={6}/> : <VehicleDetail data={data} onRent={rent} t={t}/>}
    </main>
  </div>;
}

function VehicleDetail({ data, onRent, t }:{ data:any; onRent:()=>void; t:(key:string)=>string }) {
  const v=data.vehicle;
  return <>
    <Link className="back-link" href="/browse"><ArrowLeft/>{t('browse')}</Link>
    <div className="market-detail"><section><div className="detail-photo"><VehicleImageCarousel image={v.image} images={v.images}/><StatusBadge status={v.status}/><span className="rating-badge"><Star fill="currentColor"/>{v.rating}</span></div><div className="market-detail-title"><div><span>{v.companyName}</span><h2>{v.make} {v.model}</h2><p>{v.year} · {v.trim} · {t(v.bodyType || v.category)}</p></div><div><small>{t('from')}</small><strong>{money(v.dailyRate)}</strong><span>/{t('day')}</span></div></div><div className="detail-icon-specs">{[[Gauge,t(v.gearbox)],[Fuel,t(v.fuel)],[UserRound,`${v.seats} ${t('seats')}`],[MapPin,[...new Set((v.pickupLocations||[]).map((location:any)=>location.city))].join(' · ')],[Gauge,`${Number(v.dailyKilometerAllowance).toLocaleString()} ${t('kilometers')}/${t('day')}`]].map(([Icon,value]:any)=><div key={value}><Icon/><span>{value}</span></div>)}</div><section className="panel pickup-sites-panel"><h3><MapPin/>{t('availablePickupSites')}</h3><div>{(v.pickupLocations||[]).map((location:any)=><span key={`${location.city}-${location.site}`}><strong>{location.city}</strong>{location.site}</span>)}</div></section><section className="panel included"><h3>{t('everythingNeed')}</h3><div>{v.features.map((feature:string)=><span key={feature}><Check/>{t(feature)}</span>)}</div></section>{v.protectionPackages?.length>0&&<section className="panel protection-overview public-protection"><header><h3><ShieldCheck/>{t('insurancePackages')}</h3><span>{t(v.insuranceCoverage)}</span></header><div>{v.protectionPackages.map((pkg:any)=><article key={pkg.id||pkg.tier}><span>{t(pkg.tier)}</span><strong>{pkg.name}</strong><small>{money(pkg.dailyPrice)} / {t('day')} · {t('deductible')} {money(pkg.deductible)}</small><p>{pkg.description}</p></article>)}</div></section>}</section><aside><section className="panel booking-card"><h3>{t('pricing')}</h3>{[['hour',v.hourlyRate],['day',v.dailyRate],['week',v.weeklyRate],['month',v.monthlyRate]].map(([label,value])=><div key={label}><span>{t('per')} {t(label as string)}</span><strong>{money(value as number)}</strong></div>)}<button className="btn primary" onClick={onRent}>{t('rentNow')}</button><p><ShieldCheck/>{t('protectedBooking')}</p></section>{data.promotions.length>0&&<section className="panel available-deals"><h3><Zap/>{t('deals')}</h3>{data.promotions.map((promotion:any)=><div key={promotion.id}><span><strong>{promotion.name}</strong><small>{t('use')} {promotion.code}</small></span><em>{promotion.type==='percentage'?`${promotion.value}% ${t('off')}`:`${money(promotion.value)} ${t('off')}`}</em></div>)}</section>}<section className="panel busy-card"><h3><CalendarDays/>{t('busyPeriods')}</h3>{data.busyPeriods.length?data.busyPeriods.map((period:any,index:number)=><p key={index}>{dateTime(period.startsAt)}<br/>→ {dateTime(period.endsAt)}<br/><small>{t('turnaroundUntil')} {dateTime(period.blockedUntil)}</small></p>):<p>{t('noUpcomingBookings')}</p>}</section></aside></div>
  </>;
}
