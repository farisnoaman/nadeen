'use client';

import {
  Award,
  BellRing,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  Globe2,
  KeyRound,
  Languages,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Palette,
  Phone,
  Save,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Skeleton, useToast } from '@/components/ui';
import { api, saveSessionToken } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n';
import { AppTheme, useAppTheme } from '@/lib/theme';
import { SUPPORTED_CURRENCIES } from '@/lib/currencies';

type SettingsSection = 'profile' | 'workspace' | 'loyalty' | 'notifications' | 'appearance' | 'security';

type Profile = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: 'renter' | 'company' | 'platform_admin';
  companyId: number | null;
  companyName: string | null;
  companyCity: string | null;
  createdAt: string;
};

type Preferences = {
  emailNotifications: boolean;
  inAppNotifications: boolean;
  rentalNotifications: boolean;
  messageNotifications: boolean;
  billingNotifications: boolean;
  marketingNotifications: boolean;
  weeklySummary: boolean;
  language: 'en' | 'ar';
  theme: AppTheme;
};

type LoyaltySettings = {
  id: number;
  enabled: boolean;
  pointsPerCurrency: number;
  levels: Array<{ id:number; rank:number; name:string; pointsThreshold:number; discountPercentage:number }>;
  stats: { members:number; pointsIssued:number; rewardedRentals:number };
};

type CurrencySettings = {
  baseCurrency: string;
  supportedCurrencies: string[];
  exchangeRates: Record<string, number>;
};

const defaultPreferences: Preferences = {
  emailNotifications: true,
  inAppNotifications: true,
  rentalNotifications: true,
  messageNotifications: true,
  billingNotifications: true,
  marketingNotifications: false,
  weeklySummary: true,
  language: 'en',
  theme: 'light',
};

