'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { HelpFeedback } from './feedback'
import { TicketLifecycle } from './ticket-lifecycle'
import { RestartTourButton } from '@/components/tour/restart-tour-button'
import {
  Search, BookOpen, Ticket, Bell, Clock, CircleHelp, Wrench, FileText, Mail,
  LogIn, KeyRound, UserCheck, LayoutDashboard, Menu, Settings,
  MessageSquare, Upload, ShieldOff, XCircle, Globe, WifiOff, MailX,
  AlertTriangle,
  Zap, Receipt, AlarmClockOff, TrendingDown, TrendingUp, PlusCircle, Wallet,
  ExternalLink, CheckCircle2, ClipboardCheck, UserPlus, Code2,
  RefreshCw, CheckSquare, ThumbsUp, ThumbsDown, Users, LifeBuoy,
} from 'lucide-react'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import type {
  StepCard, GuideItem, LifecycleStage, StatusGuide, PriorityGuide,
  NotificationEvent, SupportConcept, FAQItem, TroubleshootingItem,
  ContactInfo, ReleaseNote, SearchableItem,
} from './help-data'

// ── Icon Map ──────────────────────────────────────────────────────────────

const iconMap: Record<string, React.ReactNode> = {
  LogIn: <LogIn className='h-5 w-5' />,
  KeyRound: <KeyRound className='h-5 w-5' />,
  UserCheck: <UserCheck className='h-5 w-5' />,
  LayoutDashboard: <LayoutDashboard className='h-5 w-5' />,
  Menu: <Menu className='h-5 w-5' />,
  Bell: <Bell className='h-5 w-5' />,
  Settings: <Settings className='h-5 w-5' />,
  MessageSquare: <MessageSquare className='h-5 w-5' />,
  Upload: <Upload className='h-5 w-5' />,
  ShieldOff: <ShieldOff className='h-5 w-5' />,
  XCircle: <XCircle className='h-5 w-5' />,
  Globe: <Globe className='h-5 w-5' />,
  WifiOff: <WifiOff className='h-5 w-5' />,
  MailX: <MailX className='h-5 w-5' />,
  Clock: <Clock className='h-5 w-5' />,
  Zap: <Zap className='h-5 w-5' />,
  Receipt: <Receipt className='h-5 w-5' />,
  AlarmClockOff: <AlarmClockOff className='h-5 w-5' />,
  TrendingDown: <TrendingDown className='h-5 w-5' />,
  TrendingUp: <TrendingUp className='h-5 w-5' />,
  PlusCircle: <PlusCircle className='h-5 w-5' />,
  Wallet: <Wallet className='h-5 w-5' />,
}

// ── Section Key ─────────────────────────────────────────────────────────────

const SECTION_KEYS = {
  gettingStarted: 'gettingStarted',
  roleGuides: 'roleGuides',
  ticketLifecycle: 'ticketLifecycle',
  ticketStatus: 'ticketStatus',
  priority: 'priority',
  notifications: 'notifications',
  supportHours: 'supportHours',
  faq: 'faq',
  troubleshooting: 'troubleshooting',
  contact: 'contact',
  releaseNotes: 'releaseNotes',
} as const

type SectionKey = (typeof SECTION_KEYS)[keyof typeof SECTION_KEYS]

/** Map a `?section=` URL param to its section key (deep links from the Help Hub). */
const SECTION_PARAM_MAP: Record<string, SectionKey> = {
  gettingStarted: SECTION_KEYS.gettingStarted,
  roleGuides: SECTION_KEYS.roleGuides,
  ticketLifecycle: SECTION_KEYS.ticketLifecycle,
  ticketStatus: SECTION_KEYS.ticketStatus,
  priority: SECTION_KEYS.priority,
  notifications: SECTION_KEYS.notifications,
  supportHours: SECTION_KEYS.supportHours,
  faq: SECTION_KEYS.faq,
  troubleshooting: SECTION_KEYS.troubleshooting,
  contact: SECTION_KEYS.contact,
  releaseNotes: SECTION_KEYS.releaseNotes,
}

