'use client';
import Link from 'next/link';
import { CarFront } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LanguageToggle, ThemeToggle } from '@/components/theme-controls';
import { VehicleDetailContent } from '@/components/vehicle-detail-content';
import { Skeleton } from '@/components/ui';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n';

export default function PublicBrowseDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);

  useEffect(() => {
    api(`/vehicles/${id}`).then(setData);
    api('/auth/me?optional=1').then((result: any) => setAccount(result.user)).catch(() => undefined);
  }, [id]);

  const rent = () => {
    const destination = `/dashboard/browse/${id}?rent=1`;
    if (account?.role === 'renter') router.push(destination);
    else router.push(`/login?role=renter&next=${encodeURIComponent(destination)}`);
  };

  return (
    <div className="public-marketplace">
      <header className="landing-nav">
        <Link href="/" className="logo"><span><CarFront /></span>FleetFlow</Link>
        <nav><Link href="/browse">{t('marketplace')}</Link></nav>
        <div className="nav-actions">
          <LanguageToggle />
          <ThemeToggle />
          {account
            ? <Link className="btn primary" href={account.role === 'renter' ? '/dashboard/browse' : '/dashboard'}>{t('dashboard')}</Link>
            : <><Link className="btn ghost" href="/login">{t('signIn')}</Link><Link className="btn primary" href="/register?role=renter">{t('getStarted')}</Link></>}
        </div>
      </header>
      <main className="public-marketplace-content">
        {!data ? <Skeleton rows={6} /> : <VehicleDetailContent data={data} variant="public" onRent={rent} />}
      </main>
    </div>
  );
}
