'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createTicket, getTicketFormProjects, getTicketFormModules, getTicketFormClients } from '@/app/actions/tickets'
import { saveAttachment } from '@/app/actions/attachments'
import { PageTimer } from '@/lib/performance-profiler'
import { Button } from '@/components/ui/button'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
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
import { TICKET_PRIORITY_CONFIG, TICKET_CATEGORY_CONFIG, VALIDATION } from '@/lib/types'
import type { TicketPriority, TicketCategory } from '@/lib/types'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { stripHtml } from '@/lib/format'

const RichTextEditor = dynamic(() => import('@/components/dashboard/rich-text-editor').then(m => ({ default: m.RichTextEditor })), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-border/50 bg-input/50 p-4" style={{ minHeight: 200 }}>
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading editor...
      </div>
    </div>
  ),
})
import {
  Loader2,
  ArrowLeft,
  Ticket,
  ImagePlus,
  Upload,
  X,
  FolderKanban,
  Layers,
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Save,
  AlertCircle,
  FileText,
  Monitor,
  User,
} from 'lucide-react'
import Link from 'next/link'
interface StagedImage {
  file: File
  preview: string
}

interface ProjectOption {
  id: number
  projectName: string
  projectCode: string
}

interface ModuleOption {
  id: number
  moduleName: string
}

interface ClientOption {
  id: string
  name: string
  email: string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024

type Step = 'details' | 'review'

const STEPS: Step[] = ['details', 'review']
const STEP_LABELS: Record<Step, string> = {
  details: 'Details',
  review: 'Review',
}

export default function NewTicketPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('details')
  const [draftSaved, setDraftSaved] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [category, setCategory] = useState<TicketCategory>('general')
  const [environment, setEnvironment] = useState('')
  const [additionalInfo, setAdditionalInfo] = useState('')

  // Client state (admin/manager only)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [userRole, setUserRole] = useState<string>('')

  // Project / Module state
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [modules, setModules] = useState<ModuleOption[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedModuleId, setSelectedModuleId] = useState<string>('')
  const [loadingModules, setLoadingModules] = useState(false)



