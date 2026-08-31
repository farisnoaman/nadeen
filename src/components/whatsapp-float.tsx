'use client';

import { MessageCircle, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type WhatsAppNumber = { label: string; phone: string };

type WhatsAppContextValue = {
  whatsappNumbers: WhatsAppNumber[];
  companyName: string | null;
  rentalId: number | null;
  vehicleName: string | null;
  setWhatsApp: (numbers: WhatsAppNumber[], company?: string | null, rentalId?: number | null, vehicleName?: string | null) => void;
};

export const WhatsAppContext = createContext<WhatsAppContextValue>({
  whatsappNumbers: [],
  companyName: null,
  rentalId: null,
  vehicleName: null,
  setWhatsApp: () => {},
});

export function useWhatsApp() {
  return useContext(WhatsAppContext);
}

const DISMISS_KEY = 'fleetflow:whatsapp-float';
const DISMISS_COOLDOWN_DAYS = 7;

function getDismissState(): { dismissed: boolean; dismissedAt: number } {
  if (typeof window === 'undefined') return { dismissed: false, dismissedAt: 0 };
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return { dismissed: false, dismissedAt: 0 };
    const parsed = JSON.parse(raw);
    if (!parsed?.dismissedAt) return { dismissed: false, dismissedAt: 0 };
    const daysSince = (Date.now() - parsed.dismissedAt) / (1000 * 60 * 60 * 24);
    if (daysSince >= DISMISS_COOLDOWN_DAYS) {
      localStorage.removeItem(DISMISS_KEY);
      return { dismissed: false, dismissedAt: 0 };
    }
    return { dismissed: true, dismissedAt: parsed.dismissedAt };
  } catch {
    return { dismissed: false, dismissedAt: 0 };
  }
}

function setDismissState() {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ dismissed: true, dismissedAt: Date.now() }));
  } catch {}
}

export function WhatsAppProvider({ children }: { children: React.ReactNode }) {
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [company, setCompany] = useState<string | null>(null);
  const [rental, setRental] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState<string | null>(null);

  const setWhatsApp = useCallback((nums: WhatsAppNumber[], comp?: string | null, rid?: number | null, vname?: string | null) => {
    setNumbers(nums);
    setCompany(comp ?? null);
    setRental(rid ?? null);
    setVehicle(vname ?? null);
  }, []);

  return (
    <WhatsAppContext.Provider value={{ whatsappNumbers: numbers, companyName: company, rentalId: rental, vehicleName: vehicle, setWhatsApp }}>
      {children}
    </WhatsAppContext.Provider>
  );
}

export function WhatsAppFloat() {
  const { whatsappNumbers, companyName, rentalId, vehicleName } = useContext(WhatsAppContext);
  const [platformPhone, setPlatformPhone] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const state = getDismissState();
    if (!state.dismissed) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    fetch('/api/whatsapp-config')
      .then(res => res.json())
      .then(data => setPlatformPhone(data.phone || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const dismiss = () => {
    setVisible(false);
    setDismissState();
  };

  const allNumbers: WhatsAppNumber[] = whatsappNumbers.length
    ? whatsappNumbers
    : platformPhone
      ? [{ label: 'Platform', phone: platformPhone }]
      : [];

  if (!allNumbers.length || !visible) return null;

  const buildUrl = (phone: string) => {
    const message = rentalId
      ? `Hi, I'm inquiring about my rental #FF-${String(rentalId).padStart(4, '0')}${vehicleName ? ` (${vehicleName})` : ''}`
      : vehicleName
        ? `Hi, I'm interested in the ${vehicleName}${companyName ? ` from ${companyName}` : ''}`
        : `Hi, I have a question about FleetFlow`;
    return `https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(message)}`;
  };

  if (allNumbers.length === 1) {
    return (
      <div className="whatsapp-float-wrapper" ref={popupRef}>
        <button type="button" className="whatsapp-float-dismiss" onClick={dismiss} aria-label="Dismiss">
          <X />
        </button>
        <a
          href={buildUrl(allNumbers[0].phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="whatsapp-float"
          aria-label="Contact on WhatsApp"
          title={companyName ? `Chat with ${companyName}` : 'Contact support'}
        >
          <MessageCircle />
        </a>
      </div>
    );
  }

  return (
    <div className="whatsapp-float-wrapper" ref={popupRef}>
      {open && (
        <div className="whatsapp-popup">
          <div className="whatsapp-popup-header">
            <strong>{companyName || 'Contact us'}</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              <X />
            </button>
          </div>
          <div className="whatsapp-popup-list">
            {allNumbers.map((number) => (
              <a
                key={number.label}
                href={buildUrl(number.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="whatsapp-popup-item"
                onClick={() => setOpen(false)}
              >
                <MessageCircle />
                <span>{number.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}
      <button type="button" className="whatsapp-float-dismiss" onClick={dismiss} aria-label="Dismiss">
        <X />
      </button>
      <button
        type="button"
        className="whatsapp-float"
        onClick={() => setOpen(!open)}
        aria-label="Contact on WhatsApp"
        title={companyName ? `Chat with ${companyName}` : 'Contact support'}
      >
        <MessageCircle />
      </button>
    </div>
  );
}
