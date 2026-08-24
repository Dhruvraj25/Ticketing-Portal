'use client'

import { useState, useEffect } from 'react'
import {
  getProjectDevelopers,
  assignDeveloper,
  removeDeveloper,
} from '@/app/actions/projects'
import { getUserList } from '@/app/actions/users'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, User, X, Users } from 'lucide-react'

interface DeveloperAssignmentProps {
  projectId: number
}

interface Developer {
  id: string
  name: string
  email: string
}

export function DeveloperAssignment({ projectId }: DeveloperAssignmentProps) {
  const [developers, setDevelopers] = useState<Developer[]>([])
  const [allDevs, setAllDevs] = useState<Developer[]>([])
  const [selectedDevId, setSelectedDevId] = useState('')
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadDevelopers() {
    try {
      const [assigned, allUsers] = await Promise.all([
        getProjectDevelopers(projectId),
        getUserList(),
      ])
      setDevelopers(assigned)
      setAllDevs(allUsers.filter((u) => u.role === 'developer' || u.role === 'admin'))
    } catch {
      // Silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDevelopers()
  }, [projectId])

  const availableDevs = allDevs.filter(
    (d) => !developers.some((a) => a.id === d.id),
  )

  async function handleAssign() {
    if (!selectedDevId) return
    setAssigning(true)
    setError(null)

    try {
      await assignDeveloper(projectId, selectedDevId)
      // Optimistic local state update — no full re-fetch needed
      const addedDev = allDevs.find((d) => d.id === selectedDevId)
      if (addedDev) {
        setDevelopers((prev) => [...prev, addedDev])
      }
      setSelectedDevId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign developer')
    } finally {
      setAssigning(false)
    }
  }

  async function handleRemove(developerId: string) {
    try {
      await removeDeveloper(projectId, developerId)
      setDevelopers((prev) => prev.filter((d) => d.id !== developerId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove developer')
    }
  }

  if (loading) {
    return (
      <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Developers</h3>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5 bg-card/50 backdrop-blur-sm border-border/50">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground">Assigned Developers</h3>
        <Badge variant="outline" className="ml-auto text-xs">
          {developers.length}
        </Badge>
      </div>

      {error && (
        <div className="p-2 mb-3 rounded text-xs bg-destructive/10 border border-destructive/20 text-destructive">
          {error}
        </div>
      )}

      {/* Developer list */}
      <div className="space-y-2 mb-4">
        {developers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            No developers assigned yet
          </p>
        ) : (
          developers.map((dev) => (
            <div
              key={dev.id}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{dev.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{dev.email}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100"
                onClick={() => handleRemove(dev.id)}
              >
                <X className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Assign new developer */}
      {availableDevs.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={selectedDevId} onValueChange={setSelectedDevId}>
            <SelectTrigger className="flex-1 bg-input/50 h-9 text-sm">
              <SelectValue placeholder="Add developer..." />
            </SelectTrigger>
            <SelectContent>
              {availableDevs.map((dev) => (
                <SelectItem key={dev.id} value={dev.id}>
                  {dev.name} ({dev.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleAssign}
            disabled={!selectedDevId || assigning}
            className="shrink-0"
          >
            {assigning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </Card>
  )
}
