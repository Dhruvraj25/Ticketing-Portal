'use client'

import { useEffect, useState } from 'react'
import { getProjectDetailAnalytics, getModuleAnalytics } from '@/app/actions/projects'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Layers, Users, User, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TICKET_STATUS_CONFIG } from '@/lib/types'
import { StatCard } from '@/components/dashboard/stat-card'

interface ProjectAnalyticsSectionProps {
  projectId: number
  /**
   * Optional pre-fetched analytics data from the server component.
   * When provided, skips the client-side loading state for instant rendering.
   */
  initialAnalytics?: any
  /**
   * Optional pre-fetched module analytics data from the server component.
   * When provided alongside initialAnalytics, renders immediately with no loading.
   */
  initialModuleData?: any[]
}

function fmtMins(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min}m`
  if (min === 0) return `${h}h`
  return `${h}h ${min}m`
}

export function ProjectAnalyticsSection({ projectId, initialAnalytics, initialModuleData }: ProjectAnalyticsSectionProps) {
  const [analytics, setAnalytics] = useState<any>(initialAnalytics || null)
  const [moduleData, setModuleData] = useState<any[]>(initialModuleData || [])
  const [loading, setLoading] = useState(!initialAnalytics)

  useEffect(() => {
    // If pre-fetched data was provided, skip client-side fetch
    if (initialAnalytics && initialModuleData) return

    async function load() {
      try {
        const [detail, modules] = await Promise.all([
          getProjectDetailAnalytics(projectId),
          getModuleAnalytics(projectId),
        ])
        setAnalytics(detail)
        setModuleData(modules)
      } catch {
        // Silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId, initialAnalytics, initialModuleData])

  if (loading) {
    return (
      <Card className="p-6 bg-card/50 backdrop-blur-sm border-border/50">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  if (!analytics) return null

  const maxDevMinutes = Math.max(...analytics.developerContributions.map((c: any) => c.totalMinutes), 1)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Hours"
          value={`${analytics.totalHours}h`}
          iconName="Timer"
          delay={0}
        />
        <StatCard
          title="Total Tickets"
          value={analytics.totalTickets}
          iconName="Ticket"
          delay={1}
        />
        <StatCard
          title="Developer Hours"
          value={`${analytics.developerHours}h`}
          iconName="Users"
          delay={2}
        />
        <StatCard
          title="Manager Hours"
          value={`${analytics.managerHours}h`}
          iconName="Briefcase"
          delay={3}
        />
      </div>

      {/* Ticket Status Breakdown */}
      <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Ticket Status Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(analytics.ticketStatusMap).map(([status, count]) => (
            <div key={status} className="p-3 rounded-lg bg-muted/20 border border-border/30">
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs px-1.5 py-0',
                    TICKET_STATUS_CONFIG[status as keyof typeof TICKET_STATUS_CONFIG]?.color,
                  )}
                >
                  {TICKET_STATUS_CONFIG[status as keyof typeof TICKET_STATUS_CONFIG]?.label || status}
                </Badge>
              </div>
              <p className="text-lg font-bold text-foreground">{String(count)}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Module Statistics */}
      {moduleData.length > 0 && (
        <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            Module Statistics
          </h3>
          <div className="space-y-3">
            {moduleData.map((mod) => (
              <div
                key={mod.moduleId}
                className="p-3 rounded-lg bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium text-foreground text-sm">{mod.moduleName}</span>
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {mod.status}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Tickets</span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {mod.ticketCount}
                      {mod.resolvedCount > 0 && (
                        <span className="text-emerald-400 text-xs ml-1">
                          ({mod.resolvedCount} resolved)
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Hours</span>
                    <p className="font-semibold text-foreground mt-0.5">{mod.totalHours}h</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Resolution</span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {mod.avgResolutionHours > 0 ? `${mod.avgResolutionHours}h` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Developer Contribution */}
      {analytics.developerContributions.length > 0 && (
        <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Team Contribution
          </h3>
          <div className="space-y-3">
            {analytics.developerContributions.map((dev: any) => {
              const pct = (dev.totalMinutes / maxDevMinutes) * 100
              const isDev = dev.role === 'developer'
              return (
                <div key={dev.userId}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'h-6 w-6 rounded-full flex items-center justify-center',
                          isDev ? 'bg-emerald-500/20' : 'bg-purple-500/20',
                        )}
                      >
                        <User
                          className={cn(
                            'h-3 w-3',
                            isDev ? 'text-emerald-400' : 'text-purple-400',
                          )}
                        />
                      </div>
                      <span className="text-foreground font-medium">{dev.userName}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          isDev
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-purple-500/20 text-purple-400 border-purple-500/30',
                        )}
                      >
                        {dev.role === 'project_manager' ? 'Manager' : dev.role === 'admin' ? 'Admin' : 'Developer'}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {fmtMins(dev.totalMinutes)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        isDev ? 'bg-emerald-500' : 'bg-purple-500',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
