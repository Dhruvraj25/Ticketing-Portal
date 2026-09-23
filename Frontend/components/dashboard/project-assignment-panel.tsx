'use client'

import { useState } from 'react'
import { assignManager } from '@/app/actions/projects'
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
  currentManagerId: string
  managers: UserOption[]
  canAssignManager: boolean
}

export function ProjectAssignmentPanel({
  projectId,
  currentManagerId,
  managers,
  canAssignManager,
}: ProjectAssignmentPanelProps) {
  const [managerId, setManagerId] = useState(currentManagerId)
  // Track last-saved value to avoid full router.refresh() — only invalidate relevant cache
  const [savedManagerId, setSavedManagerId] = useState(currentManagerId)
  const [managerSaving, setManagerSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        {/* Manager Assignment */}
        <div className="min-w-0">
          <label className="text-xs text-muted-foreground block mb-1.5">Support Manager</label>
          <div className="flex items-center gap-2 min-w-0">
            <Select
              value={managerId}
              onValueChange={setManagerId}
              disabled={!canAssignManager}
            >
              <SelectTrigger className="flex-1 min-w-0 w-full bg-input/50 h-9 text-sm">
                <SelectValue placeholder="Select support manager" />
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
