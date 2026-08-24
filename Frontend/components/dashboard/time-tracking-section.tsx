'use client'

import { format } from 'date-fns'
import { Card } from '@/components/ui/card'
import { stripHtml } from '@/lib/format'
import { Clock, User } from 'lucide-react'
import type { TimeLogWithUser } from '@/lib/types'

interface TimeTrackingSectionProps {
  ticketId: number
  timeLogs: TimeLogWithUser[]
}

export function TimeTrackingSection({ ticketId, timeLogs }: TimeTrackingSectionProps) {
  const totalMinutes = timeLogs
    .filter(log => log.durationMinutes)
    .reduce((sum, log) => sum + (log.durationMinutes || 0), 0)

  return (
    <Card data-tour="ticket-time-tracking" className="p-5 bg-white dark:bg-slate-900 border-border/50">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Time Tracking</h3>
      </div>

      {/* Time Summary */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 mb-4">
        <span className="text-sm font-medium text-foreground">Total Time Logged</span>
        <span className="text-lg font-bold text-primary">
          {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
        </span>
      </div>

      {/* Time Logs */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground mb-2">Recent Logs</h4>
        {timeLogs.filter(log => log.endTime).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">No time entries yet</p>
        ) : (
          timeLogs
            .filter(log => log.endTime)
            .slice(0, 5)
            .map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <User className="h-3 w-3 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-foreground">{log.userName}</p>
                    {log.description && (
                      <p className="text-xs text-muted-foreground truncate">{stripHtml(log.description)}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="font-medium text-foreground">
                    {Math.floor((log.durationMinutes || 0) / 60)}h {(log.durationMinutes || 0) % 60}m
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(log.startTime), 'MMM d')}
                  </p>
                </div>
              </div>
            ))
        )}
      </div>
    </Card>
  )
}
