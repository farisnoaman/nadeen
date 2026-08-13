import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata:Metadata={title:'FleetFlow — Move freely',description:'Flexible car rental marketplace and fleet management platform'};
export default async function RootLayout({children}:{children:React.ReactNode}){const lang=(await cookies()).get('ff_lang')?.value==='ar'?'ar':'en';return <html lang={lang} dir={lang==='ar'?'rtl':'ltr'} suppressHydrationWarning><body><Providers lang={lang}>{children}</Providers></body></html>}
