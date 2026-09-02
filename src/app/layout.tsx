import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Providers } from '@/components/providers';
import { PwaRegister } from '@/components/pwa-register';
import { PwaInstallBanner } from '@/components/pwa-install-banner';
import { WhatsAppFloat, WhatsAppProvider } from '@/components/whatsapp-float';
import './globals.css';

export const siteUrl=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');
export const metadata:Metadata={
  metadataBase:new URL(siteUrl),
  title:{default:'FleetFlow — Move freely | Rent cars by the hour, day, week, or month',template:'%s | FleetFlow'},
  description:'Rent cars by the hour, day, week, or month from verified rental companies. Live availability, transparent pricing, protected bookings, and full Arabic/English support.',
  keywords:['car rental','rent a car','hourly car rental','weekly car rental','car sharing','FleetFlow','تأجير السيارات','كراء السيارات'],
  alternates:{canonical:'/',languages:{ar:'/',en:'/'}},
  openGraph:{type:'website',siteName:'FleetFlow',url:'/',locale:'ar_SA',alternateLocale:['en_US'],title:'FleetFlow — Move freely',description:'Rent cars by the hour, day, week, or month from verified rental companies.',images:[{url:'/cars/mercedes.jpg',width:1200,height:630,alt:'FleetFlow car rental'}]},
  twitter:{card:'summary_large_image',title:'FleetFlow — Move freely',description:'Rent cars by the hour, day, week, or month from verified rental companies.',images:['/cars/mercedes.jpg']},
  robots:{index:true,follow:true,googleBot:{index:true,follow:true,'max-image-preview':'large','max-snippet':-1}},
};
export const viewport:Viewport={width:'device-width',initialScale:1,maximumScale:5,viewportFit:'cover',themeColor:[{media:'(prefers-color-scheme: light)',color:'#f5f6f2'},{media:'(prefers-color-scheme: dark)',color:'#111714'}]};
export default async function RootLayout({children}:{children:React.ReactNode}){
  const cookieStore=await cookies();
  const lang=cookieStore.get('ff_lang')?.value=== 'en' ? 'en' : 'ar';
  const theme=cookieStore.get('ff_theme')?.value==='dark'?'dark':'light';
  const jsonLd={'@context':'https://schema.org','@graph':[
    {'@type':'WebSite',name:'FleetFlow',url:siteUrl,inLanguage:lang,potentialAction:{'@type':'SearchAction',target:`${siteUrl}/browse?search={search_term_string}`,'query-input':'required name=search_term_string'}},
    {'@type':'Organization',name:'FleetFlow',url:siteUrl,logo:`${siteUrl}/icon.svg`,description:'Flexible car rental marketplace and fleet management platform'},
  ]};
  return <html lang={lang} dir={lang==='ar'?'rtl':'ltr'} data-scroll-behavior="smooth" className={theme==='dark'?'dark':undefined} style={{colorScheme:theme}} suppressHydrationWarning><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,'\\u003c')}} /><Providers lang={lang} theme={theme}><PwaRegister /><WhatsAppProvider><a href="#main-content" className="skip-link">{lang==='ar'?'الانتقال إلى المحتوى':'Skip to content'}</a><div id="main-content">{children}</div><WhatsAppFloat /></WhatsAppProvider><PwaInstallBanner /></Providers></body></html>;
}
