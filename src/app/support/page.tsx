'use client';
import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight, CircleHelp, Clock3, Headphones, LifeBuoy, LockKeyhole, Mail, MessageCircle, Search, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { PublicSiteFooter, PublicSiteHeader } from '@/components/public-site-chrome';
import { useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n';
import { publicFaqs } from '@/lib/public-content';

const initialForm={name:'',email:'',phone:'',market:'',topic:'',subject:'',message:'',consent:false,website:''};

export default function PublicSupportPage(){
  const {lang,t}=useI18n();
  const toast=useToast();
  const [query,setQuery]=useState('');
  const [form,setForm]=useState<any>(initialForm);
  const [sending,setSending]=useState(false);
  const [reference,setReference]=useState('');
  const faqs=useMemo(()=>{
    const term=query.trim().toLocaleLowerCase();
    return publicFaqs[lang].filter(item=>!term||`${item.category} ${item.question} ${item.answer}`.toLocaleLowerCase().includes(term));
  },[lang,query]);
  const set=(key:string,value:any)=>setForm((current:any)=>({...current,[key]:value}));
  const submit=async(event:FormEvent)=>{
    event.preventDefault();setSending(true);
    try{
      const data:any=await api('/public-support',{method:'POST',body:JSON.stringify(form)});
      setReference(data.reference);setForm(initialForm);toast(t('publicSupportReceived'));
    }catch(error:any){
      toast(lang==='ar'
        ? t(error.status===429?'publicSupportRateLimited':'publicSupportSubmitFailed')
        : error.message || t('publicSupportSubmitFailed'),true);
    }finally{setSending(false)}
  };
  return <div className="landing public-site public-support-page">
    <PublicSiteHeader/>
    <main>
      <section className="public-support-hero"><div><span className="eyebrow"><LifeBuoy/>{t('publicSupportEyebrow')}</span><h1>{t('publicSupportTitle')}</h1><p>{t('publicSupportLead')}</p><div><a href="#platform-contact" className="btn primary big">{t('contactPlatformTeam')}<ArrowRight/></a><Link href="/login?role=renter&next=%2Fdashboard%2Fsupport" className="btn secondary big">{t('rentalAccountSupport')}</Link></div></div><aside><article><span><MessageCircle/></span><div><strong>{t('platformQuestions')}</strong><small>{t('platformQuestionsText')}</small></div><em>01</em></article><article><span><ShieldAlert/></span><div><strong>{t('rentalIssues')}</strong><small>{t('rentalIssuesText')}</small></div><em>02</em></article><article><span><LockKeyhole/></span><div><strong>{t('privacyRequests')}</strong><small>{t('privacyRequestsText')}</small></div><em>03</em></article></aside></section>

      <section className="public-support-routing"><div><ShieldAlert/><span><strong>{t('importantRoutingTitle')}</strong><p>{t('importantRoutingText')}</p></span></div><Link href="/login?role=renter&next=%2Fdashboard%2Fsupport">{t('openSignedInSupport')}<ChevronRight/></Link></section>

      <section className="public-faq-section"><header><div><span className="eyebrow"><BookOpen/>{t('publicHelpCenter')}</span><h2>{t('publicFaqTitle')}</h2><p>{t('publicFaqText')}</p></div><label><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('searchPublicFaq')}/></label></header><div className="public-faq-layout"><aside><span><Sparkles/></span><strong>{t('quickAnswers')}</strong><p>{t('quickAnswersText')}</p><small>{faqs.length} {t('supportArticles')}</small></aside><div>{faqs.map((item,index)=><details key={item.question}><summary><span>{String(index+1).padStart(2,'0')}</span><div><small>{item.category}</small><strong>{item.question}</strong></div><ChevronRight/></summary><p>{item.answer}</p></details>)}{!faqs.length&&<div className="public-faq-empty"><CircleHelp/><strong>{t('supportNoArticles')}</strong><span>{t('supportNoArticlesText')}</span></div>}</div></div></section>

      <section className="public-contact-section" id="platform-contact"><header><div><span className="eyebrow"><Headphones/>{t('platformManagement')}</span><h2>{t('contactFormTitle')}</h2><p>{t('contactFormText')}</p></div><div><span><Clock3/></span><strong>{t('responseExpectation')}</strong><small>{t('responseExpectationText')}</small></div></header><div className="public-contact-layout"><aside><h3>{t('beforeSending')}</h3><ul><li><CheckCircle2/>{t('contactPointPlatform')}</li><li><CheckCircle2/>{t('contactPointDetail')}</li><li><CheckCircle2/>{t('contactPointPrivacy')}</li></ul><a href="mailto:support@fleetflow.app"><Mail/><span><small>{t('emailPlatformTeam')}</small><strong>support@fleetflow.app</strong></span></a></aside>{reference?<div className="public-contact-success"><span><CheckCircle2/></span><h3>{t('requestReceivedTitle')}</h3><p>{t('requestReceivedText')}</p><strong>{reference}</strong><button className="btn secondary" onClick={()=>setReference('')}>{t('sendAnotherRequest')}</button></div>:<form onSubmit={submit}><label>{t('fullName')}<input required minLength={2} maxLength={100} value={form.name} onChange={event=>set('name',event.target.value)} autoComplete="name"/></label><label>{t('email')}<input required type="email" maxLength={160} value={form.email} onChange={event=>set('email',event.target.value)} autoComplete="email"/></label><label>{t('phoneOptional')}<input type="tel" maxLength={40} value={form.phone} onChange={event=>set('phone',event.target.value)} autoComplete="tel"/></label><label>{t('relatedMarket')}<select required value={form.market} onChange={event=>set('market',event.target.value)}><option value="">{t('chooseMarket')}</option><option value="saudi_arabia">{t('saudiArabia')}</option><option value="yemen">{t('yemen')}</option><option value="other">{t('otherMarket')}</option></select></label><label>{t('supportTopic')}<select required value={form.topic} onChange={event=>set('topic',event.target.value)}><option value="">{t('chooseTopic')}</option><option value="general">{t('topicGeneral')}</option><option value="suggestion">{t('topicSuggestion')}</option><option value="inquiry">{t('topicInquiry')}</option><option value="platform_issue">{t('topicPlatformIssue')}</option><option value="privacy">{t('topicPrivacy')}</option><option value="legal">{t('topicLegal')}</option></select></label><label className="span-2">{t('supportSubject')}<input required minLength={5} maxLength={140} value={form.subject} onChange={event=>set('subject',event.target.value)}/></label><label className="span-2">{t('supportMessage')}<textarea required minLength={20} maxLength={4000} value={form.message} onChange={event=>set('message',event.target.value)} placeholder={t('publicMessagePlaceholder')}/><small>{form.message.length}/4000</small></label><label className="contact-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={event=>set('website',event.target.value)}/></label><label className="span-2 public-contact-consent"><input type="checkbox" required checked={form.consent} onChange={event=>set('consent',event.target.checked)}/><span>{t('publicContactConsent')} <Link href="/privacy">{t('privacy')}</Link></span></label><footer className="span-2"><span><LockKeyhole/>{t('secureSubmission')}</span><button className="btn primary" disabled={sending}><Send/>{sending?t('sending'):t('sendToPlatform')}</button></footer></form>}</div></section>
    </main>
    <PublicSiteFooter/>
  </div>;
}
