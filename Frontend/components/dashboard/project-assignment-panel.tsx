'use client'

import { useState } from 'react'
import { assignClient, assignManager } from '@/app/actions/projects'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, UserCheck } from 'lucide-react'

interface UserOption {
  id: string
  name: string
  email: string
}

interface ProjectAssignmentPanelProps {
  projectId: number
  currentClientId: string
  currentManagerId: string
  clients: UserOption[]
  managers: UserOption[]
  canAssignClient: boolean
  canAssignManager: boolean
}

export function ProjectAssignmentPanel({
  projectId,
  currentClientId,
  currentManagerId,
  clients,
  managers,
  canAssignClient,
  canAssignManager,
}: ProjectAssignmentPanelProps) {
  const [clientId, setClientId] = useState(currentClientId)
  const [managerId, setManagerId] = useState(currentManagerId)
  // Track last-saved values to avoid full router.refresh() — only invalidate relevant cache
  const [savedClientId, setSavedClientId] = useState(currentClientId)
  const [savedManagerId, setSavedManagerId] = useState(currentManagerId)
  const [clientSaving, setClientSaving] = useState(false)
  const [managerSaving, setManagerSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAssignClient() {
    if (!clientId || clientId === savedClientId) return
    setClientSaving(true)
    setError(null)
    try {
      await assignClient(projectId, clientId)
      // Optimistic local state update instead of full page refresh
      setSavedClientId(clientId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign client')
      // Revert select to saved value on failure
      setClientId(savedClientId)
    } finally {
      setClientSaving(false)
    }
  }

  async function handleAssignManager() {
    if (!managerId || managerId === savedManagerId) return
    setManagerSaving(true)
    setError(null)
    try {
      await assignManager(projectId, managerId)
      // Optimistic local state update instead of full page refresh
      setSavedManagerId(managerId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign manager')
      // Revert select to saved value on failure
      setManagerId(savedManagerId)
    } finally {
      setManagerSaving(false)
    }
  }

  return (
    <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
      <div className="flex items-center gap-2 mb-4">
        <UserCheck className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Reassignment</h3>
      </div>

      {error && (
        <div className="p-2 mb-3 rounded text-xs bg-destructive/10 border border-destructive/20 text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Client Assignment */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Client</label>
          <div className="flex items-center gap-2">
            <Select
              value={clientId}
              onValueChange={setClientId}
              disabled={!canAssignClient}
            >
              <SelectTrigger className="flex-1 bg-input/50 h-9 text-sm">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canAssignClient && clientId !== savedClientId && (
              <Button
                size="sm"
                onClick={handleAssignClient}
                disabled={clientSaving}
                className="shrink-0"
              >
                {clientSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Update'
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Manager Assignment */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Project Manager</label>
          <div className="flex items-center gap-2">
            <Select
              value={managerId}
              onValueChange={setManagerId}
              disabled={!canAssignManager}
            >
              <SelectTrigger className="flex-1 bg-input/50 h-9 text-sm">
                <SelectValue placeholder="Select manager" />
              </SelectTrigger>
              <SelectContent>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canAssignManager && managerId !== savedManagerId && (
              <Button
                size="sm"
                onClick={handleAssignManager}
                disabled={managerSaving}
                className="shrink-0"
              >
                {managerSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Update'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
