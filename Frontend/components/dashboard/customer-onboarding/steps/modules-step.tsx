'use client'

import { memo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Layers, Plus, Trash2, Search } from 'lucide-react'
import type { OnboardingState, FormErrors, ModuleOption } from '../hooks/use-onboarding'

interface ModulesStepProps {
  state: OnboardingState
  errors: FormErrors
  existingModules: ModuleOption[]
  onFieldChange: (field: string, value: any) => void
}

const stepVariants = {
  enter: { opacity: 0, x: 60, scale: 0.98 },
  center: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -60, scale: 0.98 },
}

export const ModulesStep = memo(function ModulesStep({ state, errors, existingModules, onFieldChange }: ModulesStepProps) {
  const addModule = useCallback(() => {
    const updated = [...state.newModules, { name: '', description: '' }]
    onFieldChange('newModules', updated)
  }, [state.newModules, onFieldChange])

  const removeModule = useCallback((index: number) => {
    const updated = state.newModules.filter((_, j) => j !== index)
    onFieldChange('newModules', updated)
  }, [state.newModules, onFieldChange])

  const updateModule = useCallback((index: number, field: string, value: string) => {
    const updated = state.newModules.map((m, i) =>
      i === index ? { ...m, [field]: value } : m
    )
    onFieldChange('newModules', updated)
  }, [state.newModules, onFieldChange])

  const toggleExisting = useCallback((id: number) => {
    const exists = state.selectedExistingModules.includes(id)
    const updated = exists
      ? state.selectedExistingModules.filter((eid) => eid !== id)
      : [...state.selectedExistingModules, id]
    onFieldChange('selectedExistingModules', updated)
  }, [state.selectedExistingModules, onFieldChange])

  const filteredModules = existingModules.filter((m) =>
    m.moduleName.toLowerCase().includes(state.moduleSearch.toLowerCase())
  )

  return (
    <motion.div
      key="step-modules"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Module Creation & Selection</CardTitle>
              <CardDescription>Create new modules or select from existing ones</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {errors.modules && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {errors.modules}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Create New Modules</h3>
              <Button variant="outline" size="sm" onClick={addModule}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Module
              </Button>
            </div>
            {state.newModules.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No new modules added yet.</p>
            )}
            <AnimatePresence>
              {state.newModules.map((mod, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="flex items-start gap-3 p-4 rounded-lg border bg-card/50"
                >
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Module Name</Label>
                        <Input
                          placeholder="Module name"
                          value={mod.name}
                          onChange={e => updateModule(i, 'name', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Description</Label>
                        <Input
                          placeholder="Optional"
                          value={mod.description}
                          onChange={e => updateModule(i, 'description', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeModule(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {existingModules.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">Select Existing Modules</h3>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search modules..."
                  value={state.moduleSearch}
                  onChange={e => onFieldChange('moduleSearch', e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-lg border p-2">
                {filteredModules.length > 0 ? (
                  filteredModules.map((mod) => (
                    <label
                      key={mod.id}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors hover:bg-accent ${
                        state.selectedExistingModules.includes(mod.id) ? 'bg-accent/50' : ''
                      }`}
                    >
                      <Checkbox
                        checked={state.selectedExistingModules.includes(mod.id)}
                        onCheckedChange={() => toggleExisting(mod.id)}
                      />
                      <span className="text-sm font-medium">{mod.moduleName}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No modules found</p>
                )}
              </div>
            </div>
          )}

          <div className="p-3 rounded-lg bg-muted/50 border text-sm">
            <p className="font-medium">
              Total modules: <span className="text-primary">{state.newModules.length + state.selectedExistingModules.length}</span>
            </p>
            {state.newModules.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{state.newModules.length} new module(s)</p>
            )}
            {state.selectedExistingModules.length > 0 && (
              <p className="text-xs text-muted-foreground">{state.selectedExistingModules.length} existing module(s)</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
})
