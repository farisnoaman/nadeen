'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BadgePercent,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CarFront,
  CheckCheck,
  ChevronDown,
  CircleDollarSign,
  CircleHelp,
  Compass,
  CreditCard,
  FileCheck2,
  Gauge,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PackageCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n';
import { useCurrency } from '@/lib/currency-provider';
import { useAppTheme } from '@/lib/theme';
import { GlobalSearch } from './global-search';
import { Avatar, Skeleton } from './ui';
import { CurrencyToggle, LanguageToggle, ThemeToggle } from './theme-controls';
import { useWhatsApp } from './whatsapp-float';

type User = {
  id: number;
  name: string;
  email: string;
  role: 'renter' | 'company' | 'platform_admin';
  companyId: number | null;
  companyName: string | null;
  avatar: string | null;
  verificationStatus: 'unsubmitted' | 'pending' | 'verified' | 'rejected' | null;
};

type NotificationItem = {
  id: number;
  type: 'support_message' | 'support_reply' | 'support_status' | 'rental_created' | 'rental_status' | 'billing_updated' | 'maintenance_due' | 'maintenance_overdue' | 'maintenance_conflict' | 'system';
  body: string;
  href: string;
  entityType?: string | null;
  readAt: string | null;
  createdAt: string;
};

const UserCtx = createContext<User | null>(null);
export const useCurrentUser = () => useContext(UserCtx);

