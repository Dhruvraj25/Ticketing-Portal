'use client'

import { useState, useMemo, useEffect, useCallback, useTransition } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import {
  Plus,
  Search,
  Users,
  User,
  Ticket,
  TrendingUp,
  Clock,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit3,
  Activity,
  UserX,
  MoreHorizontal,
  Briefcase,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { PasswordField } from '@/components/ui/password-field'
import { StatCard } from '@/components/dashboard/stat-card'
import { CurrentDate } from '@/components/dashboard/page-header'
import { USER_ROLE_CONFIG } from '@/lib/types'
import { resetUserPassword } from '@/app/actions/admin'
import { KeyRound, Loader2 } from 'lucide-react'

interface Developer {
  id: string
  name: string
  email: string
  activeTickets: number
}

interface TeamClientProps {
  developers: Developer[]
  devProjectsMap: Record<string, { id: number; projectName: string; projectCode: string }[]>
  /** Whether the signed-in user is an Admin — only admins see "Add Member". */
  isAdmin: boolean
}

const ITEMS_PER_PAGE = 10

/**
 * Reset-password dialog shown to Admins and Project Managers on the Team page.
 * Backend authorization (resetUserPassword in actions/admin.ts) enforces that
 * managers may only reset developers/clients on projects they manage.
 */
function TeamResetPasswordDialog({ developer, onClose }: { developer: Developer | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleReset = () => {
    if (!developer) return
    setError(null)
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    startTransition(async () => {
      try {
        await resetUserPassword(developer.id, password)
        setSuccess(true)
        setTimeout(() => { setSuccess(false); onClose() }, 1500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reset password')
      }
    })
  }

  return (
    <Dialog open={!!developer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Reset Password</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Set a new password for <span className="font-medium text-foreground">{developer?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <PasswordField value={password} onChange={setPassword} label="New Password" placeholder="Min. 8 characters" autoGenerate={true} showValidation={true} />
          <div>
            <Label>Confirm Password</Label>
            <Input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" className="bg-input/50 border-border/50" />
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{error}</p>}
          {success && <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">Password reset successfully.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={handleReset} disabled={pending || !password}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reset Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TeamClient({ developers, devProjectsMap, isAdmin }: TeamClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState<'name' | 'tickets' | 'joined'>('tickets')
  const [resetTarget, setResetTarget] = useState<Developer | null>(null)

  // Stats
  const stats = useMemo(() => {
    const total = developers.length
    const active = developers.filter(d => d.activeTickets > 0).length
    const onLeave = 0 // No field yet
    const avgWorkload = total > 0
      ? Math.round((developers.reduce((s, d) => s + d.activeTickets, 0) / total) * 10) / 10
      : 0
    return { total, active, onLeave, avgWorkload }
  }, [developers])

  // Max workload for percentage
  const maxWorkload = useMemo(() => {
    if (developers.length === 0) return 1
    return Math.max(...developers.map(d => d.activeTickets), 1)
  }, [developers])

  // Filtered developers
  const filteredDevs = useMemo(() => {
    let result = developers

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q)
      )
    }

    if (statusFilter === 'active') {
      result = result.filter(d => d.activeTickets > 0 || d.activeTickets > 0)
    } else if (statusFilter === 'inactive') {
      result = result.filter(d => d.activeTickets === 0)
    }

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'joined') return 0
      return b.activeTickets - a.activeTickets
    })

    return result
  }, [developers, searchQuery, statusFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filteredDevs.length / ITEMS_PER_PAGE))
  const paginatedDevs = filteredDevs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )

  const hasFilters = searchQuery

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setCurrentPage(1)
  }, [])

  const goToPrevPage = useCallback(() => setCurrentPage((p) => Math.max(1, p - 1)), [])
  const goToNextPage = useCallback(() => setCurrentPage((p) => Math.min(totalPages, p + 1)), [totalPages])
  const goToPage = useCallback((p: number) => setCurrentPage(p), [])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1)
  }, [filteredDevs.length, totalPages])

  return (
    <div className="space-y-6">
      {/* Header — single clean card */}
      <motion.div
        data-tour="team-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm"
      >
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PageHeaderIcon variant="purple">
              <Users className="h-5 w-5" />
            </PageHeaderIcon>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Team Overview</h1>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                <span className="text-amber-500/80 dark:text-amber-400/80">✨</span>
                Monitor your development team&apos;s workload
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <CurrentDate />
            {/* "Add Member" is an admin-only action — hidden for project managers */}
            {isAdmin && (
              <Button asChild className="rounded-xl font-mono font-bold text-xs h-9 shadow-sm">
                <Link href="/dashboard/admin/users">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add Member
                </Link>
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        data-tour="team-kpis"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        <StatCard title="Total Members" value={stats.total} iconName="Users" delay={0} />
        <StatCard title="Active Members" value={stats.active} iconName="Briefcase" delay={1} />
        <StatCard title="On Leave" value={stats.onLeave} iconName="Clock" delay={2} />
        <StatCard title="Avg Workload" value={stats.avgWorkload} iconName="BarChart3" delay={3} />
      </motion.div>

      {/* Search & Filters */}
      <motion.div
        data-tour="team-search-filters"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm"
      >
        <div className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                placeholder="Search members by name or email..."
                className="pl-9 h-10 rounded-xl bg-muted/30 border-border/50 text-sm"
              />
            </div>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-[140px] h-10 rounded-xl bg-muted/20 border-border/50 text-sm">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tickets">Most Tickets</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="joined">Recent Join</SelectItem>
              </SelectContent>
            </Select>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                hasFilters
                  ? 'bg-primary/5 border-primary/30 text-primary'
                  : 'bg-white dark:bg-slate-900 border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {hasFilters && <span className="h-2 w-2 rounded-full bg-primary" />}
            </button>

            {hasFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 pt-4 mt-4 border-t border-border/50 flex-wrap">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">Filter by:</span>
                </div>

                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[140px] h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filteredDevs.length}</span>{' '}
          {filteredDevs.length === 1 ? 'member' : 'members'}
          {hasFilters && ' (filtered)'}
        </p>
      </div>

      {/* Team Table */}
      {filteredDevs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-white dark:bg-slate-900 border border-border p-12 text-center"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-2xl bg-muted/30">
              <Users className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <p className="font-semibold text-foreground text-lg">
              {hasFilters ? 'No members match your filters' : 'No team members yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'Try adjusting your search or filter criteria.'
                : 'Add developers to your team to get started.'}
            </p>
          </div>
        </motion.div>
      ) : (
        <div data-tour="team-table" className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Active Tickets</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Workload</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedDevs.map((dev, i) => {
                const workloadPct = Math.round((dev.activeTickets / maxWorkload) * 100)
                const devProjects = devProjectsMap[dev.id] || []
                return (
                  <TableRow key={dev.id} className="group hover:bg-muted/20 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-white">
                            {dev.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </span>
                        </div>
                        <span className="font-medium text-foreground text-sm truncate max-w-[150px]">{dev.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground truncate max-w-[180px] block">{dev.email}</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30">
                        Developer
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Active
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm font-bold text-foreground">{dev.activeTickets}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${workloadPct}%` }}
                            transition={{ duration: 0.6, delay: i * 0.05 }}
                            className={cn(
                              'h-full rounded-full',
                              workloadPct > 80 ? 'bg-red-500' : workloadPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                            )}
                          />
                        </div>
                        <span className="text-xs font-semibold text-foreground w-8 text-right">
                          {workloadPct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        —
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/tickets?assignedToId=${dev.id}`} className="cursor-pointer flex items-center">
                              <Eye className="mr-2 h-4 w-4" />
                              View Profile
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/admin/users`} className="cursor-pointer flex items-center">
                              <Edit3 className="mr-2 h-4 w-4" />
                              Edit Member
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/tickets?assignedToId=${dev.id}`} className="cursor-pointer flex items-center">
                              <Ticket className="mr-2 h-4 w-4" />
                              Assign Tickets
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/resources`} className="cursor-pointer flex items-center">
                              <Activity className="mr-2 h-4 w-4" />
                              View Performance
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setResetTarget(dev)} className="gap-2 cursor-pointer">
                            <KeyRound className="h-4 w-4" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive cursor-pointer flex items-center">
                            <UserX className="mr-2 h-4 w-4" />
                            Deactivate Member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div data-tour="team-pagination" className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToPrevPage} disabled={currentPage === 1} className="rounded-lg">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, idx, arr) => {
                const showEllipsis = idx > 0 && p - arr[idx - 1] > 1
                return (
                  <span key={p} className="flex items-center">
                    {showEllipsis && <span className="px-1 text-muted-foreground">...</span>}
                    <button
                      onClick={() => goToPage(p)}
                      className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                )
              })}
            <Button variant="outline" size="sm" onClick={goToNextPage} disabled={currentPage === totalPages} className="rounded-lg">
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <TeamResetPasswordDialog developer={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  )
}
