'use client'

import { memo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Plus,
  BarChart3,
  FileText,
  TrendingUp,
  Clock,
  Activity,
  Users,
  ArrowRight,
} from 'lucide-react'

interface TicketRightPanelProps {
  userRole: 'client' | 'developer' | 'project_manager' | 'admin'
}

export const TicketRightPanel = memo(function TicketRightPanel({ userRole }: TicketRightPanelProps) {
  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <div data-tour="tickets-quick-actions" className="bg-white dark:bg-slate-900 border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Activity className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Quick Actions</h3>
        </div>
        <div className="space-y-2">
          {userRole === 'client' && (
            <Link href="/dashboard/tickets/new">
              <Button size="sm" className="w-full justify-start rounded-lg text-xs h-9">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Ticket
              </Button>
            </Link>
          )}

          {(userRole === 'project_manager' || userRole === 'admin') && (
            <>
              <Link href="/dashboard/assignments">
                <Button size="sm" variant="outline" className="w-full justify-start rounded-lg text-xs h-9">
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  Assignments
                </Button>
              </Link>
              <Link href="/dashboard/reports/view">
                <Button size="sm" variant="outline" className="w-full justify-start rounded-lg text-xs h-9">
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  Reports
                </Button>
              </Link>
            </>
          )}
          {userRole === 'developer' && (
            <Link href="/dashboard/time-tracking">
              <Button size="sm" variant="outline" className="w-full justify-start rounded-lg text-xs h-9">
                <Clock className="mr-1.5 h-3.5 w-3.5" />
                Time Tracking
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Analytics Mini Widget */}
      <div data-tour="tickets-analytics-widget" className="bg-white dark:bg-slate-900 border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/15">
            <BarChart3 className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
          </div>
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Analytics</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Resolution Rate</span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">87%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-[87%] rounded-full bg-emerald-500" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Avg. Response</span>
            <span className="text-xs font-semibold text-foreground">2.4h</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Satisfaction</span>
            <span className="text-xs font-semibold text-foreground">4.8/5</span>
          </div>
          <Link
            href="/dashboard/analytics"
            className="flex items-center justify-between pt-2 mt-1 border-t border-border/40 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <span className="font-medium">Full Analytics</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Recent Activity Mini */}
      <div data-tour="tickets-insights" className="bg-white dark:bg-slate-900 border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/15">
            <TrendingUp className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
          </div>
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Insights</h3>
        </div>
        <div className="space-y-2.5">
          <div className="flex items-start gap-2">
            <div className="h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-foreground font-medium">5 tickets resolved today</p>
              <p className="text-[11px] text-muted-foreground">Above average performance</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="h-5 w-5 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
            </div>
            <div>
              <p className="text-xs text-foreground font-medium">2 tickets awaiting response</p>
              <p className="text-[11px] text-muted-foreground">Client feedback needed</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
            </div>
            <div>
              <p className="text-xs text-foreground font-medium">3 tickets in progress</p>
              <p className="text-[11px] text-muted-foreground">Being worked on now</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
})