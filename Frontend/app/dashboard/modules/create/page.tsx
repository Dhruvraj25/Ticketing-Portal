'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createModule } from '@/app/actions/modules'
import { getProjectNames } from '@/app/actions/projects'
import { PageTimer } from '@/lib/performance-profiler'
import { WorkspaceContainer } from '@/components/dashboard/workspace-container'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
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
import { Loader2, ArrowLeft, Layers, FolderKanban } from 'lucide-react'
import Link from 'next/link'
import { VALIDATION } from '@/lib/types'

export default function CreateModulePage() {
  const router = useRouter()
  const pageTimer = new PageTimer('Create Module Page')
  const [loading, setLoading] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [projectId, setProjectId] = useState('')
  const [moduleName, setModuleName] = useState('')
  const [description, setDescription] = useState('')
  const [projects, setProjects] = useState<{ id: number; projectName: string; projectCode: string }[]>([])
  
  useEffect(() => {
    const startTime = pageTimer.mark('Initial Render')
    async function load() {
      try {
        pageTimer.mark('Data Loading')
        const p = await getProjectNames()
        setProjects(p)
      } catch {
        setError('Failed to load projects')
      } finally {
        setLoadingProjects(false)
      }
    }
    load()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !moduleName.trim()) return
    setError(null)
    setLoading(true)

    try {
      const mod = await createModule({
        projectId: Number(projectId),
        moduleName: moduleName.trim(),
        description: description.trim() || undefined,
      })
      router.push(`/dashboard/projects/${mod.projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create module')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <WorkspaceContainer>
        <div className="space-y-6">
          {/* Header */}
          <div data-tour="create-module-header" className="flex items-center gap-4">
            <Link href="/dashboard/modules">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <PageHeaderIcon variant="indigo">
                <Layers className="h-5 w-5" />
              </PageHeaderIcon>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Create Module</h1>
                <p className="text-sm text-muted-foreground">
                  Add a new module to organize tickets within a project
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2" data-tour="create-module-project">
              <Label htmlFor="project">Project</Label>
              <Select
                value={projectId}
                onValueChange={setProjectId}
                disabled={loadingProjects}
              >
                <SelectTrigger className="bg-input/50">
                  <SelectValue
                    placeholder={loadingProjects ? 'Loading projects...' : 'Select project'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 ? (
                    <SelectItem value="no-projects" disabled>
                      No projects available
                    </SelectItem>
                  ) : (
                    projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)} className="truncate">
                        <span className="flex items-center gap-2 min-w-0">
                          <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs shrink-0">{p.projectCode}</span>
                          <span className="truncate">{p.projectName}</span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2" data-tour="create-module-name">
              <Label htmlFor="moduleName">Module Name</Label>
              <Input
                id="moduleName"
                value={moduleName}
                onChange={(e) => setModuleName(e.target.value)}
                placeholder="e.g. Authentication, Billing, Dashboard"
                required
                maxLength={VALIDATION.MODULE_NAME_MAX_LENGTH}
                className="bg-input/50"
              />
            </div>

            <div className="space-y-2" data-tour="create-module-description">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this module covers..."
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

            <div data-tour="create-module-actions" className="flex items-center gap-3 pt-4">
              <Link href="/dashboard/modules">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={loading || !projectId || !moduleName.trim()}
                className="bg-primary text-primary-foreground shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Layers className="mr-2 h-4 w-4" />
                    Create Module
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </WorkspaceContainer>
    </div>
  )
}
