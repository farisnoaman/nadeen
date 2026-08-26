'use client';
import Link from 'next/link';
import { ArrowRight, Check, Database, FileLock2, Globe2, LockKeyhole, Scale, ShieldCheck } from 'lucide-react';
import { PublicSiteFooter, PublicSiteHeader } from '@/components/public-site-chrome';
import { useI18n } from '@/lib/i18n';
import { privacySections } from '@/lib/public-content';

export default function PrivacyPage(){
  const {lang,t}=useI18n();
  const sections=privacySections[lang];
  return <div className="landing public-site legal-page"><PublicSiteHeader/><main>
    <section className="legal-hero"><div><span className="eyebrow"><FileLock2/>{t('legalCenter')}</span><h1>{t('privacyPolicyTitle')}</h1><p>{t('privacyPolicyLead')}</p><div><span><ShieldCheck/>{t('ksaPrivacyAligned')}</span><span><Globe2/>{t('yemenPrivacyPrinciples')}</span><span><LockKeyhole/>{t('privacyByDesign')}</span></div></div><aside><small>{t('effectiveDate')}</small><strong>{t('augustDate')}</strong><p>{t('privacySummary')}</p><Link href="/support">{t('submitPrivacyRequest')}<ArrowRight/></Link></aside></section>
    <section className="legal-highlight-row"><article><Database/><span><strong>{t('dataMinimization')}</strong><small>{t('dataMinimizationText')}</small></span></article><article><ShieldCheck/><span><strong>{t('roleSafeSharing')}</strong><small>{t('roleSafeSharingText')}</small></span></article><article><Scale/><span><strong>{t('marketAwareRights')}</strong><small>{t('marketAwareRightsText')}</small></span></article></section>
    <div className="legal-layout"><aside><strong>{t('onThisPage')}</strong>{sections.map((section,index)=><a href={`#privacy-${index+1}`} key={section.title}><span>{String(index+1).padStart(2,'0')}</span>{section.title.replace(/^\d+\.\s*/, '')}</a>)}<div><LockKeyhole/><p>{t('privacyContactCard')}</p><Link href="/support">{t('contactPlatformTeam')}</Link></div></aside><article className="legal-document">{sections.map((section,index)=><section id={`privacy-${index+1}`} key={section.title}><header><span>{String(index+1).padStart(2,'0')}</span><h2>{section.title.replace(/^\d+\.\s*/, '')}</h2></header><p>{section.body}</p>{section.bullets&&<ul>{section.bullets.map(item=><li key={item}><Check/>{item}</li>)}</ul>}</section>)}<section className="legal-references"><header><span>R</span><h2>{t('officialReferences')}</h2></header><p>{t('privacyReferenceNote')}</p><div><a href="https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter"><ShieldCheck/><span><strong>{t('saudiDataAuthority')}</strong><small>{t('saudiPdplReference')}</small></span><ArrowRight/></a><a href="https://agoyemen.net/lib_details.php?id=195"><FileLock2/><span><strong>{t('yemenLegalLibrary')}</strong><small>{t('yemenPrivacyReference')}</small></span><ArrowRight/></a></div></section></article></div>
    <section className="legal-contact-cta"><div><ShieldCheck/><span><strong>{t('privacyQuestionTitle')}</strong><p>{t('privacyQuestionText')}</p></span></div><Link href="/support" className="btn light">{t('submitPrivacyRequest')}<ArrowRight/></Link></section>
  </main><PublicSiteFooter/></div>;
}
