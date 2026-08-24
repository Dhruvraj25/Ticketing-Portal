'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getProjectById, updateProject } from '@/app/actions/projects'
import { WorkspaceContainer } from '@/components/dashboard/workspace-container'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { PageTimer } from '@/lib/performance-profiler'
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
import { Loader2, ArrowLeft, FolderKanban, Save } from 'lucide-react'
import Link from 'next/link'
import type { ProjectStatus, ProjectWithRelations } from '@/lib/types'
import { PROJECT_STATUS_CONFIG, VALIDATION } from '@/lib/types'

export default function EditProjectPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const projectId = parseInt(params.id)
  const pageTimer = new PageTimer('Edit Project Page')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectWithRelations | null>(null)

  const [projectName, setProjectName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('active')
  const [startDate, setStartDate] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const p = await getProjectById(projectId)
        setProject(p)
        setProjectName(p.projectName)
        setDescription(p.description || '')
        setStatus(p.status)
        setStartDate(p.startDate || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      await updateProject(projectId, {
        projectName: projectName || undefined,
        description: description || undefined,
        startDate: startDate || null,

        status,
      })
      router.push(`/dashboard/projects/${projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project')
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

  if (!project) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/projects">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Project not found</h1>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div data-tour="edit-project-header" className="flex items-center gap-4">
        <Link href={`/dashboard/projects/${projectId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <PageHeaderIcon variant="blue">
            <FolderKanban className="h-5 w-5" />
          </PageHeaderIcon>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Edit Project</h1>
            <p className="text-sm text-muted-foreground">
              {project.projectCode} — {project.projectName}
            </p>
          </div>
        </div>
      </div>

      <WorkspaceContainer>
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/projects/${projectId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <PageHeaderIcon variant="blue">
              <FolderKanban className="h-5 w-5" />
            </PageHeaderIcon>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Edit Project</h1>
              <p className="text-sm text-muted-foreground">
                {project.projectCode} — {project.projectName}
              </p>
            </div>
          </div>
        </div>
      </WorkspaceContainer>

      <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2" data-tour="edit-project-name">
            <Label htmlFor="projectName">Project Name</Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
              maxLength={VALIDATION.PROJECT_NAME_MAX_LENGTH}
              className="bg-input/50"
            />
          </div>

          <div className="space-y-2" data-tour="edit-project-status">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
              <SelectTrigger className="bg-input/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROJECT_STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2" data-tour="edit-project-description">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={VALIDATION.DESCRIPTION_MAX_LENGTH}
              className="bg-input/50 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2" data-tour="edit-project-start-date">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-input/50"
              />
            </div>
            </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div data-tour="edit-project-actions" className="flex items-center gap-3 pt-4">
            <Link href={`/dashboard/projects/${projectId}`}>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground shadow-sm">
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
