'use client'

import { useState, useTransition, useCallback } from 'react'
import { getUsersPaginated, createUser, updateUserRole, deleteUser, resetUserPassword, toggleUserBanned, updateUserTeamsNotifications } from '@/app/actions/admin'
import type { UserListResult, UserListFilters, UserRoleCounts } from '@/app/actions/admin'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { PasswordField } from '@/components/ui/password-field'
import { User, Loader2, Shield, UserPlus, Trash2, KeyRound, UserX, UserCheck, MoreHorizontal, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ArrowUpDown, MessageSquare } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { UserRole } from '@/lib/types'
import { USER_ROLE_CONFIG } from '@/lib/types'


interface UserData { id: string; name: string; email: string; role: string; banned: boolean; enableTeamsNotifications: boolean; createdAt: Date }
interface Props { initialData: UserListResult; roleCounts: UserRoleCounts; currentUserId: string }

const ROLES: { value: UserRole | 'all'; label: string }[] = [
  { value: 'all', label: 'All Roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'developer', label: 'Developer' },
  { value: 'client', label: 'Client' },
]

type SortField = 'createdAt' | 'name' | 'email' | 'role'
type SortDir = 'asc' | 'desc'

function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as unknown as T
}


function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'client' as UserRole })
  const [error, setError] = useState<string | null>(null)
  const handleCreate = () => {
    setError(null)
    startTransition(async () => {
      try { await createUser(form); setForm({ name: '', email: '', password: '', role: 'client' }); onClose() }
      catch (err) { setError(err instanceof Error ? err.message : 'Failed to create user') }
    })
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create New User</DialogTitle>
          <DialogDescription className="text-muted-foreground">The user will be able to sign in immediately with these credentials.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div><Label>Full Name</Label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" className="bg-input/50 border-border/50" /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" className="bg-input/50 border-border/50" /></div>
          <PasswordField value={form.password} onChange={(v) => setForm(f => ({ ...f, password: v }))} label="Password" placeholder="Min. 8 characters" autoGenerate={false} showValidation={false} />
          <div>
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v as UserRole }))}>
              <SelectTrigger className="bg-input/50 border-border/50"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.filter(r => r.value !== 'all').map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={handleCreate} disabled={pending || !form.name || !form.email || !form.password}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


