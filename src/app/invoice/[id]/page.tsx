'use client';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CarFront, Download, Mail, MapPin, MessageCircle, Printer, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LanguageToggle, ThemeToggle } from '@/components/theme-controls';
import { Skeleton, StatusBadge, useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { dateTime, money } from '@/lib/format';

export default function InvoicePage() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [token, setToken] = useState('');
  useEffect(() => {
    const value = new URLSearchParams(location.search).get('token') || '';
    setToken(value);
    api(`/rentals/${id}/invoice${value ? `?token=${encodeURIComponent(value)}` : ''}`)
      .then((response: any) => setData(response.invoice)).catch((error: any) => toast(error.message, true));
  }, [id, toast]);
  const pdfUrl = `/api/rentals/${id}/invoice/pdf${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  const shareUrl = typeof window === 'undefined' ? '' : `${location.origin}/invoice/${id}?token=${data?.rental.invoiceToken || token}`;

  const sharePdf = async (channel: 'email' | 'whatsapp') => {
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error('Unable to prepare PDF');
      const blob = await response.blob();
      const file = new File([blob], `${data.invoiceNumber}.pdf`, { type: 'application/pdf' });
      const payload = { title: `${data.documentType} ${data.invoiceNumber}`, text: `FleetFlow ${data.documentType} for ${data.rental.make} ${data.rental.model}`, files: [file] };
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(payload);
        return;
      }
      const download = document.createElement('a');
      download.href = URL.createObjectURL(blob); download.download = file.name; download.click();
      const subject = encodeURIComponent(`${data.documentType} ${data.invoiceNumber}`);
      const message = encodeURIComponent(`Your FleetFlow rental bill is ready. The PDF has been downloaded for attachment. You can also view it here: ${shareUrl}`);
      if (channel === 'email') window.open(`mailto:${data.rental.renterEmail}?subject=${subject}&body=${message}`);
      else window.open(`https://wa.me/?text=${message}`, '_blank');
      toast('PDF downloaded. Attach it in the opened conversation.');
    } catch (error: any) { if (error.name !== 'AbortError') toast(error.message, true); }
  };

  if (!data) return <div className="invoice-loading"><Skeleton rows={6} /></div>;
  const r = data.rental;
  const serviceDiscounts = data.services.reduce((sum: number, service: any) => sum + service.discount, 0);
  return <div className="invoice-page">
    <header className="invoice-toolbar no-print"><Link href="/dashboard/rentals" className="back-link"><ArrowLeft />Back to rentals</Link><div><LanguageToggle /><ThemeToggle /><a className="btn secondary" href={pdfUrl} download><Download />PDF</a><button className="btn secondary" onClick={() => sharePdf('email')}><Mail />Email</button><button className="btn secondary" onClick={() => sharePdf('whatsapp')}><MessageCircle />WhatsApp</button><button className="btn primary" onClick={() => window.print()}><Printer />Print</button></div></header>
    <main className="invoice-sheet">
      <header className="invoice-head"><Link href="/" className="logo"><span><CarFront /></span>FleetFlow</Link><div><span>{data.documentType}</span><strong>{data.invoiceNumber}</strong><small>Issued {dateTime(r.createdAt)}</small></div></header>
      <section className="invoice-parties"><div><span>Issued by</span><strong>{r.companyName}</strong><small>{r.companyCity}</small></div><div><span>Billed to</span><strong>{r.renterName}</strong><small>{r.renterEmail}</small><small>{r.renterPhone}</small></div><StatusBadge status={r.status} /></section>
      <section className="invoice-vehicle"><img src={r.image} /><div><span>Rented vehicle</span><h1>{r.make} {r.model}</h1><p>{r.year} {r.category} · {r.color}</p><div><small>License plate<strong>{r.licensePlate}</strong></small><small>Transmission<strong>{r.gearbox}</strong></small><small>Fuel<strong>{r.fuel}</strong></small><small>Odometer<strong>{Number(r.odometer).toLocaleString()} mi</strong></small></div></div></section>
      <section className="invoice-schedule"><div><CalendarDays /><span>Pickup<strong>{dateTime(r.startsAt)}</strong></span></div><div><CalendarDays /><span>Return<strong>{dateTime(r.endsAt)}</strong></span></div><div><MapPin /><span>Pickup location<strong>{r.pickupLocation}</strong></span></div><div><ShieldCheck /><span>Rate plan<strong>{r.quantity} × {r.rateType}</strong></span></div></section>
      <section className="invoice-lines"><header><span>Description</span><span>Details</span><span>Amount</span></header><div><strong>{r.make} {r.model} rental</strong><span>{r.quantity} {r.rateType}{r.quantity > 1 ? 's' : ''}</span><strong>{money(r.subtotal)}</strong></div>{r.discount > 0 && <div className="deduction"><strong>Promotion {r.promoCode}</strong><span>Vehicle discount</span><strong>−{money(r.discount)}</strong></div>}{data.services.map((service: any) => <div className="service-invoice-line" key={service.id}><strong>{service.name}</strong><span>{service.days} day{service.days > 1 ? 's' : ''} × {money(service.unitPrice)}{service.discount > 0 && <small>Service discount −{money(service.discount)}</small>}</span><strong>{money(service.total)}</strong></div>)}{r.extraDiscount > 0 && <div className="deduction"><strong>Additional company discount</strong><span>Bill adjustment</span><strong>−{money(r.extraDiscount)}</strong></div>}</section>
      <section className="invoice-total"><div><span>Vehicle rental</span><strong>{money(r.subtotal)}</strong></div><div><span>Premium services</span><strong>{money(r.extrasSubtotal)}</strong></div><div><span>Total discounts</span><strong>−{money(r.discount + r.extraDiscount + serviceDiscounts)}</strong></div><div><span>Total due</span><strong>{money(r.total)}</strong></div></section>
      <footer className="invoice-footer"><ShieldCheck /><span><strong>Protected FleetFlow rental</strong>This bill includes the vehicle, schedule, promotion, premium services, and company adjustments.</span><em>Thank you for choosing FleetFlow.</em></footer>
    </main>
  </div>;
}
