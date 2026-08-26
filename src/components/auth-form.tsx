'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, CarFront, CheckCircle2, Eye, EyeOff, MessageCircle, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useState } from 'react';
import { LanguageToggle, ThemeToggle } from './theme-controls';
import { useI18n } from '@/lib/i18n';
import { api, saveSessionToken } from '@/lib/client-api';

const demos=[
  {email:'alex@demo.com',name:'Alex',role:'renter'}, {email:'sara@demo.com',name:'Sara',role:'renter'},
  {email:'citydrive@demo.com',name:'CityDrive',role:'company'}, {email:'luxwheels@demo.com',name:'LuxWheels',role:'company'}, {email:'ecomotion@demo.com',name:'EcoMotion',role:'company'},
  {email:'admin@fleetflow.com',name:'Platform Admin',role:'platform_admin'},
];

export function AuthForm({mode}:{mode:'login'|'register'}){
  const {t}=useI18n();
  const router=useRouter();
  const search=useSearchParams();
  const initialRole=search.get('role')==='company'?'company':'renter';
  const requestedNext=search.get('next');
  const next=requestedNext&&/^\/(?!\/)[^\\\r\n]*$/.test(requestedNext)?requestedNext:null;
  const [role,setRole]=useState<'renter'|'company'>(initialRole);
  const [method,setMethod]=useState<'email'|'phone'>('email');
  const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(search.get('authError') || '');
  const [phone,setPhone]=useState('');
  const [code,setCode]=useState('');
  const [codeSent,setCodeSent]=useState(false);
  const [demoCode,setDemoCode]=useState('');
  const [form,setForm]=useState({name:'',companyName:'',email:initialRole==='renter'?'alex@demo.com':'citydrive@demo.com',password:'demo1234'});
  const updateForm=(key:string,value:string)=>setForm(current=>({...current,[key]:value}));
  const chooseRole=(selected:'renter'|'company')=>{
    setRole(selected);
    if(selected==='company')setMethod('email');
    if(mode==='login')updateForm('email',selected==='renter'?'alex@demo.com':'citydrive@demo.com');
  };
  const finish=(data:any)=>{
    saveSessionToken(data.sessionToken);
    const destination=data.user?.role==='platform_admin'?'/dashboard/admin/verifications':data.user?.role==='company'&&data.user?.verificationStatus!=='verified'?'/dashboard/verification':next&&data.user?.role==='renter'?next:(data.user?.role==='renter'?'/dashboard/browse':'/dashboard');
    router.push(destination);
    router.refresh();
  };
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');
    try{const data:any=await api(`/auth/${mode}`,{method:'POST',body:JSON.stringify({...form,role})});await api('/auth/me',{headers:{'X-FleetFlow-Session':data.sessionToken}});finish(data)}
    catch(reason:any){setError(reason.message)}finally{setBusy(false)}
  };
  const requestCode=async()=>{
    setBusy(true);setError('');
    try{const data:any=await api('/auth/phone/request',{method:'POST',body:JSON.stringify({phone})});setPhone(data.phone);setCodeSent(true);setDemoCode(data.demoCode||'')}
    catch(reason:any){setError(reason.message)}finally{setBusy(false)}
  };
  const verifyCode=async()=>{
    setBusy(true);setError('');
    try{const data:any=await api('/auth/phone/verify',{method:'POST',body:JSON.stringify({phone,code,name:form.name})});finish(data)}
    catch(reason:any){setError(reason.message)}finally{setBusy(false)}
  };
  const oauth=(provider:'google'|'facebook')=>{
    const returnTo=next||'/dashboard/browse';
    window.location.assign(`/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`);
  };
  return <div className="auth-page"><section className="auth-art"><Link href="/" className="logo light-logo"><span><CarFront/></span>FleetFlow</Link><div className="auth-message"><span className="eyebrow"><Sparkles/> {t('builtJourney')}</span><h1>{mode==='login'?t('driveFuture'):t('fleetForward')}</h1><p>{t('authText')}</p><div className="auth-checks"><span><CheckCircle2/> {t('authAvailability')}</span><span><CheckCircle2/> {t('authRates')}</span><span><CheckCircle2/> {t('authTrust')}</span></div></div><div className="auth-car"><img src="/cars/range-rover.jpg" alt="Premium rental vehicle"/><div><ShieldCheck/><span>{t('verifiedFleet')}</span><strong>{t('premiumCars')}</strong></div></div></section><section className="auth-side"><div className="auth-tools"><LanguageToggle/><ThemeToggle/></div><form onSubmit={submit} className="auth-form"><Link href="/" className="mobile-auth-logo logo"><span><CarFront/></span>FleetFlow</Link><span className="eyebrow">{mode==='login'?t('welcomeBack'):t('join')}</span><h2>{mode==='login'?t('signIn'):t('createAccount')}</h2><p>{mode==='login'?t('loginText'):t('registerText')}</p><div className="role-picker"><button type="button" className={role==='renter'?'active':''} onClick={()=>chooseRole('renter')}><UserRound/>{t('renter')}</button><button type="button" className={role==='company'?'active':''} onClick={()=>chooseRole('company')}><Building2/>{t('companyRole')}</button></div>
    {role==='renter'&&<><div className="social-auth"><button type="button" onClick={()=>oauth('google')}><b>G</b>{t('continueGoogle')}</button><button type="button" onClick={()=>oauth('facebook')}><b>f</b>{t('continueFacebook')}</button></div><div className="auth-divider"><span/> {t('orContinueWith')} <span/></div><div className="auth-methods"><button type="button" className={method==='email'?'active':''} onClick={()=>setMethod('email')}>{t('email')}</button><button type="button" className={method==='phone'?'active':''} onClick={()=>setMethod('phone')}><MessageCircle/>{t('whatsApp')}</button></div></>}
    {method==='email'||role==='company'?<>{mode==='register'&&<><label>{t('fullName')}<input value={form.name} onChange={event=>updateForm('name',event.target.value)} placeholder="Alex Morgan" required/></label>{role==='company'&&<><label>{t('companyName')}<input value={form.companyName} onChange={event=>updateForm('companyName',event.target.value)} placeholder="CityDrive Rentals" required/></label><div className="company-registration-notice"><ShieldCheck/><span>{t('companyRegistrationVerificationNotice')}</span></div></>}</>}<label>{t('email')}<input type="email" value={form.email} onChange={event=>updateForm('email',event.target.value)} required/></label><label>{t('password')}<div className="password-field"><input type={show?'text':'password'} value={form.password} onChange={event=>updateForm('password',event.target.value)} required/><button type="button" onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></div></label>{mode==='login'&&<div className="auth-options"><label><input type="checkbox" defaultChecked/>{t('remember')}</label><button type="button">{t('forgot')}</button></div>}{error&&<div className="auth-error">{error}</div>}<button className="btn primary auth-submit" disabled={busy}>{busy?t('loading'):<>{mode==='login'?t('signIn'):t('createAccount')}<ArrowRight/></>}</button></>:<div className="phone-auth">{mode==='register'&&<label>{t('fullName')}<input value={form.name} onChange={event=>updateForm('name',event.target.value)} placeholder="Alex Morgan"/></label>}<label>{t('phoneNumber')}<input type="tel" dir="ltr" value={phone} onChange={event=>{setPhone(event.target.value);setCodeSent(false)}} placeholder="+966 5X XXX XXXX" disabled={codeSent}/></label>{codeSent&&<label>{t('verificationCode')}<input className="otp-input" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} placeholder="000000"/></label>}{demoCode&&<div className="demo-code">{t('localDemoCode')}: <strong>{demoCode}</strong></div>}{error&&<div className="auth-error">{error}</div>}{!codeSent?<button type="button" className="btn primary auth-submit" onClick={requestCode} disabled={busy||!phone}>{busy?t('loading'):t('sendWhatsAppCode')}</button>:<><button type="button" className="btn primary auth-submit" onClick={verifyCode} disabled={busy||code.length!==6}>{busy?t('loading'):t('verifyAndSignIn')}</button><button type="button" className="phone-reset" onClick={()=>{setCodeSent(false);setCode('');setDemoCode('')}}>{t('changePhoneNumber')}</button></>}</div>}
    {mode==='login'&&method==='email'&&<><div className="auth-divider"><span/> {t('demoAccounts')} <span/></div><div className="demo-chips">{demos.map(demo=><button type="button" key={demo.email} className={role===demo.role?'':'muted'} onClick={()=>{setRole(demo.role as any);updateForm('email',demo.email);updateForm('password','demo1234')}}><span>{demo.name.slice(0,2).toUpperCase()}</span>{demo.name}</button>)}</div></>}<p className="auth-link">{mode==='login'?t('newHere'):t('haveAccount')} <Link href={`${mode==='login'?'/register':'/login'}${next?`?role=renter&next=${encodeURIComponent(next)}`:''}`}>{mode==='login'?t('createAccount'):t('signIn')}</Link></p><small className="legal">{t('legalText')}</small></form></section></div>
}
