'use server'

import { getCurrentUser as getUser } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { timeLog, ticketHistory, user, ticket, project } from '@/lib/db/schema'
import { eq, and, desc, isNull, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { dispatchNotification } from '@/lib/notify-all'
import { VALIDATION, validateField } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'

export const startTimer = wrapServerAction('startTimer', async function startTimer(ticketId: number, description?: string) {
  const currentUser = await getUser()
  if (currentUser.role !== 'developer') throw new Error('Only developers can log time')
  if (description) {
    const descErr = validateField(description, VALIDATION.DESCRIPTION_MAX_LENGTH, 'Timer description')
    if (descErr) throw new Error(descErr)
  }

  const [activeTimer] = await db.select().from(timeLog).where(and(eq(timeLog.userId, currentUser.id), isNull(timeLog.endTime))).limit(1)
  if (activeTimer) throw new Error('You already have an active timer')

  // Business rule: tickets that SKIPPED the estimate workflow (manager
  // "Assign Directly") log NON-BILLABLE time. All other tickets keep the
  // existing behavior (billable).
  const [estimateRow] = await db
    .select({ estimateWorkflowSkipped: ticket.estimateWorkflowSkipped })
    .from(ticket)
    .where(eq(ticket.id, ticketId))
    .limit(1)
  const isBillable = !estimateRow?.estimateWorkflowSkipped

  const [newLog] = await db.insert(timeLog).values({
    ticketId, userId: currentUser.id, description, startTime: new Date(), isBillable,
  }).returning()

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'timer_started', newValue: description || 'Started working',
  })

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

  const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + ticketId
  if (ticketRow) {
    if (ticketRow.clientId) {
      recipients.push({
        userId: ticketRow.clientId,
        inApp: {
          title: 'Work Started on Your Ticket',
          message: `Work has started on ticket #${ticketRow.ticketNumber} (${ticketRow.title}).`,
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
      isBillable: timeLog.isBillable, createdAt: timeLog.createdAt,
    })
    .from(timeLog)
    .where(and(eq(timeLog.id, timeLogId), eq(timeLog.userId, currentUser.id)))
    .limit(1)
  if (!log) throw new Error('Time log not found')
  if (log.endTime) throw new Error('Timer already stopped')

  const endTime = new Date()
  const durationMinutes = Math.round((endTime.getTime() - log.startTime.getTime()) / 60000)

  await db.update(timeLog).set({ endTime, durationMinutes, updatedAt: new Date() }).where(eq(timeLog.id, timeLogId))

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

  const ticketLink = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/dashboard/tickets/' + log.ticketId
  if (ticketRow) {
    if (ticketRow.clientId) {
      recipients.push({
        userId: ticketRow.clientId,
        inApp: {
          title: 'Work Completed on Your Ticket',
          message: `A work session on ticket #${ticketRow.ticketNumber} (${ticketRow.title}) has been logged (${durationMinutes} minutes).`,
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
      isBillable: timeLog.isBillable, createdAt: timeLog.createdAt,
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
      isBillable: timeLog.isBillable, createdAt: timeLog.createdAt,
    })
    .from(timeLog)
    .where(and(eq(timeLog.id, timeLogId), eq(timeLog.userId, currentUser.id)))
    .limit(1)
  if (!log) throw new Error('Time log not found')

  const previousMinutes = log.durationMinutes || 0
  const [newLog] = await db.insert(timeLog).values({
    ticketId, userId: currentUser.id,
    description: description || log.description?.replace(/\[Paused at.*?\]/g, '').trim() || 'Resumed work',
    startTime: new Date(), isBillable: log.isBillable,
  }).returning()

  await db.insert(ticketHistory).values({
    ticketId, userId: currentUser.id, action: 'timer_resumed',
    newValue: previousMinutes > 0 ? `Resumed (${previousMinutes}m previously logged)` : 'Resumed',
  })

  revalidatePath('/dashboard')
  return { ...newLog, resumedFromPreviousMinutes: previousMinutes }
})

export const getActiveTimer = wrapServerAction('getActiveTimer', async function getActiveTimer() {
  const currentUser = await getUser()
  if (currentUser.role !== 'developer') return null
  const [activeTimer] = await db
    .select({ id: timeLog.id, ticketId: timeLog.ticketId, userId: timeLog.userId,
      description: timeLog.description, startTime: timeLog.startTime,
      endTime: timeLog.endTime, durationMinutes: timeLog.durationMinutes,
      isBillable: timeLog.isBillable, createdAt: timeLog.createdAt,
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
      isBillable: timeLog.isBillable, createdAt: timeLog.createdAt, updatedAt: timeLog.updatedAt,
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
      isBillable: timeLog.isBillable, createdAt: timeLog.createdAt, updatedAt: timeLog.updatedAt,
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
