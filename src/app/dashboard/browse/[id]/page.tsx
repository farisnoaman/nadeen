'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookingModal } from '@/components/booking-modal';
import { VehicleDetailContent } from '@/components/vehicle-detail-content';
import { Skeleton } from '@/components/ui';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n';

export default function BrowseDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    api(`/vehicles/${id}`).then(setData);
    if (new URLSearchParams(window.location.search).get('rent') === '1') setBooking(true);
  }, [id]);

  if (!data) return <Skeleton rows={6} />;

  return (
    <>
      <Link className="back-link" href="/dashboard/browse"><ArrowLeft />{t('browse')}</Link>
      <VehicleDetailContent data={data} variant="dashboard" onBookingOpen={() => setBooking(true)} />
      {booking && <BookingModal vehicle={data.vehicle} onClose={() => setBooking(false)} />}
    </>
  );
}