  const [stagedImages, setStagedImages] = useState<StagedImage[]>([])
  const [dragOver, setDragOver] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Load user role and clients on mount
  useEffect(() => {
    async function load() {
      console.log('[CreateTicket] Initial load')
      try {
        // Check user role via session
        try {
          const sessionRes = await fetch('/api/auth/me')
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json()
            console.log('[CreateTicket] User role:', sessionData.role)
            setUserRole(sessionData.role || '')
          }
        } catch (e) {
          console.warn('[CreateTicket] Failed to fetch user role:', e)
        }

        // Load clients for admin/manager
        try {
          const clientList = await getTicketFormClients()
          console.log('[CreateTicket] Clients loaded:', clientList.length)
          setClients(clientList)
        } catch (e) {
          console.warn('[CreateTicket] Failed to load clients:', e)
        }

        const projs = await getTicketFormProjects()
        console.log('[CreateTicket] Projects loaded:', projs.length, JSON.stringify(projs.map(p => ({ id: p.id, name: p.projectName }))))
        setProjects(projs)

        // Check for projectId search param first, then look for project named 'Support' (case-insensitive)
        const projectParam = searchParams.get('projectId')
        let selectedProjId: string | null = null

        if (projectParam && projs.find((p) => String(p.id) === projectParam)) {
          selectedProjId = projectParam
          console.log('[CreateTicket] Auto-selected project from URL param:', selectedProjId)
        } else {
          const supportProject = projs.find((p) =>
            p.projectName.toLowerCase().includes('support')
          )
          if (supportProject) {
            selectedProjId = String(supportProject.id)
            console.log('[CreateTicket] Auto-selected Support project:', selectedProjId, supportProject.projectName)
          }
        }

        if (selectedProjId) {
          setSelectedProjectId(selectedProjId)
          console.log('[CreateTicket] Loading modules for project:', selectedProjId)
          setLoadingModules(true)
          try {
            const mods = await getTicketFormModules(Number(selectedProjId))
            console.log('[CreateTicket] Modules response:', JSON.stringify(mods))
            setModules(mods)

            if (mods.length === 0) {
              console.warn('[CreateTicket] No modules found for project:', selectedProjId)
            }

            // Check for moduleId search param first, then look for module named 'Support'
            const moduleParam = searchParams.get('moduleId')
            if (moduleParam && mods.find((m) => String(m.id) === moduleParam)) {
              setSelectedModuleId(moduleParam)
              console.log('[CreateTicket] Auto-selected module from URL param:', moduleParam)
            } else {
              const supportModule = mods.find((m) =>
                m.moduleName.toLowerCase().includes('support')
              )
              if (supportModule) {
                setSelectedModuleId(String(supportModule.id))
                console.log('[CreateTicket] Auto-selected Support module:', supportModule.id, supportModule.moduleName)
              }
            }
          } catch (e) {
            console.error('[CreateTicket] Failed to load modules:', e)
          } finally {
            setLoadingModules(false)
          }
        }
      } catch (e) {
        console.error('[CreateTicket] Initial load failed:', e)
      }
    }
    load()
  }, [])

  // Restore draft from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ticket-draft')
      if (saved) {
        const draft = JSON.parse(saved)
        if (draft.title) setTitle(draft.title)
        if (draft.description) setDescription(draft.description)
        if (draft.priority) setPriority(draft.priority)
        if (draft.category) setCategory(draft.category)
        if (draft.environment) setEnvironment(draft.environment)
        if (draft.additionalInfo) setAdditionalInfo(draft.additionalInfo)

        if (draft.projectId) {
          setSelectedProjectId(draft.projectId)
          if (draft.moduleId) setSelectedModuleId(draft.moduleId)
        }
      }
    } catch {}
  }, [])

  const handleProjectChange = useCallback(async (projectId: string) => {
    console.log('[CreateTicket] Project changed to:', projectId)
    setSelectedProjectId(projectId)
    setSelectedModuleId('')
    setModules([])
    if (!projectId) {
      console.log('[CreateTicket] Project deselected, clearing modules')
      return
    }
    console.log('[CreateTicket] Fetching modules for project ID:', Number(projectId))
    setLoadingModules(true)
    try {
      const mods = await getTicketFormModules(Number(projectId))
      console.log('[CreateTicket] Modules fetched:', JSON.stringify(mods))
      if (mods.length === 0) {
        console.warn('[CreateTicket] No modules returned for project:', projectId)
      }
      setModules(mods)
    } catch (e) {
      console.error('[CreateTicket] Failed to fetch modules:', e)
    } finally {
      setLoadingModules(false)
    }
  }, [])

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const valid: StagedImage[] = []
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`"${file.name}" exceeds the 10 MB limit.`)
        return
      }
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
      valid.push({ file, preview })
    }
    setStagedImages((prev) => [...prev, ...valid])
  }

  function removeStagedImage(index: number) {
    setStagedImages((prev) => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    const valid: StagedImage[] = []
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) continue
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
      valid.push({ file, preview })
    }
    setStagedImages((prev) => [...prev, ...valid])
  }, [])

  function saveDraft() {
    const draft = {
      title,
      description,
      priority,
      category,
      environment,
      additionalInfo,

      projectId: selectedProjectId,
      moduleId: selectedModuleId,
    }
    localStorage.setItem('ticket-draft', JSON.stringify(draft))
    setDraftSaved(true)
    setTimeout(() => setDraftSaved(false), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required fields
    if (!selectedProjectId) {
      setError('Please select a project.')
      return
    }
    if (!selectedModuleId) {
      setError('Please select a module.')
      return
    }
    if (!environment) {
      setError('Please select an environment.')
      return
    }

    setLoading(true)

    try {
      const ticket = await createTicket({
        title,
        description,
        priority,
        category,
        projectId: Number(selectedProjectId),
        moduleId: Number(selectedModuleId),
        clientId: selectedClientId || undefined,
      })

      for (const staged of stagedImages) {
        const formData = new FormData()
        formData.append('file', staged.file)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (res.ok) {
          await saveAttachment({
            ticketId: ticket.id,
            filename: data.filename,
            url: data.url,
            publicId: data.publicId,
            mimeType: data.mimeType,
            sizeBytes: data.sizeBytes,
          })
        }
      }

      localStorage.removeItem('ticket-draft')
      router.push(`/dashboard/tickets/${ticket.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket')
      setLoading(false)
    }
  }

  const canGoNext = step === 'details'
    ? title.trim() && description.trim() && selectedProjectId && selectedModuleId && environment
    : true
  const stepIndex = STEPS.indexOf(step)

  function goToStep(s: Step) {
    if (s === 'details') {
      setStep(s)
      setError(null)
      return
    }
    // Going forward to review — validate required fields
    if (!selectedProjectId) {
      setError('Please select a project.')
      return
    }
    if (!selectedModuleId) {
      setError('Please select a module.')
      return
    }
    if (!environment) {
      setError('Please select an environment.')
      return
    }
    setStep(s)
    setError(null)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header in rounded container */}
      <div data-tour="create-ticket-header" className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm p-5 flex items-center gap-4">
        <Link href="/dashboard/tickets">
          <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <PageHeaderIcon variant="teal">
            <Ticket className="h-5 w-5" />
          </PageHeaderIcon>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Create Ticket</h1>
            <p className="text-sm text-muted-foreground">Submit a new support request</p>
          </div>
        </div>
      </div>

      {/* Step Progress Indicator */}
      <div data-tour="create-ticket-stepper" className="relative">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <button
                onClick={() => goToStep(s)}
                className={cn(
                  'flex items-center gap-2.5 transition-all',
                  stepIndex >= i ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <div
                  className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300',
                    stepIndex > i
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : stepIndex === i
                      ? 'bg-primary text-primary-foreground shadow-md ring-4 ring-primary/20'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {stepIndex > i ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    'text-sm font-medium hidden sm:inline transition-colors',
                    stepIndex >= i ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {STEP_LABELS[s]}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className="flex-1 mx-3">
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: stepIndex > i ? '100%' : stepIndex === i ? '50%' : '0%' }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <AnimatePresence mode="wait">
          {/* ─── STEP 1: Details (with image upload merged in) ──────── */}
          {step === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
              className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm p-6 space-y-5"
            >
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Ticket Details
              </h2>

              <div className="space-y-2" data-tour="ticket-title">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Brief summary of your issue"
                  required
                  maxLength={VALIDATION.TICKET_TITLE_MAX_LENGTH}
                  className="h-11 rounded-xl bg-input/50 border-border/50"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {title.length}/{VALIDATION.TICKET_TITLE_MAX_LENGTH}
                </p>
              </div>

              <div data-tour="create-ticket-description" className="space-y-2">
                <Label htmlFor="description">
                  Description <span className="text-destructive">*</span>
                </Label>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Provide detailed information about your issue..."
                  minHeight={200}
                />
                <div className="flex items-center justify-between">
                  {description.length > VALIDATION.DESCRIPTION_MAX_LENGTH && (
                    <p className="text-xs text-destructive">
                      Description exceeds {VALIDATION.DESCRIPTION_MAX_LENGTH} characters ({description.length}).
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground ml-auto">
                    {description.length}/{VALIDATION.DESCRIPTION_MAX_LENGTH}
                  </p>
                </div>
              </div>

              {/* ─── Image Upload — on same page as description ──────── */}
              <div className="space-y-2" data-tour="ticket-attachments">
                <Label className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-primary" />
                  <span>Attachments <span className="font-normal text-muted-foreground">(optional)</span></span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Upload screenshots or documents to help describe your issue.
                </p>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => imageInputRef.current?.click()}
                  className={cn(
                    'border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer',
                    dragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-border/50 hover:border-primary/50 hover:bg-muted/20',
                  )}
                  role="button"
                  tabIndex={0}
                  aria-label="Add images"
                >
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                    multiple
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 rounded-xl bg-primary/10">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        <span className="text-primary font-medium">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        Images, PDFs, Documents — max 10 MB each
                      </p>
                    </div>
                  </div>
                </div>

                {stagedImages.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2 mt-3">
                      {stagedImages.length} file{stagedImages.length !== 1 ? 's' : ''} selected
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {stagedImages.map((img, i) => (
                        <div key={i} className="relative group w-28 h-28 rounded-xl overflow-hidden border border-border/50 bg-muted/20 flex-shrink-0">
                          {img.file.type.startsWith('image/') ? (
                            <img
                              src={img.preview}
                              alt={img.file.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-muted/30">
                              <FileText className="h-6 w-6 text-muted-foreground" />
                              <span className="text-[11px] text-muted-foreground text-center px-1 truncate w-full">
                                {img.file.name}
                              </span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeStagedImage(i)}
                            className="absolute top-1 right-1 p-1 rounded-full bg-background/80 hover:bg-background transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X className="h-3.5 w-3.5 text-foreground" />
                          </button>
                          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-background/80 text-[11px] text-muted-foreground">
                            {(img.file.size / (1024 * 1024)).toFixed(1)} MB
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>


              <div className="grid grid-cols-2 gap-4">
                <div data-tour="ticket-category" className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
                    <SelectTrigger className="h-11 rounded-xl bg-input/50 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TICKET_CATEGORY_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2" data-tour="ticket-priority">
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                    <SelectTrigger className="h-11 rounded-xl bg-input/50 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TICKET_PRIORITY_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {userRole !== 'client' && clients.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="client">
                    Client <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedClientId} onValueChange={async (clientId) => {
                    setSelectedClientId(clientId)
                    setSelectedProjectId('')
                    setSelectedModuleId('')
                    setModules([])
                    if (clientId) {
                      const projs = await getTicketFormProjects(clientId)
                      setProjects(projs)
                    } else {
                      const projs = await getTicketFormProjects()
                      setProjects(projs)
                    }
                  }}>
                    <SelectTrigger className="h-11 rounded-xl bg-input/50 border-border/50">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="truncate">
                          <span className="flex items-center gap-2 min-w-0">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{c.name}</span>
                            <span className="text-muted-foreground text-xs shrink-0">({c.email})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2" data-tour="ticket-project">
                  <Label htmlFor="project">
                    Project <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedProjectId} onValueChange={handleProjectChange}>
                    <SelectTrigger className="h-11 rounded-xl bg-input/50 border-border/50">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (                          <SelectItem key={p.id} value={String(p.id)} className="truncate">
                            <span className="flex items-center gap-2 min-w-0">
                              <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-mono text-xs shrink-0">{p.projectCode}</span>
                              <span className="truncate">{p.projectName}</span>
                            </span>
                          </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2" data-tour="ticket-module">
                  <Label htmlFor="module">
                    Module <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedModuleId}
                    onValueChange={setSelectedModuleId}
                    disabled={!selectedProjectId || loadingModules}
                  >
                    <SelectTrigger className="h-11 rounded-xl bg-input/50 border-border/50">
                      <SelectValue placeholder={
                        loadingModules ? 'Loading...'
                        : !selectedProjectId ? 'Select project first'
                        : selectedProjectId && modules.length === 0 ? 'No modules available'
                        : 'Select module'
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {modules.length === 0 && selectedProjectId ? (
                        <div className="px-3 py-6 text-center">
                          <Layers className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p className="text-sm text-muted-foreground">No modules found for this project</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            Modules are created during project setup. Contact your project manager to add modules.
                          </p>
                        </div>
                      ) : modules.length === 0 ? (
                        <div className="px-3 py-6 text-center">
                          <p className="text-sm text-muted-foreground">Select a project first</p>
                        </div>
                      ) : (
                        modules.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)} className="truncate">
                            <span className="flex items-center gap-2 min-w-0">
                              <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{m.moduleName}</span>
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div data-tour="ticket-environment" className="space-y-2">
                <Label htmlFor="environment">
                  Environment <span className="text-destructive">*</span>
                </Label>
                <Select value={environment} onValueChange={setEnvironment}>
                  <SelectTrigger className="h-11 rounded-xl bg-input/50 border-border/50">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging / Sandbox</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="testing">Testing</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div data-tour="ticket-additional-info" className="space-y-2">
                <Label htmlFor="additionalInfo">Additional Information <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id="additionalInfo"
                  value={additionalInfo}
                  onChange={(e) => setAdditionalInfo(e.target.value)}
                  placeholder="Any additional context, steps to reproduce, or error messages..."
                  rows={3}
                  maxLength={VALIDATION.ADDITIONAL_INFO_MAX_LENGTH}
                  className="rounded-xl bg-input/50 border-border/50 resize-none"
                />
              </div>

              <div data-tour="ticket-form-actions" className="flex justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveDraft}
                  className="rounded-xl"
                  disabled={!title.trim()}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {draftSaved ? 'Saved!' : 'Save Draft'}
                </Button>
                <Button
                  type="button"
                  onClick={() => goToStep('review')}
                  disabled={!canGoNext}
                  className="rounded-xl"
                  data-tour="ticket-next-review"
                >
                  Next: Review
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 3: Review ───────────────────────────────────────── */}
          {step === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
              className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm p-6 space-y-5"
            >
              <div data-tour="ticket-review-summary" className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Review Your Ticket</h2>
              </div>
              <p className="text-sm text-muted-foreground -mt-2">
                Please review all the information before submitting.
              </p>

              <div className="space-y-3">
                {/* Title */}
                <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Title</p>
                  <p className="font-medium text-foreground">{title}</p>
                </div>

                {/* Description */}
                <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Description</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {stripHtml(description)}
                  </p>
                </div>


                {/* Priority & Category */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Priority</p>
                    <p className="text-sm font-medium text-foreground">{TICKET_PRIORITY_CONFIG[priority].label}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Category</p>
                    <p className="text-sm font-medium text-foreground">{TICKET_CATEGORY_CONFIG[category].label}</p>
                  </div>
                </div>

                {/* Project, Module & Environment */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Project</p>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                      {projects.find((p) => String(p.id) === selectedProjectId)?.projectName || 'Selected'}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Module</p>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      {modules.find((m) => String(m.id) === selectedModuleId)?.moduleName || 'Selected'}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Environment</p>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                      {environment.charAt(0).toUpperCase() + environment.slice(1)}
                    </p>
                  </div>
                </div>

                {/* Additional Info */}
                {additionalInfo && (
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Additional Information</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{additionalInfo}</p>
                  </div>
                )}

                {/* Attachments Summary */}
                {stagedImages.length > 0 && (
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">
                      Attachments ({stagedImages.length})
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {stagedImages.map((img, i) => (
                        <div key={i} className="w-14 h-14 rounded-lg overflow-hidden border border-border/50 bg-muted/30">
                          {img.file.type.startsWith('image/') ? (
                            <img src={img.preview} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <div className="flex justify-between pt-2 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep('details')} className="rounded-xl">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back: Details
                  </Button>
                  <Button type="button" variant="ghost" onClick={saveDraft} className="rounded-xl" disabled={loading}>
                    <Save className="mr-2 h-4 w-4" />
                    Save Draft
                  </Button>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  data-tour="ticket-submit"
                  className="rounded-xl px-8"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {stagedImages.length > 0 ? 'Uploading...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Submit Ticket
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  )
}