function ResetPasswordDialog({ user: targetUser, onClose }: { user: UserData | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState(false)
  const handleReset = () => {
    if (!targetUser) return; setError(null)
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    startTransition(async () => {
      try { await resetUserPassword(targetUser.id, password); setSuccess(true); setTimeout(() => { setSuccess(false); onClose() }, 1500) }
      catch (err) { setError(err instanceof Error ? err.message : 'Failed to reset password') }
    })
  }
  return (
    <Dialog open={!!targetUser} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Reset Password</DialogTitle>
          <DialogDescription className="text-muted-foreground">Set a new password for <span className="font-medium text-foreground">{targetUser?.name}</span>.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <PasswordField value={password} onChange={setPassword} label="New Password" placeholder="Min. 8 characters" autoGenerate={true} showValidation={true} />
          <div><Label>Confirm Password</Label><Input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" className="bg-input/50 border-border/50" /></div>
          {error && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{error}</p>}
          {success && <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">Password reset successfully.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={handleReset} disabled={pending || !password}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reset Password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


function SortHeader({ field, currentSort, currentDir, onSort, children }: {
  field: SortField; currentSort: SortField; currentDir: SortDir; onSort: (f: SortField) => void; children: React.ReactNode
}) {
  const isActive = currentSort === field
  return (
    <TableHead className="text-muted-foreground cursor-pointer select-none" onClick={() => onSort(field)}>
      <div className="flex items-center gap-1 hover:text-foreground transition-colors">
        {children}
        {isActive ? (currentDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </div>
    </TableHead>
  )
}


export default function UserManagementTablePaginated({ initialData, roleCounts, currentUserId }: Props) {
  const [pending, startTransition] = useTransition()
  const [data, setData] = useState<UserListResult>(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState(''); const [roleFilter, setRoleFilter] = useState('all')
  const [page, setPage] = useState(initialData.page); const [sortBy, setSortBy] = useState<SortField>('createdAt'); const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showCreate, setShowCreate] = useState(false); const [resetTarget, setResetTarget] = useState<UserData | null>(null); const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null); const [rowError, setRowError] = useState<Record<string, string>>({})

  const fetchData = useCallback(async (filters: UserListFilters) => {
    setIsLoading(true)
    try { const r = await getUsersPaginated(filters); setData(r) } catch (err) { console.error('Failed to fetch users:', err) } finally { setIsLoading(false) }
  }, [])

  const debouncedSearch = useCallback(debounce(async (term: string, role: string, sb: SortField, sd: SortDir, p: number) => {
    await fetchData({ search: term || undefined, role: role !== 'all' ? role : undefined, sortBy: sb, sortDir: sd, page: p, pageSize: 50 })
  }, 300), [fetchData])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value; setSearch(term); setPage(1); debouncedSearch(term, roleFilter, sortBy, sortDir, 1)
  }


  const handleRoleChange = (newRole: string) => { setRoleFilter(newRole); setPage(1); fetchData({ search: search || undefined, role: newRole !== 'all' ? newRole : undefined, sortBy, sortDir, page: 1, pageSize: 50 }) }

  const handleSort = (field: SortField) => {
    const newDir = sortBy === field && sortDir === 'asc' ? 'desc' : 'asc'
    setSortBy(field); setSortDir(newDir); setPage(1)
    fetchData({ search: search || undefined, role: roleFilter !== 'all' ? roleFilter : undefined, sortBy: field, sortDir: newDir, page: 1, pageSize: 50 })
  }

  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > data.totalPages) return; setPage(newPage)
    fetchData({ search: search || undefined, role: roleFilter !== 'all' ? roleFilter : undefined, sortBy, sortDir, page: newPage, pageSize: 50 })
  }

  const runAction = async (userId: string, fn: () => Promise<void>) => {
    setLoadingId(userId); setRowError(prev => ({ ...prev, [userId]: '' }))
    try { await fn() } catch (err) { setRowError(prev => ({ ...prev, [userId]: err instanceof Error ? err.message : 'Action failed' })) } finally { setLoadingId(null) }
  }

  const handleRoleChangeAction = (userId: string, newRole: UserRole) => runAction(userId, () => updateUserRole(userId, newRole))
  const handleToggleBanned = (u: UserData) => runAction(u.id, async () => { await toggleUserBanned(u.id) })

  const handleTeamsChange = (userId: string, enabled: boolean) => runAction(userId, async () => {
    await updateUserTeamsNotifications(userId, enabled)
    setData(prev => ({ ...prev, users: prev.users.map(u => u.id === userId ? { ...u, enableTeamsNotifications: enabled } : u) }))
  })

  const handleDelete = () => {
    if (!deleteTarget) return
    startTransition(async () => {
      try { await deleteUser(deleteTarget.id); fetchData({ search: search || undefined, role: roleFilter !== 'all' ? roleFilter : undefined, sortBy, sortDir, page, pageSize: 50 }) }
      catch (err) { setRowError(prev => ({ ...prev, [deleteTarget.id]: err instanceof Error ? err.message : 'Failed to delete' })) } finally { setDeleteTarget(null) }
    })
  }

  const handleCreateClose = () => { setShowCreate(false); fetchData({ search: search || undefined, role: roleFilter !== 'all' ? roleFilter : undefined, sortBy, sortDir, page: 1, pageSize: 50 }); setPage(1) }

  const ps = data.pageSize

  return (
    <>
      <div data-tour="users-table-toolbar" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="font-medium">{data.total} users total</span>
          <span className="hidden sm:inline text-border">|</span>
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-xs"><span className="font-medium text-amber-400">{roleCounts.admins}</span> admins</span>
            <span className="text-xs"><span className="font-medium text-indigo-400">{roleCounts.project_managers}</span> managers</span>
            <span className="text-xs"><span className="font-medium text-green-400">{roleCounts.developers}</span> developers</span>
            <span className="text-xs"><span className="font-medium text-blue-400">{roleCounts.clients}</span> clients</span>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><UserPlus className="h-4 w-4 mr-2" /> Create User</Button>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={handleSearchChange} placeholder="Search by name or email..." className="pl-9 bg-input/50 border-border/50 h-9" />
        </div>
        <Select value={roleFilter} onValueChange={handleRoleChange}>
          <SelectTrigger className="w-full sm:w-44 bg-input/50 border-border/50 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>


      <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <SortHeader field="name" currentSort={sortBy} currentDir={sortDir} onSort={handleSort}>User</SortHeader>
              <SortHeader field="email" currentSort={sortBy} currentDir={sortDir} onSort={handleSort}>Email</SortHeader>
              <SortHeader field="role" currentSort={sortBy} currentDir={sortDir} onSort={handleSort}>Role</SortHeader>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">
                <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />Teams</span>
              </TableHead>
              <SortHeader field="createdAt" currentSort={sortBy} currentDir={sortDir} onSort={handleSort}>Joined</SortHeader>
              <TableHead className="text-muted-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && data.users.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : data.users.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">{search || roleFilter !== 'all' ? 'No users match your search criteria.' : 'No users found.'}</TableCell></TableRow>
            ) : data.users.map(u => {
              const rc = USER_ROLE_CONFIG[u.role as UserRole]
              const isCU = u.id === currentUserId; const isLR = loadingId === u.id
              return (
                <TableRow key={u.id} className={cn('border-border/50', u.banned && 'opacity-60', isLR && 'animate-pulse')}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        {isLR ? <Loader2 className="h-4 w-4 text-primary animate-spin" /> : <User className="h-4 w-4 text-primary" />}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{u.name}{isCU && <span className="text-xs text-muted-foreground ml-1">(You)</span>}</p>
                        {rowError[u.id] && <p className="text-xs text-destructive mt-0.5">{rowError[u.id]}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">{u.email}</TableCell>
                  <TableCell>
                    {isCU ? <Badge variant="outline" className={cn('text-xs', rc?.color)}>{rc?.label || u.role}</Badge> : (
                      <Select value={u.role} onValueChange={(v) => handleRoleChangeAction(u.id, v as UserRole)} disabled={isLR || u.banned}>
                        <SelectTrigger className="w-40 bg-input/50 border-border/50 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.filter(r => r.value !== 'all').map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={cn('text-xs', u.banned ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')}>{u.banned ? 'Deactivated' : 'Active'}</Badge></TableCell>
                  {/* Teams notification preference — applies to customer (client) accounts */}
                  <TableCell>
                    {u.role === 'client' ? (
                      <div className="flex items-center gap-2" title={u.enableTeamsNotifications ? 'Teams notifications enabled — toggle to disable' : 'Teams notifications disabled — toggle to enable'}>
                        <Switch
                          checked={u.enableTeamsNotifications}
                          onCheckedChange={(v) => handleTeamsChange(u.id, v)}
                          disabled={isLR || u.banned}
                          aria-label={`Toggle Teams notifications for ${u.name}`}
                        />
                        <span className={cn('text-xs font-medium whitespace-nowrap', u.enableTeamsNotifications ? 'text-emerald-400' : 'text-muted-foreground')}>
                          {u.enableTeamsNotifications ? '✅ Enabled' : '❌ Disabled'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground" title="Teams preference applies to customer (client) accounts">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{format(new Date(u.createdAt), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">
                    {isCU ? <span className="text-xs text-muted-foreground flex items-center justify-end gap-1"><Shield className="h-3 w-3" />Your account</span> : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Actions</span></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border/50">
                          <DropdownMenuItem onClick={() => setResetTarget(u)} className="gap-2 cursor-pointer"><KeyRound className="h-4 w-4" />Reset Password</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleBanned(u)} className="gap-2 cursor-pointer">
                            {u.banned ? <><UserCheck className="h-4 w-4 text-emerald-400" /><span className="text-emerald-400">Activate</span></> : <><UserX className="h-4 w-4 text-amber-400" /><span className="text-amber-400">Deactivate</span></>}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border/50" />
                          <DropdownMenuItem onClick={() => setDeleteTarget(u)} className="gap-2 cursor-pointer text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" />Delete User</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>


      {data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">Showing {(page - 1) * ps + 1}–{Math.min(page * ps, data.total)} of {data.total}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => goToPage(page - 1)} disabled={page <= 1 || isLoading} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex items-center gap-1">{Array.from({ length: Math.min(data.totalPages, 7) }, (_, i) => {
              let pn: number
              if (data.totalPages <= 7) pn = i + 1
              else if (page <= 4) pn = i + 1
              else if (page >= data.totalPages - 3) pn = data.totalPages - 6 + i
              else pn = page - 3 + i
              return <Button key={pn} variant={pn === page ? 'default' : 'outline'} size="sm" onClick={() => goToPage(pn)} disabled={isLoading} className={cn('h-8 w-8 p-0 text-xs', pn === page && 'pointer-events-none')}>{pn}</Button>
            })}</div>
            <Button variant="outline" size="sm" onClick={() => goToPage(page + 1)} disabled={page >= data.totalPages || isLoading} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
      <CreateUserDialog open={showCreate} onClose={handleCreateClose} />
      <ResetPasswordDialog user={resetTarget} onClose={() => setResetTarget(null)} />
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete User</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">Are you sure you want to permanently delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/50">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={pending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

