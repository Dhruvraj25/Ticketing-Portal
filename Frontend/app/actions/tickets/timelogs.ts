'use server'

import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { statusAfterWorkStarts } from '@/lib/ticket-work-flow'
import type { ExportableTimeEntry } from '@/lib/time-entry-export'
import { isBillableTicket } from '@/lib/billing'
import { timeLogIsBillable } from '@/lib/billing-sql'
import { getPortalUrl } from '@/lib/urls'
import { db } from '@/lib/db'
import { timeLog, ticketHistory, user, ticket, project } from '@/lib/db/schema'
import { eq, and, desc, isNull, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { dispatchNotification } from '@/lib/notify-all'
import { VALIDATION, validateField } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'
import {
  deriveTimerSession, isPausedEntry, NOT_ASSIGNED_TIMER_MESSAGE, TIMER_WORKABLE_STATUSES, timerStatusBlockMessage,
  timerTicketOptions, type MyTimerState, type TimerEntry, type TimerSession, type TimerTicketOption,
} from '@/lib/timer-rules'

/**
 * Starting / resuming a timer on a not-started ticket (assigned, rework —
 * incl. a REOPENED ticket) moves it to in progress: the same transition the
 * ticket page's Start Work performs (lib/ticket-work-flow.ts). No-op when the
 * ticket is already in progress. Recorded like any status change.
 */
async function markWorkStarted(ticketId: number, currentStatus: string, userId: string): Promise<void> {
  const next = statusAfterWorkStarts(currentStatus)
  if (!next) return
  const moved = await db.update(ticket).set({ status: next, updatedAt: new Date() })
    .where(and(eq(ticket.id, ticketId), eq(ticket.status, currentStatus)))
    .returning({ id: ticket.id })
  if (moved.length === 0) return
  await db.insert(ticketHistory).values({ ticketId, userId, action: 'status_changed', oldValue: currentStatus, newValue: next })
}

export const startTimer = wrapServerAction('startTimer', async function startTimer(ticketId: number, description?: string) {
  const currentUser = await getUser()
  // Developers, and project managers working a ticket assigned to them (the
  // assignee check below enforces that) — lib/ticket-assignment canWorkOnTicket.
  if (currentUser.role !== 'developer' && currentUser.role !== 'project_manager') throw new Error('Only the assigned resource can log time')
  if (description) {
    const descErr = validateField(description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Timer description')
    if (descErr) throw new Error(descErr)
  }

  // Server-side eligibility (never trust the UI list — lib/timer-rules.ts):
  // the ticket must exist, be assigned to this developer, and be in a status
  // where the developer works on it (Assigned / Work in Progress / Rework).
  const [estimateRow] = await db
    .select({ status: ticket.status, assignedToId: ticket.assignedToId, estimateWorkflowSkipped: ticket.estimateWorkflowSkipped, consumedHours: ticket.consumedHours })
    .from(ticket)
    .where(eq(ticket.id, ticketId))
    .limit(1)
  if (!estimateRow) throw new Error('Ticket not found')
  if (estimateRow.assignedToId !== currentUser.id) throw new Error(NOT_ASSIGNED_TIMER_MESSAGE)
  const statusBlock = timerStatusBlockMessage(estimateRow.status)
  if (statusBlock) throw new Error(statusBlock)

  const [activeTimer] = await db.select().from(timeLog).where(and(eq(timeLog.userId, currentUser.id), isNull(timeLog.endTime))).limit(1)
  if (activeTimer) throw new Error('You already have an active timer')

  // Billable ⇔ the ticket follows the estimate workflow (lib/billing.ts):
  // "Assign Directly" / skipped-estimate tickets log NON-BILLABLE time.
  const isBillable = isBillableTicket(estimateRow)

  const [newLog] = await db.insert(timeLog).values({
    ticketId, userId: currentUser.id, description, startTime: new Date(), isBillable,
  }).returning()

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'timer_started', newValue: description || 'Started working',
  })
  await markWorkStarted(ticketId, estimateRow.status, currentUser.id)

  // Fetch ticket details for stakeholder notifications
  const [ticketRow] = await db
    .select({ id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title, clientId: ticket.clientId, projectId: ticket.projectId })
    .from(ticket)
    .where(eq(ticket.id, ticketId))
    .limit(1)

  // Work Started: In-App + Email + Teams (client + manager; in-app self-confirm)
  const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = [
    {
      userId: currentUser.id,
      channels: ['inApp'],
      inApp: {
        title: 'Work Started',
        message: `You started working on ticket #${ticketId}.${description ? ' ' + description : ''}`,
        link: `/dashboard/tickets/${ticketId}`,
        ticketId,
      },
    },
  ]

  const ticketLink = (getPortalUrl()) + '/dashboard/tickets/' + ticketId
  if (ticketRow) {
    // Canonical recipient policy: developer_started_work → Manager ONLY. The
    // client is deliberately NOT a recipient of this event (a client should
    // not be notified every time a developer starts a work session).
    if (ticketRow.projectId) {
      const [projectRow] = await db
        .select({ managerId: project.managerId })
        .from(project)
        .where(eq(project.id, ticketRow.projectId))
        .limit(1)
      if (projectRow?.managerId) {
        recipients.push({
          userId: projectRow.managerId,
          inApp: {
            title: 'Work Started on Ticket',
            message: `${currentUser.name} started work on ticket #${ticketRow.ticketNumber} (${ticketRow.title}).`,
            link: `/dashboard/tickets/${ticketId}`,
            ticketId,
          },
          email: {
            templateData: {
              ticketNumber: ticketRow.ticketNumber,
              ticketTitle: ticketRow.title,
              developerName: currentUser.name,
              description: description || 'Started working',
              ticketLink,
            },
          },
          teams: {
            payload: {
              ticketNumber: ticketRow.ticketNumber,
              ticketTitle: ticketRow.title,
              developerName: currentUser.name,
              description: description || 'Started working',
              url: ticketLink,
            },
          },
        })
      }
    }
  }

  await dispatchNotification({
    eventType: 'developer_started_work',
    triggeredBy: currentUser.id,
    dedup: { scope: `ticket:${ticketId}` },
    recipients,
  })

  revalidatePath('/dashboard')
  return newLog
})

