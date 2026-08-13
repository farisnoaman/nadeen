'use client';
import { Languages, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

export function ThemeToggle({label=false}:{label?:boolean}){
  const{theme,setTheme}=useTheme();const[mounted,setMounted]=useState(false);useEffect(()=>setMounted(true),[]);
  const current=mounted?theme:'system';const next=current==='light'?'dark':current==='dark'?'system':'light';
  const Icon=current==='light'?Sun:current==='dark'?Moon:Monitor;
  return <button className={`theme-toggle ${label?'with-label':''}`} onClick={()=>setTheme(next)} aria-label="Change theme"><Icon size={17}/>{label&&<span>{current}</span>}</button>;
}
export function LanguageToggle(){const{lang,setLang}=useI18n();return <button className="lang-toggle" onClick={()=>setLang(lang==='en'?'ar':'en')} aria-label="Change language"><Languages size={16}/><span>{lang==='en'?'ع':'EN'}</span></button>}
