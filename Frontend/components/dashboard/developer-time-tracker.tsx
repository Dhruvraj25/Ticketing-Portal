'use client'

import { useState, useEffect } from 'react'
import { startTimer, stopTimer, pauseTimer, resumeTimer } from '@/app/actions/tickets'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { stripHtml } from '@/lib/format'
import { Play, Square, Pause, RefreshCw, Loader2, Clock, Ticket, FolderKanban, Layers } from 'lucide-react'
import type { TicketWithRelations, TimeLogWithUser } from '@/lib/types'

interface TicketTimeLogs {
  ticketId: number
  ticketNumber: string
  ticketTitle: string
  projectName?: string
  projectCode?: string
  moduleName?: string
  logs: TimeLogWithUser[]
}

interface DeveloperTimeTrackerProps {
  tickets: TicketWithRelations[]
  activeTimer: any | null
  allTimeLogs: TicketTimeLogs[]
}

export function DeveloperTimeTracker({ 
  tickets, 
  activeTimer: initialActiveTimer,
  allTimeLogs 
}: DeveloperTimeTrackerProps) {
  const router = useRouter()
  const [selectedTicket, setSelectedTicket] = useState<string>('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTimer, setActiveTimer] = useState(initialActiveTimer)
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    if (activeTimer) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - new Date(activeTimer.startTime).getTime()) / 1000)
        setElapsedTime(elapsed)
      }, 1000)
      return () => clearInterval(interval)
    } else {
      setElapsedTime(0)
    }
  }, [activeTimer])

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const handleStart = async () => {
    if (!selectedTicket) return
    setError(null)
    setLoading('start')
    try {
      const timer = await startTimer(parseInt(selectedTicket), description || undefined)
      setActiveTimer(timer)
      setDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start timer')
    } finally {
      setLoading(null)
    }
  }

  const handleStop = async () => {
    if (!activeTimer) return
    setError(null)
    setLoading('stop')
    try {
      await stopTimer(activeTimer.id)
      setActiveTimer(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop timer')
    } finally {
      setLoading(null)
    }
  }

  const handlePause = async () => {
    if (!activeTimer) return
    setError(null)
    setLoading('pause')
    try {
      await pauseTimer(activeTimer.id)
      setActiveTimer(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause timer')
    } finally {
      setLoading(null)
    }
  }

  const handleResume = async () => {
    if (!activeTimer) return
    setError(null)
    setLoading('resume')
    try {
      const newTimer = await resumeTimer(activeTimer.id, activeTimer.ticketId, description || undefined)
      setActiveTimer(newTimer)
      setDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume timer')
    } finally {
      setLoading(null)
    }
  }

  const activeTicketInfo = activeTimer 
    ? tickets.find(t => t.id === activeTimer.ticketId)
    : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
      {/* Timer Controls */}
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Timer</h2>
        
        <Card className="p-6 bg-card/50 backdrop-blur-sm border-border/50">
          {activeTimer ? (
            <div className="space-y-4">
              {/* Active timer display */}
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">Working on</p>
                <p className="text-lg font-medium text-foreground mb-4">
                  {activeTicketInfo?.ticketNumber}: {activeTicketInfo?.title}
                </p>
                <motion.p
                  key={elapsedTime}
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 0.3 }}
                  className="text-5xl font-mono text-primary"
                >
                  {formatElapsed(elapsedTime)}
                </motion.p>
                {activeTimer.description && (
                  <p className="text-sm text-muted-foreground mt-4">{activeTimer.description}</p>
                )}
              </div>
              
              {/* Timer controls */}
              <div className="flex items-center justify-center gap-3">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    onClick={handlePause}
                    disabled={loading !== null}
                    variant="outline"
                    className="rounded-xl h-11 px-5 border-amber-500/30 text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/100/10"
                  >
                    {loading === 'pause' ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Pause className="h-4 w-4 mr-2" />
                    )}
                    Pause
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    onClick={handleStop}
                    disabled={loading !== null}
                    variant="destructive"
                    className="rounded-xl h-11 px-5"
                  >
                    {loading === 'stop' ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Square className="h-4 w-4 mr-2" />
                    )}
                    Stop
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    onClick={handleResume}
                    disabled={loading !== null}
                    className="rounded-lg h-10 px-5 bg-primary text-primary-foreground shadow-sm"
                  >
                    {loading === 'resume' ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Resume
                  </Button>
                </motion.div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Select a ticket and start tracking your time</p>
              <div className="space-y-3">
                <Select
                  value={selectedTicket}
                  onValueChange={(v) => setSelectedTicket(v)}
                >
                  <SelectTrigger className="w-full h-11 rounded-xl bg-input/50">
                    <SelectValue placeholder="Select a ticket to work on..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tickets.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{t.ticketNumber}: {t.title}</span>
                          {t.projectName && (
                            <span className="text-xs text-muted-foreground shrink-0">— {t.projectCode || ''} {t.projectName}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are you working on? (optional)"
                  className="bg-input/50 rounded-xl"
                />
              </div>

              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={handleStart}
                  disabled={loading !== null || !selectedTicket}
                  className="w-full rounded-lg h-10 bg-primary text-primary-foreground shadow-sm"
                >
                  {loading === 'start' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Start Timer
                </Button>
              </motion.div>
            </div>
          )}
          
          {error && (
            <p className="text-sm text-destructive mt-4 text-center">{error}</p>
          )}
        </Card>
      </div>

      {/* Recent Time Entries */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Recent Entries</h2>
        
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {allTimeLogs
            .flatMap(t => t.logs.map(log => ({ ...log, ticketNumber: t.ticketNumber, ticketTitle: t.ticketTitle })))
            .filter(log => log.endTime)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 10)
            .map((log) => (
              <Card 
                key={log.id}
                className="p-4 bg-card/50 backdrop-blur-sm border-border/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-mono">{log.ticketNumber}</p>
                    <p className="text-sm font-medium text-foreground truncate">{log.ticketTitle}</p>
                    {(log as any).projectName && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                        <FolderKanban className="h-3 w-3 inline mr-0.5" />
                        {(log as any).projectCode ? `${(log as any).projectCode} — ` : ''}{(log as any).projectName}
                      </p>
                    )}
                    {log.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{stripHtml(log.description)}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-medium text-foreground">{Math.floor((log.durationMinutes || 0) / 60)}h {(log.durationMinutes || 0) % 60}m</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(log.startTime), 'MMM d')}</p>
                  </div>
                </div>
              </Card>
            ))}
          
          {allTimeLogs.flatMap(t => t.logs).filter(log => log.endTime).length === 0 && (
            <Card className="p-6 bg-card/50 backdrop-blur-sm border-border/50 text-center">
              <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No time entries yet</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
