'use client'

import { memo } from 'react'
import { Check, UserPlus, Building2, Layers, Wallet } from 'lucide-react'
import type { WizardStep } from '../hooks/use-onboarding'

const steps = [
  { id: 1, label: 'User', icon: UserPlus },
  { id: 2, label: 'Project', icon: Building2 },
  { id: 3, label: 'Modules', icon: Layers },
  { id: 4, label: 'Hours', icon: Wallet },
]

export const ProgressStepper = memo(function ProgressStepper({ currentStep }: { currentStep: WizardStep }) {
  const stepNum: number = typeof currentStep === 'number' ? currentStep : currentStep === 'review' ? 5 : 6
  return (
    <div data-tour="onboarding-stepper" className="w-full mb-8">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {steps.map((s, i) => {
          const isActive = stepNum === s.id
          const isCompleted = stepNum > s.id || stepNum >= 5
          const Icon = s.icon
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCompleted ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30' :
                  isActive ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30 ring-4 ring-primary/20' :
                  'bg-muted text-muted-foreground'}`}>
                  {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={`text-xs font-medium mt-1.5 ${isCompleted || isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
              </div>
              {i < 3 && <div className={`flex-1 h-0.5 mx-4 rounded-full ${isCompleted ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          )
        })}
      </div>
      <div className="text-center mt-4">
        <span className="text-sm text-muted-foreground">
          {stepNum >= 6 ? 'Onboarding Complete' : stepNum === 5 ? 'Review & Confirm' : `Step ${currentStep} of 4`}
        </span>
      </div>
    </div>
  )
})
