'use client'

import { useState } from 'react'
import { getProjectClientUsers, addUserToProject, removeUserFromProject, type ProjectClientUser } from '@/app/actions/projects'
import { toggleUserBanned } from '@/app/actions/admin'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, UserPlus, Users, ShieldCheck, User, UserMinus } from 'lucide-react'
import { USER_ROLE_CONFIG } from '@/lib/types'
import { format } from 'date-fns'

interface ProjectUsersSectionProps {
  projectId: number
  projectName: string
  initialUsers: ProjectClientUser[]
  /** Can add/remove project users (project_manager or admin). */
  canManage: boolean
  /** Can activate/deactivate accounts — mirrors toggleUserBanned's own admin-only gate. */
  canActivate: boolean
}

export function ProjectUsersSection({ projectId, projectName, initialUsers, canManage, canActivate }: ProjectUsersSectionProps) {
  const [users, setUsers] = useState<ProjectClientUser[]>(initialUsers)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [userType, setUserType] = useState<'approver' | 'standard'>('standard')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [removeTarget, setRemoveTarget] = useState<ProjectClientUser | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function refresh() {
    try {
      const list = await getProjectClientUsers(projectId)
      setUsers(list)
    } catch {
      // Keep the previous list rather than clearing it on a refresh failure.
    }
  }

  async function handleToggle(u: ProjectClientUser) {
    setBusyId(u.id)
    setError(null)
    try {
      await toggleUserBanned(u.id)
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, banned: !x.banned } : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the account status')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemove() {
    if (!removeTarget) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await removeUserFromProject(projectId, removeTarget.id)
      setUsers((prev) => prev.filter((x) => x.id !== removeTarget.id))
      setRemoveTarget(null)
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove this user from the project')
    } finally {
      setRemoving(false)
    }
  }

  async function handleAddUser() {
    setFormError(null)
    setSubmitting(true)
    try {
      await addUserToProject(projectId, {
        email,
        name: name.trim() || undefined,
        userType,
        password: password || undefined,
      })
      setDialogOpen(false)
      setEmail('')
      setName('')
      setPassword('')
      setUserType('standard')
      await refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add user')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Project Users</h3>
        <Badge variant="outline" className="ml-auto text-xs">{users.length}</Badge>
      </div>

      {error && (
        <div className="p-2 mb-3 rounded text-xs bg-destructive/10 border border-destructive/20 text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2 mb-4">
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">No users linked to this project yet</p>
        ) : (
          users.map((u) => (
            <div key={u.id} className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-sky-500/20 flex items-center justify-center shrink-0">
                    {u.userType === 'approver' ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
                    ) : (
                      <User className="h-3.5 w-3.5 text-sky-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                      {u.name}
                      {u.isPrimary && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Primary</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canActivate && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={busyId === u.id}
                      onClick={() => handleToggle(u)}
                    >
                      {busyId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : u.banned ? 'Activate' : 'Deactivate'}
                    </Button>
                  )}
                  {canManage && !u.isPrimary && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => { setRemoveTarget(u); setRemoveError(null) }}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">
                  {u.userType === 'approver' ? 'Approver Account' : 'Standard Account'}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {USER_ROLE_CONFIG[u.role as keyof typeof USER_ROLE_CONFIG]?.label || u.role}
                </Badge>
                <Badge variant="outline" className={u.banned ? 'text-[10px] text-destructive border-destructive/30' : 'text-[10px] text-emerald-500 border-emerald-500/30'}>
                  {u.banned ? 'Inactive' : 'Active'}
                </Badge>
                {u.assignedAt && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    Added {format(new Date(u.assignedAt), 'MMM d, yyyy')}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {canManage && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button size="sm" variant="outline" className="w-full" onClick={() => setDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add User to Project</DialogTitle>
              <DialogDescription>
                Enter the user&apos;s email. If an account with this email already exists, it will be linked to this
                project as-is. Otherwise, fill in the remaining fields to create a new account.
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="p-2 rounded text-xs bg-destructive/10 border border-destructive/20 text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pu-email">Email</Label>
                <Input id="pu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pu-type">Account Type</Label>
                <Select value={userType} onValueChange={(v) => setUserType(v as 'approver' | 'standard')}>
                  <SelectTrigger id="pu-type" className="bg-input/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approver">Approver Account</SelectItem>
                    <SelectItem value="standard">Standard Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pu-name">Name <span className="text-muted-foreground font-normal">(only needed for a new account)</span></Label>
                <Input id="pu-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pu-password">Password <span className="text-muted-foreground font-normal">(only needed for a new account, 8+ characters)</span></Label>
                <Input id="pu-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddUser} disabled={submitting || !email}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Remove-from-project confirmation — explicit about project-membership-only scope */}
      <Dialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name} from this project?</DialogTitle>
            <DialogDescription>
              This only removes {removeTarget?.name}&apos;s access to <strong>{projectName}</strong> — it does{' '}
              <strong>not</strong> delete their user account, and does not affect any other project they belong to.
              They can be added back to this project at any time.
            </DialogDescription>
          </DialogHeader>

          {removeError && (
            <div className="p-2 rounded text-xs bg-destructive/10 border border-destructive/20 text-destructive">
              {removeError}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing}>
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove from Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
