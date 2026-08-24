'use client'

import { useState, useEffect } from 'react'
import { updateTicketStatus, startTimer, stopTimer, pauseTimer, resumeTimer, getActiveTimer } from '@/app/actions/tickets'
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
  const [timerState, setTimerState] = useState<TimerState>('idle')
  const [activeTimerId, setActiveTimerId] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [status, setStatus] = useState(currentStatus)

  // Check for active timer on mount
  useEffect(() => {
    async function checkTimer() {
      try {
        const timer = await getActiveTimer()
        if (timer && timer.ticketId === ticketId) {
          setTimerState('running')
          setActiveTimerId(timer.id)
        }
      } catch {}
    }
    checkTimer()
  }, [ticketId])

  // Elapsed time counter
  useEffect(() => {
    if (timerState !== 'running') return
    const interval = setInterval(() => {
      setElapsedSeconds(s => s + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [timerState])

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
      if (action === 'start_work') {
        setTimerState('running')
        setStatus(TicketStatus.IN_PROGRESS)
      } else if (action === 'stop_work') {
        setTimerState('idle')
        setActiveTimerId(null)
        setElapsedSeconds(0)
      } else if (action === 'pause_work') {
        setTimerState('paused')
      } else if (action === 'resume_work') {
        setTimerState('running')
      } else if (action === 'mark_resolved') {
        setTimerState('idle')
        setActiveTimerId(null)
        setElapsedSeconds(0)
        setStatus(TicketStatus.RESOLVED)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed: ${action}`)
    } finally {
      setLoading(null)
    }
  }

  // Determine which buttons to show based on timer state and status
  const isAssigned = status === TicketStatus.ASSIGNED
  const isInProgress = status === TicketStatus.IN_PROGRESS
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
        {/* Start Working — only when assigned and no active timer */}
        {isAssigned && timerState === 'idle' && (
            <Button
              onClick={() => handleAction('start_work', async () => {
                await updateTicketStatus(ticketId, TicketStatus.IN_PROGRESS)
                const timer = await startTimer(ticketId, 'Started working')
                setActiveTimerId(timer.id)
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
                const newTimer = await resumeTimer(activeTimerId, ticketId, 'Resumed work')
                setActiveTimerId(newTimer.id)
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
        {(isInProgress || timerState !== 'idle') && (
            <Button
              onClick={() => handleAction('mark_resolved', async () => {
                if (activeTimerId) {
                  await stopTimer(activeTimerId)
                  setActiveTimerId(null)
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
                await updateTicketStatus(ticketId, 'in_progress' as TicketStatus)
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
