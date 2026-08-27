'use client';
import Link from 'next/link';
import { ArrowRight, CarFront, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { CurrencyToggle, LanguageToggle, ThemeToggle } from './theme-controls';

export function PublicSiteHeader() {
  const {t}=useI18n();
  const [open,setOpen]=useState(false);
  return <header className="landing-nav public-site-nav">
    <Link href="/" className="logo"><span><CarFront/></span>FleetFlow</Link>
    <nav id="public-site-navigation" className={open?'open':''}>
      <Link href="/browse" onClick={()=>setOpen(false)}>{t('marketplace')}</Link>
      <Link href="/#features" onClick={()=>setOpen(false)}>{t('features')}</Link>
      <Link href="/terms" onClick={()=>setOpen(false)}>{t('terms')}</Link>
      <Link href="/support" onClick={()=>setOpen(false)}>{t('support')}</Link>
    </nav>
    <div className="nav-actions"><CurrencyToggle/><LanguageToggle/><ThemeToggle/><Link className="btn ghost hide-mobile" href="/login">{t('signIn')}</Link><Link className="btn primary hide-mobile" href="/register?role=renter">{t('getStarted')}<ArrowRight/></Link><button type="button" className="nav-menu" onClick={()=>setOpen(!open)} aria-label={t(open?'close':'openMenu')} aria-expanded={open} aria-controls="public-site-navigation">{open?<X/>:<Menu/>}</button></div>
  </header>;
}

export function PublicSiteFooter() {
  const {t}=useI18n();
  return <footer className="public-site-footer">
    <Link href="/" className="logo"><span><CarFront/></span>FleetFlow</Link>
    <p>{t('footerText')}</p>
    <div><Link href="/privacy">{t('privacy')}</Link><Link href="/terms">{t('terms')}</Link><Link href="/support">{t('support')}</Link></div>
  </footer>;
}