export function DashboardShell({ children }: { children: React.ReactNode }) {
const { lang, setLang, t } = useI18n();
const { currency, setCurrency } = useCurrency();
const { theme, setTheme } = useAppTheme();
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [whatsappNumbers, setWhatsappNumbers] = useState<Array<{label:string; phone:string}>>([]);
  const [loading, setLoading] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem('fleetflow-sidebar-collapsed') === 'true');
  }, []);

  useEffect(() => setMobile(false), [path]);

  useEffect(() => {
    if (!mobile) return;
    const previousOverflow = document.body.style.overflow;
    const desktop = window.matchMedia('(min-width: 901px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobile(false); };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setMobile(false); };
    document.body.style.overflow = 'hidden';
    desktop.addEventListener('change', closeOnDesktop);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener('change', closeOnDesktop);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobile]);

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then(data => setUser(data.user))
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'platform_admin' && !path.startsWith('/dashboard/admin') && !path.startsWith('/dashboard/settings')) {
      router.replace('/dashboard/admin/verifications');
    } else if (user.role === 'company' && user.verificationStatus !== 'verified'
      && !path.startsWith('/dashboard/verification') && !path.startsWith('/dashboard/settings') && !path.startsWith('/dashboard/support')) {
      router.replace('/dashboard/verification');
    }
  }, [user, path, router]);

  useEffect(() => {
    const refreshProfile = () => {
      api<{ user: User }>('/auth/me').then(data => setUser(data.user)).catch(() => undefined);
    };
    window.addEventListener('fleetflow:profile:refresh', refreshProfile);
    return () => window.removeEventListener('fleetflow:profile:refresh', refreshProfile);
  }, []);

  useEffect(() => {
    if (!user) return;
    api<{ preferences: { language: 'en' | 'ar'; theme: 'light' | 'dark'; currency?: string }; whatsappNumbers?: Array<{label:string; phone:string}> }>('/settings')
      .then(data => {
        if (data.preferences.language !== lang) setLang(data.preferences.language);
        if (data.preferences.theme !== theme) setTheme(data.preferences.theme);
        if (data.preferences.currency && data.preferences.currency !== currency) setCurrency(data.preferences.currency);
        if (data.whatsappNumbers) setWhatsappNumbers(data.whatsappNumbers);
      })
      .catch(() => undefined);
  }, [user?.id]);

  const { setWhatsApp } = useWhatsApp();
  useEffect(() => {
    if (whatsappNumbers.length) {
      setWhatsApp(whatsappNumbers, user?.companyName);
      return () => setWhatsApp([]);
    }
  }, [whatsappNumbers, user?.companyName, setWhatsApp]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const loadNotifications = async (showLoading = false) => {
      if (showLoading) setNotificationLoading(true);
      try {
        const data = await api<{ notifications: NotificationItem[] }>('/notifications');
        if (alive) setNotificationItems(data.notifications);
      } catch {
        // Notifications retry automatically without interrupting the dashboard.
      } finally {
        if (alive && showLoading) setNotificationLoading(false);
      }
    };
    loadNotifications(true);
    const timer = window.setInterval(() => loadNotifications(), 10_000);
    const refresh = () => loadNotifications();
    window.addEventListener('fleetflow:notifications:refresh', refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('fleetflow:notifications:refresh', refresh);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="dash-boot">
        <Link href="/" className="logo"><span><CarFront /></span>{t('brand')}</Link>
        <Skeleton rows={4} />
      </div>
    );
  }
  if (!user) return null;

  const companyNav = [
    ['/dashboard', 'overview', LayoutDashboard],
    ['/dashboard/verification', 'companyVerification', ShieldCheck],
    ['/dashboard/vehicles', 'fleet', CarFront],
    ['/dashboard/rentals', 'rentals', CalendarDays],
    ['/dashboard/policies', 'kilometerPolicies', Gauge],
    ['/dashboard/reports', 'reports', BarChart3],
    ['/dashboard/maintenance', 'maintenance', Wrench],
    ['/dashboard/insurance', 'insurancePackages', ShieldCheck],
    ['/dashboard/promotions', 'promotions', BadgePercent],
    ['/dashboard/services', 'premiumServices', Sparkles],
  ] as const;
  const renterNav = [
    ['/dashboard', 'overview', LayoutDashboard],
    ['/dashboard/browse', 'browse', Compass],
    ['/dashboard/saved', 'savedVehicles', Heart],
    ['/dashboard/rentals', 'rentals', CalendarDays],
    ['/dashboard/reports', 'reports', BarChart3],
  ] as const;
  const unverifiedCompanyNav = [['/dashboard/verification', 'companyVerification', ShieldCheck]] as const;
  const platformAdminNav = [
    ['/dashboard/admin/verifications', 'verificationRequests', FileCheck2],
    ['/dashboard/admin/companies', 'companiesTab', Building2],
    ['/dashboard/admin/subscriptions', 'subscriptionPackages', PackageCheck],
    ['/dashboard/admin/payments', 'paymentsTab', CreditCard],
  ] as const;
  const nav = user.role === 'platform_admin' ? platformAdminNav
    : user.role === 'company' ? (user.verificationStatus === 'verified' ? companyNav : unverifiedCompanyNav) : renterNav;
  const active = (href: string) => href === '/dashboard' ? path === href : path.startsWith(href);
  const pageKey = path.startsWith('/dashboard/support')
    ? 'support'
    : path.startsWith('/dashboard/settings')
      ? 'settings'
      : nav.find(([href]) => active(href))?.[1] || 'overview';
  const unreadCount = notificationItems.filter(item => !item.readAt).length;
  const supportUnread = notificationItems.filter(item => !item.readAt && item.type.startsWith('support')).length;

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  };
  const toggleSidebar = () => {
    setCollapsed(current => {
      const next = !current;
      localStorage.setItem('fleetflow-sidebar-collapsed', String(next));
      return next;
    });
  };

  const notificationTitle = (type: NotificationItem['type']) => t({
    support_message: 'notificationSupportMessage',
    support_reply: 'notificationSupportReply',
    support_status: 'notificationSupportStatus',
    rental_created: 'notificationRentalCreated',
    rental_status: 'notificationRentalStatus',
    billing_updated: 'notificationBillingUpdated',
    maintenance_due: 'notificationMaintenanceDue',
    maintenance_overdue: 'notificationMaintenanceOverdue',
    maintenance_conflict: 'notificationMaintenanceConflict',
    system: 'notificationSystem',
  }[type]);
  const notificationBody = (item: NotificationItem) => {
    if (item.type === 'rental_status') {
      const [reference, status] = item.body.split(' · ');
      return status ? `${reference} · ${t(status)}` : item.body;
    }
    if (item.type === 'support_status') {
      const [status, ...subject] = item.body.split(' · ');
      const statusKey = status === 'resolved' ? 'supportStatusResolved' : 'supportStatusOpen';
      return `${t(statusKey)} · ${subject.join(' · ')}`;
    }
    if (item.type === 'system' && item.entityType === 'loyalty_points') {
      const [amount, reference] = item.body.split(' loyalty points · ');
      return `${amount} ${t('points')} · ${reference || ''}`;
    }
    return item.body;
  };
  const notificationTime = (value: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
  const notificationIcon = (type: NotificationItem['type']) => {
    if (type.startsWith('support')) return <MessageCircle />;
    if (type === 'billing_updated') return <CircleDollarSign />;
    if (type.startsWith('maintenance')) return <Wrench />;
    if (type === 'rental_created' || type === 'rental_status') return <CalendarDays />;
    return <Bell />;
  };

  const openNotification = async (item: NotificationItem) => {
    setNotificationItems(current => current.map(entry => entry.id === item.id ? { ...entry, readAt: entry.readAt || new Date().toISOString() } : entry));
    if (!item.readAt) {
      api('/notifications', { method: 'PATCH', body: JSON.stringify({ id: item.id }) }).catch(() => undefined);
    }
    setNotificationOpen(false);
    router.push(item.href);
  };

  const markAllRead = async () => {
    const readAt = new Date().toISOString();
    setNotificationItems(current => current.map(item => ({ ...item, readAt: item.readAt || readAt })));
    await api('/notifications', { method: 'PATCH', body: JSON.stringify({ action: 'readAll' }) }).catch(() => undefined);
  };

  return (
    <UserCtx.Provider value={user}>
      <div className={`dashboard-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <aside id="dashboard-sidebar" className={mobile ? 'mobile-open' : ''} aria-label={t('workspace')}>
          <div className="side-logo">
            <Link href="/" className="logo"><span><CarFront /></span>{t('brand')}</Link>
            <button type="button" className="mobile-sidebar-close" onClick={() => setMobile(false)} aria-label={t('close')}><X /></button>
          </div>
          <button type="button" className="sidebar-collapse-toggle" onClick={toggleSidebar} aria-label={t(collapsed ? 'expandSidebar' : 'collapseSidebar')} title={t(collapsed ? 'expandSidebar' : 'collapseSidebar')} aria-expanded={!collapsed} aria-controls="dashboard-sidebar">
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
          <div className="workspace-switch" data-sidebar-label={user.role==='platform_admin'?t('platformAdministration'):user.companyName || t('personal')}>
            <span>{user.role==='platform_admin'?'PA':user.companyName?.split(' ').map(value => value[0]).slice(0, 2).join('') || 'FF'}</span>
            <div><small>{t('workspace')}</small><strong>{user.role==='platform_admin'?t('platformAdministration'):user.companyName || t('personal')}</strong></div>
            <ChevronDown />
          </div>
          <nav>
            <small>{t('workspace')}</small>
            {nav.map(([href, key, Icon]) => (
              <Link href={href} className={active(href) ? 'active' : ''} key={href} onClick={() => setMobile(false)} data-sidebar-label={t(key)} aria-label={t(key)}>
                <Icon />
                <span>{t(key)}</span>
                {key === 'rentals' && user.role === 'company' && <em>2</em>}
              </Link>
            ))}
          </nav>
          <div className="side-bottom">
            <nav>
              {user.role!=='platform_admin'&&<Link href="/dashboard/support" className={active('/dashboard/support') ? 'active' : ''} onClick={() => setMobile(false)} data-sidebar-label={t('support')} aria-label={t('support')}>
                <CircleHelp />
                <span>{t('support')}</span>
                {supportUnread > 0 && <em>{supportUnread > 9 ? '9+' : supportUnread}</em>}
              </Link>}
              <Link href="/dashboard/settings" className={active('/dashboard/settings') ? 'active' : ''} onClick={() => setMobile(false)} data-sidebar-label={t('settings')} aria-label={t('settings')}><Settings /><span>{t('settings')}</span></Link>
            </nav>
            <div className="side-theme"><CurrencyToggle /><LanguageToggle /><ThemeToggle /></div>
            <button type="button" className="side-user" data-sidebar-label={user.name} aria-label={user.name} onClick={() => { setProfile(!profile); setNotificationOpen(false); }}>
              <Avatar name={user.name} initials={user.avatar} />
              <div><strong>{user.name}</strong><small>{user.role === 'platform_admin' ? t('platformAdmin') : user.role === 'company' ? t('administrator') : t('verifiedDriver')}</small></div>
              <ChevronDown />
            </button>
            <button type="button" className="side-logout" data-sidebar-label={t('logout')} aria-label={t('logout')} onClick={logout}>
              <LogOut />
              <span>{t('logout')}</span>
            </button>
          </div>
        </aside>

        {mobile && <button type="button" className="side-scrim" onClick={() => setMobile(false)} aria-label={t('close')} />}

        <main>
          <header className="dash-topbar">
            <div>
              <button type="button" className="mobile-menu" onClick={() => setMobile(true)} aria-label={t('openMenu')} aria-expanded={mobile} aria-controls="dashboard-sidebar"><Menu /></button>
              <span>{user.role==='platform_admin'?t('platformAdmin'):user.companyName || 'FleetFlow'}</span>
              <h1>{t(pageKey)}</h1>
            </div>
            <div className="top-actions">
              <GlobalSearch />
              <button
                type="button"
                className={`icon-btn bell ${notificationOpen ? 'active' : ''}`}
                onClick={() => { setNotificationOpen(!notificationOpen); setProfile(false); }}
                aria-label={t('notifications')}
                aria-expanded={notificationOpen}
              >
                <Bell />
                {unreadCount > 0 && <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>
              {user.role === 'company' && user.verificationStatus==='verified' && <Link href="/dashboard/vehicles?new=1" className="btn primary top-add">+ {t('addVehicle')}</Link>}
              <button type="button" className="top-avatar" onClick={() => { setProfile(!profile); setNotificationOpen(false); }}>
                <Avatar name={user.name} initials={user.avatar} size="sm" /><ChevronDown />
              </button>
            </div>

          </header>
          {notificationOpen && (
            <>
              <button type="button" className="notification-scrim" onClick={() => setNotificationOpen(false)} aria-label={t('close')} />
              <section className="notification-menu">
                <header>
                  <div><h3>{t('notifications')}</h3>{unreadCount > 0 && <span>{unreadCount} {t('notificationNew')}</span>}</div>
                  {unreadCount > 0 && <button type="button" onClick={markAllRead}><CheckCheck />{t('notificationMarkAll')}</button>}
                </header>
                <div className="notification-list">
                  {notificationLoading ? (
                    <div className="notification-loading"><Skeleton rows={4} /></div>
                  ) : notificationItems.length ? notificationItems.map(item => (
                    <button type="button" key={item.id} className={item.readAt ? '' : 'unread'} onClick={() => openNotification(item)}>
                      <span className={`notification-icon notification-${item.type}`}>{notificationIcon(item.type)}</span>
                      <span>
                        <strong>{notificationTitle(item.type)}</strong>
                        <small>{notificationBody(item)}</small>
                        <time>{notificationTime(item.createdAt)}</time>
                      </span>
                      {!item.readAt && <i />}
                    </button>
                  )) : (
                    <div className="notification-empty"><Bell /><strong>{t('notificationEmpty')}</strong><span>{t('notificationEmptyText')}</span></div>
                  )}
                </div>
                <footer><Link href="/dashboard/support" onClick={() => setNotificationOpen(false)}>{t('notificationOpenSupport')}<MessageCircle /></Link></footer>
              </section>
            </>
          )}

          {profile && (
            <>
              <button type="button" className="profile-scrim" onClick={() => setProfile(false)} />
              <div className="profile-menu">
                <div><Avatar name={user.name} initials={user.avatar} /><span><strong>{user.name}</strong><small>{user.email}</small></span></div>
                <Link href="/dashboard/settings" onClick={() => setProfile(false)}><Settings />{t('settings')}</Link>
                <button type="button" onClick={logout} className="danger"><LogOut />{t('logout')}</button>
              </div>
            </>
          )}
          <div className="dash-content">{children}</div>
        </main>
      </div>
    </UserCtx.Provider>
  );
}
