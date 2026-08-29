'use client';

import {
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Headphones,
  LifeBuoy,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '@/components/dashboard-shell';
import { Avatar, Empty, Modal, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/client-api';
import { useI18n } from '@/lib/i18n';

type SupportStatus = 'open' | 'waiting' | 'resolved';
type SupportCategory = 'booking' | 'billing' | 'vehicle' | 'account' | 'technical' | 'other';

type SupportTicket = {
  id: number;
  userId: number;
  companyId: number | null;
  rentalId: number | null;
  requesterName: string;
  companyName: string | null;
  subject: string;
  category: SupportCategory;
  priority: 'normal' | 'urgent';
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
};

type SupportMessage = {
  id: number;
  senderType: 'customer' | 'company' | 'support';
  body: string;
  automated: boolean;
  createdAt: string;
};

type RentalOption = {
  id: number;
  make: string;
  model: string;
  status: string;
};

const categoryKeys: Record<SupportCategory, string> = {
  booking: 'supportCategoryBooking',
  billing: 'supportCategoryBilling',
  vehicle: 'supportCategoryVehicle',
  account: 'supportCategoryAccount',
  technical: 'supportCategoryTechnical',
  other: 'supportCategoryOther',
};

const statusKeys: Record<SupportStatus, string> = {
  open: 'supportStatusOpen',
  waiting: 'supportStatusWaiting',
  resolved: 'supportStatusResolved',
};

const blankForm = {
  subject: '',
  category: 'booking' as SupportCategory,
  priority: 'normal' as 'normal' | 'urgent',
  rentalId: '',
  message: '',
};

export default function SupportPage() {
  const { lang, t } = useI18n();
  const user = useCurrentUser();
  const searchParams = useSearchParams();
  const toast = useToast();
  const messageEnd = useRef<HTMLDivElement>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [rentals, setRentals] = useState<RentalOption[]>([]);
  const [faqQuery, setFaqQuery] = useState('');
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const requestedConversation = searchParams.get('conversation');

  const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(value)) : '';
  const timeLabel = (value?: string) => value ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-US', {
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(value)) : '';

  const refreshTickets = async (selectId?: number) => {
    const data = await api<{ tickets: SupportTicket[] }>('/support');
    setTickets(data.tickets);
    setActiveId(current => {
      if (selectId && data.tickets.some(ticket => ticket.id === selectId)) return selectId;
      if (current && data.tickets.some(ticket => ticket.id === current)) return current;
      return data.tickets[0]?.id ?? null;
    });
    return data.tickets;
  };

  useEffect(() => {
    const requestedId = Number(requestedConversation);
    const hasRequestedConversation = Number.isInteger(requestedId) && requestedId > 0;
    if (hasRequestedConversation) setMobileThreadOpen(true);
    refreshTickets(hasRequestedConversation ? requestedId : undefined)
      .catch(error => toast(error.message, true))
      .finally(() => setLoading(false));
  }, [requestedConversation]);

  useEffect(() => {
    if (!newOpen || rentals.length) return;
    api<{ rentals: RentalOption[] }>('/rentals')
      .then(data => setRentals(data.rentals))
      .catch(error => toast(error.message, true));
  }, [newOpen, rentals.length, toast]);

  useEffect(() => {
    if (!activeId) {
      setActiveTicket(null);
      setMessages([]);
      return;
    }
    let alive = true;
    const loadThread = async (quiet = false) => {
      if (!quiet) setThreadLoading(true);
      try {
        const data = await api<{ ticket: SupportTicket; messages: SupportMessage[] }>(`/support/${activeId}`);
        if (!alive) return;
        setActiveTicket(data.ticket);
        setMessages(data.messages);
        setTickets(current => current.map(ticket => ticket.id === activeId ? { ...ticket, ...data.ticket, unreadCount: 0 } : ticket));
        if (!quiet) window.dispatchEvent(new Event('fleetflow:notifications:refresh'));
      } catch (error: any) {
        if (alive && !quiet) toast(error.message, true);
      } finally {
        if (alive && !quiet) setThreadLoading(false);
      }
    };
    loadThread();
    const timer = window.setInterval(() => loadThread(true), 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [activeId, toast]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const createTicket = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const data = await api<{ ticket: SupportTicket; messages: SupportMessage[] }>('/support', {
        method: 'POST',
        body: JSON.stringify({ ...form, rentalId: form.rentalId || null, lang }),
      });
      setForm(blankForm);
      setNewOpen(false);
      setActiveTicket(data.ticket);
      setMessages(data.messages);
      setMobileThreadOpen(true);
      await refreshTickets(data.ticket.id);
      toast(t('supportConversationCreated'));
    } catch (error: any) {
      toast(error.message, true);
    } finally {
      setCreating(false);
    }
  };

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || !activeId || sending) return;
    setSending(true);
    try {
      const data = await api<{ message: SupportMessage; ticket: SupportTicket }>(`/support/${activeId}`, {
        method: 'POST',
        body: JSON.stringify({ message, lang }),
      });
      setMessages(current => [...current, data.message]);
      setActiveTicket(data.ticket);
      setDraft('');
      await refreshTickets(activeId);
    } catch (error: any) {
      toast(error.message, true);
    } finally {
      setSending(false);
    }
  };

  const handleComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sendMessage();
    }
  };

  const changeStatus = async (status: 'open' | 'resolved') => {
    if (!activeId) return;
    try {
      const data = await api<{ ticket: SupportTicket }>(`/support/${activeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setActiveTicket(data.ticket);
      await refreshTickets(activeId);
      toast(t(status === 'resolved' ? 'supportMarkedResolved' : 'supportReopened'));
    } catch (error: any) {
      toast(error.message, true);
    }
  };

  const faqs = [1, 2, 3, 4, 5, 6].map(index => ({
    question: t(`supportFaq${index}Question`),
    answer: t(`supportFaq${index}Answer`),
  }));
  const shownFaqs = useMemo(() => {
    const query = faqQuery.trim().toLowerCase();
    return faqs.filter(item => `${item.question} ${item.answer}`.toLowerCase().includes(query));
  }, [faqQuery, lang]);
  const openCount = tickets.filter(ticket => ticket.status !== 'resolved').length;
  const messageIsOwn = (message: SupportMessage) => {
    if (!activeTicket || !user) return false;
    if (message.senderType === 'customer') return activeTicket.userId === user.id;
    if (message.senderType === 'company') return user.role === 'company' && activeTicket.companyId === user.companyId;
    return false;
  };
  const messageSender = (message: SupportMessage) => {
    if (messageIsOwn(message)) return t('supportYou');
    if (message.senderType === 'company') return activeTicket?.companyName || t('supportRentalCompany');
    if (message.senderType === 'customer') return activeTicket?.requesterName || t('renter');
    return t('supportTeam');
  };

  return (
    <>
      <div className="page-heading support-page-heading">
        <div>
          <span className="eyebrow"><LifeBuoy />{t('supportCenter')}</span>
          <h2>{t('supportTitle')}</h2>
          <p>{t('supportText')}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setNewOpen(true)}>
          <Plus />{t('supportNewConversation')}
        </button>
      </div>

      <section className="support-hero">
        <div className="support-hero-copy">
          <span><Sparkles />{t('supportHereToHelp')}</span>
          <h3>{t('supportHowCanWeHelp')}</h3>
          <p>{t('supportHeroText')}</p>
          <label>
            <Search />
            <input value={faqQuery} onChange={event => setFaqQuery(event.target.value)} placeholder={t('supportSearchHelp')} />
          </label>
        </div>
        <div className="support-contact-cards">
          <article>
            <span><MessageCircle /></span>
            <div><strong>{t('supportInApp')}</strong><small>{t('supportInAppText')}</small></div>
            <em>{openCount} {t('supportActive')}</em>
          </article>
          <a href="mailto:support@fleetflow.app">
            <span><Mail /></span>
            <div><strong>support@fleetflow.app</strong><small>{t('supportEmailText')}</small></div>
            <ChevronRight />
          </a>
          <a href="tel:+14155550140">
            <span><Phone /></span>
            <div><strong>+1 (415) 555-0140</strong><small>{t('supportUrgentLine')}</small></div>
            <ChevronRight />
          </a>
        </div>
      </section>

      <section className={`support-workspace panel ${mobileThreadOpen ? 'mobile-thread-open' : ''}`}>
        <aside className="support-inbox">
          <header>
            <div><h3>{t('supportMessages')}</h3><span>{tickets.length}</span></div>
            <button type="button" onClick={() => setNewOpen(true)} aria-label={t('supportNewConversation')}><Plus /></button>
          </header>
          {loading ? (
            <div className="support-ticket-loading"><Skeleton rows={5} /></div>
          ) : tickets.length ? (
            <div className="support-ticket-list">
              {tickets.map(ticket => (
                <button
                  type="button"
                  key={ticket.id}
                  className={activeId === ticket.id ? 'active' : ''}
                  onClick={() => { setActiveId(ticket.id); setMobileThreadOpen(true); }}
                >
                  <span className="support-ticket-row">
                    <span className={`support-category-icon category-${ticket.category}`}><MessageCircle /></span>
                    <span className="support-ticket-copy">
                      <strong>{ticket.subject}</strong>
                      <small>
                        SUP-{String(ticket.id).padStart(4, '0')} · {t(categoryKeys[ticket.category])}
                        {user?.role === 'company' && ticket.companyId ? ` · ${ticket.requesterName}` : ticket.companyName ? ` · ${ticket.companyName}` : ''}
                      </small>
                    </span>
                    <time>{dateLabel(ticket.lastMessageAt || ticket.updatedAt)}</time>
                  </span>
                  <span className="support-ticket-preview">{ticket.lastMessage || t('supportNoMessages')}</span>
                  <span className="support-ticket-footer">
                    <span className={`support-status support-status-${ticket.status}`}>{t(statusKeys[ticket.status])}</span>
                    {ticket.priority === 'urgent' && <em>{t('supportUrgent')}</em>}
                    {!!ticket.unreadCount && <b>{ticket.unreadCount}</b>}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon={MessageCircle} title={t('supportNoConversations')} text={t('supportNoConversationsText')} action={() => setNewOpen(true)} label={t('supportStartConversation')} />
          )}
        </aside>

        <div className="support-conversation">
          {!activeId ? (
            <div className="support-thread-empty">
              <span><Headphones /></span>
              <h3>{t('supportSelectConversation')}</h3>
              <p>{t('supportSelectConversationText')}</p>
              <button type="button" className="btn primary" onClick={() => setNewOpen(true)}><Plus />{t('supportNewConversation')}</button>
            </div>
          ) : threadLoading || !activeTicket ? (
            <div className="support-thread-loading"><Skeleton rows={6} /></div>
          ) : (
            <>
              <header className="support-thread-header">
                <div>
                  <button type="button" className="support-mobile-back" onClick={() => setMobileThreadOpen(false)} aria-label={t('supportMessages')}><ChevronRight />{t('supportMessages')}</button>
                  <span>
                    SUP-{String(activeTicket.id).padStart(4, '0')} · {t(categoryKeys[activeTicket.category])}
                    {user?.role === 'company' && activeTicket.companyId ? ` · ${activeTicket.requesterName}` : ''}
                  </span>
                  <h3>{activeTicket.subject}</h3>
                  <small><Clock3 />{t('supportUpdated')} {dateLabel(activeTicket.updatedAt)} {timeLabel(activeTicket.updatedAt)}</small>
                </div>
                <div>
                  <span className={`support-status support-status-${activeTicket.status}`}>{t(statusKeys[activeTicket.status])}</span>
                  {activeTicket.status !== 'resolved' && (
                    <button type="button" onClick={() => changeStatus('resolved')}><CheckCircle2 />{t('supportResolve')}</button>
                  )}
                </div>
              </header>

              {activeTicket.rentalId && (
                <Link href="/dashboard/rentals" className="support-linked-rental">
                  <CalendarDays />
                  <span><small>{t('supportLinkedRental')}</small><strong dir="ltr">#FF-{String(activeTicket.rentalId).padStart(4, '0')}</strong></span>
                  <ChevronRight />
                </Link>
              )}

              <div className="support-message-list" aria-live="polite">
                <div className="support-thread-start"><span>{dateLabel(activeTicket.createdAt)}</span></div>
                {messages.map(message => {
                  const ownMessage = messageIsOwn(message);
                  return (
                    <article className={`support-message ${ownMessage ? 'customer' : 'support'}`} key={message.id}>
                      <div className="support-message-avatar">
                        {message.senderType === 'support' ? (
                          <span><Headphones /></span>
                        ) : message.senderType === 'company' && !ownMessage ? (
                          <span><Building2 /></span>
                        ) : (
                          <Avatar
                            name={ownMessage ? user?.name : activeTicket.requesterName}
                            initials={ownMessage ? user?.avatar : undefined}
                            size="sm"
                          />
                        )}
                      </div>
                      <div>
                        <header>
                          <strong>{messageSender(message)}</strong>
                          {message.automated && <em>{t('supportAutomated')}</em>}
                          <time>{timeLabel(message.createdAt)}</time>
                        </header>
                        <p>{message.body}</p>
                      </div>
                    </article>
                  );
                })}
                <div ref={messageEnd} />
              </div>

              {activeTicket.status === 'resolved' ? (
                <div className="support-conversation-closed">
                  <CheckCircle2 />
                  <div><strong>{t('supportConversationResolved')}</strong><span>{t('supportConversationResolvedText')}</span></div>
                  <button type="button" className="btn secondary" onClick={() => changeStatus('open')}>{t('supportReopen')}</button>
                </div>
              ) : (
                <div className="support-composer">
                  <textarea
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    onKeyDown={handleComposerKey}
                    placeholder={t('supportReplyPlaceholder')}
                    maxLength={2_000}
                  />
                  <footer>
                    <span><ShieldCheck />{t('supportPrivateConversation')}</span>
                    <small>{draft.length}/2000</small>
                    <button type="button" onClick={sendMessage} disabled={!draft.trim() || sending} aria-label={t('supportSend')}>
                      <Send />{sending ? t('sending') : t('supportSend')}
                    </button>
                  </footer>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="support-faq-section">
        <header>
          <div><span><BookOpen /></span><div><h3>{t('supportPopularQuestions')}</h3><p>{t('supportPopularQuestionsText')}</p></div></div>
          <small>{shownFaqs.length} {t('supportArticles')}</small>
        </header>
        <div className="support-faq-grid">
          {shownFaqs.map((item, index) => (
            <details key={`${item.question}-${index}`}>
              <summary><span>{String(index + 1).padStart(2, '0')}</span>{item.question}<ChevronRight /></summary>
              <p>{item.answer}</p>
            </details>
          ))}
          {!shownFaqs.length && <div className="support-faq-empty"><CircleHelp /><strong>{t('supportNoArticles')}</strong><span>{t('supportNoArticlesText')}</span></div>}
        </div>
      </section>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title={t('supportNewConversation')} subtitle={t('supportNewConversationText')} wide>
        <form className="support-ticket-form" onSubmit={createTicket}>
          <div className="support-form-intro">
            <span><Headphones /></span>
            <div><strong>{t('supportMessageSpecialist')}</strong><p>{t('supportMessageSpecialistText')}</p></div>
          </div>
          <div className="support-form-grid">
            <label className="span-2">
              {t('supportSubject')}
              <input required minLength={4} maxLength={120} value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} placeholder={t('supportSubjectPlaceholder')} />
            </label>
            <label>
              {t('supportCategory')}
              <select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value as SupportCategory }))}>
                {(Object.keys(categoryKeys) as SupportCategory[]).map(category => <option value={category} key={category}>{t(categoryKeys[category])}</option>)}
              </select>
            </label>
            <label>
              {t('supportPriority')}
              <select value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value as 'normal' | 'urgent' }))}>
                <option value="normal">{t('supportNormal')}</option>
                <option value="urgent">{t('supportUrgent')}</option>
              </select>
            </label>
            <label className="span-2">
              {user?.role === 'renter' ? t('supportSendToCompany') : t('supportRelatedRental')}
              <select value={form.rentalId} onChange={event => setForm(current => ({ ...current, rentalId: event.target.value }))}>
                <option value="">{t('supportNoRental')}</option>
                {rentals.map(rental => <option value={rental.id} key={rental.id}>#FF-{String(rental.id).padStart(4, '0')} · {rental.make} {rental.model} · {t(rental.status)}</option>)}
              </select>
              <small className="support-route-hint">
                {t(user?.role === 'renter' ? 'supportCompanyRoutingHint' : 'supportRentalContextHint')}
              </small>
            </label>
            <label className="span-2">
              {t('supportMessage')}
              <textarea required minLength={2} maxLength={2_000} value={form.message} onChange={event => setForm(current => ({ ...current, message: event.target.value }))} placeholder={t('supportMessagePlaceholder')} />
              <small>{form.message.length}/2000</small>
            </label>
          </div>
          <div className="support-form-actions">
            <span><ShieldCheck />{t('supportPrivacyNote')}</span>
            <div>
              <button type="button" className="btn secondary" onClick={() => setNewOpen(false)}>{t('cancel')}</button>
              <button type="submit" className="btn primary" disabled={creating}><Send />{creating ? t('sending') : t('supportSendMessage')}</button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
