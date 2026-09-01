'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, CarFront, CheckCircle2, Eye, EyeOff, MessageCircle, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LanguageToggle, ThemeToggle } from './theme-controls';
import { useI18n } from '@/lib/i18n';
import { api, saveSessionToken } from '@/lib/client-api';
import { isValidGulfMobile, normalizeGulfNational, GULF_MOBILE } from '@/lib/phone-mobile';

const demos=[
  {email:'alex@demo.com',name:'Alex',role:'renter'}, {email:'sara@demo.com',name:'Sara',role:'renter'},
  {email:'citydrive@demo.com',name:'CityDrive',role:'company'}, {email:'luxwheels@demo.com',name:'LuxWheels',role:'company'}, {email:'ecomotion@demo.com',name:'EcoMotion',role:'company'},
  {email:'admin@fleetflow.com',name:'Platform Admin',role:'platform_admin'},
];

const gulfCountries=[
  {code:'966',flag:'🇸🇦',name:'Saudi Arabia'},
  {code:'971',flag:'🇦🇪',name:'UAE'},
  {code:'974',flag:'🇶🇦',name:'Qatar'},
  {code:'965',flag:'🇰🇼',name:'Kuwait'},
  {code:'973',flag:'🇧🇭',name:'Bahrain'},
  {code:'968',flag:'🇴🇲',name:'Oman'},
  {code:'967',flag:'🇾🇪',name:'Yemen'},
];

const COOLDOWN_SECONDS=60;
const RATE_WINDOW_MS=10*60*1000;
const MAX_TRIES=2;

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
  const [dialCode,setDialCode]=useState('966');
  const [code,setCode]=useState('');
  const [codeSent,setCodeSent]=useState(false);
const [requestTimes,setRequestTimes]=useState<number[]>([]);
const [cooldown,setCooldown]=useState(0);
const [form,setForm]=useState({name:'',companyName:'',email:initialRole==='renter'?'alex@demo.com':'citydrive@demo.com',password:'demo1234'});
const phoneFirstDigit=GULF_MOBILE[dialCode]?.starts[0] ?? '5';
const phoneRef=useRef<HTMLInputElement>(null);
const otpRef=useRef<HTMLInputElement>(null);
// Keep the caret at the end of numeric fields. In an RTL document, React resets a
// controlled input's caret to position 0 after each re-render, which makes typed
// digits land at the start and reverses the number (e.g. 712345678 -> 871234567).
useEffect(()=>{ const fix=(el:HTMLInputElement|null)=>{ if(el&&document.activeElement===el){ const end=el.value.length; try{ el.setSelectionRange(end,end); }catch{} } }; fix(phoneRef.current); fix(otpRef.current); },[phone,code]);
  const updateForm=(key:string,value:string)=>setForm(current=>({...current,[key]:value}));
