'use client';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CarFront, Download, Mail, MapPin, MessageCircle, Printer, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
  const [qrCode, setQrCode] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const value = new URLSearchParams(location.search).get('token') || '';
    setToken(value);
    api(`/rentals/${id}/invoice${value ? `?token=${encodeURIComponent(value)}` : ''}`)
      .then((response: any) => setData(response.invoice)).catch((error: any) => toast(error.message, true));
  }, [id, toast]);
  const shareUrl = typeof window === 'undefined' ? '' : `${location.origin}/invoice/${id}?token=${data?.rental.invoiceToken || token}`;

  useEffect(() => {
    if (!shareUrl || !data) return;
    let active = true;
    import('qrcode').then(module => module.toDataURL(shareUrl, { width:220, margin:1, errorCorrectionLevel:'M', color:{ dark:'#1d2824', light:'#ffffff' } }))
      .then(value => { if (active) setQrCode(value); })
      .catch(() => { if (active) setQrCode(''); });
    return () => { active = false; };
  }, [shareUrl, data]);

  const createStyledPdf = async () => {
    const sheet = sheetRef.current;
    if (!sheet) throw new Error(t('unablePreparePdf'));
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    sheet.classList.add('pdf-exporting');
    try {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = await html2canvas(sheet, {
        scale: Math.min(2, window.devicePixelRatio || 2), useCORS:true, logging:false,
        backgroundColor:'#ffffff', windowWidth:sheet.scrollWidth, windowHeight:sheet.scrollHeight,
      });
      const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4', compress:true });
      const usableWidth = 190;
      const usableHeight = 277;
      const scale = Math.min(usableWidth / canvas.width, usableHeight / canvas.height);
      const imageWidth = canvas.width * scale;
      const imageHeight = canvas.height * scale;
      pdf.addImage(canvas.toDataURL('image/jpeg', .96), 'JPEG', (210 - imageWidth) / 2, 10, imageWidth, imageHeight, undefined, 'FAST');
      return pdf.output('blob');
    } finally {
      sheet.classList.remove('pdf-exporting');
    }
  };

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = url; download.download = filename; download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try { const blob = await createStyledPdf(); saveBlob(blob, `${data.invoiceNumber}.pdf`); toast(t('styledPdfDownloaded')); }
    catch (error: any) { toast(error.message || t('unablePreparePdf'), true); }
    finally { setPdfBusy(false); }
  };

  const prepareSinglePagePrint = () => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    // Measure the fixed A4/desktop document rather than the responsive screen layout.
    // Without this, printing from a narrow preview measures stacked sections and then
    // unnecessarily shrinks the desktop print layout, leaving a large blank area.
    sheet.classList.add('print-measuring');
    const measuredHeight = sheet.scrollHeight;
    sheet.classList.remove('print-measuring');
    const a4HeightPx = 297 * 96 / 25.4;
    const scale = Math.min(1, (a4HeightPx - 2) / Math.max(measuredHeight, 1));
    sheet.style.setProperty('--invoice-print-scale', String(scale));
    sheet.style.setProperty('--invoice-print-width', `${210 / scale}mm`);
    sheet.style.setProperty('--invoice-print-height', `${297 / scale}mm`);
  };

  const clearPrintScale = () => {
    const sheet = sheetRef.current;
    sheet?.style.removeProperty('--invoice-print-scale');
    sheet?.style.removeProperty('--invoice-print-width');
    sheet?.style.removeProperty('--invoice-print-height');
  };

  useEffect(() => {
    window.addEventListener('beforeprint', prepareSinglePagePrint);
    window.addEventListener('afterprint', clearPrintScale);
    return () => {
      window.removeEventListener('beforeprint', prepareSinglePagePrint);
      window.removeEventListener('afterprint', clearPrintScale);
    };
  });

  const printInvoice = () => {
    prepareSinglePagePrint();
    requestAnimationFrame(() => window.print());
  };

  const sharePdf = async (channel: 'email' | 'whatsapp') => {
    setPdfBusy(true);
    try {
      const blob = await createStyledPdf();
      const file = new File([blob], `${data.invoiceNumber}.pdf`, { type:'application/pdf' });
      const documentLabel = t(data.documentType === 'Rental proposal' ? 'rentalProposalDoc' : 'rentalInvoice');
      const payload = { title:`${documentLabel} ${data.invoiceNumber}`, text:`${t('brand')} ${documentLabel} — ${data.rental.make} ${data.rental.model}`, files:[file] };
      if (navigator.share && navigator.canShare?.({ files:[file] })) {
        try { await navigator.share(payload); return; }
        catch (error: any) { if (error.name === 'AbortError') return; }
      }
      saveBlob(blob, file.name);
      const subject = encodeURIComponent(`${documentLabel} ${data.invoiceNumber}`);
      const message = encodeURIComponent(`${t('rentalBillReady')} ${shareUrl}`);
      if (channel === 'email') location.href = `mailto:${data.rental.renterEmail}?subject=${subject}&body=${message}`;
      else location.href = `https://wa.me/?text=${message}`;
      toast(t('shareDownloaded'));
    } catch (error: any) { if (error.name !== 'AbortError') toast(error.message || t('unablePreparePdf'), true); }
    finally { setPdfBusy(false); }
  };

  if (!data) return <div className="invoice-loading"><Skeleton rows={6} /></div>;
  const r = data.rental;
  const serviceDiscounts = data.services.reduce((sum: number, service: any) => sum + service.discount, 0);
  return <div className="invoice-page">
    <header className="invoice-toolbar no-print"><Link href="/dashboard/rentals" className="back-link"><ArrowLeft />{t('invoiceBack')}</Link><div><LanguageToggle /><ThemeToggle /><button className="btn secondary" onClick={downloadPdf} disabled={pdfBusy || !qrCode} aria-label={pdfBusy ? t('pdfPreparing') : t('pdf')}><Download /><span>{pdfBusy ? t('pdfPreparing') : t('pdf')}</span></button><button className="btn secondary" onClick={() => sharePdf('email')} disabled={pdfBusy || !qrCode} aria-label={t('emailAction')}><Mail /><span>{t('emailAction')}</span></button><button className="btn secondary" onClick={() => sharePdf('whatsapp')} disabled={pdfBusy || !qrCode} aria-label={t('whatsapp')}><MessageCircle /><span>{t('whatsapp')}</span></button><button className="btn primary" onClick={printInvoice} disabled={!qrCode} aria-label={t('print')}><Printer /><span>{t('print')}</span></button></div></header>
    <main className="invoice-sheet" ref={sheetRef}>
      <header className="invoice-head"><section className="invoice-brand"><Link href="/" className="logo"><span><CarFront /></span>FleetFlow</Link><StatusBadge status={r.status} /></section><div><span>{t(data.documentType === 'Rental proposal' ? 'rentalProposalDoc' : 'rentalInvoice')}</span><strong>{data.invoiceNumber}</strong><small>{t('issued')} {dateTime(r.createdAt)}</small></div></header>
      <section className="invoice-parties"><div><span>{t('issuedBy')}</span><strong>{r.companyName}</strong><small>{r.companyCity}</small></div><div><span>{t('billedTo')}</span><strong>{r.renterName}</strong><small>{r.renterEmail}</small><small>{r.renterPhone}</small></div></section>
      <section className="invoice-vehicle"><img src={r.image} /><div><span>{t('rentedVehicle')}</span><h1>{r.make} {r.model}</h1><p>{r.year} {t(r.category)} · {r.color}</p><div><small>{t('licensePlate')}<strong>{r.licensePlate}</strong></small><small>{t('transmission')}<strong>{t(r.gearbox)}</strong></small><small>{t('fuel')}<strong>{t(r.fuel)}</strong></small><small>{t('odometer')}<strong>{Number(r.odometer).toLocaleString()} {t('miles')}</strong></small></div></div></section>
      <section className="invoice-schedule" style={{gridTemplateColumns:'repeat(2, minmax(0, 1fr))',gridTemplateRows:'repeat(2, auto)'}}><div><CalendarDays /><span>{t('pickup')}<strong>{dateTime(r.startsAt)}</strong></span></div><div><CalendarDays /><span>{t('returnDate')}<strong>{dateTime(r.endsAt)}</strong></span></div><div><MapPin /><span>{t('pickupLocation')}<strong>{r.pickupLocation}</strong></span></div><div><ShieldCheck /><span>{t('ratePlan')}<strong>{r.quantity} × {t(r.rateType)}</strong></span></div></section>
      <section className="invoice-lines"><header><span>{t('descriptionColumn')}</span><span>{t('details')}</span><span>{t('amount')}</span></header><div><strong>{r.make} {r.model} {t('invoiceRentalSuffix')}</strong><span>{r.quantity} {t(r.rateType)}</span><strong>{money(r.subtotal)}</strong></div>{r.discount > 0 && <div className="deduction"><strong>{t('promotion')} {r.promoCode}</strong><span>{t('vehicleDiscount')}</span><strong>−{money(r.discount)}</strong></div>}{data.services.map((service: any) => <div className="service-invoice-line" key={service.id}><strong>{t(service.name)}</strong><span>{service.days} {t(service.days > 1 ? 'days' : 'day')} × {money(service.unitPrice)}{service.discount > 0 && <small>{t('serviceDiscount')} −{money(service.discount)}</small>}</span><strong>{money(service.total)}</strong></div>)}{r.extraDiscount > 0 && <div className="deduction"><strong>{t('additionalCompanyDiscount')}</strong><span>{t('billAdjustment')}</span><strong>−{money(r.extraDiscount)}</strong></div>}</section>
      <section className="invoice-summary-row"><div className="invoice-qr">{qrCode ? <img src={qrCode} alt={t('billQrCode')} /> : <span className="qr-placeholder" />}<div><strong>{t('scanOnlineBill')}</strong><small>{t('scanOnlineBillText')}</small><a href={shareUrl}>{t('openOnlineBill')}</a></div></div><section className="invoice-total"><div><span>{t('vehicleRental')}</span><strong>{money(r.subtotal)}</strong></div><div><span>{t('premiumServices')}</span><strong>{money(r.extrasSubtotal)}</strong></div><div><span>{t('totalDiscounts')}</span><strong>−{money(r.discount + r.extraDiscount + serviceDiscounts)}</strong></div><div><span>{t('totalDue')}</span><strong>{money(r.total)}</strong></div></section></section>
      <footer className="invoice-footer"><ShieldCheck /><span><strong>{t('invoiceProtection')}</strong>{t('invoiceProtectionText')}</span><em>{t('thankYou')}</em></footer>
    </main>
  </div>;
}
