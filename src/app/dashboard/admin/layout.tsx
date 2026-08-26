'use client';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function PlatformAdminLayout({children}:{children:React.ReactNode}){
  const{t}=useI18n();
  return <div className="platform-admin-workspace">
    <div className="page-heading admin-workspace-heading"><div><span className="eyebrow"><ShieldCheck/>{t('platformControlCenter')}</span><h2>{t('platformAdministration')}</h2><p>{t('platformAdministrationText')}</p></div></div>
    {children}
  </div>;
}
