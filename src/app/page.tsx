'use client';
import Link from 'next/link';
import { Activity, ArrowRight, BarChart3, CalendarCheck, Check, ChevronRight, FileCheck2, Gauge, Globe2, Languages, MapPin, Percent, ReceiptText, Search, ShieldCheck, Sparkles, Star, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PublicSiteFooter, PublicSiteHeader } from '@/components/public-site-chrome';
import { Skeleton } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/client-api';
import { money } from '@/lib/format';

export default function Landing(){
  const {t}=useI18n();
  const [data,setData]=useState<any>(null);
  useEffect(()=>{api('/landing').then(setData)},[]);
  const featureTiles=[
    [Search,'landingFeatureGuestTitle','landingFeatureGuestText','01'],
    [CalendarCheck,'landingFeatureBookingTitle','landingFeatureBookingText','02'],
    [Gauge,'landingFeatureMileageTitle','landingFeatureMileageText','03'],
    [ShieldCheck,'landingFeatureProtectionTitle','landingFeatureProtectionText','04'],
    [BarChart3,'landingFeatureReportsTitle','landingFeatureReportsText','05'],
    [Languages,'landingFeatureLanguageTitle','landingFeatureLanguageText','06'],
  ];
  return <div className="landing">
    <PublicSiteHeader/>
    <main>
      <section className="hero"><div className="hero-glow one"/><div className="hero-glow two"/><div className="hero-copy"><span className="eyebrow"><Sparkles/> {t('heroEyebrow')}</span><h1>{t('heroTitle')}</h1><p>{t('heroText')}</p><div className="hero-actions"><Link className="btn primary big" href="/browse">{t('browseCars')}<ArrowRight/></Link><Link className="btn glass big" href="/login?role=company">{t('listFleet')}<ChevronRight/></Link></div><div className="hero-trust"><span><Check/>{t('noHiddenFees')}</span><span><Check/>{t('verifiedPartners')}</span><span><Check/>{t('instantBooking')}</span></div></div><div className="hero-showcase"><div className="hero-card"><div className="hero-card-top"><span>San Francisco, CA</span><span className="live-dot">{t('live')}</span></div><img src="/cars/mercedes.jpg" alt="Mercedes-Benz C-Class"/><div className="floating-chip discount"><Percent/>{t('saveTwenty')}</div><div className="floating-chip rating"><Star fill="currentColor"/>4.9</div><div className="hero-car-info"><div><span>{t('luxurySedan')}</span><h2>Mercedes-Benz C-Class</h2><small>CityDrive Rentals</small></div><div><strong>$139</strong><small>/ {t('day')}</small></div></div></div></div></section>
      <section className="landing-stats">{[[data?.stats.vehicles||17,t('liveVehicles')],[data?.stats.companies||3,t('trustedCompanies')],[data?.stats.trips||1248,t('completedTrips')]].map(([value,label],i)=><div key={i}><strong>{value}{i===2?'+':''}</strong><span>{label}</span></div>)}<div className="stat-rating"><span>★★★★★</span><small>4.9 {t('averageRating')}</small></div></section>
      <section className="landing-section" id="deals"><div className="section-title"><div><span className="eyebrow">{t('marketplace')}</span><h2>{t('featured')}</h2><p>{t('featuredText')}</p></div><Link href="/browse">{t('viewAll')}<ArrowRight/></Link></div>{!data?<Skeleton cards={3}/>:<div className="landing-cars">{data.featured.slice(0,3).map((car:any)=><article className="market-card" key={car.id}><div className="market-image"><img src={car.image} alt={`${car.make} ${car.model}`}/>{car.promotion&&<span className="deal-badge"><Zap/> {car.promotion.type==='percentage'?`${car.promotion.value}% ${t('off')}`:`${money(car.promotion.value)} ${t('off')}`}</span>}<span className="rating-badge"><Star fill="currentColor"/>{car.rating}</span></div><div className="market-body"><div className="market-company">{car.companyName}</div><h3>{car.make} {car.model}</h3><div className="market-specs"><span>{t(car.category)}</span><i/> <span>{t(car.fuel)}</span><i/><span>{car.seats} {t('seats')}</span></div><div className="market-price"><span>{t('from')} <strong>{money(car.dailyRate)}</strong> / {t('day')}</span><Link href={`/browse/${car.id}`} aria-label={`${t('viewDetails')} — ${car.make} ${car.model}`}><ArrowRight/></Link></div></div></article>)}</div>}</section>

      <section className="feature-section feature-pro" id="features">
        <header className="feature-pro-heading"><div><span className="eyebrow"><Sparkles/>{t('fleetflowDifference')}</span><h2>{t('landingFeaturesTitle')}</h2></div><p>{t('landingFeaturesText')}</p><div className="feature-market-pills"><span><Globe2/>{t('ksaMarket')}</span><span><Globe2/>{t('yemenMarket')}</span><span><Activity/>{t('liveOperations')}</span></div></header>
        <div className="feature-command-card">
          <div className="feature-command-copy"><span>{t('connectedWorkspace')}</span><h3>{t('featureCommandTitle')}</h3><p>{t('featureCommandText')}</p><ul><li><Check/>{t('featureCommandPoint1')}</li><li><Check/>{t('featureCommandPoint2')}</li><li><Check/>{t('featureCommandPoint3')}</li></ul><Link href="/register?role=company">{t('exploreCompanyWorkspace')}<ArrowRight/></Link></div>
          <div className="feature-workspace" aria-label={t('workspacePreview')}><header><span><i/><i/><i/></span><small>FleetFlow / {t('overview')}</small><em><Activity/>{t('live')}</em></header><div className="feature-workspace-body"><aside><b>FF</b>{[BarChart3,CalendarCheck,Gauge,ReceiptText].map((Icon,index)=><span className={index===0?'active':''} key={index}><Icon/></span>)}</aside><section><div className="workspace-welcome"><span>{t('workspaceSnapshot')}</span><strong>{t('operationsAtGlance')}</strong></div><div className="workspace-metrics"><article><span>{t('activeRentals')}</span><strong>28</strong><small>+12.4%</small></article><article><span>{t('fleetUtilization')}</span><strong>84%</strong><small>{t('healthy')}</small></article><article><span>{t('monthlyRevenue')}</span><strong>$48.2k</strong><small>+8.7%</small></article></div><div className="workspace-chart"><header><span>{t('revenueAndUtilization')}</span><small>30 {t('days')}</small></header><div>{[36,52,44,68,61,78,72,88,81,95,89,100].map((height,index)=><i style={{height:`${height}%`}} key={index}/>)}</div></div><div className="workspace-activity"><span><i><Gauge/></i><b>{t('odometerVerified')}</b><small>FF-0038 · 42,810 km</small></span><span><i><FileCheck2/></i><b>{t('invoiceIssued')}</b><small>FF-0041 · $1,248</small></span></div></section></div></div>
        </div>
        <div className="feature-pro-grid">{featureTiles.map(([Icon,title,text,number]:any)=><article key={title}><header><span><Icon/></span><em>{number}</em></header><h3>{t(title)}</h3><p>{t(text)}</p><footer><span>{t('learnCapability')}</span><ArrowRight/></footer></article>)}</div>
        <div className="feature-proof"><div><MapPin/><span><strong>{t('multiCityReady')}</strong><small>{t('multiCityReadyText')}</small></span></div><div><ReceiptText/><span><strong>{t('contractReadyBilling')}</strong><small>{t('contractReadyBillingText')}</small></span></div><div><ShieldCheck/><span><strong>{t('privacyByDesign')}</strong><small>{t('privacyByDesignText')}</small></span></div></div>
      </section>

      <section className="landing-cta"><div><span className="eyebrow">FleetFlow</span><h2>{t('readyTitle')}</h2><p>{t('readyText')}</p></div><Link href="/register" className="btn light big">{t('getStarted')}<ArrowRight/></Link></section>
    </main>
    <PublicSiteFooter/>
  </div>;
}