export const stopTimer = wrapServerAction('stopTimer', async function stopTimer(timeLogId: number) {
  const currentUser = await getUser()
  const [log] = await db
    .select({ id: timeLog.id, ticketId: timeLog.ticketId, userId: timeLog.userId,
      description: timeLog.description, startTime: timeLog.startTime,
      endTime: timeLog.endTime, durationMinutes: timeLog.durationMinutes,
      isBillable: timeLogIsBillable, createdAt: timeLog.createdAt,
    })
    .from(timeLog)
    .where(and(eq(timeLog.id, timeLogId), eq(timeLog.userId, currentUser.id)))
    .limit(1)
  if (!log) throw new Error('Time log not found')

  // Stop works from RUNNING (close the entry now) and from PAUSED (the paused
  // entry is already closed — Stop just ends the session so it is no longer
  // resumable: the pause marker is removed). Only the latest entry of the
  // session can be stopped; a stopped entry can't be stopped again.
  let endTime: Date
  let durationMinutes: number
  if (log.endTime) {
    const [latest] = await db.select({ id: timeLog.id }).from(timeLog)
      .where(and(eq(timeLog.userId, currentUser.id), eq(timeLog.ticketId, log.ticketId)))
      .orderBy(desc(timeLog.startTime), desc(timeLog.id)).limit(1)
    if (!isPausedEntry(log) || latest?.id !== log.id) throw new Error('Timer already stopped')
    endTime = log.endTime
    durationMinutes = log.durationMinutes ?? 0
    await db.update(timeLog).set({
      description: (log.description ?? '').replace(/\s*\[Paused at.*?\]/g, '').trim() || null,
      updatedAt: new Date(),
    }).where(eq(timeLog.id, timeLogId))
  } else {
    endTime = new Date()
    durationMinutes = Math.round((endTime.getTime() - log.startTime.getTime()) / 60000)
    await db.update(timeLog).set({ endTime, durationMinutes, updatedAt: new Date() }).where(eq(timeLog.id, timeLogId))
  }

  await db.insert(ticketHistory).values({
    ticketId: log.ticketId, userId: currentUser.id, action: 'timer_stopped', newValue: `${durationMinutes} minutes`,
  })

  // Fetch ticket details for stakeholder notifications
  const [ticketRow] = await db
    .select({ id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title, clientId: ticket.clientId, projectId: ticket.projectId })
    .from(ticket)
    .where(eq(ticket.id, log.ticketId))
    .limit(1)

  // Work Completed: In-App + Email + Teams (client + manager; in-app self-confirm)
  const recipients: Parameters<typeof dispatchNotification>[0]['recipients'] = [
    {
      userId: currentUser.id,
      channels: ['inApp'],
      inApp: {
        title: 'Work Completed',
        message: `You logged ${durationMinutes} minutes on ticket #${log.ticketId}.`,
        link: `/dashboard/tickets/${log.ticketId}`,
        ticketId: log.ticketId,
      },
    },
  ]

  const ticketLink = (getPortalUrl()) + '/dashboard/tickets/' + log.ticketId
  if (ticketRow) {
    // Canonical recipient policy: developer_completed_work → Manager ONLY.
    // The client is deliberately NOT a recipient of this event (a client
    // should not be notified every time a developer logs a work session).
    if (ticketRow.projectId) {
      const [projectRow] = await db
        .select({ managerId: project.managerId })
        .from(project)
        .where(eq(project.id, ticketRow.projectId))
        .limit(1)
      if (projectRow?.managerId) {
        recipients.push({
          userId: projectRow.managerId,
          inApp: {
            title: 'Work Logged on Ticket',
            message: `${currentUser.name} logged ${durationMinutes} minutes on ticket #${ticketRow.ticketNumber} (${ticketRow.title}).`,
            link: `/dashboard/tickets/${log.ticketId}`,
            ticketId: log.ticketId,
          },
          email: {
            templateData: {
              ticketNumber: ticketRow.ticketNumber,
              ticketTitle: ticketRow.title,
              developerName: currentUser.name,
              durationMinutes,
              ticketLink,
            },
          },
          teams: {
            payload: {
              ticketNumber: ticketRow.ticketNumber,
              ticketTitle: ticketRow.title,
              developerName: currentUser.name,
              durationMinutes,
              url: ticketLink,
            },
          },
        })
      }
    }
  }

  await dispatchNotification({
    eventType: 'developer_completed_work',
    triggeredBy: currentUser.id,
    dedup: { scope: `ticket:${log.ticketId}` },
    recipients,
  })

  revalidatePath('/dashboard')
  return { ...log, endTime, durationMinutes }
})