export default function SettingsPage() {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useAppTheme();
  const toast = useToast();
  const [section, setSection] = useState<SettingsSection>('profile');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', companyName: '', companyCity: '' });
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [loyalty, setLoyalty] = useState<LoyaltySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingLoyalty, setSavingLoyalty] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [currency, setCurrency] = useState<CurrencySettings | null>(null);
  const [savingCurrency, setSavingCurrency] = useState(false);

  useEffect(() => {
    api<{ profile: Profile; preferences: Preferences; loyalty:LoyaltySettings|null; currency:CurrencySettings[]|null }>('/settings')
      .then(data => {
        setProfile(data.profile);
        setLoyalty(data.loyalty);
        setProfileForm({
          name: data.profile.name,
          phone: data.profile.phone || '',
          companyName: data.profile.companyName || '',
          companyCity: data.profile.companyCity || '',
        });
        setPreferences({ ...data.preferences, language: lang, theme });
        setCurrency(Array.isArray(data.currency) && data.currency[0]
          ? data.currency[0]
          : { baseCurrency: 'USD', supportedCurrencies: ['USD'], exchangeRates: {} });
      })
      .catch(error => toast(error.message, true))
      .finally(() => setLoading(false));
  }, []);

  const sections = useMemo(() => [
    { id: 'profile' as const, icon: UserRound, label: t('settingsProfile'), text: t('settingsProfileText') },
    ...(profile?.role === 'company' ? [
      { id: 'workspace' as const, icon: Building2, label: t('settingsWorkspace'), text: t('settingsWorkspaceText') },
      { id: 'loyalty' as const, icon: Award, label: t('settingsLoyalty'), text: t('settingsLoyaltyText') },
    ] : []),
    { id: 'notifications' as const, icon: BellRing, label: t('settingsNotifications'), text: t('settingsNotificationsText') },
    { id: 'appearance' as const, icon: Palette, label: t('settingsAppearance'), text: t('settingsAppearanceText') },
    { id: 'security' as const, icon: ShieldCheck, label: t('settingsSecurity'), text: t('settingsSecurityText') },
  ], [profile?.role, lang]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const data = await api<{ profile: Profile; sessionToken: string }>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'profile', ...profileForm }),
      });
      saveSessionToken(data.sessionToken);
      setProfile(data.profile);
      setProfileForm({
        name: data.profile.name,
        phone: data.profile.phone || '',
        companyName: data.profile.companyName || '',
        companyCity: data.profile.companyCity || '',
      });
      window.dispatchEvent(new Event('fleetflow:profile:refresh'));
      toast(t('settingsProfileSaved'));
    } catch (error: any) {
      toast(error.message, true);
    } finally {
      setSavingProfile(false);
    }
  };

  const updateLoyaltyLevel = (rank:number, changes:Partial<LoyaltySettings['levels'][number]>) => {
    setLoyalty(current => current ? {
      ...current,
      levels:current.levels.map(level => level.rank === rank ? { ...level, ...changes } : level),
    } : current);
  };

  const saveLoyalty = async () => {
    if (!loyalty) return;
    setSavingLoyalty(true);
    try {
      const data = await api<{ loyalty:LoyaltySettings }>('/settings', {
        method:'PATCH',
        body:JSON.stringify({
          action:'loyalty',
          enabled:loyalty.enabled,
          pointsPerCurrency:loyalty.pointsPerCurrency,
          levels:loyalty.levels,
        }),
      });
      setLoyalty(data.loyalty);
      toast(t('settingsLoyaltySaved'));
    } catch (error:any) {
      toast(error.message, true);
    } finally {
      setSavingLoyalty(false);
    }
  };

  const saveNotificationPreferences = async () => {
    setSavingPreferences(true);
    try {
      const data = await api<{ preferences: Preferences }>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'preferences', ...preferences }),
      });
      setPreferences(current => ({ ...data.preferences, language: current.language, theme: current.theme }));
      window.dispatchEvent(new Event('fleetflow:notifications:refresh'));
      toast(t('settingsPreferencesSaved'));
    } catch (error: any) {
      toast(error.message, true);
    } finally {
      setSavingPreferences(false);
    }
  };

  const saveAppearance = async (changes: Partial<Pick<Preferences, 'language' | 'theme'>>) => {
    const next = { ...preferences, ...changes };
    setPreferences(next);
    if (changes.theme) setTheme(changes.theme);
    if (changes.language) setLang(changes.language);
    setSavingAppearance(true);
    try {
      const data = await api<{ preferences: Preferences }>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'preferences', language: next.language, theme: next.theme }),
      });
      setPreferences(current => ({ ...current, language: data.preferences.language, theme: data.preferences.theme }));
      toast(t('settingsAppearanceSaved'));
    } catch (error: any) {
      toast(error.message, true);
    } finally {
      setSavingAppearance(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast(t('settingsPasswordsMismatch'), true);
      return;
    }
    setSavingPassword(true);
    try {
      await api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'password',
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast(t('settingsPasswordChanged'));
    } catch (error: any) {
      toast(error.message, true);
    } finally {
      setSavingPassword(false);
    }
  };

  const saveCurrency = async () => {
    if (!currency) return;
    setSavingCurrency(true);
    try {
      const data = await api<{ currency: CurrencySettings }>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'currencies',
          baseCurrency: currency.baseCurrency,
          supportedCurrencies: currency.supportedCurrencies,
          exchangeRates: currency.exchangeRates,
        }),
      });
      setCurrency(data.currency ?? currency);
      toast(t('settingsCurrenciesSaved'));
    } catch (error: any) {
      toast(error.message, true);
    } finally {
      setSavingCurrency(false);
    }
  };

  const togglePreference = (key: keyof Preferences) => {
    if (typeof preferences[key] !== 'boolean') return;
    setPreferences(current => ({ ...current, [key]: !current[key] }));
  };
  const memberSince = profile ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-US', {
    month: 'long', year: 'numeric',
  }).format(new Date(profile.createdAt)) : '';

  if (loading || !profile) {
    return <section className="panel settings-loading"><Skeleton rows={8} /></section>;
  }

  return (
    <>
      <div className="page-heading settings-page-heading">
        <div>
          <span className="eyebrow"><Sparkles />{t('settingsControlCenter')}</span>
          <h2>{t('settingsTitle')}</h2>
          <p>{t('settingsText')}</p>
        </div>
        <div className="settings-account-pill">
          <span>{profile.avatar}</span>
          <div><strong>{profile.name}</strong><small>{profile.email}</small></div>
        </div>
      </div>

      <div className="settings-layout">
        <aside className="panel settings-nav">
          <header>
            <span>{profile.avatar}</span>
            <div>
              <strong>{profile.name}</strong>
              <small>{profile.role === 'platform_admin' ? t('platformAdmin') : profile.role === 'company' ? t('companyRole') : t('renter')}</small>
            </div>
          </header>
          <nav>
            {sections.map(item => (
              <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
                <span><item.icon /></span>
                <div><strong>{item.label}</strong><small>{item.text}</small></div>
                <ChevronRight />
              </button>
            ))}
          </nav>
          <footer><LockKeyhole /><span><strong>{t('settingsProtected')}</strong><small>{t('settingsProtectedText')}</small></span></footer>
        </aside>

        <main className="panel settings-content">
          {section === 'profile' && (
            <form onSubmit={saveProfile} className="settings-section-form">
              <SettingsHeader icon={UserRound} title={t('settingsProfile')} text={t('settingsProfileDescription')} />
              <div className="settings-profile-hero">
                <span>{profile.avatar}</span>
                <div><strong>{profile.name}</strong><small>{t('settingsMemberSince')} {memberSince}</small></div>
                <em>{profile.role === 'platform_admin' ? t('platformAdmin') : profile.role === 'company' ? t('administrator') : t('verifiedDriver')}</em>
              </div>
              <div className="settings-form-grid">
                <label>
                  {t('fullName')}
                  <div><UserRound /><input required minLength={2} maxLength={80} value={profileForm.name} onChange={event => setProfileForm(current => ({ ...current, name: event.target.value }))} /></div>
                </label>
                <label>
                  {t('email')}
                  <div className="disabled"><Mail /><input value={profile.email} disabled /></div>
                  <small>{t('settingsEmailManaged')}</small>
                </label>
                <label className="span-2">
                  {t('settingsPhone')}
                  <div><Phone /><input maxLength={30} value={profileForm.phone} onChange={event => setProfileForm(current => ({ ...current, phone: event.target.value }))} placeholder={t('settingsPhonePlaceholder')} /></div>
                </label>
              </div>
              <SettingsActions saving={savingProfile} label={t('settingsSaveProfile')} t={t} />
            </form>
          )}

          {section === 'workspace' && profile.role === 'company' && (
            <>
            <form onSubmit={saveProfile} className="settings-section-form">
              <SettingsHeader icon={Building2} title={t('settingsWorkspace')} text={t('settingsWorkspaceDescription')} />
              <div className="settings-workspace-banner">
                <span>{profile.companyName?.split(' ').map(value => value[0]).slice(0, 2).join('')}</span>
                <div><strong>{profile.companyName}</strong><small><MapPin />{profile.companyCity}</small></div>
                <em>{t('settingsVerifiedWorkspace')}</em>
              </div>
              <div className="settings-form-grid">
                <label className="span-2">
                  {t('companyName')}
                  <div><Building2 /><input required minLength={2} maxLength={100} value={profileForm.companyName} onChange={event => setProfileForm(current => ({ ...current, companyName: event.target.value }))} /></div>
                </label>
                <label className="span-2">
                  {t('settingsCompanyLocation')}
                  <div><MapPin /><input required minLength={2} maxLength={100} value={profileForm.companyCity} onChange={event => setProfileForm(current => ({ ...current, companyCity: event.target.value }))} /></div>
                  <small>{t('settingsCompanyLocationText')}</small>
                </label>
              </div>
              <div className="settings-workspace-note"><ShieldCheck /><span><strong>{t('settingsAdminOnly')}</strong><small>{t('settingsAdminOnlyText')}</small></span></div>
              <SettingsActions saving={savingProfile} label={t('settingsSaveWorkspace')} t={t} />
            </form>
            {currency && <CurrencyRatesSection currency={currency} setCurrency={setCurrency} saving={savingCurrency} onSave={saveCurrency} t={t} />}
            </>
          )}

          {section === 'loyalty' && profile.role === 'company' && loyalty && (
            <div className="settings-section-form loyalty-settings-form">
              <SettingsHeader icon={Award} title={t('settingsLoyalty')} text={t('settingsLoyaltyDescription')} />
              <section className={`loyalty-program-switch ${loyalty.enabled?'active':''}`}>
                <span><Award /></span>
                <div><strong>{t('loyaltyProgram')}</strong><small>{t(loyalty.enabled?'loyaltyProgramActiveText':'loyaltyProgramInactiveText')}</small></div>
                <em>{t(loyalty.enabled?'active':'paused')}</em>
                <button type="button" role="switch" aria-checked={loyalty.enabled} className={loyalty.enabled?'on':''} onClick={() => setLoyalty(current => current ? { ...current, enabled:!current.enabled } : current)}><i /></button>
              </section>
              <div className="loyalty-admin-stats">
                <article><small>{t('loyaltyMembers')}</small><strong>{loyalty.stats.members.toLocaleString()}</strong></article>
                <article><small>{t('pointsIssued')}</small><strong>{loyalty.stats.pointsIssued.toLocaleString()}</strong></article>
                <article><small>{t('rewardedRentals')}</small><strong>{loyalty.stats.rewardedRentals.toLocaleString()}</strong></article>
              </div>
              <section className="loyalty-earning-rule">
                <header><CircleDollarSign /><div><strong>{t('pointsEarningRule')}</strong><small>{t('pointsEarningRuleText')}</small></div></header>
                <label>{t('pointsPerCurrencyUnit')}<div><input type="number" min="0.01" max="100" step="0.01" value={loyalty.pointsPerCurrency} onChange={event => setLoyalty(current => current ? { ...current, pointsPerCurrency:Number(event.target.value) } : current)} /><span>{t('points')}</span></div></label>
              </section>
              <section className="loyalty-level-editor">
                <header><div><strong>{t('loyaltyLevels')}</strong><small>{t('loyaltyLevelsText')}</small></div><em>{t('fourLevels')}</em></header>
                <div>{loyalty.levels.map(level => <article className={`loyalty-level-row loyalty-rank-${level.rank}`} key={level.id}>
                  <span>{level.rank + 1}</span>
                  <label>{t('levelName')}<input required minLength={2} maxLength={30} value={level.name} onChange={event => updateLoyaltyLevel(level.rank,{ name:event.target.value })} /></label>
                  <label>{t('pointsThreshold')}<div><input type="number" min={level.rank===0?0:1} max="10000000" step="1" disabled={level.rank===0} value={level.pointsThreshold} onChange={event => updateLoyaltyLevel(level.rank,{ pointsThreshold:Number(event.target.value) })} /><small>{t('points')}</small></div></label>
                  <label>{t('automaticDiscount')}<div><input type="number" min="0" max="50" step="0.1" value={level.discountPercentage} onChange={event => updateLoyaltyLevel(level.rank,{ discountPercentage:Number(event.target.value) })} /><small>%</small></div></label>
                </article>)}</div>
              </section>
              <div className="settings-workspace-note loyalty-policy-note"><ShieldCheck /><span><strong>{t('loyaltySnapshotProtection')}</strong><small>{t('loyaltySnapshotProtectionText')}</small></span></div>
              <SettingsActions button onClick={saveLoyalty} saving={savingLoyalty} label={t('saveLoyaltyProgram')} t={t} />
            </div>
          )}

          {section === 'notifications' && (
            <div className="settings-section-form">
              <SettingsHeader icon={BellRing} title={t('settingsNotifications')} text={t('settingsNotificationsDescription')} />
              <div className="settings-toggle-groups">
                <section>
                  <header><div><BellRing /><span><strong>{t('settingsDelivery')}</strong><small>{t('settingsDeliveryText')}</small></span></div></header>
                  <PreferenceToggle icon={BellRing} title={t('settingsInApp')} text={t('settingsInAppText')} checked={preferences.inAppNotifications} onChange={() => togglePreference('inAppNotifications')} />
                  <PreferenceToggle icon={Mail} title={t('settingsEmailNotifications')} text={t('settingsEmailNotificationsText')} checked={preferences.emailNotifications} onChange={() => togglePreference('emailNotifications')} />
                </section>
                <section>
                  <header><div><Sparkles /><span><strong>{t('settingsNotifyAbout')}</strong><small>{t('settingsNotifyAboutText')}</small></span></div></header>
                  <PreferenceToggle icon={MessageCircle} title={t('settingsMessages')} text={t('settingsMessagesText')} checked={preferences.messageNotifications} disabled={!preferences.inAppNotifications} onChange={() => togglePreference('messageNotifications')} />
                  <PreferenceToggle icon={BellRing} title={t('settingsRentalUpdates')} text={t('settingsRentalUpdatesText')} checked={preferences.rentalNotifications} disabled={!preferences.inAppNotifications} onChange={() => togglePreference('rentalNotifications')} />
                  <PreferenceToggle icon={CircleDollarSign} title={t('settingsBillingUpdates')} text={t('settingsBillingUpdatesText')} checked={preferences.billingNotifications} disabled={!preferences.inAppNotifications} onChange={() => togglePreference('billingNotifications')} />
                  <PreferenceToggle icon={Mail} title={t('settingsWeeklySummary')} text={t('settingsWeeklySummaryText')} checked={preferences.weeklySummary} onChange={() => togglePreference('weeklySummary')} />
                  <PreferenceToggle icon={Sparkles} title={t('settingsMarketing')} text={t('settingsMarketingText')} checked={preferences.marketingNotifications} onChange={() => togglePreference('marketingNotifications')} />
                </section>
              </div>
              <SettingsActions button onClick={saveNotificationPreferences} saving={savingPreferences} label={t('settingsSaveNotifications')} t={t} />
            </div>
          )}

          {section === 'appearance' && (
            <div className="settings-section-form">
              <SettingsHeader icon={Palette} title={t('settingsAppearance')} text={t('settingsAppearanceDescription')} />
              <section className="settings-choice-section">
                <header><Globe2 /><div><strong>{t('language')}</strong><small>{t('settingsLanguageText')}</small></div></header>
                <div className="settings-language-options">
                  <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => saveAppearance({ language: 'en' })}>
                    <span>EN</span><div><strong>English</strong><small>Left to right</small></div>{lang === 'en' && <Check />}
                  </button>
                  <button type="button" className={lang === 'ar' ? 'active' : ''} onClick={() => saveAppearance({ language: 'ar' })}>
                    <span>ع</span><div><strong>العربية</strong><small>من اليمين إلى اليسار</small></div>{lang === 'ar' && <Check />}
                  </button>
                </div>
              </section>
              <section className="settings-choice-section">
                <header><Palette /><div><strong>{t('theme')}</strong><small>{t('settingsThemeText')}</small></div></header>
                <div className="settings-theme-options">
                  <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => saveAppearance({ theme: 'light' })}>
                    <div className="theme-preview light-preview"><i /><i /><i /></div>
                    <span><Sun /><strong>{t('light')}</strong>{theme === 'light' && <Check />}</span>
                  </button>
                  <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => saveAppearance({ theme: 'dark' })}>
                    <div className="theme-preview dark-preview"><i /><i /><i /></div>
                    <span><Moon /><strong>{t('dark')}</strong>{theme === 'dark' && <Check />}</span>
                  </button>
                </div>
              </section>
              <div className="settings-auto-save"><Check />{savingAppearance ? t('saving') : t('settingsAppearanceAutoSave')}</div>
            </div>
          )}

          {section === 'security' && (
            <form onSubmit={changePassword} className="settings-section-form">
              <SettingsHeader icon={ShieldCheck} title={t('settingsSecurity')} text={t('settingsSecurityDescription')} />
              <div className="settings-security-summary">
                <span><ShieldCheck /></span>
                <div><strong>{t('settingsAccountSecure')}</strong><small>{t('settingsAccountSecureText')}</small></div>
                <em>{t('settingsProtectedStatus')}</em>
              </div>
              <div className="settings-password-form">
                <label>
                  {t('settingsCurrentPassword')}
                  <div><KeyRound /><input required type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={event => setPasswords(current => ({ ...current, currentPassword: event.target.value }))} /></div>
                </label>
                <label>
                  {t('settingsNewPassword')}
                  <div><LockKeyhole /><input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={passwords.newPassword} onChange={event => setPasswords(current => ({ ...current, newPassword: event.target.value }))} /></div>
                  <small>{t('settingsPasswordHint')}</small>
                </label>
                <label>
                  {t('settingsConfirmPassword')}
                  <div><LockKeyhole /><input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={passwords.confirmPassword} onChange={event => setPasswords(current => ({ ...current, confirmPassword: event.target.value }))} /></div>
                </label>
              </div>
              <SettingsActions saving={savingPassword} label={t('settingsUpdatePassword')} t={t} />
            </form>
          )}
        </main>
      </div>
    </>
  );
}

