'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createProject, getProjectCompanies } from '@/app/actions/projects'
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

interface CompanyOption {
  /** Company identifier — the server resolves it to ALL of the company's client users. */
  key: string
  companyName: string
  companyCode: string | null
  clientCount: number
}

// Grid children and triggers must be allowed to shrink (min-w-0 / w-full) and
// the selected value must truncate — otherwise a long value widens its trigger
// past the column and overlaps the neighbouring field.
const FORM_SELECT_TRIGGER = 'bg-input/50 w-full min-w-0 [&>[data-slot=select-value]]:min-w-0'

export default function NewProjectPage() {
  const router = useRouter()
  const pageTimer = new PageTimer('New Project Page')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [companyKey, setCompanyKey] = useState('')
  const [managerId, setManagerId] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')

  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [managers, setManagers] = useState<UserOption[]>([])
  const selectedCompany = companies.find((c) => c.key === companyKey)
  const selectedManager = managers.find((m) => m.id === managerId)

  useEffect(() => {
    async function loadUsers() {
      try {
        const { getUserList } = await import('@/app/actions/users')
        // Companies (never individual users) for the Company field; users only
        // for the Support Manager field.
        const [allUsers, companyList] = await Promise.all([getUserList(), getProjectCompanies()])
        setCompanies(companyList)
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

    if (!companyKey) {
      setError('Please select a company')
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
        companyKey,
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
              <div className="space-y-2 min-w-0" data-tour="new-project-client">
                <Label htmlFor="company">Company</Label>
                <Select value={companyKey} onValueChange={setCompanyKey}>
                  <SelectTrigger id="company" className={FORM_SELECT_TRIGGER}>
                    {/* Trigger shows only the company name, truncated to the field width. */}
                    <SelectValue placeholder="Select company">
                      {selectedCompany && <span className="block truncate">{selectedCompany.companyName}</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-w-[min(28rem,calc(100vw-2rem))]">
                    {companies.length === 0 ? (
                      <SelectItem value="no-companies" disabled>
                        No companies available
                      </SelectItem>
                    ) : (
                      companies.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{c.companyName}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {[c.companyCode, ` client user`].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 min-w-0" data-tour="new-project-manager">
                <Label htmlFor="manager">Support Manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger id="manager" className={FORM_SELECT_TRIGGER}>
                    <SelectValue placeholder="Select support manager">
                      {selectedManager && <span className="block truncate">{selectedManager.name} ({selectedManager.email})</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-w-[min(28rem,calc(100vw-2rem))]">
                    {managers.length === 0 ? (
                      <SelectItem value="no-managers" disabled>
                        No support managers available
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
