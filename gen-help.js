const fs = require('fs');

// Generate help-content.tsx - a complete Help & Support page component
const content = `'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { HelpFeedback } from './feedback'
import { RoleGuides } from './role-guides'
import { TicketLifecycle } from './ticket-lifecycle'
import { Search, BookOpen, Ticket, Bell, Clock, HelpCircle, Wrench, FileText, Mail, LogIn, KeyRound, UserCheck, LayoutDashboard, Menu, Settings, MessageSquare, Upload, ShieldOff, XCircle, Globe, WifiOff, MailX, ArrowDown, Minus, ArrowUp, AlertTriangle, Zap, Receipt, ClockOff, TrendingDown, TrendingUp, PlusCircle, Wallet, ExternalLink } from 'lucide-react'
import type { StepCard, LifecycleStage, StatusGuide, PriorityGuide, NotificationEvent, FaqItem, TroubleshootingItem, SupportHoursConcept, ContactInfo, ReleaseNote, GuideItem } from './help-data'

const SECTIONS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'role-guides', label: 'Role Guides' },
  { id: 'ticket-lifecycle', label: 'Ticket Lifecycle' },
  { id: 'status-guide', label: 'Status Guide' },
  { id: 'priority-guide', label: 'Priority Guide' },
  { id: 'notification-guide', label: 'Notifications' },
  { id: 'support-hours', label: 'Support Hours' },
  { id: 'faq', label: 'FAQ' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'contact-support', label: 'Contact' },
  { id: 'release-notes', label: 'Release Notes' },
]

interface HelpContentProps {
  gettingStartedSteps: StepCard[]
  clientGuide: GuideItem[]
  managerGuide: GuideItem[]
  resourceGuide: GuideItem[]
  adminGuide: GuideItem[]
  ticketLifecycleStages: LifecycleStage[]
  statusGuides: StatusGuide[]
  priorityGuides: PriorityGuide[]
  notificationEvents: NotificationEvent[]
  supportHoursConcepts: SupportHoursConcept[]
  faqItems: FaqItem[]
  troubleshootingItems: TroubleshootingItem[]
  contactInfo: ContactInfo
  releaseNotes: ReleaseNote[]
}

export function HelpContent(props: HelpContentProps) {
  const [searchQ, setSearchQ] = useState('')
  const [activeSec, setActiveSec] = useState('getting-started')

  useEffect(() => {
    const obs = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) setActiveSec(e.target.id) }) }, { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 })
    SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [])

  const scrollTo = useCallback((id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [])

  const searchResults = useMemo(() => {
    if (!searchQ.trim()) return null
    const q = searchQ.toLowerCase()
    const r: { section: string; text: string; id: string }[] = []
    const push = (section: string, text: string, id: string) => { r.push({ section, text, id }) }
    props.gettingStartedSteps.forEach(s => { if (s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) push('Getting Started', s.title, 'getting-started') })
    const allGuides = [...props.clientGuide, ...props.managerGuide, ...props.resourceGuide, ...props.adminGuide]
    allGuides.forEach(s => { if (s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) push('Role Guides', s.title, 'role-guides') })
    props.ticketLifecycleStages.forEach(s => { if (s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) push('Lifecycle', s.title, 'ticket-lifecycle') })
    props.faqItems.forEach(s => { if (s.question.toLowerCase().includes(q) || s.answer.toLowerCase().includes(q)) push('FAQ', s.question, 'faq') })
    props.troubleshootingItems.forEach(s => { if (s.problem.toLowerCase().includes(q) || s.solution.toLowerCase().includes(q)) push('Troubleshooting', s.problem, 'troubleshooting') })
    return r.slice(0, 8)
  }, [searchQ, props])

  const hl = (text: string) => {
    if (!searchQ.trim()) return text
    const esc = searchQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return text.split(new RegExp('(' + esc + ')', 'gi')).map((p, i) => p.toLowerCase() === searchQ.toLowerCase() ? <mark key={i} className='bg-amber-200/70 text-foreground rounded-sm px-0.5'>{p}</mark> : p)
  }

  const H = ({ id, title, sub }: { id: string; title: string; sub?: string }) => (
    <div id={id} className='scroll-mt-24 mb-6'><h2 className='text-xl font-bold text-foreground'>{title}</h2>{sub && <p className='text-sm text-muted-foreground mt-1'>{sub}</p>}</div>
  )

  const StepIcon = ({ icon }: { icon: string }) => {
    const m: Record<string, React.ReactNode> = { LogIn: <LogIn className='h-4 w-4' />, KeyRound: <KeyRound className='h-4 w-4' />, UserCheck: <UserCheck className='h-4 w-4' />, LayoutDashboard: <LayoutDashboard className='h-4 w-4' />, Menu: <Menu className='h-4 w-4' />, Bell: <Bell className='h-4 w-4' />, Settings: <Settings className='h-4 w-4' /> }
    return m[icon] || <HelpCircle className='h-4 w-4' />
  }
  const StatusIcon = ({ icon }: { icon: string }) => {
    const m: Record<string, React.ReactNode> = { FilePlus: <FileText className='h-4 w-4' />, UserCheck: <UserCheck className='h-4 w-4' />, PlayCircle: <Ticket className='h-4 w-4' />, Clock: <Clock className='h-4 w-4' />, RefreshCw: <RefreshCw className='h-4 w-4' />, CheckCircle2: <Ticket className='h-4 w-4' />, CheckSquare: <Ticket className='h-4 w-4' />, RotateCcw: <RefreshCw className='h-4 w-4' />, FileText: <FileText className='h-4 w-4' />, TrendingUp: <TrendingUp className='h-4 w-4' /> }
    return m[icon] || <HelpCircle className='h-4 w-4' />
  }
  const PriorityIcon = ({ icon }: { icon: string }) => {
    const m: Record<string, React.ReactNode> = { ArrowDown: <ArrowDown className='h-5 w-5' />, Minus: <Minus className='h-5 w-5' />, ArrowUp: <ArrowUp className='h-5 w-5' />, AlertTriangle: <AlertTriangle className='h-5 w-5' /> }
    return m[icon] || <HelpCircle className='h-5 w-5' />
  }
  const HoursIcon = ({ icon }: { icon: string }) => {
    const m: Record<string, React.ReactNode> = { Clock: <Clock className='h-5 w-5' />, Zap: <Zap className='h-5 w-5' />, Receipt: <Receipt className='h-5 w-5' />, ClockOff: <ClockOff className='h-5 w-5' />, TrendingDown: <TrendingDown className='h-5 w-5' />, TrendingUp: <TrendingUp className='h-5 w-5' />, PlusCircle: <PlusCircle className='h-5 w-5' />, Wallet: <Wallet className='h-5 w-5' /> }
    return m[icon] || <HelpCircle className='h-5 w-5' />
  }
  const TroubleIcon = ({ icon }: { icon: string }) => {
    const m: Record<string, React.ReactNode> = { MailX: <MailX className='h-4 w-4' />, MessageSquare: <MessageSquare className='h-4 w-4' />, Upload: <Upload className='h-4 w-4' />, LogIn: <LogIn className='h-4 w-4' />, KeyRound: <KeyRound className='h-4 w-4' />, ShieldOff: <ShieldOff className='h-4 w-4' />, XCircle: <XCircle className='h-4 w-4' />, Globe: <Globe className='h-4 w-4' />, WifiOff: <WifiOff className='h-4 w-4' /> }
    return m[icon] || <HelpCircle className='h-4 w-4' />
  }

  const colors = ['bg-blue-50 text-blue-600','bg-indigo-50 text-indigo-600','bg-emerald-50 text-emerald-600','bg-amber-50 text-amber-600','bg-purple-50 text-purple-600','bg-sky-50 text-sky-600','bg-rose-50 text-rose-600']
  const troubleColors = ['bg-red-50 text-red-500','bg-orange-50 text-orange-500','bg-amber-50 text-amber-500','bg-blue-50 text-blue-500','bg-indigo-50 text-indigo-500','bg-purple-50 text-purple-500','bg-rose-50 text-rose-500','bg-cyan-50 text-cyan-500','bg-gray-50 text-gray-500']

  const quickCards = [
    { I: LogIn, label: 'Getting Started', id: 'getting-started', color: 'text-blue-500 bg-blue-50' },
    { I: BookOpen, label: 'User Guides', id: 'role-guides', color: 'text-indigo-500 bg-indigo-50' },
    { I: Ticket, label: 'Ticket Lifecycle', id: 'ticket-lifecycle', color: 'text-amber-500 bg-amber-50' },
    { I: Bell, label: 'Notifications', id: 'notificat
