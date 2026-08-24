'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useNotifications } from '@/components/dashboard/notification-provider'
import { startComponentRender, endComponentRender } from '@/lib/performance-profiler'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

type Notification = {
  id: number
  title: string
  message: string
  link: string | null
  ticketId: number | null
  isRead: boolean
  createdAt: Date
}

export function NotificationCenter({ collapsed }: { collapsed?: boolean }) {
  const renderStart = startComponentRender('NotificationCenter')
  const [open, setOpen] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  useEffect(() => { endComponentRender('NotificationCenter', renderStart) }, [])

  // Read notification state from global NotificationProvider context.
  // Initial data was fetched once in the layout and seeded into the provider.
  // Provider refreshes every 60 seconds via SWR.
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    isLoading,
  } = useNotifications()

  const hasUnread = unreadCount > 0

  const handleMarkAsRead = async (id: number) => {
    const ok = await markAsRead(id)
    if (!ok) {
      toast.error('Could not mark notification as read. Please try again.')
    }
  }

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true)
    try {
      const ok = await markAllAsRead()
      if (ok) {
        toast.success('All notifications marked as read')
      } else {
        toast.error('Could not mark all notifications as read. Please try again.')
      }
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-tour="notification-bell"
          className="relative h-9 w-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center leading-none"
              aria-hidden
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-80 p-0 bg-popover border-border/50 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
              onClick={handleMarkAllAsRead}
              disabled={markingAll}
            >
              {markingAll ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCheck className="h-3 w-3" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification List */}
        <ScrollArea className="h-[360px]">
          {isLoading && (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center h-24 gap-2">
              <Bell className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No notifications yet</p>
            </div>
          )}

          {!isLoading &&
            notifications.length > 0 &&
            notifications.map((notif: Notification, idx: number) => (
              <div key={notif.id}>
                <NotificationItem
                  notification={notif}
                  onRead={handleMarkAsRead}
                  onClose={() => setOpen(false)}
                />
                {idx < notifications.length - 1 && (
                  <Separator className="bg-border/30" />
                )}
              </div>
            ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function NotificationItem({
  notification,
  onRead,
  onClose,
}: {
  notification: Notification
  onRead: (id: number) => void
  onClose: () => void
}) {
  const content = (
    <div
      className={cn(
        'px-4 py-3 cursor-pointer transition-colors',
        notification.isRead
          ? 'hover:bg-muted/30'
          : 'bg-primary/5 hover:bg-primary/10'
      )}
      onClick={() => {
        if (!notification.isRead) onRead(notification.id)
        if (!notification.link) return
        onClose()
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (!notification.isRead) onRead(notification.id)
          if (!notification.link) return
          onClose()
        }
      }}
    >
      <div className="flex items-start gap-2.5">
        {/* Unread dot */}
        <div className="mt-1.5 flex-shrink-0">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              notification.isRead ? 'bg-transparent' : 'bg-primary'
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium leading-snug', notification.isRead ? 'text-muted-foreground' : 'text-foreground')}>
            {notification.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.message}
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>
    </div>
  )

  if (notification.link) {
    return <Link href={notification.link}>{content}</Link>
  }

  return content
}
