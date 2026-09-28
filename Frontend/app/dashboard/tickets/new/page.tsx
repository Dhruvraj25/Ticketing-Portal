'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createTicket, getTicketFormProjects, getTicketFormModules, getModulesForClient, getTicketFormClients, getCurrentUser } from '@/app/actions/tickets'
import { saveAttachment } from '@/app/actions/attachments'
import { getMyWalletThresholdStatus } from '@/app/actions/wallets'
import { getFriendlyError } from '@/lib/error-utils'
import { PageTimer } from '@/lib/performance-profiler'
import { Button } from '@/components/ui/button'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TICKET_PRIORITY_CONFIG, TICKET_CATEGORY_CONFIG, VALIDATION } from '@/lib/types'
import type { TicketPriority, TicketCategory } from '@/lib/types'
import type { TicketType } from '@/lib/historical-ticket'
import { loadTicketDraft, saveTicketDraft, clearTicketDraft, resolveDraftSelection, hasDraftSelection } from '@/lib/ticket-draft'
import { zonedInputToUtcDate } from '@/lib/datetime'
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
  CalendarClock,
  Wallet,
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

  // Support Wallet 10% creation threshold — CLIENT callers only (section 1/8).
  // UX-only: the authoritative check is re-run server-side in createTicket()
  // regardless of what this state says (section 8/10 — never trust the
  // frontend). Admin/project_manager never gate on this (section 2/8).
  const [walletAtOrBelowThreshold, setWalletAtOrBelowThreshold] = useState(false)
  const [walletRemainingHours, setWalletRemainingHours] = useState<number | null>(null)

  // Project / Module state
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [modules, setModules] = useState<ModuleOption[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedModuleId, setSelectedModuleId] = useState<string>('')
  const [loadingModules, setLoadingModules] = useState(false)

  // Ticket Type (admin/manager only) — On Behalf of Client / Historical.
  // Defaults to 'on_behalf', which is today's normal staff-creates-for-a-
  // client flow, so leaving this untouched changes nothing for existing users.
  const [ticketType, setTicketType] = useState<TicketType>('on_behalf')
  const [estimateApprovalRequired, setEstimateApprovalRequired] = useState(false)
  const [supportHoursConsumed, setSupportHoursConsumed] = useState('')
  const [historicalDateInput, setHistoricalDateInput] = useState('')
  const [historicalClosingDateInput, setHistoricalClosingDateInput] = useState('')

  const isStaff = userRole === 'admin' || userRole === 'project_manager'

  const [stagedImages, setStagedImages] = useState<StagedImage[]>([])
  const [dragOver, setDragOver] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Load the current user's role and the staff-only client list (and, for a
  // client user, their own project list) once on mount.
  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentUser()
        setUserRole(me.role)
        if (me.role === 'admin' || me.role === 'project_manager') {
          const clientList = await getTicketFormClients()
          setClients(clientList)
        } else if (me.role === 'client') {
          const [projs, mods, walletStatus] = await Promise.all([
            getTicketFormProjects(),
            getModulesForClient(),
            getMyWalletThresholdStatus(),
          ])
          setProjects(projs)
          setModules(mods)
          setWalletAtOrBelowThreshold(walletStatus.atOrBelowThreshold)
          setWalletRemainingHours(walletStatus.remainingHours)
        }
      } catch (e) {
        console.error('[CreateTicket] Failed to load initial form data:', e)
      }
    })()
  }, [])

  // Ticket Type sets an AUTOMATIC default for Estimate Approval Required —
  // "On Behalf of Client" defaults it ON, "Historical" defaults it OFF — but
  // the toggle always stays visible AND manually adjustable afterward (never
  // hidden, never disabled). This only re-fires when ticketType itself
  // changes (dependency array), never on every render, so it can't stomp on
  // a manual change the user makes without switching ticket types again.
  useEffect(() => {
    if (ticketType === 'on_behalf') setEstimateApprovalRequired(true)
    else if (ticketType === 'historical') setEstimateApprovalRequired(false)
  }, [ticketType])

  // Restore simple fields from a saved draft.
  // Project / Module / Client are restored inside load() so the restored
  // dropdown values always resolve against freshly loaded option lists.
  // NOTE: this effect deliberately runs AFTER the load() effect above, so a
  // saved priority/category/environment always wins over the state defaults
  // ('medium' / 'general' / '') that were in place while options loaded.
  useEffect(() => {
    const draft = loadTicketDraft()
    if (!draft) return
    if (draft.title) setTitle(draft.title)
    if (draft.description) setDescription(draft.description)
    if (draft.priority) setPriority(draft.priority as TicketPriority)
    if (draft.category) setCategory(draft.category as TicketCategory)
    if (draft.environment) setEnvironment(draft.environment)
    if (draft.additionalInfo) setAdditionalInfo(draft.additionalInfo)
  }, [])

  // When the user picks a different project we must clear the now-invalid
  // Module selection — but NOT when this handler is invoked programmatically
  // to load the modules of an already-restored project (Save Draft restore
  // flow), because that would wipe the restored module before the async
  // module list arrives. The initial-load effect therefore calls
  // loadModulesForProject directly instead of routing through this handler.
  const loadModulesForProject = useCallback(async (projectId: string) => {
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

  // No project selected → show every module/service area for the current
  // client (all of their projects), not an empty/disabled list. selectedClientId
  // is only ever set for staff — a client-role user has none, and
  // getModulesForClient() with no argument resolves to their own id server-side.
  const loadModulesForClient = useCallback(async (clientId: string) => {
    setLoadingModules(true)
    try {
      const mods = await getModulesForClient(clientId || undefined)
      setModules(mods)
    } catch (e) {
      console.error('[CreateTicket] Failed to fetch modules for client:', e)
    } finally {
      setLoadingModules(false)
    }
  }, [])

  const handleProjectChange = useCallback(async (projectId: string) => {
    console.log('[CreateTicket] Project changed to:', projectId)
    setSelectedProjectId(projectId)
    setSelectedModuleId('')
    setModules([])
    if (!projectId) {
      console.log('[CreateTicket] Project deselected, loading all modules for the client')
      await loadModulesForClient(selectedClientId)
      return
    }
    await loadModulesForProject(projectId)
  }, [loadModulesForProject, loadModulesForClient, selectedClientId])

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
    const saved = saveTicketDraft({
      title,
      description,
      priority,
      category,
      environment,
      additionalInfo,

      clientId: selectedClientId,
      projectId: selectedProjectId,
      moduleId: selectedModuleId,
    })
    if (!saved) {
      toast.error('Could not save the draft. Please check your browser storage settings and try again.')
      return
    }
    toast.success('Draft saved')
    setDraftSaved(true)
    setTimeout(() => setDraftSaved(false), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Section 8: a client at/below the 10% wallet threshold must never be
    // able to submit, and the form must never appear to have succeeded.
    // This is UX only — createTicket() independently re-checks the same
    // rule server-side regardless of this client-side state (section 10).
    if (userRole === 'client' && walletAtOrBelowThreshold) {
      setError('Ticket creation is unavailable because your Support Wallet balance is at or below the 10% limit. Please recharge your wallet to create a ticket.')
      return
    }

    // Validate required fields
    if (!selectedProjectId) {
      setError('Please select a project.')
      return
    }
    if (isStaff && !selectedClientId) {
      setError('Please select a client.')
      return
    }

    let historicalCreatedAt: Date | null = null
    let historicalClosedAt: Date | null = null
    if (isStaff && ticketType === 'historical') {
      const hours = Number(supportHoursConsumed)
      if (!supportHoursConsumed || !Number.isFinite(hours) || hours <= 0) {
        setError('Support Hour Consumed must be a number greater than 0.')
        return
      }
      if (!historicalDateInput) {
        setError('Historical Ticket Date is required.')
        return
      }
      historicalCreatedAt = zonedInputToUtcDate(historicalDateInput)
      if (!historicalCreatedAt) {
        setError('Historical Ticket Date is invalid.')
        return
      }
      if (historicalClosingDateInput) {
        historicalClosedAt = zonedInputToUtcDate(historicalClosingDateInput)
        if (!historicalClosedAt) {
          setError('Closing Date is invalid.')
          return
        }
        if (historicalClosedAt.getTime() < historicalCreatedAt.getTime()) {
          setError('Closing Date cannot be earlier than the Historical Ticket Date.')
          return
        }
      }
    }

    setLoading(true)

    try {
      const ticket = await createTicket({
        title,
        description,
        priority,
        category,
        projectId: Number(selectedProjectId),
        moduleId: selectedModuleId ? Number(selectedModuleId) : null,
        clientId: selectedClientId || undefined,
        ...(isStaff ? {
          ticketType,
          // The real, current toggle state — already correctly defaulted by
          // the ticketType effect above AND respects a manual override, so
          // it must be sent as-is (never re-forced here at submit time).
          estimateApprovalRequired,
          ...(ticketType === 'historical' ? {
            supportHoursConsumed: Number(supportHoursConsumed),
            historicalCreatedAt: historicalCreatedAt!.toISOString(),
            historicalClosedAt: historicalClosedAt ? historicalClosedAt.toISOString() : null,
          } : {}),
        } : {}),
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

      clearTicketDraft()
      router.push(`/dashboard/tickets/${ticket.id}`)
    } catch (err) {
      // Section 26: resolve structured backend errors (e.g. the wallet
      // threshold/insufficiency errors from createTicket()) to their
      // friendly text instead of a raw/generic message.
      setError(getFriendlyError(err))
      setLoading(false)
    }
  }

  const ticketTypeFieldsFilled = !isStaff || (
    !!selectedClientId &&
    (ticketType !== 'historical' || (!!supportHoursConsumed && !!historicalDateInput))
  )

  const canGoNext = step === 'details'
    ? title.trim() && description.trim() && selectedProjectId && ticketTypeFieldsFilled
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
    if (isStaff && !selectedClientId) {
      setError('Please select a client.')
      return
    }
    if (isStaff && ticketType === 'historical' && (!supportHoursConsumed || !historicalDateInput)) {
      setError('Support Hour Consumed and Historical Ticket Date are required for a Historical ticket.')
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
                      const [projs, mods] = await Promise.all([
                        getTicketFormProjects(clientId),
                        getModulesForClient(clientId),
                      ])
                      setProjects(projs)
                      setModules(mods)
                    } else {
                      const projs = await getTicketFormProjects()
                      setProjects(projs)
                      setModules([])
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

              {/* Ticket Type — admin/project_manager only (Phase 3) */}
              {isStaff && (
                <div className="space-y-4 p-4 rounded-xl bg-muted/20 border border-border/50" data-tour="ticket-type">
                  <div className="space-y-2">
                    <Label htmlFor="ticketType">
                      Ticket Type <span className="text-destructive">*</span>
                    </Label>
                    <Select value={ticketType} onValueChange={(v) => setTicketType(v as TicketType)}>
                      <SelectTrigger className="h-11 rounded-xl bg-input/50 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on_behalf">On Behalf of Client</SelectItem>
                        <SelectItem value="historical">Historical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label htmlFor="estimateApprovalRequired" className="text-sm">Estimate Approval Required</Label>
                      <p className="text-xs text-muted-foreground">
                        {ticketType === 'on_behalf'
                          ? 'Automatically turned on for tickets created on behalf of a client — turn it off below if this one doesn\'t need approval.'
                          : ticketType === 'historical'
                          ? 'Automatically turned off for historical tickets (created already closed) — turn it on below if this one still needs approval.'
                          : 'Off by default. When on, the ticket follows the normal manager estimate → client approval workflow.'}
                      </p>
                    </div>
                    {/* Always visible and interactive — the automatic default above is a
                        starting point, never a lock. Selecting a different Ticket Type
                        re-applies its own default (see the effect above); it never
                        continuously overwrites a manual choice on every render. */}
                    <Switch
                      id="estimateApprovalRequired"
                      checked={estimateApprovalRequired}
                      onCheckedChange={setEstimateApprovalRequired}
                    />
                  </div>

                  {ticketType === 'historical' && (
                    <div className="space-y-4 pt-2 border-t border-border/50">
                      <div className="space-y-2">
                        <Label htmlFor="supportHoursConsumed" className="flex items-center gap-1.5">
                          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                          Support Hour Consumed <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="supportHoursConsumed"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={supportHoursConsumed}
                          onChange={(e) => setSupportHoursConsumed(e.target.value)}
                          placeholder="e.g. 10"
                          className="h-11 rounded-xl bg-input/50 border-border/50"
                        />
                        <p className="text-xs text-muted-foreground">Deducted from the client's Support Wallet when the ticket is created.</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="historicalDate" className="flex items-center gap-1.5">
                            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                            Ticket Date <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="historicalDate"
                            type="datetime-local"
                            value={historicalDateInput}
                            onChange={(e) => setHistoricalDateInput(e.target.value)}
                            className="h-11 rounded-xl bg-input/50 border-border/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="historicalClosingDate" className="flex items-center gap-1.5">
                            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                            Closing Date <span className="font-normal text-muted-foreground">(optional)</span>
                          </Label>
                          <Input
                            id="historicalClosingDate"
                            type="datetime-local"
                            value={historicalClosingDateInput}
                            onChange={(e) => setHistoricalClosingDateInput(e.target.value)}
                            className="h-11 rounded-xl bg-input/50 border-border/50"
                          />
                          <p className="text-xs text-muted-foreground">Defaults to the Historical Ticket Date when left empty.</p>
                        </div>
                      </div>
                    </div>
                  )}
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
                    Module / Service Area <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Select
                    value={selectedModuleId}
                    onValueChange={setSelectedModuleId}
                    disabled={(isStaff && !selectedClientId) || loadingModules}
                  >
                    <SelectTrigger className="h-11 rounded-xl bg-input/50 border-border/50">
                      <SelectValue placeholder={
                        loadingModules ? 'Loading...'
                        : isStaff && !selectedClientId ? 'Select a client first'
                        : modules.length === 0 ? 'No modules / service areas available'
                        : 'Select module / service area'
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {modules.length === 0 && !(isStaff && !selectedClientId) ? (
                        <div className="px-3 py-6 text-center">
                          <Layers className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p className="text-sm text-muted-foreground">
                            {selectedProjectId ? 'No modules / service areas found for this project' : 'No modules / service areas found for this client'}
                          </p>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            Modules / Service Areas are created during project setup. Contact your support manager to add modules / service areas.
                          </p>
                        </div>
                      ) : modules.length === 0 ? (
                        <div className="px-3 py-6 text-center">
                          <p className="text-sm text-muted-foreground">Select a client first</p>
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
                  Environment <span className="text-muted-foreground font-normal">(optional)</span>
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
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Module / Service Area</p>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      {modules.find((m) => String(m.id) === selectedModuleId)?.moduleName || 'None'}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Environment</p>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                      {environment ? environment.charAt(0).toUpperCase() + environment.slice(1) : 'Not specified'}
                    </p>
                  </div>
                </div>

                {/* Ticket Type (admin/manager only) */}
                {isStaff && (
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">Ticket Type</p>
                    <p className="text-sm font-medium text-foreground">
                      {ticketType === 'historical' ? 'Historical' : 'On Behalf of Client'}
                    </p>
                    {ticketType === 'historical' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {supportHoursConsumed || 0}h will be deducted from the client's Support Wallet · dated {historicalDateInput || '—'}
                      </p>
                    )}
                  </div>
                )}

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

              {userRole === 'client' && walletAtOrBelowThreshold && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">
                    Your Support Wallet balance is at or below the 10% limit. Please recharge your wallet before creating a ticket.
                  </p>
                </div>
              )}

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
                    {draftSaved ? 'Saved!' : 'Save Draft'}
                  </Button>
                </div>
                <Button
                  type="submit"
                  disabled={loading || (userRole === 'client' && walletAtOrBelowThreshold)}
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
