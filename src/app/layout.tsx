import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Providers } from '@/components/providers';
import { WhatsAppFloat, WhatsAppProvider } from '@/components/whatsapp-float';
import './globals.css';

export const metadata:Metadata={title:'FleetFlow — Move freely',description:'Flexible car rental marketplace and fleet management platform'};
export const viewport:Viewport={width:'device-width',initialScale:1,maximumScale:5,viewportFit:'cover',themeColor:[{media:'(prefers-color-scheme: light)',color:'#f5f6f2'},{media:'(prefers-color-scheme: dark)',color:'#111714'}]};
export default async function RootLayout({children}:{children:React.ReactNode}){
  const cookieStore=await cookies();
  const lang=cookieStore.get('ff_lang')?.value=== 'en' ? 'en' : 'ar';
  const theme=cookieStore.get('ff_theme')?.value==='dark'?'dark':'light';
  return <html lang={lang} dir={lang==='ar'?'rtl':'ltr'} data-scroll-behavior="smooth" className={theme==='dark'?'dark':undefined} style={{colorScheme:theme}} suppressHydrationWarning><body><Providers lang={lang} theme={theme}><WhatsAppProvider><a href="#main-content" className="skip-link">{lang==='ar'?'الانتقال إلى المحتوى':'Skip to content'}</a><div id="main-content">{children}</div><WhatsAppFloat /></WhatsAppProvider></Providers></body></html>;
}