export const pauseTimer = wrapServerAction('pauseTimer', async function pauseTimer(timeLogId: number) {
  const currentUser = await getUser()
  const [log] = await db
    .select({ id: timeLog.id, ticketId: timeLog.ticketId, userId: timeLog.userId,
      description: timeLog.description, startTime: timeLog.startTime,
      endTime: timeLog.endTime, durationMinutes: timeLog.durationMinutes,
      isBillable: timeLogIsBillable, createdAt: timeLog.createdAt,
    })
    .from(timeLog)
    .where(and(eq(timeLog.id, timeLogId), eq(timeLog.userId, currentUser.id)))
    .limit(1)
  if (!log) throw new Error('Time log not found')
  if (log.endTime) throw new Error('Timer already stopped')

  const pauseTime = new Date()
  const elapsedMinutes = Math.round((pauseTime.getTime() - log.startTime.getTime()) / 60000)

  await db.update(timeLog).set({
    endTime: pauseTime, durationMinutes: elapsedMinutes, updatedAt: new Date(),
    description: log.description ? `${log.description} [Paused at ${elapsedMinutes}m]` : `[Paused at ${elapsedMinutes}m]`,
  }).where(eq(timeLog.id, timeLogId))

  await db.insert(ticketHistory).values({
    ticketId: log.ticketId, userId: currentUser.id, action: 'timer_paused', newValue: `${elapsedMinutes} minutes`,
  })

  revalidatePath('/dashboard')
  return { ...log, endTime: pauseTime, durationMinutes: elapsedMinutes, paused: true }
})

