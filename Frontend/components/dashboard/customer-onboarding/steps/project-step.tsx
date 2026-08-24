'use client'

import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Building2, FolderPlus, FolderOpen, Layers, Loader2, Plus, Trash2 } from 'lucide-react'
import { Field } from '../components/field'
import type { OnboardingState, FormErrors, UserOption, ExistingProjectOption, OnboardingMode } from '../hooks/use-onboarding'

interface ProjectStepProps {
  state: OnboardingState
  errors: FormErrors
  managerList: UserOption[]
  existingProjects: ExistingProjectOption[]
  currentUserRole: string
  onFieldChange: (field: string, value: any) => void
  setMode: (mode: OnboardingMode) => void
  addModuleToExisting?: () => void
  removeModuleFromExisting?: (index: number) => void
  updateModuleInExisting?: (index: number, field: string, value: string) => void
}

const stepVariants = {
  enter: { opacity: 0, x: 60, scale: 0.98 },
  center: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -60, scale: 0.98 },
}

export const ProjectStep = memo(function ProjectStep({ state, errors, managerList, existingProjects, currentUserRole, onFieldChange, setMode, addModuleToExisting, removeModuleFromExisting, updateModuleInExisting }: ProjectStepProps) {
  return (
    <motion.div
      key="step-project"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* ── Mode Toggle ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-950">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Project</CardTitle>
              <CardDescription>
                {state.mode === 'new'
                  ? 'Create a new project for the customer'
                  : 'Add client users to an existing project'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Mode toggle buttons */}
          <div className="flex gap-2 p-1 rounded-lg bg-muted w-fit">
            <Button
              variant={state.mode === 'new' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('new')}
              className="gap-2"
            >
              <FolderPlus className="h-4 w-4" />
              New Project
            </Button>
            <Button
              variant={state.mode === 'existing' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('existing')}
              className="gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              Existing Project
            </Button>
          </div>

          {state.mode === 'existing' ? (
            /* ── Existing Project Selector ──────────────────────────── */
            <div className="space-y-5">
              <Field name="selectedProjectId" label="Select Project" required error={errors.selectedProjectId}>
                <Select
                  value={state.selectedProjectId ? String(state.selectedProjectId) : ''}
                  onValueChange={(v) => onFieldChange('selectedProjectId', parseInt(v))}
                >
                  <SelectTrigger className={errors.selectedProjectId ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select an active project" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingProjects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.projectName} ({p.projectCode}) — {p.clientName || 'Unknown client'}
                      </SelectItem>
                    ))}
                    {existingProjects.length === 0 && (
                      <SelectItem value="__none" disabled>No active projects found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </Field>

              {/* ── Existing Project Modules & New Module Creator ── */}
              {state.selectedProjectId && (
                <div className="space-y-4 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                    <h3 className="text-sm font-semibold">Project Modules</h3>
                  </div>

                  {/* Existing modules of the project */}
                  {state.loadingProjectModules ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading modules...
                    </div>
                  ) : state.projectModules.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {state.projectModules.map((mod) => (
                        <Badge key={mod.id} variant="secondary" className="gap-1">
                          <Layers className="h-3 w-3" />
                          {mod.moduleName}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No existing modules found for this project.</p>
                  )}

                  {/* ── New Module Creator ─────────────────────────── */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Create New Modules
                      </h4>
                      <Button variant="outline" size="sm" onClick={addModuleToExisting}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Module
                      </Button>
                    </div>
                    {state.existingModeNewModules.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No new modules added yet.</p>
                    )}
                    <AnimatePresence>
                      {state.existingModeNewModules.map((mod, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card/50"
                        >
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Module Name</Label>
                              <Input
                                placeholder="Module name"
                                value={mod.name}
                                onChange={(e) => updateModuleInExisting?.(i, 'name', e.target.value)}
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Description</Label>
                              <Input
                                placeholder="Optional"
                                value={mod.description}
                                onChange={(e) => updateModuleInExisting?.(i, 'description', e.target.value)}
                                className="h-9"
                              />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 mt-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeModuleFromExisting?.(i)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Module count summary */}
                  <div className="p-2 rounded-lg bg-muted/30 border text-xs text-muted-foreground">
                    {state.projectModules.length} existing module(s)
                    {state.existingModeNewModules.length > 0 && (
                      <>{' · '}{state.existingModeNewModules.length} new module(s) to create</>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── New Project Form ───────────────────────────────────── */
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field name="projectName" label="Project Name" required error={errors.projectName}>
                  <Input
                    placeholder="Enter project name"
                    value={state.projectName}
                    onChange={e => onFieldChange('projectName', e.target.value)}
                    className={errors.projectName ? 'border-destructive' : ''}
                  />
                </Field>
                <Field name="manager" label="Project Manager" required error={errors.selectedManager}>
                  <Select
                    value={state.selectedManager}
                    onValueChange={(v) => onFieldChange('selectedManager', v)}
                    disabled={currentUserRole === 'project_manager'}
                  >
                    <SelectTrigger className={errors.selectedManager ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Select a manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {managerList.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name} ({m.email})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {currentUserRole === 'project_manager' && (
                    <p className="text-xs text-muted-foreground mt-1">Auto-set to your account</p>
                  )}
                </Field>
                <Field name="projectType" label="Project Type">
                  <Select value={state.projectType} onValueChange={(v) => onFieldChange('projectType', v)}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="consulting">Consulting</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field name="priority" label="Priority">
                  <Select value={state.projectPriority} onValueChange={(v) => onFieldChange('projectPriority', v)}>
                    <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field name="startDate" label="Start Date">
                  <Input
                    type="date"
                    value={state.projectStartDate}
                    onChange={e => onFieldChange('projectStartDate', e.target.value)}
                  />
                </Field>
              </div>
              <Field name="description" label="Description">
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Project description..."
                  value={state.projectDescription}
                  onChange={e => onFieldChange('projectDescription', e.target.value)}
                />
              </Field>
              <Field name="notes" label="Notes">
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Additional notes..."
                  value={state.projectNotes}
                  onChange={e => onFieldChange('projectNotes', e.target.value)}
                />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
})
