'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useNotifications } from '@/components/dashboard/notification-provider'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { formatDistanceToNow, format } from 'date-fns'
import { categorizeNotification, NOTIFICATION_TABS } from '@/lib/notification-types'
import type { NotificationType } from '@/lib/notification-types'
import {
  Bell,
  CheckCheck,
  Loader2,
  ExternalLink,
  Ticket,
  MessageSquare,
  AlertCircle,
  UserPlus,
  Inbox,
  X,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Calendar,
  Activity,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

interface Notification {
  id: number
  title: string
  message: string
  link: string | null
  ticketId: number | null
  isRead: boolean
  createdAt: Date
}

interface NotificationsClientProps {
  user: { id: string; name: string; role: UserRole }
}

const ITEMS_PER_PAGE = 10

const notificationTypeIcons: Record<NotificationType, { icon: any; color: string; bg: string }> = {
  ticket: { icon: Ticket, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/15' },
  project: { icon: FolderKanban, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/15' },
  system: { icon: AlertCircle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/15' },
  mention: { icon: UserPlus, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/15' },
  comment: { icon: MessageSquare, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-500/15' },
  wallet: { icon: Activity, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/15' },
  general: { icon: Bell, color: 'text-gray-600 dark:text-slate-400', bg: 'bg-gray-50 dark:bg-slate-800/50' },
}

function getNotificationIcon(title: string, message: string) {
  const type = categorizeNotification(title, message)
  return notificationTypeIcons[type]
}

export function NotificationsClient({ user }: NotificationsClientProps) {
  // Read notification state from global NotificationProvider context.
  // Initial data was fetched once in the dashboard layout and seeded into the provider.
  // Provider refreshes every 60 seconds via SWR.
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    isLoading,
  } = useNotifications()

  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedNotifications, setSelectedNotifications] = useState<Set<number>>(new Set())
  const [detailNotification, setDetailNotification] = useState<Notification | null>(null)
  const [showDetailDrawer, setShowDetailDrawer] = useState(false)

  // Count by tab
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: notifications.length, unread: unreadCount }
    for (const tab of NOTIFICATION_TABS) {
      if (tab.id === 'all' || tab.id === 'unread') continue
      counts[tab.id] = notifications.filter((n) => tab.filter(n.title, n.message)).length
    }
    return counts
  }, [notifications, unreadCount])

  // Filter notifications based on active tab
  const filteredNotifications = useMemo(() => {
    let result = notifications

    if (activeTab === 'unread') {
      result = result.filter((n) => !n.isRead)
    } else if (activeTab !== 'all') {
      const tab = NOTIFICATION_TABS.find((t) => t.id === activeTab)
      if (tab) {
        result = result.filter((n) => tab.filter(n.title, n.message))
      }
    }

    return result
  }, [notifications, activeTab])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE))
  const paginatedNotifications = filteredNotifications.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )

  // Reset page on tab change
  useEffect(() => {
    setCurrentPage(1)
    setSelectedNotifications(new Set())
  }, [activeTab])

  async function handleMarkAsRead(id: number): Promise<boolean> {
    setLoadingId(id)
    try {
      const ok = await markAsRead(id)
      if (!ok) {
        toast.error('Could not mark notification as read. Please try again.')
      }
      return ok
    } finally {
      setLoadingId(null)
    }
  }

  async function handleMarkAllAsRead() {
    setMarkingAll(true)
    try {
      const ok = await markAllAsRead()
      setSelectedNotifications(new Set())
      if (ok) {
        toast.success('All notifications marked as read')
      } else {
        toast.error('Could not mark all notifications as read. Please try again.')
      }
    } finally {
      setMarkingAll(false)
    }
  }

  function toggleSelect(id: number) {
    const next = new Set(selectedNotifications)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedNotifications(next)
  }

  function selectAll() {
    const ids = paginatedNotifications.map((n) => n.id)
    setSelectedNotifications(new Set(ids))
  }

  function deselectAll() {
    setSelectedNotifications(new Set())
  }

  function openDetail(n: Notification) {
    setDetailNotification(n)
    setShowDetailDrawer(true)
  }

  const currentDate = format(new Date(), 'EEEE, MMMM d, yyyy')

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 space-y-6" data-tour="notifications-list">
      {/* Header in creative rounded container */}
      <motion.div
        data-tour="notifications-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm overflow-hidden"
      >
        <div aria-hidden="true" className="pointer-events-none absolute top-0 right-0 w-48 h-32 opacity-[0.03]">
          <svg width="100%" height="100%" viewBox="0 0 100 60" fill="currentColor" className="text-foreground">
            <circle cx="10" cy="10" r="1.5" /><circle cx="30" cy="10" r="1.5" /><circle cx="50" cy="10" r="1.5" />
            <circle cx="70" cy="10" r="1.5" /><circle cx="90" cy="10" r="1.5" /><circle cx="20" cy="25" r="1.5" />
            <circle cx="40" cy="25" r="1.5" /><circle cx="60" cy="25" r="1.5" /><circle cx="80" cy="25" r="1.5" />
            <circle cx="10" cy="40" r="1.5" /><circle cx="30" cy="40" r="1.5" /><circle cx="50" cy="40" r="1.5" />
            <circle cx="70" cy="40" r="1.5" /><circle cx="90" cy="40" r="1.5" /><circle cx="20" cy="55" r="1.5" />
            <circle cx="40" cy="55" r="1.5" /><circle cx="60" cy="55" r="1.5" /><circle cx="80" cy="55" r="1.5" />
          </svg>
        </div>
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PageHeaderIcon variant="red">
              <Bell className="h-5 w-5" />
            </PageHeaderIcon>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Notifications</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Calendar className="h-3.5 w-3.5" />
                {currentDate}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : 'All caught up!'}
            </p>
            {selectedNotifications.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg h-8 text-xs"
                onClick={() => {
                  selectedNotifications.forEach((id) => handleMarkAsRead(id))
                  setSelectedNotifications(new Set())
                }}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark selected read
              </Button>
            )}
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg h-8 text-xs"
                onClick={handleMarkAllAsRead}
                disabled={markingAll}
              >
                {markingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                )}
                Mark all read
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div data-tour="notifications-tabs" className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center overflow-x-auto px-1 pt-1">
          {NOTIFICATION_TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const count = tabCounts[tab.id] || 0
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors relative',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                {tab.id === 'unread' ? (
                  unreadCount > 0 && (
                    <span className="h-5 min-w-[20px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )
                ) : count > 0 ? (
                  <span className={cn(
                    'h-5 min-w-[20px] px-1 rounded-full text-[11px] font-bold flex items-center justify-center',
                    isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    {count > 99 ? '99+' : count}
                  </span>
                ) : null}
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Bulk Selection Bar */}
      {filteredNotifications.length > 0 && (
        <div data-tour="notifications-bulk-bar" className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (selectedNotifications.size === paginatedNotifications.length) {
                  deselectAll()
                } else {
                  selectAll()
                }
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <div className={cn(
                'h-4 w-4 rounded border-2 flex items-center justify-center transition-colors',
                selectedNotifications.size === paginatedNotifications.length
                  ? 'bg-primary border-primary'
                  : selectedNotifications.size > 0
                  ? 'bg-primary/30 border-primary'
                  : 'border-muted-foreground/30',
              )}>
                {selectedNotifications.size === paginatedNotifications.length && (
                  <CheckCheck className="h-2.5 w-2.5 text-white" />
                )}
              </div>
              Select all
            </button>
            {selectedNotifications.size > 0 && (
              <span className="text-xs text-muted-foreground">
                {selectedNotifications.size} selected
              </span>
            )}
          </div>
        </div>
      )}

      {/* Notification List */}
      <div className="space-y-1">
        {filteredNotifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-900 border border-border rounded-xl p-12 text-center"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-2xl bg-muted/30">
                <Inbox className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-lg">
                  {activeTab === 'unread'
                    ? 'No unread notifications'
                    : activeTab === 'all'
                    ? 'No notifications yet'
                    : `No ${activeTab} notifications`}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeTab === 'unread'
                    ? "You've read all your notifications."
                    : "You'll be notified when something requires your attention."}
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          paginatedNotifications.map((n, idx) => {
            const iconConfig = getNotificationIcon(n.title, n.message)
            const Icon = iconConfig.icon
            const isSelected = selectedNotifications.has(n.id)
            const type = categorizeNotification(n.title, n.message)

            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.025 }}
                className={cn(
                  'group relative bg-white dark:bg-slate-900 border rounded-xl transition-all hover:shadow-sm',
                  n.isRead ? 'border-border/70' : 'border-l-2 border-l-primary border-border/70',
                  isSelected && 'ring-2 ring-primary/20 bg-primary/5',
                )}
              >
                <div className="flex items-start gap-3 p-4">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(n.id)}
                    className="mt-1 shrink-0"
                    aria-label={isSelected ? 'Deselect' : 'Select'}
                  >
                    <div className={cn(
                      'h-4 w-4 rounded border-2 flex items-center justify-center transition-colors',
                      isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30 group-hover:border-muted-foreground/60',
                    )}>
                      {isSelected && <CheckCheck className="h-2.5 w-2.5 text-white" />}
                    </div>
                  </button>

                  {/* Unread indicator dot */}
                  {!n.isRead && (
                    <div className="mt-1.5 shrink-0">
                      <span className="h-2 w-2 rounded-full bg-primary block" />
                    </div>
                  )}

                  {/* Icon */}
                  <div
                    className={cn(
                      'p-2 rounded-xl shrink-0 mt-0.5 cursor-pointer',
                      iconConfig.bg,
                      !n.isRead && '',
                    )}
                    onClick={() => openDetail(n)}
                  >
                    <Icon className={cn('h-4 w-4', iconConfig.color)} />
                  </div>

                  {/* Content */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => openDetail(n)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={cn(
                          'text-sm font-medium',
                          n.isRead ? 'text-muted-foreground' : 'text-foreground',
                        )}>
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-xs text-muted-foreground/60">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                      {n.ticketId && (
                        <span className="text-xs text-muted-foreground/40 font-mono">
                          #{n.ticketId}
                        </span>
                      )}
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground capitalize">
                        {type}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!n.isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMarkAsRead(n.id)
                        }}
                        disabled={loadingId === n.id}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100"
                        aria-label="Mark as read"
                      >
                        {loadingId === n.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCheck className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    {n.link && (
                      <Link
                        href={n.link}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100"
                        aria-label="Open link"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div data-tour="notifications-pagination" className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
            <span className="ml-2 text-muted-foreground/60">
              ({filteredNotifications.length} total)
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, idx, arr) => {
                  const showEllipsis = idx > 0 && p - arr[idx - 1] > 1
                  return (
                    <span key={p} className="flex items-center">
                      {showEllipsis && <span className="px-1 text-muted-foreground">...</span>}
                      <button
                        onClick={() => setCurrentPage(p)}
                        className={cn(
                          'h-8 w-8 rounded-lg text-sm font-medium transition-colors',
                          currentPage === p
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                        )}
                      >
                        {p}
                      </button>
                    </span>
                  )
                })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Notification Detail Drawer */}
      <AnimatePresence>
        {showDetailDrawer && detailNotification && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
              onClick={() => setShowDetailDrawer(false)}
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white dark:bg-slate-900 border-l border-border shadow-2xl z-50 overflow-y-auto"
            >
              <div className="p-6 space-y-6">
                {/* Drawer Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">Notification Details</h2>
                  <button
                    onClick={() => setShowDetailDrawer(false)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Notification Content */}
                <div className="space-y-4">
                  {/* Icon and Title */}
                  <div className="flex items-start gap-3">
                    {(() => {
                      const ic = getNotificationIcon(detailNotification.title, detailNotification.message)
                      const Icon = ic.icon
                      return (
                        <div className={cn('p-3 rounded-2xl', ic.bg)}>
                          <Icon className={cn('h-6 w-6', ic.color)} />
                        </div>
                      )
                    })()}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-foreground">
                        {detailNotification.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {detailNotification.message}
                      </p>
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div className="bg-muted/30 rounded-xl p-4 space-y-3 border border-border/50">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <span className={cn(
                        'inline-flex items-center gap-1 text-xs font-medium',
                        detailNotification.isRead ? 'text-muted-foreground' : 'text-primary',
                      )}>
                        <span className={cn('h-2 w-2 rounded-full', detailNotification.isRead ? 'bg-muted-foreground/40' : 'bg-primary')} />
                        {detailNotification.isRead ? 'Read' : 'Unread'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Type</span>
                      <span className="text-xs font-medium capitalize text-foreground">
                        {categorizeNotification(detailNotification.title, detailNotification.message)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Received</span>
                      <span className="text-xs text-foreground">
                        {format(new Date(detailNotification.createdAt), 'MMM d, yyyy \'at\' h:mm a')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Time ago</span>
                      <span className="text-xs text-foreground">
                        {formatDistanceToNow(new Date(detailNotification.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    {detailNotification.ticketId && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Related Ticket</span>
                        <Link
                          href={`/dashboard/tickets/${detailNotification.ticketId}`}
                          className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1"
                          onClick={() => setShowDetailDrawer(false)}
                        >
                          <Ticket className="h-3 w-3" />
                          #{detailNotification.ticketId}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Timeline */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" />
                      Activity Timeline
                    </h4>
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="relative flex flex-col items-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary/20" />
                          <div className="flex-1 w-0.5 bg-border mt-1" />
                        </div>
                        <div className="pb-3">
                          <p className="text-sm font-medium text-foreground">
                            {detailNotification.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {detailNotification.message}
                          </p>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            {formatDistanceToNow(new Date(detailNotification.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    {!detailNotification.isRead && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const ok = await handleMarkAsRead(detailNotification.id)
                          if (ok) {
                            setDetailNotification((prev) => prev ? { ...prev, isRead: true } : null)
                          }
                        }}
                        className="rounded-lg"
                      >
                        <CheckCheck className="h-4 w-4 mr-1.5" />
                        Mark as Read
                      </Button>
                    )}
                    {detailNotification.link && (
                      <Link href={detailNotification.link} onClick={() => setShowDetailDrawer(false)}>
                        <Button size="sm" className="rounded-lg">
                          <ExternalLink className="h-4 w-4 mr-1.5" />
                          View Details
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