// ── Quick Access Cards ─────────────────────────────────────────────────────

interface QuickCard {
  icon: React.ReactNode
  label: string
  color: string
}

function QuickAccessCards({ searchQuery, activeSection, onSectionChange }: {
  searchQuery: string
  activeSection: SectionKey
  onSectionChange: (key: SectionKey) => void
}) {
  const cards: (QuickCard & { key: SectionKey })[] = [
    { icon: <BookOpen className='h-5 w-5' />, label: 'Getting Started', key: SECTION_KEYS.gettingStarted, color: 'bg-slate-950' },
    { icon: <Users className='h-5 w-5' />, label: 'User Guides', key: SECTION_KEYS.roleGuides, color: 'bg-slate-700' },
    { icon: <RefreshCw className='h-5 w-5' />, label: 'Ticket Lifecycle', key: SECTION_KEYS.ticketLifecycle, color: 'bg-slate-950' },
    { icon: <ClipboardCheck className='h-5 w-5' />, label: 'Ticket Status', key: SECTION_KEYS.ticketStatus, color: 'bg-slate-600' },
    { icon: <AlertTriangle className='h-5 w-5' />, label: 'Priority Guide', key: SECTION_KEYS.priority, color: 'bg-orange-600' },
    { icon: <Bell className='h-5 w-5' />, label: 'Notifications', key: SECTION_KEYS.notifications, color: 'bg-amber-500' },
    { icon: <Clock className='h-5 w-5' />, label: 'Support Hours', key: SECTION_KEYS.supportHours, color: 'bg-emerald-500' },
    { icon: <CircleHelp className='h-5 w-5' />, label: 'FAQs', key: SECTION_KEYS.faq, color: 'bg-purple-600' },
    { icon: <Wrench className='h-5 w-5' />, label: 'Troubleshooting', key: SECTION_KEYS.troubleshooting, color: 'bg-orange-500' },
    { icon: <FileText className='h-5 w-5' />, label: 'Release Notes', key: SECTION_KEYS.releaseNotes, color: 'bg-emerald-600' },
    { icon: <Mail className='h-5 w-5' />, label: 'Contact Support', key: SECTION_KEYS.contact, color: 'bg-purple-500' },
  ]

  const filtered = cards.filter(c =>
    c.label.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3'>
      {filtered.map((card) => {
        const isActive = activeSection === card.key
        return (
          <motion.button
            key={card.key}
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSectionChange(card.key)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl border p-4 shadow-sm transition-all duration-200 text-center',
              isActive
                ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20'
                : 'bg-white dark:bg-slate-900 border-border hover:shadow-md'
            )}
          >
            <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center text-white', card.color)}>
              {card.icon}
            </div>
            <span className={cn(
              'text-xs font-medium leading-tight',
              isActive ? 'text-primary' : 'text-foreground'
            )}>{card.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

// ── Section Wrapper ────────────────────────────────────────────────────────

function Section({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div data-tour="help-section">
      <div className='mb-6'>
        <h2 className='text-xl sm:text-2xl font-bold text-foreground'>{title}</h2>
        {description && (
          <p className='text-sm text-muted-foreground mt-1.5 max-w-2xl'>{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Getting Started Section ────────────────────────────────────────────────

function GettingStartedSection({ steps }: { steps: StepCard[] }) {
  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {steps.map((step, i) => (
        <motion.div
          key={step.title}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.06, duration: 0.3 }}
        >
          <Card className='p-4 border gap-3 shadow-sm hover:shadow-md transition-all duration-200'>
            <div className='flex items-start gap-3'>
              <div className='h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0'>
                {iconMap[step.icon] || <BookOpen className="h-4 w-4" />}
              </div>
              <div className='min-w-0'>
                <h3 className='text-sm font-semibold text-foreground'>{step.title}</h3>
                <p className='text-xs text-muted-foreground mt-1 leading-relaxed'>{step.description}</p>
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

// ── Status Guide Section ───────────────────────────────────────────────────

function StatusGuideSection({ statuses }: { statuses: StatusGuide[] }) {
  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
      {statuses.map((s) => (
        <Card key={s.status} className={cn('p-4 border shadow-sm', s.color)}>
          <div className='flex items-center justify-between mb-2'>
            <Badge variant='outline' className='text-xs font-semibold'>{s.status}</Badge>
          </div>
          <p className='text-xs text-muted-foreground mb-1'><span className='font-medium text-foreground'>Meaning:</span> {s.meaning}</p>
          <p className='text-xs text-muted-foreground mb-1'><span className='font-medium text-foreground'>Who:</span> {s.who}</p>
          <p className='text-xs text-muted-foreground'><span className='font-medium text-foreground'>Next:</span> {s.next}</p>
        </Card>
      ))}
    </div>
  )
}

// ── Priority Guide Section ─────────────────────────────────────────────────

function PriorityGuideSection({ priorities }: { priorities: PriorityGuide[] }) {
  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
      {priorities.map((p) => (
        <Card key={p.level} className={cn('p-4 border shadow-sm', p.color)}>
          <div className='flex items-center gap-2 mb-2'>
            {p.level === "Critical" && <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />}
            <h4 className='text-sm font-bold'>{p.level}</h4>
          </div>
          <p className='text-xs text-muted-foreground mb-2'>{p.description}</p>
          <p className='text-xs'><span className='font-medium'>Use for:</span> {p.usage}</p>
        </Card>
      ))}
    </div>
  )
}

// ── Notification Guide Section ─────────────────────────────────────────────

function NotificationGuideSection({ events }: { events: NotificationEvent[] }) {
  return (
    <div className='overflow-x-auto rounded-xl border border-border'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='bg-muted/50 border-b border-border'>
            <th className='text-left px-4 py-3 font-semibold text-foreground'>Event</th>
            <th className='text-left px-4 py-3 font-semibold text-foreground'>Description</th>
            <th className='text-left px-4 py-3 font-semibold text-foreground'>Channels</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={e.event} className={cn('border-b border-border last:border-0', i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-muted/20')}>
              <td className='px-4 py-3 font-medium text-foreground'>{e.event}</td>
              <td className='px-4 py-3 text-muted-foreground'>{e.description}</td>
              <td className='px-4 py-3'>
                <div className='flex flex-wrap gap-1.5'>
                  {e.channels.map((ch) => (
                    <Badge key={ch} variant='secondary' className='text-[11px]'>{ch}</Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SupportHoursSection({ concepts }: { concepts: SupportConcept[] }) {
  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
      {concepts.map((c) => (
        <Card key={c.title} className='p-4 border shadow-sm hover:shadow-md transition-all duration-200'>
          <div className='flex items-center gap-2 mb-2'>
            <div className='h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center'>
              {iconMap[c.icon] || <Clock className="h-4 w-4" />}
            </div>
            <h4 className='text-sm font-semibold text-foreground'>{c.title}</h4>
          </div>
          <p className='text-xs text-muted-foreground leading-relaxed'>{c.description}</p>
        </Card>
      ))}
    </div>
  )
}

function FAQSection({ items }: { items: FAQItem[] }) {
  return (
    <Accordion type='single' collapsible className='space-y-2'>
      {items.map((faq, i) => (
        <AccordionItem key={i} value={'faq-' + i} className='rounded-xl border border-border bg-white dark:bg-slate-900 px-4'>
          <AccordionTrigger className='text-sm font-medium text-foreground hover:no-underline py-3'>
            {faq.question}
          </AccordionTrigger>
          <AccordionContent className='text-xs text-muted-foreground leading-relaxed pb-4'>
            {faq.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function TroubleshootingSection({ items }: { items: TroubleshootingItem[] }) {
  return (
    <div className='space-y-3'>
      {items.map((item) => (
        <Card key={item.problem} className='p-4 border shadow-sm'>
          <div className='flex items-start gap-3'>
            <div className='h-9 w-9 rounded-lg bg-red-50 dark:bg-red-500/15 text-red-500 dark:text-red-400 flex items-center justify-center shrink-0'>
              {iconMap[item.icon] || <AlertTriangle className="h-4 w-4" />}
            </div>
            <div className='min-w-0 flex-1'>
              <h4 className='text-sm font-semibold text-foreground'>{item.problem}</h4>
              <div className='mt-2 space-y-1'>
                <p className='text-xs'><span className='font-medium text-foreground'>Possible Cause:</span> <span className='text-muted-foreground'>{item.cause}</span></p>
                <p className='text-xs'><span className='font-medium text-foreground'>Solution:</span> <span className='text-muted-foreground'>{item.solution}</span></p>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function ContactSection({ info }: { info: ContactInfo }) {
  return (
    <Card className='p-6 border shadow-sm bg-primary/5'>
      <div className='grid gap-6 sm:grid-cols-2'>
        <div className='space-y-4'>
          <div className='flex items-center gap-3'>
            <div className='h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center'>
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Support Email</p>
              <a href={'mailto:' + info.email} className='text-sm font-semibold text-primary hover:underline'>{info.email}</a>
            </div>
          </div>
          <div className='flex items-center gap-3'>
            <div className='h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center'>
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Business Hours</p>
              <p className='text-sm font-medium text-foreground'>{info.hours}</p>
            </div>
          </div>
        </div>
        <div className='space-y-4'>
          <div className='flex items-center gap-3'>
            <div className='h-10 w-10 rounded-xl bg-red-50 dark:bg-red-500/15 text-red-500 dark:text-red-400 flex items-center justify-center'>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Emergency Contact</p>
              <p className='text-sm font-medium text-foreground'>{info.emergency}</p>
            </div>
          </div>
          <div className='flex items-center gap-3'>
            <div className='h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center'>
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Response SLA</p>
              <p className='text-sm font-medium text-foreground'>{info.sla}</p>
            </div>
          </div>
        </div>
      </div>
      <div className='mt-4 pt-4 border-t border-border flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className='text-sm text-muted-foreground'>{info.portal}</span>
        </div>
        <Button variant='outline' size='sm' className='gap-1.5 text-xs' asChild>
          <a href={'mailto:' + info.email}>
            Send Email <ExternalLink className="h-3 w-3" />
          </a>
        </Button>
      </div>
    </Card>
  )
}

function ReleaseNotesSection({ notes }: { notes: ReleaseNote[] }) {
  return (
    <div className='space-y-6'>
      {notes.map((note, i) => (
        <motion.div
          key={note.version}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.08, duration: 0.3 }}
        >
          <Card className='p-5 border shadow-sm'>
            <div className='flex flex-wrap items-baseline gap-2 mb-3'>
              <Badge variant='default' className='text-xs'>{note.version}</Badge>
              <span className='text-xs text-muted-foreground'>{note.date}</span>
            </div>
            <div className='grid gap-4 sm:grid-cols-3'>
              {note.features.length > 0 && (
                <div>
                  <p className='text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5'>Features</p>
                  <ul className='space-y-1'>
                    {note.features.map((f) => (
                      <li key={f} className='text-xs text-muted-foreground flex items-start gap-1.5'>
                        <PlusCircle className="h-3 w-3 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {note.fixes.length > 0 && (
                <div>
                  <p className='text-xs font-semibold text-red-600 dark:text-red-400 mb-1.5'>Bug Fixes</p>
                  <ul className='space-y-1'>
                    {note.fixes.map((f) => (
                      <li key={f} className='text-xs text-muted-foreground flex items-start gap-1.5'>
                        <CheckCircle2 className="h-3 w-3 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {note.improvements.length > 0 && (
                <div>
                  <p className='text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1.5'>Improvements</p>
                  <ul className='space-y-1'>
                    {note.improvements.map((f) => (
                      <li key={f} className='text-xs text-muted-foreground flex items-start gap-1.5'>
                        <TrendingUp className="h-3 w-3 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

// ── Search Results Dropdown ─────────────────────────────────────────────────

function SearchResults({ results, query, onResultClick, onClear }: {
  results: SearchableItem[]
  query: string
  onResultClick: (id: string) => void
  onClear: () => void
}) {
  const highlightMatch = (text: string) => {
    if (!query.trim()) return text
    const escaped = query.replace(/[.*+?^${}()|[]\]/g, "\$&")
    const parts = text.split(new RegExp("(" + escaped + ")", "gi"))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 text-foreground rounded px-0.5">{part}</mark>
        : part
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className='absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-border bg-white dark:bg-slate-900 shadow-xl overflow-hidden max-h-80 overflow-y-auto'
    >
      <div className='p-2 border-b border-border bg-muted/30'>
        <p className='text-xs text-muted-foreground'>
          Found {results.length} result{results.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className='p-1'>
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => onResultClick(r.id)}
            className='w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent transition-colors'
          >
            <div className='flex items-center gap-2 mb-0.5'>
              <Badge variant='outline' className='text-[11px]'>{r.section}</Badge>
            </div>
            <p className='text-xs text-foreground leading-relaxed'>{highlightMatch(r.text)}</p>
          </button>
        ))}
      </div>
      <div className='p-2 border-t border-border'>
        <button
          onClick={onClear}
          className='text-xs text-muted-foreground hover:text-foreground transition-colors'
        >
          Clear search
        </button>
      </div>
    </motion.div>
  )
}



// ── Hero Section ────────────────────────────────────────────────────────────

function HeroSection({ searchQuery, onSearchChange, searchResults, onResultClick, onClearSearch }: {
  searchQuery: string
  onSearchChange: (q: string) => void
  searchResults: SearchableItem[] | null
  onResultClick: (id: string) => void
  onClearSearch: () => void
}) {
  return (            <div className='relative overflow-hidden rounded-2xl bg-primary/5 border border-border px-6 py-10 sm:px-10 sm:py-14 mb-8' data-tour="help-hero">
      <div aria-hidden="true" className='pointer-events-none absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2' />
      <div className='relative z-10 max-w-2xl mx-auto text-center'>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className='mb-4 flex justify-center'>
            <PageHeaderIcon variant='teal'>
              <LifeBuoy className='h-5 w-5' />
            </PageHeaderIcon>
          </div>
          <Badge variant='outline' className='mb-3 text-xs'>Help &amp; Support</Badge>
          <h1 className='text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground'>
            Help &amp; Support Center
          </h1>
          <p className='mt-3 text-sm sm:text-base text-muted-foreground max-w-lg mx-auto'>
            Everything you need to learn and use Support Hero efficiently.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
            <RestartTourButton size="sm" className="rounded-full h-9 px-4" />
          </div>
        </motion.div>
        <div className='mt-8 relative max-w-md mx-auto'>
          <div className='relative'>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search help articles, guides, FAQs..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className='pl-9 pr-4 h-11 rounded-xl bg-white dark:bg-slate-900 border-border shadow-sm text-sm'
              aria-label="Search help content"
            />
          </div>
          {searchQuery && searchResults && searchResults.length > 0 && (
            <SearchResults
              results={searchResults}
              query={searchQuery}
              onResultClick={onResultClick}
              onClear={onClearSearch}
            />
          )}
          {searchQuery && searchResults && searchResults.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className='absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-border bg-white dark:bg-slate-900 shadow-xl p-4 text-center'
            >
              <p className='text-sm text-muted-foreground'>No results found for &quot;{searchQuery}&quot;</p>
              <button onClick={onClearSearch} className="text-xs text-primary hover:underline mt-1">
                Clear search
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}



// ── Main HelpContent Component ──────────────────────────────────────────────

export interface HelpContentProps {
  gettingStartedSteps: StepCard[]
  clientGuide: GuideItem[]
  managerGuide: GuideItem[]
  resourceGuide: GuideItem[]
  adminGuide: GuideItem[]
  ticketLifecycleStages: LifecycleStage[]
  statusGuides: StatusGuide[]
  priorityGuides: PriorityGuide[]
  notificationEvents: NotificationEvent[]
  supportHoursConcepts: SupportConcept[]
  faqItems: FAQItem[]
  troubleshootingItems: TroubleshootingItem[]
  contactInfo: ContactInfo
  releaseNotes: ReleaseNote[]
  searchableItems: SearchableItem[]
  userRole?: string
  /**
   * Deep-link target from the URL (?section=...) — opens that section on mount
   * and whenever the value changes (e.g. navigating from the Help Hub while
   * already on the Help Center page).
   */
  initialSection?: string
}

// ── Role-Based Guide Configuration ──────────────────────────────────────────
// Add new roles here for future scalability

// ── Role-Guide data mapping ────────────────────────────────────────────────
// To add a new role: add an entry here, create the GuideItem[] data in help-data.ts,
// pass it as a prop, and add a case in mapRoleToGuide().

const ROLE_GUIDE_META: Record<string, { title: string; description: string; color: string; bgColor: string }> = {
  client:          { title: 'My User Guide',           description: 'Step-by-step instructions to manage your tickets and account.',                 color: 'text-blue-600 dark:text-blue-400',      bgColor: 'bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30' },
  project_manager: { title: 'Manager User Guide',       description: 'Tools and workflows to manage projects, tickets, and your team.',              color: 'text-indigo-600 dark:text-indigo-400',    bgColor: 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/30' },
  developer:       { title: 'Resource User Guide',      description: 'Instructions for working on assigned tickets and tracking your time.',          color: 'text-amber-600 dark:text-amber-400',    bgColor: 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30' },
  admin:           { title: 'Administrator User Guide', description: 'System administration, user management, and configuration.',                     color: 'text-emerald-600 dark:text-emerald-400',  bgColor: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30' },
}

function getRoleGuideData(role: string | undefined, props: HelpContentProps): GuideItem[] {
  switch (role) {
    case 'client':          return props.clientGuide
    case 'project_manager': return props.managerGuide
    case 'developer':       return props.resourceGuide
    case 'admin':           return props.adminGuide
    default:                return props.clientGuide
  }
}

export function HelpContent(props: HelpContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeSection, setActiveSection] = useState<SectionKey>(SECTION_KEYS.gettingStarted)
  const searchRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Deep-link support: open the section named by ?section= (and scroll to the
  // content area) on mount or whenever the param changes.
  useEffect(() => {
    if (!props.initialSection) return
    const target = SECTION_PARAM_MAP[props.initialSection]
    if (!target) return
    setActiveSection(target)
    const t = window.setTimeout(() => {
      contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [props.initialSection])
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    return props.searchableItems.filter(
      (item) =>
        item.text.toLowerCase().includes(q) ||
        item.keywords.includes(q) ||
        item.section.toLowerCase().includes(q)
    )
  }, [searchQuery, props.searchableItems])

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q)
  }, [])

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  const handleSectionChange = useCallback((key: SectionKey) => {
    setActiveSection(key)
    // Scroll to top of content after section change
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 50)
  }, [])

  const handleResultClick = useCallback((resultId: string) => {
    setSearchQuery('')
    // Map search result ID prefix to section key
    const prefixToSection: Record<string, SectionKey> = {
      'gs-': SECTION_KEYS.gettingStarted,
      'cg-': SECTION_KEYS.roleGuides,
      'mg-': SECTION_KEYS.roleGuides,
      'rg-': SECTION_KEYS.roleGuides,
      'ag-': SECTION_KEYS.roleGuides,
      'faq-': SECTION_KEYS.faq,
      'tr-': SECTION_KEYS.troubleshooting,
      'rn-': SECTION_KEYS.releaseNotes,
    }
    const prefix = Object.keys(prefixToSection).find(p => resultId.startsWith(p))
    if (prefix) {
      handleSectionChange(prefixToSection[prefix])
    }
  }, [handleSectionChange])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const renderSection = () => {
    switch (activeSection) {
      case SECTION_KEYS.gettingStarted:
        return (
          <Section title="Getting Started" description="Everything you need to begin using Support Hero.">
            <GettingStartedSection steps={props.gettingStartedSteps} />
          </Section>
        )
      case SECTION_KEYS.roleGuides: {
        const role = props.userRole || 'client'
        const meta = ROLE_GUIDE_META[role] || ROLE_GUIDE_META.client
        const guideData = getRoleGuideData(role, props)
        return (
          <Section title={meta.title} description={meta.description}>
            <div className='grid gap-3 sm:grid-cols-2'>
              {guideData.map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.25 }}
                >
                  <Card className={cn('p-4 border gap-2 shadow-sm', meta.bgColor)}>
                    <h4 className='text-sm font-semibold text-foreground'>{item.title}</h4>
                    <p className='text-xs text-muted-foreground leading-relaxed'>{item.description}</p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </Section>
        )
      }
      case SECTION_KEYS.ticketLifecycle:
        return (
          <Section title="Ticket Lifecycle" description="Follow the journey of a ticket from creation to closure.">
            <TicketLifecycle stages={props.ticketLifecycleStages} />
          </Section>
        )
      case SECTION_KEYS.ticketStatus:
        return (
          <Section title="Ticket Status Guide" description="Understand what each status means and what happens next.">
            <StatusGuideSection statuses={props.statusGuides} />
          </Section>
        )
      case SECTION_KEYS.priority:
        return (
          <Section title="Priority Guide" description="Learn when to use each priority level.">
            <PriorityGuideSection priorities={props.priorityGuides} />
          </Section>
        )
      case SECTION_KEYS.notifications:
        return (
          <Section title="Notification Guide" description="Stay informed with real-time updates across channels.">
            <NotificationGuideSection events={props.notificationEvents} />
          </Section>
        )
      case SECTION_KEYS.supportHours:
        return (
          <Section title="Support Hours Guide" description="Understand how support hours work.">
            <SupportHoursSection concepts={props.supportHoursConcepts} />
          </Section>
        )
      case SECTION_KEYS.faq:
        return (
          <Section title="Frequently Asked Questions" description="Quick answers to common questions.">
            <FAQSection items={props.faqItems} />
          </Section>
        )
      case SECTION_KEYS.troubleshooting:
        return (
          <Section title="Troubleshooting" description="Solutions to common issues.">
            <TroubleshootingSection items={props.troubleshootingItems} />
          </Section>
        )
      case SECTION_KEYS.contact:
        return (
          <Section title="Contact Support" description="Get in touch with our support team.">
            <ContactSection info={props.contactInfo} />
          </Section>
        )
      case SECTION_KEYS.releaseNotes:
        return (
          <Section title="Release Notes" description="Stay up to date with the latest changes.">
            <ReleaseNotesSection notes={props.releaseNotes} />
          </Section>
        )
      default:
        return null
    }
  }

  return (
    <div className='-mx-4 sm:-mx-6 lg:-mx-10 pt-0 pb-6 sm:pb-10'>
      {/* Hero spans full width */}
      <div ref={searchRef}>
        <HeroSection
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          searchResults={searchResults}
          onResultClick={handleResultClick}
          onClearSearch={handleClearSearch}
        />
      </div>
      {/* Content below hero */}
      <div className='px-6 lg:px-8 space-y-10' ref={contentRef}>
        <QuickAccessCards
          searchQuery={searchQuery}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
        />
        <div className='border-t border-border/40' />
        {/* Active section with transition */}
        <div className="min-h-[200px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {renderSection()}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="pt-2 mb-6">
          <HelpFeedback />
        </div>
      </div>
    </div>
  )
}