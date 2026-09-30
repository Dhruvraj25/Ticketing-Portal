'use client'

import { useState, useEffect, useCallback } from 'react'
import { canCompleteWork, statusAfterWorkStarts } from '@/lib/ticket-work-flow'
import { updateTicketStatus, startTimer, stopTimer, pauseTimer, resumeTimer, getTicketTimerState } from '@/app/actions/tickets'
import { sessionElapsedSeconds, type TimerSession } from '@/lib/timer-rules'
import { Button } from '@/components/ui/button'

import { cn } from '@/lib/utils'
import { TicketStatus, TICKET_STATUS_CONFIG } from '@/lib/types'
import { Loader2, Play, Square, RotateCcw, CheckCircle2, Pause, RefreshCw, AlertCircle } from 'lucide-react'

interface TicketStatusActionsProps {
  ticketId: number
  currentStatus: TicketStatus
}

type TimerState = 'idle' | 'running' | 'paused'

export function TicketStatusActions({ ticketId, currentStatus }: TicketStatusActionsProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Timer state is NEVER tracked locally: it is read from the server
  // (getTicketTimerState → the same derivation the Time Tracking page uses)
  // on mount and after every timer action, so a pause/resume/stop made on
  // either page shows here identically — including after refresh.
  const [session, setSession] = useState<TimerSession | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [status, setStatus] = useState(currentStatus)
  const timerState: TimerState = session?.state === 'running' ? 'running' : session?.state === 'paused' ? 'paused' : 'idle'
  const activeTimerId = timerState !== 'idle' ? session?.entryId ?? null : null

  const loadTimer = useCallback(async () => {
    try {
      setSession(await getTicketTimerState(ticketId))
    } catch {}
  }, [ticketId])

  useEffect(() => { loadTimer() }, [loadTimer])

  // Display only: accumulated seconds + the running segment, ticking while running.
  useEffect(() => {
    if (!session) return
    setElapsedSeconds(sessionElapsedSeconds(session))
    if (session.state !== 'running') return
    const interval = setInterval(() => setElapsedSeconds(sessionElapsedSeconds(session)), 1000)
    return () => clearInterval(interval)
  }, [session])

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const handleAction = async (action: string, actionFn: () => Promise<any>) => {
    setError(null)
    setLoading(action)
    try {
      await actionFn()
      if (action === 'start_work') setStatus(TicketStatus.IN_PROGRESS)
      else if (action === 'mark_resolved') setStatus(TicketStatus.RESOLVED)
      else if (action === 'reopen') setStatus(TicketStatus.ASSIGNED)
      // Resuming work on a not-started (assigned / rework) ticket starts it, as on the server.
      else if (action === 'resume_work' && statusAfterWorkStarts(status)) setStatus(TicketStatus.IN_PROGRESS)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed: ${action}`)
    } finally {
      // Re-read the authoritative timer state (also after a failure).
      await loadTimer()
      setLoading(null)
    }
  }

  // Determine which buttons to show based on timer state and status
  // "Start Work" must be available whenever the assigned developer can begin
  // active work on this SAME ticket — the initial ASSIGNED state, and also
  // REWORK (the manager sent completed work back for another pass; the
  // developer resumes the existing ticket, never a new one).
  const canStartWork = status === TicketStatus.ASSIGNED || status === TicketStatus.REWORK
  const isResolved = status === TicketStatus.RESOLVED || status === TicketStatus.CLIENT_REVIEW

  return (
    <div data-tour="ticket-status-actions" className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 card-shadow">
      <div className="flex items-center gap-2 mb-4">
        {timerState === 'running' && (
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
        )}
        <h3 className="font-semibold text-foreground">
          {timerState === 'running' ? 'Working' :
           timerState === 'paused' ? 'Paused' : 'Actions'}
        </h3>
        {timerState !== 'idle' && (
          <span className="font-mono text-sm text-primary ml-auto">
            {formatTime(elapsedSeconds)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Start Working — when assigned (initial) or sent back for rework, and no active timer */}
        {canStartWork && timerState === 'idle' && (
            <Button
              onClick={() => handleAction('start_work', async () => {
                await updateTicketStatus(ticketId, TicketStatus.IN_PROGRESS)
                await startTimer(ticketId, 'Started working')
              })}
              disabled={loading !== null}
              className="bg-primary text-primary-foreground shadow-sm rounded-lg h-10 px-5 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading === 'start_work' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Work
            </Button>
        )}

        {/* Pause — when running */}
        {timerState === 'running' && activeTimerId && (
            <Button
              onClick={() => handleAction('pause_work', () => pauseTimer(activeTimerId))}
              disabled={loading !== null}
              variant="outline"
              className="rounded-xl h-11 px-5 border-amber-500/30 text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/100/10 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading === 'pause_work' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Pause className="h-4 w-4 mr-2" />
              )}
              Pause
            </Button>
        )}

        {/* Resume — when paused */}
        {timerState === 'paused' && activeTimerId && (
            <Button
              onClick={() => handleAction('resume_work', async () => {
                await resumeTimer(activeTimerId, ticketId, 'Resumed work')
              })}
              disabled={loading !== null}
              className="rounded-lg h-10 px-5 bg-primary text-primary-foreground shadow-sm transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading === 'resume_work' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Resume
            </Button>
        )}

        {/* Stop — when running or paused */}
        {(timerState === 'running' || timerState === 'paused') && activeTimerId && (
            <Button
              onClick={() => handleAction('stop_work', () => stopTimer(activeTimerId))}
              disabled={loading !== null}
              variant="destructive"
              className="rounded-xl h-11 px-5 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading === 'stop_work' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              Stop
            </Button>
        )}

        {/* Mark Resolved — when in progress or running/paused */}
        {/* Complete only while work is in progress (lib/ticket-work-flow.ts —
            the server enforces it too): a newly assigned or REOPENED ticket shows
            Start Work first, and a paused one is Resumed before completing. */}
        {canCompleteWork(status) && (
            <Button
              onClick={() => handleAction('mark_resolved', async () => {
                if (activeTimerId) {
                  await stopTimer(activeTimerId)
                }
                await updateTicketStatus(ticketId, TicketStatus.RESOLVED)
              })}
              disabled={loading !== null}
              variant="outline"
              className="rounded-xl h-11 px-5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/100/10 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading === 'mark_resolved' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {timerState !== 'idle' ? 'Stop & Complete' : 'Mark Completed'}
            </Button>
        )}

        {/* Reopen — when resolved */}
        {isResolved && timerState === 'idle' && (
            <Button
              onClick={() => handleAction('reopen', async () => {
                // Back to the resource, not started — like a newly assigned ticket
                // (lib/ticket-work-flow.ts): Start Work → timer → Complete again.
                await updateTicketStatus(ticketId, TicketStatus.ASSIGNED)
              })}
              disabled={loading !== null}
              variant="outline"
              className="rounded-xl h-11 px-5 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading === 'reopen' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Reopen Request
            </Button>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive mt-3 bg-destructive/10 rounded-lg px-3 py-2 animate-fade-in">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
