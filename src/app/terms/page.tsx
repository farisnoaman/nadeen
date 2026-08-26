'use client';
import Link from 'next/link';
import { ArrowRight, Building2, CarFront, Check, FileCheck2, Gauge, Globe2, Landmark, Scale, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { PublicSiteFooter, PublicSiteHeader } from '@/components/public-site-chrome';
import { useI18n } from '@/lib/i18n';
import { commonTerms, marketTerms } from '@/lib/public-content';

export default function TermsPage(){
  const {lang,t}=useI18n();
  const [market,setMarket]=useState<'ksa'|'yemen'>('ksa');
  const common=commonTerms[lang];
  const schedule=marketTerms[market][lang];
  return <div className="landing public-site legal-page terms-page"><PublicSiteHeader/><main>
    <section className="legal-hero terms-hero"><div><span className="eyebrow"><Scale/>{t('legalCenter')}</span><h1>{t('termsTitle')}</h1><p>{t('termsLead')}</p><div><span><FileCheck2/>{t('clearContractTerms')}</span><span><Gauge/>{t('odoBillingRules')}</span><span><Globe2/>{t('marketSchedules')}</span></div></div><aside><small>{t('effectiveDate')}</small><strong>{t('augustDate')}</strong><p>{t('termsSummary')}</p><Link href="/support">{t('legalInquiry')}<ArrowRight/></Link></aside></section>
    <section className="terms-role-strip"><article><span><CarFront/></span><div><strong>{t('renterResponsibility')}</strong><p>{t('renterResponsibilityText')}</p></div></article><article><span><Building2/></span><div><strong>{t('companyResponsibility')}</strong><p>{t('companyResponsibilityText')}</p></div></article><article><span><ShieldCheck/></span><div><strong>{t('fleetflowResponsibility')}</strong><p>{t('fleetflowResponsibilityText')}</p></div></article></section>
    <section className="terms-core"><header><span className="eyebrow"><FileCheck2/>{t('corePlatformConditions')}</span><h2>{t('conditionsForEveryMarket')}</h2><p>{t('conditionsForEveryMarketText')}</p></header><div>{common.map((section,index)=><article key={section.title}><span>{String(index+1).padStart(2,'0')}</span><h3>{section.title.replace(/^\d+\.\s*/, '')}</h3><p>{section.body}</p></article>)}</div></section>
    <section className="market-conditions"><header><div><span className="eyebrow"><Landmark/>{t('marketConditions')}</span><h2>{t('chooseMarketConditions')}</h2><p>{t('chooseMarketConditionsText')}</p></div><div className="market-tabs" role="tablist"><button className={market==='ksa'?'active':''} onClick={()=>setMarket('ksa')} role="tab" aria-selected={market==='ksa'}><span>SA</span>{t('saudiArabia')}</button><button className={market==='yemen'?'active':''} onClick={()=>setMarket('yemen')} role="tab" aria-selected={market==='yemen'}><span>YE</span>{t('yemen')}</button></div></header><div className="market-schedule"><aside><span>{market==='ksa'?'SA':'YE'}</span><h3>{market==='ksa'?t('ksaScheduleTitle'):t('yemenScheduleTitle')}</h3><p>{market==='ksa'?t('ksaScheduleText'):t('yemenScheduleText')}</p><small>{t('marketLawPriority')}</small></aside><article>{schedule.map((section,index)=><section key={section.title}><header><span><Check/></span><h3>{section.title.replace(/^(Saudi Arabia|Yemen|السعودية|اليمن)\s*[—-]\s*/, '')}</h3></header><p>{section.body}</p></section>)}</article></div></section>
    <section className="legal-references standalone"><header><span>R</span><h2>{t('officialReferences')}</h2></header><p>{t('termsReferenceNote')}</p><div><a href="https://tajeer.tga.gov.sa/assets/static/faqEn.html"><CarFront/><span><strong>{t('saudiTgaRental')}</strong><small>{t('saudiTgaRentalText')}</small></span><ArrowRight/></a><a href="https://www.tga.gov.sa/Regulations/Regulation/1540"><Landmark/><span><strong>{t('saudiRentalRegulation')}</strong><small>{t('saudiRentalRegulationText')}</small></span><ArrowRight/></a><a href="https://agoyemen.net/lib_details.php?id=11"><Scale/><span><strong>{t('yemenTrafficLaw')}</strong><small>{t('yemenTrafficLawText')}</small></span><ArrowRight/></a></div></section>
    <section className="legal-disclaimer"><Scale/><span><strong>{t('legalScopeTitle')}</strong><p>{t('legalScopeText')}</p></span><Link href="/support">{t('legalInquiry')}<ArrowRight/></Link></section>
  </main><PublicSiteFooter/></div>;
}
