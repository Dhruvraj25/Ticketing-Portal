'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ExternalLink, Plus, Home } from 'lucide-react'
import type { OnboardingResult } from '@/lib/types'

interface SuccessStepProps {
  result: OnboardingResult
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold break-words">{value}</p>
    </div>
  )
}

export const SuccessStep = memo(function SuccessStep({ result }: SuccessStepProps) {
  if (!result) return null

  return (
    <motion.div
      key="step-success"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, type: 'spring' }}
      className="max-w-xl mx-auto text-center space-y-6"
    >
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shadow-lg shadow-green-500/20">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Customer Successfully Onboarded! 🎉</h2>
        <p className="text-muted-foreground">All entities have been created successfully.</p>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-left">
            <SummaryItem label="Project" value={result.projectName || ''} />
            <SummaryItem label="Client" value={result.clientName || ''} />
            <SummaryItem label="User Email" value={result.userEmail || ''} />
            <SummaryItem label="Support Hours" value={`${result.supportHours} hrs`} />
            <div className="col-span-2">
              <SummaryItem label="Valid Until" value={result.validUntil || ''} />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <a href={`/dashboard/projects/${result.projectId}`}>
            <ExternalLink className="h-4 w-4 mr-1" /> Open Project
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href="/dashboard/customer-onboarding">
            <Plus className="h-4 w-4 mr-1" /> Start New Onboarding
          </a>
        </Button>
        <Button asChild variant="ghost">
          <a href="/dashboard">
            <Home className="h-4 w-4 mr-1" /> Return Dashboard
          </a>
        </Button>
      </div>
    </motion.div>
  )
})
