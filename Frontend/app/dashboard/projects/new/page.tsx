'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createProject } from '@/app/actions/projects'
import { WorkspaceContainer } from '@/components/dashboard/workspace-container'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { PageTimer } from '@/lib/performance-profiler'
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
import { Loader2, ArrowLeft, FolderKanban } from 'lucide-react'
import Link from 'next/link'
import { VALIDATION } from '@/lib/types'

interface UserOption {
  id: string
  name: string
  email: string
  role: string
}

export default function NewProjectPage() {
  const router = useRouter()
  const pageTimer = new PageTimer('New Project Page')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [clientId, setClientId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')

  const [clients, setClients] = useState<UserOption[]>([])
  const [managers, setManagers] = useState<UserOption[]>([])

  useEffect(() => {
    async function loadUsers() {
      try {
        const { getUserList } = await import('@/app/actions/users')
        const allUsers = await getUserList()
        setClients(allUsers.filter((u: UserOption) => u.role === 'client'))
        setManagers(
          allUsers.filter(
            (u: UserOption) => u.role === 'project_manager',
          ),
        )
      } catch {
        // Silently handle — redirect will happen on submit with appropriate error
      }
    }
    loadUsers()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!clientId) {
      setError('Please select a client')
      return
    }

    if (!managerId) {
      setError('Please select a project manager')
      return
    }

    setLoading(true)

    try {
      const project = await createProject({
        projectName,
        clientId,
        managerId,
        description: description || undefined,
        startDate: startDate || undefined,
      })

      router.push(`/dashboard/projects/${project.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <WorkspaceContainer>
        <div className="space-y-6">
          {/* Header */}
          <div data-tour="new-project-header" className="flex items-center gap-4">
            <Link href="/dashboard/projects">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <PageHeaderIcon variant="blue">
                <FolderKanban className="h-5 w-5" />
              </PageHeaderIcon>
              <div>
                <h1 className="text-2xl font-bold text-foreground">New Project</h1>
                <p className="text-sm text-muted-foreground">
                  Create a new project to organize tickets and modules
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2" data-tour="new-project-name">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Customer Portal Redesign"
                required
                maxLength={VALIDATION.PROJECT_NAME_MAX_LENGTH}
                className="bg-input/50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2" data-tour="new-project-client">
                <Label htmlFor="client">Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="bg-input/50">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.length === 0 ? (
                      <SelectItem value="no-clients" disabled>
                        No clients available
                      </SelectItem>
                    ) : (
                      clients.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="truncate">
                          <span className="truncate">{c.name} ({c.email})</span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2" data-tour="new-project-manager">
                <Label htmlFor="manager">Project Manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger className="bg-input/50">
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.length === 0 ? (
                      <SelectItem value="no-managers" disabled>
                        No managers available
                      </SelectItem>
                    ) : (
                      managers.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="truncate">
                          <span className="truncate">{m.name} ({m.email})</span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2" data-tour="new-project-description">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the project goals, scope, and objectives..."
                rows={4}
                maxLength={VALIDATION.DESCRIPTION_MAX_LENGTH}
                className="bg-input/50 resize-none"
              />
            </div>

            <div className="space-y-2" data-tour="new-project-start-date">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-input/50"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div data-tour="new-project-actions" className="flex items-center gap-3 pt-4">
              <Link href="/dashboard/projects">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={loading}
                className="bg-primary text-primary-foreground shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Project'
                )}
              </Button>
            </div>
          </form>
        </div>
      </WorkspaceContainer>
    </div>
  )
}
