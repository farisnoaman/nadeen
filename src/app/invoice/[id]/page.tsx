'use client';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CarFront, Download, Mail, MapPin, MessageCircle, Printer, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LanguageToggle, ThemeToggle } from '@/components/theme-controls';
import { Skeleton, StatusBadge, useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { dateTime, money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export default function InvoicePage() {
  const { id } = useParams();
  const { t } = useI18n();
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
      if (!response.ok) throw new Error(t('unablePreparePdf'));
      const blob = await response.blob();
      const file = new File([blob], `${data.invoiceNumber}.pdf`, { type: 'application/pdf' });
      const documentLabel = t(data.documentType === 'Rental proposal' ? 'rentalProposalDoc' : 'rentalInvoice');
      const payload = { title: `${documentLabel} ${data.invoiceNumber}`, text: `${t('brand')} ${documentLabel} — ${data.rental.make} ${data.rental.model}`, files: [file] };
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(payload);
        return;
      }
      const download = document.createElement('a');
      download.href = URL.createObjectURL(blob); download.download = file.name; download.click();
      const subject = encodeURIComponent(`${documentLabel} ${data.invoiceNumber}`);
      const message = encodeURIComponent(`${t('rentalBillReady')} ${shareUrl}`);
      if (channel === 'email') window.open(`mailto:${data.rental.renterEmail}?subject=${subject}&body=${message}`);
      else window.open(`https://wa.me/?text=${message}`, '_blank');
      toast(t('shareDownloaded'));
    } catch (error: any) { if (error.name !== 'AbortError') toast(error.message, true); }
  };

  if (!data) return <div className="invoice-loading"><Skeleton rows={6} /></div>;
  const r = data.rental;
  const serviceDiscounts = data.services.reduce((sum: number, service: any) => sum + service.discount, 0);
  return <div className="invoice-page">
    <header className="invoice-toolbar no-print"><Link href="/dashboard/rentals" className="back-link"><ArrowLeft />{t('invoiceBack')}</Link><div><LanguageToggle /><ThemeToggle /><a className="btn secondary" href={pdfUrl} download><Download />{t('pdf')}</a><button className="btn secondary" onClick={() => sharePdf('email')}><Mail />{t('emailAction')}</button><button className="btn secondary" onClick={() => sharePdf('whatsapp')}><MessageCircle />{t('whatsapp')}</button><button className="btn primary" onClick={() => window.print()}><Printer />{t('print')}</button></div></header>
    <main className="invoice-sheet">
      <header className="invoice-head"><Link href="/" className="logo"><span><CarFront /></span>FleetFlow</Link><div><span>{t(data.documentType === 'Rental proposal' ? 'rentalProposalDoc' : 'rentalInvoice')}</span><strong>{data.invoiceNumber}</strong><small>{t('issued')} {dateTime(r.createdAt)}</small></div></header>
      <section className="invoice-parties"><div><span>{t('issuedBy')}</span><strong>{r.companyName}</strong><small>{r.companyCity}</small></div><div><span>{t('billedTo')}</span><strong>{r.renterName}</strong><small>{r.renterEmail}</small><small>{r.renterPhone}</small></div><StatusBadge status={r.status} /></section>
      <section className="invoice-vehicle"><img src={r.image} /><div><span>{t('rentedVehicle')}</span><h1>{r.make} {r.model}</h1><p>{r.year} {t(r.category)} · {r.color}</p><div><small>{t('licensePlate')}<strong>{r.licensePlate}</strong></small><small>{t('transmission')}<strong>{t(r.gearbox)}</strong></small><small>{t('fuel')}<strong>{t(r.fuel)}</strong></small><small>{t('odometer')}<strong>{Number(r.odometer).toLocaleString()} {t('miles')}</strong></small></div></div></section>
      <section className="invoice-schedule"><div><CalendarDays /><span>{t('pickup')}<strong>{dateTime(r.startsAt)}</strong></span></div><div><CalendarDays /><span>{t('returnDate')}<strong>{dateTime(r.endsAt)}</strong></span></div><div><MapPin /><span>{t('pickupLocation')}<strong>{r.pickupLocation}</strong></span></div><div><ShieldCheck /><span>{t('ratePlan')}<strong>{r.quantity} × {t(r.rateType)}</strong></span></div></section>
      <section className="invoice-lines"><header><span>{t('descriptionColumn')}</span><span>{t('details')}</span><span>{t('amount')}</span></header><div><strong>{r.make} {r.model} {t('invoiceRentalSuffix')}</strong><span>{r.quantity} {t(r.rateType)}</span><strong>{money(r.subtotal)}</strong></div>{r.discount > 0 && <div className="deduction"><strong>{t('promotion')} {r.promoCode}</strong><span>{t('vehicleDiscount')}</span><strong>−{money(r.discount)}</strong></div>}{data.services.map((service: any) => <div className="service-invoice-line" key={service.id}><strong>{t(service.name)}</strong><span>{service.days} {t(service.days > 1 ? 'days' : 'day')} × {money(service.unitPrice)}{service.discount > 0 && <small>{t('serviceDiscount')} −{money(service.discount)}</small>}</span><strong>{money(service.total)}</strong></div>)}{r.extraDiscount > 0 && <div className="deduction"><strong>{t('additionalCompanyDiscount')}</strong><span>{t('billAdjustment')}</span><strong>−{money(r.extraDiscount)}</strong></div>}</section>
      <section className="invoice-total"><div><span>{t('vehicleRental')}</span><strong>{money(r.subtotal)}</strong></div><div><span>{t('premiumServices')}</span><strong>{money(r.extrasSubtotal)}</strong></div><div><span>{t('totalDiscounts')}</span><strong>−{money(r.discount + r.extraDiscount + serviceDiscounts)}</strong></div><div><span>{t('totalDue')}</span><strong>{money(r.total)}</strong></div></section>
      <footer className="invoice-footer"><ShieldCheck /><span><strong>{t('invoiceProtection')}</strong>{t('invoiceProtectionText')}</span><em>{t('thankYou')}</em></footer>
    </main>
  </div>;
}
