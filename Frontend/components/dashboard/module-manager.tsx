'use client'

import { useState } from 'react'
import { createModule, updateModule, deleteModule, updateModuleStatus } from '@/app/actions/modules'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { stripHtml } from '@/lib/format'
import { Plus, Loader2, Layers, Edit3, Trash2, MoreHorizontal } from 'lucide-react'
import type { ModuleWithRelations, ModuleStatus } from '@/lib/types'
import { MODULE_STATUS_CONFIG } from '@/lib/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ModuleManagerProps {
  projectId: number
  initialModules: ModuleWithRelations[]
  canManage: boolean
}

export function ModuleManager({ projectId, initialModules, canManage }: ModuleManagerProps) {
  const [modules, setModules] = useState<ModuleWithRelations[]>(initialModules)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New module form
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')

  // Edit module form
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setLoading(true)
    setError(null)

    try {
      const mod = await createModule({
        projectId,
        moduleName: newName.trim(),
        description: newDescription.trim() || undefined,
      })
      setModules((prev) => [
        ...prev,
        {
          ...mod,
          projectName: undefined,
          projectCode: undefined,
          ticketCount: 0,
          status: mod.status as ModuleStatus,
        },
      ])
      setNewName('')
      setNewDescription('')
      setIsAdding(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create module')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdate(moduleId: number) {
    if (!editName.trim()) return
    setLoading(true)
    setError(null)

    try {
      const updated = await updateModule(moduleId, {
        moduleName: editName.trim(),
        description: editDescription.trim() || null,
      })
      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId
            ? { ...m, moduleName: updated.moduleName, description: updated.description, status: updated.status as ModuleStatus }
            : m,
        ),
      )
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update module')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(moduleId: number) {
    if (!confirm('Are you sure you want to delete this module? Tickets linked to it will have their module reference removed.')) {
      return
    }
    setLoading(true)
    setError(null)

    try {
      await deleteModule(moduleId)
      setModules((prev) => prev.filter((m) => m.id !== moduleId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete module')
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusToggle(moduleId: number, currentStatus: ModuleStatus) {
    const newStatus: ModuleStatus = currentStatus === 'active' ? 'inactive' : 'active'
    setError(null)

    try {
      const updated = await updateModuleStatus(moduleId, newStatus)
      setModules((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, status: updated.status as ModuleStatus } : m)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update module status')
    }
  }

  function startEditing(mod: ModuleWithRelations) {
    setEditingId(mod.id)
    setEditName(mod.moduleName)
    setEditDescription(mod.description || '')
  }

  if (modules.length === 0 && !isAdding) {
    return (
      <div className="space-y-4">
        <div className="py-8 text-center">
          <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No modules defined yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Modules help organize tickets into logical groups within the project
          </p>
        </div>
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Module
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {modules.map((mod) => (
        <div  
          key={mod.id}
          className="p-4 rounded-lg bg-muted/30 border border-border/50 group"
        >
          {editingId === mod.id ? (
            /* Edit mode */
            <div className="space-y-3">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Module name"
                className="bg-input/50"
                autoFocus
              />
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Module description (optional)"
                rows={2}
                className="bg-input/50 resize-none"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleUpdate(mod.id)}
                  disabled={loading || !editName.trim()}
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            /* Display mode */
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-foreground">{mod.moduleName}</span>
                  <Badge
                    variant="outline"
                    className={cn('text-xs', MODULE_STATUS_CONFIG[mod.status].color)}
                  >
                    {MODULE_STATUS_CONFIG[mod.status].label}
                  </Badge>
                </div>
                {mod.description && (
                  <p className="text-xs text-muted-foreground">{stripHtml(mod.description)}</p>
                )}
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {mod.ticketCount} ticket{mod.ticketCount !== 1 ? 's' : ''}
                </p>
              </div>

              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => startEditing(mod)} className="cursor-pointer">
                      <Edit3 className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleStatusToggle(mod.id, mod.status)}
                      className="cursor-pointer"
                    >
                      <Layers className="mr-2 h-4 w-4" />
                      {mod.status === 'active' ? 'Deactivate' : 'Activate'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleDelete(mod.id)}
                      className="text-destructive cursor-pointer"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add new module form */}
      {isAdding ? (
        <form onSubmit={handleCreate} className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/50">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Module name"
            className="bg-input/50"
            autoFocus
            required
          />
          <Textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Module description (optional)"
            rows={2}
            className="bg-input/50 resize-none"
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={loading || !newName.trim()}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsAdding(false)
                setNewName('')
                setNewDescription('')
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : canManage && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="w-full"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Module
        </Button>
      )}
    </div>
  )
}