const resetRequestState=()=>{ setCodeSent(false); setCode(''); setCooldown(0); setRequestTimes([]); };
const rateLimited=requestTimes.filter(ts=>Date.now()-ts<RATE_WINDOW_MS).length>=MAX_TRIES;
useEffect(()=>{ if(cooldown<=0)return; const id=setInterval(()=>setCooldown(c=>c<=1?0:c-1),1000); return ()=>clearInterval(id); },[cooldown]);
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
  const national=normalizeGulfNational(dialCode,phone);
  const now=Date.now();
  const recent=requestTimes.filter(ts=>now-ts<RATE_WINDOW_MS);
  if(recent.length>=MAX_TRIES){ setBusy(false); setError(t('tooManyAttempts')); return; }
  if(!isValidGulfMobile(dialCode,national)){ setBusy(false); setError(t('invalidMobile')); return; }
  try{const data:any=await api('/auth/phone/request',{method:'POST',body:JSON.stringify({phone:`+${dialCode}${national}`})});setPhone(data.phone.startsWith(`+${dialCode}`)?data.phone.slice(dialCode.length+1):national);setCodeSent(true);setCooldown(COOLDOWN_SECONDS);setRequestTimes([...recent,now])}
  catch(reason:any){setError(reason.message)}finally{setBusy(false)}
};
  const verifyCode=async()=>{
    setBusy(true);setError('');
    try{const data:any=await api('/auth/phone/verify',{method:'POST',body:JSON.stringify({phone:`+${dialCode}${normalizeGulfNational(dialCode,phone)}`,code,name:form.name})});finish(data)}
    catch(reason:any){setError(reason.message)}finally{setBusy(false)}
  };
  const oauth=(provider:'google'|'facebook')=>{
    const returnTo=next||'/dashboard/browse';
    window.location.assign(`/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`);
  };
  return <div className="auth-page"><section className="auth-art"><Link href="/" className="logo light-logo"><span><CarFront/></span>FleetFlow</Link><div className="auth-message"><span className="eyebrow"><Sparkles/> {t('builtJourney')}</span><h1>{mode==='login'?t('driveFuture'):t('fleetForward')}</h1><p>{t('authText')}</p><div className="auth-checks"><span><CheckCircle2/> {t('authAvailability')}</span><span><CheckCircle2/> {t('authRates')}</span><span><CheckCircle2/> {t('authTrust')}</span></div></div><div className="auth-car"><img src="/cars/range-rover.jpg" alt="Premium rental vehicle"/><div><ShieldCheck/><span>{t('verifiedFleet')}</span><strong>{t('premiumCars')}</strong></div></div></section><section className="auth-side"><div className="auth-tools"><LanguageToggle/><ThemeToggle/></div><form onSubmit={submit} className="auth-form"><Link href="/" className="mobile-auth-logo logo"><span><CarFront/></span>FleetFlow</Link><span className="eyebrow">{mode==='login'?t('welcomeBack'):t('join')}</span><h2>{mode==='login'?t('signIn'):t('createAccount')}</h2><p>{mode==='login'?t('loginText'):t('registerText')}</p><div className="role-picker"><button type="button" className={role==='renter'?'active':''} onClick={()=>chooseRole('renter')}><UserRound/>{t('renter')}</button><button type="button" className={role==='company'?'active':''} onClick={()=>chooseRole('company')}><Building2/>{t('companyRole')}</button></div>
    {role==='renter'&&<><div className="social-auth"><button type="button" onClick={()=>oauth('google')}><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>{t('continueGoogle')}</button><button type="button" onClick={()=>oauth('facebook')}><svg viewBox="0 0 24 24" width="18" height="18" fill="#1877F2" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>{t('continueFacebook')}</button></div><div className="auth-divider"><span/> {t('orContinueWith')} <span/></div><div className="auth-methods"><button type="button" className={method==='email'?'active':''} onClick={()=>setMethod('email')}>{t('email')}</button><button type="button" className={method==='phone'?'active':''} onClick={()=>setMethod('phone')}><MessageCircle/>{t('whatsApp')}</button></div></>}
    {method==='email'||role==='company'?<>{mode==='register'&&<><label>{t('fullName')}<input value={form.name} onChange={event=>updateForm('name',event.target.value)} placeholder="Alex Morgan" required/></label>{role==='company'&&<><label>{t('companyName')}<input value={form.companyName} onChange={event=>updateForm('companyName',event.target.value)} placeholder="CityDrive Rentals" required/></label><div className="company-registration-notice"><ShieldCheck/><span>{t('companyRegistrationVerificationNotice')}</span></div></>}</>}<label>{t('email')}<input type="email" value={form.email} onChange={event=>updateForm('email',event.target.value)} required/></label><label>{t('password')}<div className="password-field"><input type={show?'text':'password'} value={form.password} onChange={event=>updateForm('password',event.target.value)} required/><button type="button" onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></div></label>{mode==='login'&&<div className="auth-options"><label><input type="checkbox" defaultChecked/>{t('remember')}</label><button type="button">{t('forgot')}</button></div>}{error&&<div className="auth-error">{error}</div>}<button className="btn primary auth-submit" disabled={busy}>{busy?t('loading'):<>{mode==='login'?t('signIn'):t('createAccount')}<ArrowRight/></>}</button></>:<div className="phone-auth">{mode==='register'&&<label>{t('fullName')}<input value={form.name} onChange={event=>updateForm('name',event.target.value)} placeholder="Alex Morgan"/></label>}<label>{t('phoneNumber')}<div className="phone-row"><select className="phone-country" value={dialCode} onChange={event=>{setDialCode(event.target.value);resetRequestState();}} aria-label="Country code" disabled={codeSent}>{gulfCountries.map(c=><option key={c.code} value={c.code}>{c.flag} +{c.code}</option>)}</select><input ref={phoneRef} type="tel" dir="ltr" style={{direction:'ltr'}} value={phone} onChange={event=>{setPhone(event.target.value.replace(/\D/g,''));resetRequestState();}} placeholder={`+${dialCode} ${phoneFirstDigit}X XXX XXXX`} disabled={codeSent}/></div></label>{codeSent&&<label>{t('verificationCode')}<input ref={otpRef} className="otp-input" inputMode="numeric" maxLength={6} style={{direction:'ltr'}} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} placeholder="000000"/></label>}{error&&<div className="auth-error">{error}</div>}{!codeSent?(
  <button type="button" className="btn primary auth-submit" onClick={requestCode} disabled={busy||!phone||rateLimited}>{busy?t('loading'):t('sendWhatsAppCode')}</button>
):(
  <>
    <button type="button" className="btn primary auth-submit" onClick={verifyCode} disabled={busy||code.length!==6}>{busy?t('loading'):t('verifyAndSignIn')}</button>
    {cooldown>0?(
      <button type="button" className="phone-reset" disabled>{t('resendIn')} {cooldown}s</button>
    ):rateLimited?(
      <span className="phone-reset phone-reset-blocked">{t('tooManyAttempts')}</span>
    ):(
      <button type="button" className="phone-reset" onClick={requestCode} disabled={busy}>{t('resendCode')}</button>
    )}
    <button type="button" className="phone-reset" onClick={resetRequestState}>{t('changePhoneNumber')}</button>
  </>
)}
{rateLimited && !codeSent && <div className="auth-error">{t('tooManyAttempts')}</div>}</div>}
    {mode==='login'&&method==='email'&&<><div className="auth-divider"><span/> {t('demoAccounts')} <span/></div><div className="demo-chips">{demos.map(demo=><button type="button" key={demo.email} className={role===demo.role?'':'muted'} onClick={()=>{setRole(demo.role as any);updateForm('email',demo.email);updateForm('password','demo1234')}}><span>{demo.name.slice(0,2).toUpperCase()}</span>{demo.name}</button>)}</div></>}<p className="auth-link">{mode==='login'?t('newHere'):t('haveAccount')} <Link href={`${mode==='login'?'/register':'/login'}${next?`?role=renter&next=${encodeURIComponent(next)}`:''}`}>{mode==='login'?t('createAccount'):t('signIn')}</Link></p><small className="legal">{t('legalText')}</small></form></section></div>
}