export const resumeTimer = wrapServerAction('resumeTimer', async function resumeTimer(timeLogId: number, ticketId: number, description?: string) {
  const currentUser = await getUser()
  if (description) {
    const descErr = validateField(description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Timer description')
    if (descErr) throw new Error(descErr)
  }

  const [log] = await db
    .select({ id: timeLog.id, ticketId: timeLog.ticketId, userId: timeLog.userId,
      description: timeLog.description, startTime: timeLog.startTime,
      endTime: timeLog.endTime, durationMinutes: timeLog.durationMinutes,
      isBillable: timeLogIsBillable, createdAt: timeLog.createdAt,
    })
    .from(timeLog)
    .where(and(eq(timeLog.id, timeLogId), eq(timeLog.userId, currentUser.id)))
    .limit(1)
  // The resumed session continues the SAME ticket as the paused log — a caller
  // can't redirect it to another ticket — and a completed ticket can't resume.
  if (!log || log.ticketId !== ticketId) throw new Error('Time log not found')
  // Only a PAUSED session can resume, from its latest (paused) entry — never a
  // stopped entry or an older segment (that would fork a duplicate session).
  const [latestEntry] = await db.select({ id: timeLog.id }).from(timeLog)
    .where(and(eq(timeLog.userId, currentUser.id), eq(timeLog.ticketId, ticketId)))
    .orderBy(desc(timeLog.startTime), desc(timeLog.id)).limit(1)
  if (!isPausedEntry(log) || latestEntry?.id !== log.id) throw new Error('This timer is not paused.')
  const [ticketRow] = await db.select({ status: ticket.status, assignedToId: ticket.assignedToId, estimateWorkflowSkipped: ticket.estimateWorkflowSkipped, consumedHours: ticket.consumedHours }).from(ticket).where(eq(ticket.id, ticketId)).limit(1)
  if (!ticketRow) throw new Error('Ticket not found')
  if (ticketRow.assignedToId !== currentUser.id) throw new Error(NOT_ASSIGNED_TIMER_MESSAGE)
  const statusBlock = timerStatusBlockMessage(ticketRow.status)
  if (statusBlock) throw new Error(statusBlock)
  // One active timer at a time (same rule as startTimer) — resuming must never
  // open a second running entry.
  const [running] = await db.select({ id: timeLog.id }).from(timeLog).where(and(eq(timeLog.userId, currentUser.id), isNull(timeLog.endTime))).limit(1)
  if (running) throw new Error('You already have an active timer')

  const previousMinutes = log.durationMinutes || 0
  const [newLog] = await db.insert(timeLog).values({
    ticketId, userId: currentUser.id,
    description: description || log.description?.replace(/\[Paused at.*?\]/g, '').trim() || 'Resumed work',
    // From the ticket's CURRENT workflow (lib/billing.ts), not copied from the old entry.
    startTime: new Date(), isBillable: isBillableTicket(ticketRow),
  }).returning()

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'timer_resumed',
    newValue: previousMinutes > 0 ? `Resumed (${previousMinutes}m previously logged)` : 'Resumed',
  })
  await markWorkStarted(ticketId, ticketRow.status, currentUser.id)

  revalidatePath('/dashboard')
  return { ...newLog, resumedFromPreviousMinutes: previousMinutes }
})

