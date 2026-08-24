'use client'

import { useState, useTransition } from 'react'
import {
  createUser,
  updateUserRole,
  deleteUser,
  resetUserPassword,
  toggleUserBanned,
} from '@/app/actions/admin'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { PasswordField } from '@/components/ui/password-field'
import {
  User,
  Loader2,
  Shield,
  UserPlus,
  Trash2,
  KeyRound,
  UserX,
  UserCheck,
  MoreHorizontal,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UserRole } from '@/lib/types'
import { USER_ROLE_CONFIG } from '@/lib/types'

interface UserData {
  id: string
  name: string
  email: string
  role: string
  banned: boolean
  createdAt: Date
}

interface UserManagementTableProps {
  users: UserData[]
  currentUserId: string
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'developer', label: 'Developer' },
  { value: 'client', label: 'Client' },
]

// ---------------------------------------------------------------------------
// Create User Dialog
// ---------------------------------------------------------------------------
function CreateUserDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'client' as UserRole })
  const [error, setError] = useState<string | null>(null)

  const handleCreate = () => {
    setError(null)
    startTransition(async () => {
      try {
        await createUser(form)
        setForm({ name: '', email: '', password: '', role: 'client' })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create user')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create New User</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            The user will be able to sign in immediately with these credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label className="text-foreground">Full Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Jane Smith"
              className="bg-input/50 border-border/50"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-foreground">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@company.com"
              className="bg-input/50 border-border/50"
            />
          </div>
          <PasswordField
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            label="Password"
            placeholder="Min. 8 characters"
            autoGenerate={false}
            showValidation={false}
          />
          <div className="flex flex-col gap-2">
            <Label className="text-foreground">Role</Label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}
            >
              <SelectTrigger className="bg-input/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={pending || !form.name || !form.email || !form.password}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Reset Password Dialog
// ---------------------------------------------------------------------------
function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: UserData | null
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleReset = () => {
    if (!user) return
    setError(null)
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }

    startTransition(async () => {
      try {
        await resetUserPassword(user.id, password)
        setSuccess(true)
        setTimeout(() => { setSuccess(false); onClose() }, 1500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reset password')
      }
    })
  }

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Reset Password</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Set a new password for <span className="font-medium text-foreground">{user?.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <PasswordField
            value={password}
            onChange={setPassword}
            label="New Password"
            placeholder="Min. 8 characters"
            autoGenerate={true}
            showValidation={true}
          />
          <div className="flex flex-col gap-2">
            <Label className="text-foreground">Confirm Password</Label>
            <Input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              className="bg-input/50 border-border/50"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
              Password reset successfully.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleReset} disabled={pending || !password}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reset Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Table
// ---------------------------------------------------------------------------
export function UserManagementTable({ users, currentUserId }: UserManagementTableProps) {
  const [pending, startTransition] = useTransition()

  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserData | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  const runAction = async (userId: string, fn: () => Promise<void>) => {
    setLoadingId(userId)
    setRowError((prev) => ({ ...prev, [userId]: '' }))
    try {
      await fn()
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [userId]: err instanceof Error ? err.message : 'Action failed',
      }))
    } finally {
      setLoadingId(null)
    }
  }

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    runAction(userId, () => updateUserRole(userId, newRole))
  }

  const handleToggleBanned = (u: UserData) => {
    runAction(u.id, async () => { await toggleUserBanned(u.id) })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    startTransition(async () => {
      try {
        await deleteUser(deleteTarget.id)
      } catch (err) {
        setRowError((prev) => ({
          ...prev,
          [deleteTarget.id]: err instanceof Error ? err.message : 'Failed to delete',
        }))
      } finally {
        setDeleteTarget(null)
      }
    })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">{users.length} users total</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground">User</TableHead>
              <TableHead className="text-muted-foreground">Email</TableHead>
              <TableHead className="text-muted-foreground">Role</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Joined</TableHead>
              <TableHead className="text-muted-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const roleConfig = USER_ROLE_CONFIG[u.role as UserRole]
              const isCurrentUser = u.id === currentUserId
              const isLoading = loadingId === u.id

              return (
                <TableRow
                  key={u.id}
                  className={cn(
                    'border-border/50',
                    u.banned && 'opacity-60',
                  )}
                >
                  {/* User */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 text-primary animate-spin" />
                        ) : (
                          <User className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{u.name}</p>
                        {isCurrentUser && (
                          <span className="text-xs text-muted-foreground">(You)</span>
                        )}
                        {rowError[u.id] && (
                          <p className="text-xs text-destructive mt-0.5">{rowError[u.id]}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Email */}
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>

                  {/* Role selector */}
                  <TableCell>
                    {isCurrentUser ? (
                      <Badge variant="outline" className={cn('text-xs', roleConfig?.color)}>
                        {roleConfig?.label || u.role}
                      </Badge>
                    ) : (
                      <Select
                        value={u.role}
                        onValueChange={(v) => handleRoleChange(u.id, v as UserRole)}
                        disabled={isLoading || u.banned}
                      >
                        <SelectTrigger className="w-40 bg-input/50 border-border/50 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>

                  {/* Active/Banned badge */}
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        u.banned
                          ? 'bg-destructive/10 text-destructive border-destructive/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                      )}
                    >
                      {u.banned ? 'Deactivated' : 'Active'}
                    </Badge>
                  </TableCell>

                  {/* Joined date */}
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(u.createdAt), 'MMM d, yyyy')}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    {isCurrentUser ? (
                      <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                        <Shield className="h-3 w-3" />
                        Your account
                      </span>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border/50">
                          <DropdownMenuItem
                            onClick={() => setResetTarget(u)}
                            className="gap-2 cursor-pointer"
                          >
                            <KeyRound className="h-4 w-4" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleBanned(u)}
                            className="gap-2 cursor-pointer"
                          >
                            {u.banned ? (
                              <>
                                <UserCheck className="h-4 w-4 text-emerald-400" />
                                <span className="text-emerald-400">Activate</span>
                              </>
                            ) : (
                              <>
                                <UserX className="h-4 w-4 text-amber-400" />
                                <span className="text-amber-400">Deactivate</span>
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border/50" />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(u)}
                            className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete User
                          </DropdownMenuItem>
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

      {/* Create user dialog */}
      <CreateUserDialog open={showCreate} onClose={() => setShowCreate(false)} />

      {/* Reset password dialog */}
      <ResetPasswordDialog user={resetTarget} onClose={() => setResetTarget(null)} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete User</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to permanently delete{' '}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This action
              cannot be undone and will remove all their sessions and account data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/50">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
