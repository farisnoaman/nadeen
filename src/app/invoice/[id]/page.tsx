'use client';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CarFront, Download, Mail, MapPin, MessageCircle, PenLine, Printer, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LanguageToggle, ThemeToggle } from '@/components/theme-controls';
import { Skeleton, StatusBadge, useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { dateTime, formatMoney } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { RentalDocumentStage } from '@/lib/rental-document';

function DocumentStageBadge({ stage }:{ stage:RentalDocumentStage }) {
  const { t } = useI18n();
  return <span className={`document-stage-badge document-stage-${stage}`}><i />{t(`documentStage_${stage}`)}</span>;
}

export default function InvoicePage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
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

  const pdfFileName = () => {
    const rental = data?.rental;
    const start = rental?.startsAt ? new Date(rental.startsAt).toISOString().slice(0, 10) : '';
    const end = rental?.endsAt ? new Date(rental.endsAt).toISOString().slice(0, 10) : '';
    const base = [data?.invoiceNumber, rental ? `${rental.make} ${rental.model}` : '', start && end ? `${start} to ${end}` : ''].filter(Boolean).join(' - ');
    return `${base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()}.pdf`;
  };

  useEffect(() => {
    if (data) document.title = pdfFileName().replace(/\.pdf$/, '');
  }, [data]);

  const downloadPdf = async () => {
    setPdfBusy(true);
    try { const blob = await createStyledPdf(); saveBlob(blob, pdfFileName()); toast(t('styledPdfDownloaded')); }
    catch (error: any) { toast(error.message || t('unablePreparePdf'), true); }
    finally { setPdfBusy(false); }
  };

  const prepareSinglePagePrint = () => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    document.documentElement.classList.add('printing-invoice');
    // Always measure the fixed desktop A4 composition, even when Print is opened
    // from a narrow phone/tablet preview. The inverse dimensions compensate for
    // print zoom so the final physical box remains exactly 210 × 297 mm.
    sheet.classList.add('print-measuring');
    const measuredHeight = Math.max(sheet.scrollHeight, sheet.getBoundingClientRect().height);
    sheet.classList.remove('print-measuring');
    const a4HeightPx = 297 * 96 / 25.4;
    const scale = Math.min(1, (a4HeightPx - 4) / Math.max(measuredHeight, 1));
    sheet.style.setProperty('--invoice-print-scale', String(scale));
    sheet.style.setProperty('--invoice-print-width', `${210 / scale}mm`);
    sheet.style.setProperty('--invoice-print-height', `${297 / scale}mm`);
  };

  const clearPrintScale = () => {
    const sheet = sheetRef.current;
    sheet?.style.removeProperty('--invoice-print-scale');
    sheet?.style.removeProperty('--invoice-print-width');
    sheet?.style.removeProperty('--invoice-print-height');
    document.documentElement.classList.remove('printing-invoice');
  };

  useEffect(() => {
    window.addEventListener('beforeprint', prepareSinglePagePrint);
    window.addEventListener('afterprint', clearPrintScale);
    return () => {
      window.removeEventListener('beforeprint', prepareSinglePagePrint);
      window.removeEventListener('afterprint', clearPrintScale);
    };
  });

  const printInvoice = async () => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    await document.fonts.ready;
    await Promise.all([...sheet.querySelectorAll('img')].map(image => image.decode?.().catch(() => undefined)));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    prepareSinglePagePrint();
    requestAnimationFrame(() => window.print());
  };

  const sharePdf = async (channel: 'email' | 'whatsapp') => {
    setPdfBusy(true);
    try {
      const blob = await createStyledPdf();
      const file = new File([blob], pdfFileName(), { type:'application/pdf' });
      const documentLabel = t(`documentTitle_${data.documentStage}`);
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
  const money = (value: number) => formatMoney(Number(value) * (Number(r.exchangeRate) || 1), r.currency || 'USD', lang);
  return <div className="invoice-page">
    <header className="invoice-toolbar no-print"><Link href="/dashboard/rentals" className="back-link"><ArrowLeft />{t('invoiceBack')}</Link><div><LanguageToggle /><ThemeToggle /><button className="btn secondary" onClick={downloadPdf} disabled={pdfBusy || !qrCode} aria-label={pdfBusy ? t('pdfPreparing') : t('pdf')}><Download /><span>{pdfBusy ? t('pdfPreparing') : t('pdf')}</span></button><button className="btn secondary" onClick={() => sharePdf('email')} disabled={pdfBusy || !qrCode} aria-label={t('emailAction')}><Mail /><span>{t('emailAction')}</span></button><button className="btn secondary" onClick={() => sharePdf('whatsapp')} disabled={pdfBusy || !qrCode} aria-label={t('whatsapp')}><MessageCircle /><span>{t('whatsapp')}</span></button><button className="btn primary" onClick={printInvoice} disabled={!qrCode} aria-label={t('print')}><Printer /><span>{t('print')}</span></button></div></header>
    <main className="invoice-sheet" ref={sheetRef}>
      <header className="invoice-head"><section className="invoice-brand"><Link href="/" className="logo"><span><CarFront /></span>FleetFlow</Link><div className="invoice-badge-stack"><StatusBadge status={r.status} /><DocumentStageBadge stage={data.documentStage} /></div></section><div><span>{t(`documentTitle_${data.documentStage}`)}</span><strong>{data.invoiceNumber}</strong><small>{t(`documentDate_${data.documentStage}`)} {dateTime(data.documentDate)}</small></div></header>
      <section className="invoice-parties"><div><span>{t('issuedBy')}</span><strong>{r.companyName}</strong><small>{r.companyCity}</small></div><div><span>{t('billedTo')}</span><strong>{r.renterName}</strong><small>{r.renterEmail}</small><small>{r.renterPhone}</small></div></section>
      <section className="invoice-vehicle invoice-vehicle-pro"><figure><img src={r.image} alt={`${r.make} ${r.model}`} /><figcaption><span>{r.year} · {t(r.category)}</span><strong>{r.licensePlate}</strong></figcaption></figure><div className="invoice-vehicle-details"><header><div><span>{t('rentedVehicle')}</span><h1>{r.make} {r.model}</h1><p>{r.color}</p></div><em>{t(r.gearbox)} · {t(r.fuel)}</em></header><section className="invoice-vehicle-policy"><article><small>{t('vehicleInsurance')}</small><strong>{t(r.insuranceCoverage)} · {r.insuranceProvider||'—'}</strong><span>{r.insurancePolicyNumber||'—'} · {r.insurancePolicyExpiry?new Date(r.insurancePolicyExpiry).toLocaleDateString():'—'}</span></article><article><small>{t('vehiclePolicyDeductible')}</small><strong>{money(r.insuranceDeductible)}</strong><span>{t('licensePlate')}: {r.licensePlate}</span></article></section><section className="invoice-vehicle-readings"><article><small>{t('bookingOdometer')}</small><strong>{Number(r.bookingOdometer||0).toLocaleString()}</strong><span>{t('kilometers')} · {t('quotationReading')}</span></article><article className={r.pickupOdometer!=null?'verified':''}><small>{t('pickupOdometer')}</small><strong>{r.pickupOdometer!=null?Number(r.pickupOdometer).toLocaleString():'—'}</strong><span>{r.pickupOdometer!=null?`${t('kilometers')} · ${t('acknowledged')}`:t('awaitingHandover')}</span></article><article><small>{t('returnOdometer')}</small><strong>{r.returnOdometer!=null?Number(r.returnOdometer).toLocaleString():'—'}</strong><span>{r.returnOdometer!=null?t('kilometers'):t('returnInspection')}</span></article><article><small>{t('pickupFuel')}</small><strong>{r.pickupFuelLevel!=null?`${r.pickupFuelLevel}%`:'—'}</strong></article><article><small>{t('returnFuel')}</small><strong>{r.returnFuelLevel!=null?`${r.returnFuelLevel}%`:'—'}</strong></article></section></div></section>
      <section className="invoice-schedule" style={{gridTemplateColumns:'repeat(2, minmax(0, 1fr))',gridTemplateRows:'repeat(2, auto)'}}><div><CalendarDays /><span>{t('pickup')}<strong>{dateTime(r.startsAt)}</strong></span></div><div><CalendarDays /><span>{t('returnDate')}<strong>{dateTime(r.endsAt)}</strong></span></div><div><MapPin /><span>{t('pickupSite')}<strong>{r.pickupLocation} · {r.pickupCity}</strong><small>{t('returnSite')}: {r.returnLocation} · {r.returnCity}</small></span></div><div className="invoice-rate-policy"><ShieldCheck /><span>{t('ratePlan')}<strong>{r.quantity} × {t(r.rateType)}</strong><div className="invoice-kilometer-policy"><small><span>{t('dailyKilometerAllowance')}</span><b>{Number(r.dailyKilometerAllowance||0).toLocaleString()} {t('kilometers')} / {t('day')}</b></small><small><span>{t('excessKilometerRate')}</span><b>{money(r.excessKilometerRate)} / {t('kilometers')}</b></small></div><em title={r.kilometerPolicyName}>{t('totalAllowanceForRental')}: {Number(r.allowedKilometers||0).toLocaleString()} {t('kilometers')}</em></span></div></section>
      <section className="invoice-lines"><header><span>{t('descriptionColumn')}</span><span>{t('details')}</span><span>{t('amount')}</span></header><div><strong>{r.make} {r.model} {t('invoiceRentalSuffix')}</strong><span>{r.quantity} {t(r.rateType)}</span><strong>{money(r.subtotal)}</strong></div><div><strong>{t('protectionPackage')} · {r.protectionName || t(`protection_${r.protectionTier}`)}</strong><span>{r.protectionDays} {t(r.protectionDays>1?'days':'day')} × {money(r.protectionDailyPrice)}<small>{t('deductible')} {money(r.protectionDeductible)}</small><small>{r.protectionCoverage.map((code:string)=>t(`coverage_${code}`)).join(' · ')}</small></span><strong>{money(r.protectionSubtotal)}</strong></div>{r.fuelCharge>0&&<div><strong>{t('fuelCharge')}</strong><span>{t('returnInspection')}</span><strong>{money(r.fuelCharge)}</strong></div>}{r.excessDistanceCharge>0&&<div><strong>{t('excessDistanceCharge')}</strong><span>{Math.max(0,r.returnOdometer-r.pickupOdometer-r.allowedKilometers)} {t('kilometers')} × {money(r.excessKilometerRate)}</span><strong>{money(r.excessDistanceCharge)}</strong></div>}{r.promoDetails && r.promoDetails.length > 0 ? r.promoDetails.map((pd: any) => <div className="deduction" key={pd.code}><strong>{t('promotion')} {pd.code}</strong><span>{pd.type === 'percentage' ? `${pd.value}% (${t('percentage')})` : `${t('fixed')} · ${money(pd.value)}`}</span><strong>−{money(pd.discount)}</strong></div>) : r.discount > 0 && <div className="deduction"><strong>{t('promotion')} {r.promoCode}</strong><span>{t('vehicleDiscount')}</span><strong>−{money(r.discount)}</strong></div>}{r.loyaltyDiscount>0&&<div className="deduction loyalty-invoice-line"><strong>{t('loyaltyDiscount')} · {r.loyaltyLevelName}</strong><span>{r.loyaltyDiscountPercentage}%</span><strong>−{money(r.loyaltyDiscount)}</strong></div>}{r.loyaltyPointsEarned>0&&<div className="loyalty-points-invoice-line"><strong>{t('loyaltyPointsEarned')}</strong><span>{r.loyaltyLevelName}</span><strong>+{Number(r.loyaltyPointsEarned).toLocaleString()} {t('points')}</strong></div>}{data.services.map((service: any) => <div className="service-invoice-line" key={service.id}><strong>{t(service.name)}</strong><span>{service.days} {t(service.days > 1 ? 'days' : 'day')} × {money(service.unitPrice)}{service.discount > 0 && <small>{t('serviceDiscount')} −{money(service.discount)}</small>}</span><strong>{money(service.total)}</strong></div>)}{r.extraDiscount > 0 && <div className="deduction"><strong>{t('additionalCompanyDiscount')}</strong><span>{t('billAdjustment')}</span><strong>−{money(r.extraDiscount)}</strong></div>}</section>
      <section className="invoice-summary-row"><div className="invoice-qr">{qrCode ? <img src={qrCode} alt={t('billQrCode')} /> : <span className="qr-placeholder" />}<div><strong>{t('scanOnlineBill')}</strong><small>{t('scanOnlineBillText')}</small><a href={shareUrl}>{t('openOnlineBill')}</a></div></div><section className="invoice-total"><div className="invoice-total-final"><span>{t(data.documentStage==='paid'?'totalPaid':'totalDue')}</span><strong>{money(r.total)}</strong></div></section></section>
      <section className={`invoice-signature ${r.pickupOdometer!=null?'signed':'pending'}`}><PenLine/><div><span>{t('renterHandoverSignature')}</span><strong>{r.renterSignatureName||(r.pickupOdometer!=null?t('deemedHandoverAcceptance'):t('signatureRequiredAtPickup'))}</strong><small>{r.renterSignedAt?`${t('signedAt')} ${dateTime(r.renterSignedAt)} · ${t('pickupOdometer')} ${Number(r.pickupOdometer||0).toLocaleString()} ${t('kilometers')}`:r.pickupOdometer!=null?t('deemedHandoverExplanation'):t('signaturePickupExplanation')}</small>{r.renterSignedAt&&<small>{t('signedInvoiceAgreement')}</small>}</div><em>{r.pickupOdometer!=null?t(r.handoverByRole==='company'?'companyAssistedHandover':r.handoverByRole==='renter'?'renterConfirmedHandover':'odoAcceptedBySignature'):t('awaitingHandover')}</em></section>
      <footer className="invoice-footer"><ShieldCheck /><span><strong>{t('invoiceProtection')}</strong>{t('invoiceProtectionText')}</span><em>{t('thankYou')}</em></footer>
    </main>
  </div>;
}
