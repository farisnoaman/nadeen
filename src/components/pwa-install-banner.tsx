'use client';
import { useEffect, useState, useCallback } from 'react';
import { Download, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const DISMISS_KEY = 'ff_pwa_dismissed';
const DISMISS_DAYS = 7;

export function PwaInstallBanner() {
  const { t, lang } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const daysSince = (Date.now() - Number(dismissed)) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_DAYS) return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      localStorage.removeItem(DISMISS_KEY);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }, []);

  if (!visible) return null;

  return (
    <div className="pwa-install-banner" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="pwa-install-banner-inner">
        <div className="pwa-install-banner-icon">
          <img src="/icon.svg" alt="FleetFlow" width={40} height={40} />
        </div>
        <div className="pwa-install-banner-text">
          <strong>{t('pwaInstallTitle')}</strong>
          <span>{t('pwaInstallText')}</span>
        </div>
        <div className="pwa-install-banner-actions">
          <button className="btn primary small" onClick={install}>
            <Download size={14} />
            {t('pwaInstallButton')}
          </button>
          <button className="pwa-install-banner-dismiss" onClick={dismiss} aria-label={t('pwaDismissButton')}>
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
