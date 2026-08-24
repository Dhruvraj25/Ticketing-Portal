'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getModuleById, updateModule } from '@/app/actions/modules'
import { PageTimer } from '@/lib/performance-profiler'
import { WorkspaceContainer } from '@/components/dashboard/workspace-container'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, ArrowLeft, Layers, Save } from 'lucide-react'
import Link from 'next/link'
import type { ModuleStatus } from '@/lib/types'
import { MODULE_STATUS_CONFIG, VALIDATION } from '@/lib/types'

export default function EditModulePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const moduleId = parseInt(params.id)
  const pageTimer = new PageTimer('Edit Module Page')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [moduleName, setModuleName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<ModuleStatus>('active')
  const [projectId, setProjectId] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const m = await getModuleById(moduleId)
        setModuleName(m.moduleName)
        setDescription(m.description || '')
        setStatus(m.status)
        setProjectId(m.projectId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load module')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [moduleId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!moduleName.trim()) return
    setError(null)
    setSaving(true)

    try {
      await updateModule(moduleId, {
        moduleName: moduleName.trim(),
        description: description.trim() || null,
        status,
      })
      router.push(`/dashboard/projects/${projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update module')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div data-tour="edit-module-header" className="flex items-center gap-4">
        <Link href={projectId ? `/dashboard/projects/${projectId}` : '/dashboard/modules'}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <PageHeaderIcon variant="indigo">
            <Layers className="h-5 w-5" />
          </PageHeaderIcon>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Edit Module</h1>
            <p className="text-sm text-muted-foreground">{moduleName}</p>
          </div>
        </div>
      </div>

      <WorkspaceContainer>
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={projectId ? `/dashboard/projects/${projectId}` : '/dashboard/modules'}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <PageHeaderIcon variant="indigo">
              <Layers className="h-5 w-5" />
            </PageHeaderIcon>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Edit Module</h1>
              <p className="text-sm text-muted-foreground">{moduleName}</p>
            </div>
          </div>
        </div>
      </WorkspaceContainer>

      <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2" data-tour="edit-module-name">
            <Label htmlFor="moduleName">Module Name</Label>
            <Input
              id="moduleName"
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              required
              maxLength={VALIDATION.MODULE_NAME_MAX_LENGTH}
              className="bg-input/50"
            />
          </div>

          <div className="space-y-2" data-tour="edit-module-status">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ModuleStatus)}>
              <SelectTrigger className="bg-input/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MODULE_STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2" data-tour="edit-module-description">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={VALIDATION.DESCRIPTION_MAX_LENGTH}
              className="bg-input/50 resize-none"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div data-tour="edit-module-actions" className="flex items-center gap-3 pt-4">
            <Link href={projectId ? `/dashboard/projects/${projectId}` : '/dashboard/modules'}>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={saving || !moduleName.trim()}
              className="bg-primary text-primary-foreground shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
    </div>
  )
}