function SettingsHeader({ icon: Icon, title, text }: { icon: typeof UserRound; title: string; text: string }) {
  return <header className="settings-section-header"><span><Icon /></span><div><h3>{title}</h3><p>{text}</p></div></header>;
}

function PreferenceToggle({ icon: Icon, title, text, checked, disabled = false, onChange }: {
  icon: typeof BellRing;
  title: string;
  text: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <div className={`settings-preference ${disabled ? 'disabled' : ''}`}>
      <span><Icon /></span>
      <div><strong>{title}</strong><small>{text}</small></div>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={checked ? 'on' : ''} onClick={onChange}><i /></button>
    </div>
  );
}

function SettingsActions({ saving, label, t, button = false, onClick }: {
  saving: boolean;
  label: string;
  t: (key: string) => string;
  button?: boolean;
  onClick?: () => void;
}) {
  return (
    <footer className="settings-actions">
      <span><ShieldCheck />{t('settingsSecurelySaved')}</span>
      <button type={button ? 'button' : 'submit'} className="btn primary" disabled={saving} onClick={onClick}>
        <Save />{saving ? t('saving') : label}
      </button>
    </footer>
  );
}

function CurrencyRatesSection({ currency, setCurrency, saving, onSave, t }: {
  currency: CurrencySettings;
  setCurrency: (c: CurrencySettings) => void;
  saving: boolean;
  onSave: () => void;
  t: (key: string) => string;
}) {
  const toggleSupported = (code: string) => {
    if (code === currency.baseCurrency) return;
    const has = currency.supportedCurrencies.includes(code);
    const supportedCurrencies = has
      ? currency.supportedCurrencies.filter(c => c !== code)
      : [...currency.supportedCurrencies, code];
    const exchangeRates = { ...currency.exchangeRates };
    if (has) delete exchangeRates[code];
    setCurrency({ ...currency, supportedCurrencies, exchangeRates });
  };
  const setBase = (code: string) => {
    const supportedCurrencies = currency.supportedCurrencies.includes(code)
      ? currency.supportedCurrencies
      : [...currency.supportedCurrencies, code];
    setCurrency({ ...currency, baseCurrency: code, supportedCurrencies });
  };
  const setRate = (code: string, value: string) => {
    const n = Number(value);
    setCurrency({ ...currency, exchangeRates: { ...currency.exchangeRates, [code]: Number.isFinite(n) ? n : 0 } });
  };
  const nonBase = currency.supportedCurrencies.filter(c => c !== currency.baseCurrency);
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSave(); }} className="settings-section-form currency-rates-form">
      <SettingsHeader icon={CircleDollarSign} title={t('settingsCurrencies')} text={t('settingsCurrenciesDescription')} />
      <section className="currency-base-select">
        <label>
          {t('settingsBaseCurrency')}
          <div><CircleDollarSign />
            <select value={currency.baseCurrency} onChange={event => setBase(event.target.value)}>
              {SUPPORTED_CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </label>
      </section>
      <section className="currency-supported-grid">
        <header><div><strong>{t('settingsSupportedCurrencies')}</strong></div></header>
        <div className="currency-supported-chips">
          {SUPPORTED_CURRENCIES.map(code => (
            <label key={code} className={`currency-chip ${currency.supportedCurrencies.includes(code) ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={currency.supportedCurrencies.includes(code)}
                disabled={code === currency.baseCurrency}
                onChange={() => toggleSupported(code)}
              />
              <span>{code}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="currency-rates-grid">
        <header><div><strong>{t('settingsExchangeRates')}</strong><small>{t('settingsExchangeRateFor')}</small></div></header>
        <div className="currency-rate-inputs">
          {nonBase.length > 0 ? nonBase.map(code => (
            <label key={code}>
              {code}
              <div>
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={currency.exchangeRates[code] ?? 0}
                  onChange={event => setRate(code, event.target.value)}
                />
              </div>
            </label>
          )) : <small>{t('settingsCurrenciesAdminNote')}</small>}
        </div>
      </section>
      <div className="settings-workspace-note"><ShieldCheck /><span><strong>{t('settingsAdminOnly')}</strong><small>{t('settingsCurrenciesAdminNote')}</small></span></div>
      <SettingsActions button onClick={onSave} saving={saving} label={t('settingsSaveCurrencies')} t={t} />
    </form>
  );
}
