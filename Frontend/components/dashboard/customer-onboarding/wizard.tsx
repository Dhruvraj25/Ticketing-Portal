'use client'

import dynamic from 'next/dynamic'
import { useOnboarding } from './hooks/use-onboarding'
import { ProgressStepper } from './components/progress-stepper'
import { useMemo } from 'react'
import { UserStep } from './steps/user-step'
import { ProjectStep } from './steps/project-step'
import { ModulesStep } from './steps/modules-step'
import { SupportContractStep } from './steps/hours-step'
import { AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2, X } from 'lucide-react'
import type { ClientUserEntry } from './hooks/use-onboarding'

// ── Lazy-load the less-frequently used steps ─────────────────────────────
const ReviewStep = dynamic(
  () => import('./steps/review-step').then((m) => ({ default: m.ReviewStep })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    ),
    ssr: false,
  }
)

const SuccessStep = dynamic(
  () => import('./steps/success-step').then((m) => ({ default: m.SuccessStep })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    ),
    ssr: false,
  }
)

export function CustomerOnboardingWizard({ currentUserRole, currentUserId }: { currentUserRole: string; currentUserId: string }) {
  const {
    state,
    setField,
    goNext,
    goPrev,
    saveDraft,
    loadDraft,
    handleFinish,
    router,
    managerName,
    clientName,
    selectedProjectName,
    setMode,
    addUser,
    updateUser,
    removeUser,
    startEditingUser,
    cancelEditing,
    addModuleToExisting,
    removeModuleFromExisting,
    updateModuleInExisting,
  } = useOnboarding(currentUserRole, currentUserId)

  const handleUserFieldChange = useMemo(() => {
    return (field: string, value: any) => {
      // Intercept special user action keys
      if (field === '__add_user') {
        addUser()
      } else if (field === '__update_user') {
        updateUser()
      } else if (field === '__remove_user') {
        removeUser(value)
      } else if (field === '__start_edit') {
        startEditingUser(value)
      } else if (field === '__cancel_edit') {
        cancelEditing()
      } else {
        setField(field, value)
      }
    }
  }, [addUser, updateUser, removeUser, startEditingUser, cancelEditing, setField])

  return (
    <div data-tour="onboarding-wizard" className="max-w-4xl mx-auto">
      <ProgressStepper currentStep={state.step} />
      <AnimatePresence mode="wait">
        {state.step === 1 && (
          <UserStep
            state={state}
            errors={state.errors}
            onFieldChange={handleUserFieldChange}
          />
        )}
        {state.step === 2 && (
          <ProjectStep
            state={state}
            errors={state.errors}
            managerList={state.managerList}
            existingProjects={state.availableProjects}
            currentUserRole={currentUserRole}
            onFieldChange={setField}
            setMode={setMode}
            addModuleToExisting={addModuleToExisting}
            removeModuleFromExisting={removeModuleFromExisting}
            updateModuleInExisting={updateModuleInExisting}
          />
        )}
        {state.step === 3 && (
          <ModulesStep
            state={state}
            errors={state.errors}
            existingModules={state.existingModules}
            onFieldChange={setField}
          />
        )}
        {state.step === 4 && (
          <SupportContractStep
            state={state}
            errors={state.errors}
            onFieldChange={setField}
          />
        )}
        {state.step === 'review' && (
          <ReviewStep
            state={state}
            managerList={state.managerList}
            existingModules={state.existingModules}
            onEdit={(s) => setField('step', s)}
            onFieldChange={setField}
            clientName={clientName}
            managerName={managerName}
            selectedProjectName={selectedProjectName}
          />
        )}
        {state.step === 'success' && state.onboardingResult && (
          <SuccessStep result={state.onboardingResult} />
        )}
      </AnimatePresence>
      {state.step !== 'success' && (
        <>
          <div className="flex items-center justify-between pt-6 border-t mt-6">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={goPrev} disabled={state.step === 1}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <Button variant="ghost" onClick={saveDraft} disabled={state.submitting}>Save Draft</Button>
              <Button variant="ghost" onClick={loadDraft} disabled={state.submitting}>Load Draft</Button>
            </div>
            {state.step === 'review' ? (
              <Button onClick={handleFinish} disabled={state.submitting} size="lg">
                {state.submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                ) : state.mode === 'existing' ? (
                  <>Add Users to Project <CheckCircle2 className="h-4 w-4 ml-2" /></>
                ) : (
                  <>Complete Onboarding <CheckCircle2 className="h-4 w-4 ml-2" /></>
                )}
              </Button>
            ) : (
              <Button onClick={goNext}>
                {state.step === 4 ? 'Review' : 'Next'} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
          <div className="text-center mt-4">
            <Button variant="link" className="text-muted-foreground" onClick={() => router.push('/dashboard')}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel and return to dashboard
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