export const getActiveTimer = wrapServerAction('getActiveTimer', async function getActiveTimer() {
  const currentUser = await getUser()
  if (currentUser.role !== 'developer' && currentUser.role !== 'project_manager') return null
  const [activeTimer] = await db
    .select({ id: timeLog.id, ticketId: timeLog.ticketId, userId: timeLog.userId,
      description: timeLog.description, startTime: timeLog.startTime,
      endTime: timeLog.endTime, durationMinutes: timeLog.durationMinutes,
      isBillable: timeLogIsBillable, createdAt: timeLog.createdAt,
    })
    .from(timeLog)
    .where(and(eq(timeLog.userId, currentUser.id), isNull(timeLog.endTime)))
    .limit(1)
  return activeTimer || null
})

export const getTimeLogs = wrapServerAction('getTimeLogs', async function getTimeLogs(ticketId: number, limit: number = 50, offset: number = 0) {
  const logs = await db
    .select({
      id: timeLog.id, ticketId: timeLog.ticketId, userId: timeLog.userId,
      description: timeLog.description, startTime: timeLog.startTime,
      endTime: timeLog.endTime, durationMinutes: timeLog.durationMinutes,
      isBillable: timeLogIsBillable, createdAt: timeLog.createdAt, updatedAt: timeLog.updatedAt,
      userName: user.name,
    })
    .from(timeLog)
    .leftJoin(user, eq(timeLog.userId, user.id))
    .where(eq(timeLog.ticketId, ticketId))
    .orderBy(desc(timeLog.createdAt))
    .limit(limit)
    .offset(offset)

  return logs.map((l) => ({ ...l, userName: l.userName ?? 'Unknown' }))
})

export const getTimeLogsBatch = wrapServerAction('getTimeLogsBatch', async function getTimeLogsBatch(ticketIds: number[]) {
  if (ticketIds.length === 0) return new Map<number, any[]>()
  const logs = await db
    .select({
      id: timeLog.id, ticketId: timeLog.ticketId, userId: timeLog.userId,
      description: timeLog.description, startTime: timeLog.startTime,
      endTime: timeLog.endTime, durationMinutes: timeLog.durationMinutes,
      isBillable: timeLogIsBillable, createdAt: timeLog.createdAt, updatedAt: timeLog.updatedAt,
      userName: user.name,
    })
    .from(timeLog)
    .leftJoin(user, eq(timeLog.userId, user.id))
    .where(inArray(timeLog.ticketId, ticketIds))
    .orderBy(desc(timeLog.createdAt))

  const logsWithUser = logs.map((l) => ({ ...l, userName: l.userName ?? 'Unknown' }))
  const logMap = new Map<number, typeof logsWithUser>()
  for (const log of logsWithUser) {
    if (!logMap.has(log.ticketId)) logMap.set(log.ticketId, [])
    logMap.get(log.ticketId)!.push(log)
  }
  return logMap
})

// ── Time Tracking → Timer ticket list ──────────────────────────────────────
// Only tickets the logged-in developer can start/resume right now
// (lib/timer-rules.ts): assigned to them, in a workable status, and not
// already running. Filtered in the database by assignee + status; the timer
// state comes from the developer's own most recent entry on each ticket.
export const getTimerTickets = wrapServerAction('getTimerTickets', async function getTimerTickets(): Promise<TimerTicketOption[]> {
  const currentUser = await getUser()
  if (currentUser.role !== 'developer') return []

  const tickets = await db
    .select({ id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title, status: ticket.status, assignedToId: ticket.assignedToId })
    .from(ticket)
    .where(and(eq(ticket.assignedToId, currentUser.id), inArray(ticket.status, [...TIMER_WORKABLE_STATUSES])))
    .orderBy(desc(ticket.updatedAt))
  if (tickets.length === 0) return []

  const entries = await db
    .select({ id: timeLog.id, ticketId: timeLog.ticketId, endTime: timeLog.endTime, description: timeLog.description })
    .from(timeLog)
    .where(and(eq(timeLog.userId, currentUser.id), inArray(timeLog.ticketId, tickets.map((t) => t.id))))
    .orderBy(desc(timeLog.startTime), desc(timeLog.id))
  const latest = new Map<number, TimerEntry>()
  for (const e of entries) if (!latest.has(e.ticketId)) latest.set(e.ticketId, e)

  return timerTicketOptions(currentUser.id, tickets, latest)
})

