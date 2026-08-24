'use client'

import { useEffect, useState, useCallback } from 'react'
import { getProjectTicketStats } from '@/app/actions/projects'
import { Loader2 } from 'lucide-react'
import { StatCard } from '@/components/dashboard/stat-card'

interface ProjectStatsProps {
  projectId: number
}

interface Stats {
  total: number
  open: number
  assigned: number
  inProgress: number
  resolved: number
  closed: number
  reopened: number
}

export function ProjectStats({ projectId }: ProjectStatsProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      // Single optimized query — returns aggregated counts only
      const result = await getProjectTicketStats(projectId)
      setStats(result)
    } catch {
      // Silent
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  if (loading) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-border/60 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Ticket Statistics</h3>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-4">Ticket Statistics</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          title="Total Tickets"
          value={stats.total}
          iconName="Ticket"
          delay={0}
        />
        <StatCard
          title="Open"
          value={stats.open}
          iconName="AlertCircle"
          delay={1}
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress}
          iconName="Clock"
          delay={2}
        />
        <StatCard
          title="Resolved"
          value={stats.resolved}
          iconName="CheckCircle2"
          delay={3}
        />
        <StatCard
          title="Closed"
          value={stats.closed}
          iconName="CheckCircle2"
          delay={4}
        />
      </div>
    </div>
  )
}
