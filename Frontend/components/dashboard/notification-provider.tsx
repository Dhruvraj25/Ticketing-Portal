'use client'

import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react'
import useSWR from 'swr'
import {
  getNotifications,
  markAsRead as markAsReadAction,
  markAllAsRead as markAllAsReadAction,
} from '@/app/actions/notifications'

export interface NotificationItem {
  id: number
  title: string
  message: string
  link: string | null
  ticketId: number | null
  isRead: boolean
  createdAt: Date
}

export interface NotificationResponse {
  notifications: NotificationItem[]
  unreadCount: number
  totalCount: number
}

interface NotificationContextType {
  notifications: NotificationItem[]
  unreadCount: number
  totalCount: number
  refreshNotifications: () => Promise<void>
  /** Returns true when the server confirmed the notification was marked read. */
  markAsRead: (id: number) => Promise<boolean>
  /** Returns true when the server confirmed all unread notifications were marked read. */
  markAllAsRead: () => Promise<boolean>
  isLoading: boolean
}

const defaultContext: NotificationContextType = {
  notifications: [],
  unreadCount: 0,
  totalCount: 0,
  refreshNotifications: async () => {},
  markAsRead: async () => false,
  markAllAsRead: async () => false,
  isLoading: false,
}

const NotificationContext = createContext<NotificationContextType>(defaultContext)

export function useNotifications() {
  return useContext(NotificationContext)
}

interface NotificationProviderProps {
  children: ReactNode
  initialData?: NotificationResponse | null
}

export function NotificationProvider({ children, initialData }: NotificationProviderProps) {
  const { data, isLoading, mutate } = useSWR(
    'dashboard-notifications',
    () => getNotifications(),
    {
      // Refresh every 60s while user is on the page (catches notifications
      // from other tabs/browsers without waiting for mutation events).
      refreshInterval: 60_000,
      // Server-provided initial data — eliminates duplicate fetch on mount.
      // The layout now fetches notifications alongside auth and seeds SWR.
      fallbackData: initialData ?? undefined,
      // Don't re-fetch on focus/blur — mutation actions (create, markAsRead,
      // markAllAsRead) already call revalidateTag to invalidate the cache.
      revalidateOnFocus: false,
      // 30s dedup prevents concurrent requests from rapid re-mounts.
      dedupingInterval: 30_000,
      // Use the server-provided initialData without re-fetching on mount.
      revalidateIfStale: false,
    },
  )

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0
  const totalCount = data?.totalCount ?? 0

  const refreshNotifications = useCallback(async () => {
    await mutate()
  }, [mutate])

  const markAsRead = useCallback(
    async (id: number) => {
      // Optimistic update FIRST — the UI reflects the intent immediately even
      // if the server call is slow or fails. A failed call is reconciled with
      // the server state below so unread counts stay accurate.
      mutate(
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            notifications: prev.notifications.map((n) =>
              n.id === id ? { ...n, isRead: true } : n,
            ),
            unreadCount: Math.max(0, prev.unreadCount - 1),
          }
        },
        { revalidate: false },
      )
      try {
        await markAsReadAction(id)
        // Re-sync with authoritative server state so stale cached data can
        // never restore the old unread count after a successful mutation.
        await mutate()
        return true
      } catch (err) {
        console.error('[notifications] markAsRead failed:', err)
        await mutate()
        return false
      }
    },
    [mutate],
  )

  const markAllAsRead = useCallback(async () => {
    // Optimistic update FIRST (see markAsRead above).
    mutate(
      (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          notifications: prev.notifications.map((n) => ({ ...n, isRead: true })),
          unreadCount: 0,
        }
      },
      { revalidate: false },
    )
    try {
      await markAllAsReadAction()
      // Re-sync with authoritative server state so stale cached data can
      // never restore the old unread count after a successful mutation.
      await mutate()
      return true
    } catch (err) {
      console.error('[notifications] markAllAsRead failed:', err)
      await mutate()
      return false
    }
  }, [mutate])

  const contextValue = useMemo(() => ({
    notifications,
    unreadCount,
    totalCount,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    isLoading,
  }), [notifications, unreadCount, totalCount, refreshNotifications, markAsRead, markAllAsRead, isLoading])

  return (
    <NotificationContext.Provider
      value={contextValue}
    >
      {children}
    </NotificationContext.Provider>
  )
}