// ── Authoritative timer state (Time Tracking page AND Ticket Detail) ───────
// Both pages read the timer from the SAME source — the current developer's
// time entries — through the same derivation (lib/timer-rules.ts
// deriveTimerSession): RUNNING / PAUSED / STOPPED plus accumulated seconds.
async function sessionForTicket(userId: string, ticketId: number): Promise<TimerSession> {
  const entries = await db
    .select({ id: timeLog.id, ticketId: timeLog.ticketId, startTime: timeLog.startTime, endTime: timeLog.endTime, description: timeLog.description })
    .from(timeLog)
    .where(and(eq(timeLog.userId, userId), eq(timeLog.ticketId, ticketId)))
    .orderBy(desc(timeLog.startTime), desc(timeLog.id))
    .limit(200)
  return deriveTimerSession(entries)
}

/** This developer's timer on one ticket (Ticket Detail). */
export const getTicketTimerState = wrapServerAction('getTicketTimerState', async function getTicketTimerState(ticketId: number): Promise<TimerSession> {
  const currentUser = await getUser()
  // Managers too — only their OWN entries, i.e. tickets they work on themselves.
  if (currentUser.role !== 'developer' && currentUser.role !== 'project_manager') return deriveTimerSession([])
  return sessionForTicket(currentUser.id, ticketId)
})

/**
 * This developer's current timer (Time Tracking page): the session of their
 * most recent entry — running or paused. A stopped latest entry → no session.
 */
export const getMyTimerState = wrapServerAction('getMyTimerState', async function getMyTimerState(): Promise<MyTimerState> {
  const currentUser = await getUser()
  const none: MyTimerState = { ...deriveTimerSession([]), ticketNumber: null, ticketTitle: null, description: null }
  if (currentUser.role !== 'developer') return none
  const [latest] = await db
    .select({ ticketId: timeLog.ticketId, description: timeLog.description })
    .from(timeLog)
    .where(eq(timeLog.userId, currentUser.id))
    .orderBy(desc(timeLog.startTime), desc(timeLog.id))
    .limit(1)
  if (!latest) return none
  const session = await sessionForTicket(currentUser.id, latest.ticketId)
  if (session.state !== 'running' && session.state !== 'paused') return none
  const [t] = await db.select({ ticketNumber: ticket.ticketNumber, title: ticket.title }).from(ticket).where(eq(ticket.id, latest.ticketId)).limit(1)
  return {
    ...session,
    ticketNumber: t?.ticketNumber ?? null,
    ticketTitle: t?.title ?? null,
    description: (latest.description ?? '').replace(/\s*\[Paused at.*?\]/g, '').trim() || null,
  }
})

// ── Time Tracking → Export ─────────────────────────────────────────────────
// The CURRENT developer's own time entries only (never another user's),
// classified with the shared billing rule (lib/billing-sql.ts). The page
// turns them into an .xlsx with the existing lib/office-export builder.
export const getMyTimeEntriesForExport = wrapServerAction('getMyTimeEntriesForExport', async function getMyTimeEntriesForExport(): Promise<ExportableTimeEntry[]> {
  const currentUser = await getUser()
  if (currentUser.role !== 'developer') return []
  const rows = await db
    .select({
      id: timeLog.id,
      ticketId: timeLog.ticketId,
      startTime: timeLog.startTime,
      endTime: timeLog.endTime,
      durationMinutes: timeLog.durationMinutes,
      description: timeLog.description,
      isBillable: timeLogIsBillable,
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
    })
    .from(timeLog)
    .leftJoin(ticket, eq(timeLog.ticketId, ticket.id))
    .where(eq(timeLog.userId, currentUser.id))
    .orderBy(desc(timeLog.startTime), desc(timeLog.id))
    .limit(5000)
  return rows.map((r) => ({ ...r, isBillable: !!r.isBillable, userName: currentUser.name ?? null }))
})
