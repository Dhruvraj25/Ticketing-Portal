'use client'

import { memo, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Building2, Layers, UserPlus, Wallet, FileText, BellRing } from 'lucide-react'
import { getCountryDialCode } from '@/lib/phone'
import type { OnboardingState, UserOption, ModuleOption } from '../hooks/use-onboarding'

interface ReviewStepProps {
  state: OnboardingState
  managerList: UserOption[]
  existingModules: ModuleOption[]
  onEdit: (step: 1 | 2 | 3 | 4) => void
  onFieldChange: (field: string, value: any) => void
  clientName: string
  managerName: string
  selectedProjectName: string
}

const stepVariants = {
  enter: { opacity: 0, x: 60, scale: 0.98 },
  center: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -60, scale: 0.98 },
}

export const ReviewStep = memo(function ReviewStep({ state, managerList, existingModules, onEdit, onFieldChange, clientName, managerName, selectedProjectName }: ReviewStepProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <motion.div
      key="step-review"
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
            <div className="p-2 rounded-xl bg-slate-950">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Review & Confirm</CardTitle>
              <CardDescription>Review all information before completing onboarding</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {state.mode === 'existing' ? (
            <ReviewSection title="Existing Project" icon={<Building2 className="h-4 w-4 text-blue-500 dark:text-blue-400" />} onEdit={() => onEdit(2)}>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="col-span-2">
                  <span className="text-muted-foreground">Project:</span>{' '}
                  <span className="font-medium">{selectedProjectName}</span>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground italic">
                    Adding {state.clientUsers.length} user(s) to this existing project.
                    Support Contract and wallet are already configured.
                  </p>
                </div>
              </div>
            </ReviewSection>
          ) : (
            <ReviewSection title="Project" icon={<Building2 className="h-4 w-4 text-blue-500 dark:text-blue-400" />} onEdit={() => onEdit(2)}>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{state.projectName}</span></div>
                <div><span className="text-muted-foreground">Code:</span> <span className="font-medium font-mono">
                  {state.projectName.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 6) || 'PRJ'}-****
                </span></div>
                <div><span className="text-muted-foreground">Client:</span> <span className="font-medium">{clientName}</span></div>
                <div><span className="text-muted-foreground">Manager:</span> <span className="font-medium">{managerName}</span></div>
                {state.projectDescription && (
                  <div className="col-span-2"><span className="text-muted-foreground">Description:</span> {state.projectDescription}</div>
                )}
              </div>
            </ReviewSection>
          )}

          <ReviewSection title="Modules" icon={<Layers className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />} onEdit={() => state.mode === 'existing' ? onEdit(2) : onEdit(3)}>
            <div className="flex flex-wrap gap-2">
              {state.mode !== 'existing' ? (
                <>
                  {state.newModules.filter(m => m.name.trim()).map((m, i) => (
                    <Badge key={`n${i}`} variant="secondary">{m.name} <span className="text-[11px] ml-1 text-muted-foreground">(new)</span></Badge>
                  ))}
                  {state.selectedExistingModules.map(id => {
                    const mod = existingModules.find(m => m.id === id)
                    return mod ? <Badge key={`e${id}`} variant="outline">{mod.moduleName}</Badge> : null
                  })}
                </>
              ) : (
                <>
                  {state.projectModules.map(mod => (
                    <Badge key={`pe${mod.id}`} variant="outline">{mod.moduleName}</Badge>
                  ))}
                  {state.existingModeNewModules.filter(m => m.name.trim()).map((m, i) => (
                    <Badge key={`pn${i}`} variant="secondary">{m.name} <span className="text-[11px] ml-1 text-muted-foreground">(new)</span></Badge>
                  ))}
                  {state.projectModules.length === 0 && state.existingModeNewModules.filter(m => m.name.trim()).length === 0 && (
                    <span className="text-sm text-muted-foreground italic">No modules</span>
                  )}
                </>
              )}
            </div>
          </ReviewSection>

          <ReviewSection title="Client Users" icon={<UserPlus className="h-4 w-4 text-purple-500 dark:text-purple-400" />} onEdit={() => onEdit(1)}>
            <div className="space-y-3">
              {state.clientUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No users added</p>
              ) : (
                state.clientUsers.map((user, idx) => (
                  <div key={user.tempId} className="p-3 rounded-lg border bg-card/50">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{user.firstName} {user.lastName}</span></div>
                      <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{user.email}</span></div>
                      <div>
                        <span className="text-muted-foreground">Phone:</span>{' '}
                        <span className="font-medium">
                          {user.countryCode && getCountryDialCode(user.countryCode)
                            ? `+${getCountryDialCode(user.countryCode)} ${user.phoneNumber}`
                            : user.phoneNumber}
                        </span>
                      </div>
                      {user.designation && <div><span className="text-muted-foreground">Designation:</span> {user.designation}</div>}
                      <div>
                        <span className="text-muted-foreground">Type:</span>{' '}
                        <Badge variant="secondary" className={
                          user.userType === 'approver'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 ml-1'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 ml-1'
                        }>
                          {user.userType === 'approver' ? 'Approver' : 'Standard'}
                        </Badge>
                      </div>
                    </div>
                    {idx === 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Password: <span className="font-mono">{showPassword ? user.password : '••••••••••••'}</span>
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="ml-1 underline hover:text-foreground">
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                        {user.sendEmail && <span className="ml-3 text-green-600 dark:text-green-400">Email notifications will be sent</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ReviewSection>

          {state.mode !== 'existing' && (
            <ReviewSection title="Support Contract" icon={<Wallet className="h-4 w-4 text-amber-500 dark:text-amber-400" />} onEdit={() => onEdit(4)}>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="col-span-2">
                  <span className="text-muted-foreground">Contract Type:</span>{' '}
                  <span className="font-medium capitalize">
                    {state.contractType === 'hypercare' ? 'Hypercare / Stability Support' : state.contractType === 'support_agreement' ? 'Support Agreement' : '—'}
                  </span>
                </div>
                {state.contractType === 'hypercare' ? (
                  <>
                    <div><span className="text-muted-foreground">Duration:</span> <span className="font-medium">{state.hypercareDuration} days</span></div>
                    <div><span className="text-muted-foreground">Start Date:</span> {state.supportStartDate || '—'}</div>
                    <div><span className="text-muted-foreground">End Date:</span> {state.supportEndDate || '—'}</div>
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground italic">
                        Hypercare support is time-based and does not use a support hour wallet.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div><span className="text-muted-foreground">Hours:</span> <span className="font-medium">{state.supportHours}</span></div>
                    <div><span className="text-muted-foreground">Start Date:</span> {state.supportStartDate || '—'}</div>
                    <div><span className="text-muted-foreground">End Date:</span> {state.supportEndDate || '—'}</div>
                  </>
                )}
                {state.supportRemarks && <div className="col-span-2"><span className="text-muted-foreground">Remarks:</span> {state.supportRemarks}</div>}
              </div>
            </ReviewSection>
          )}

          <ReviewSection
            title="Notification Preferences"
            icon={<BellRing className="h-4 w-4 text-sky-500 dark:text-sky-400" />}
            onEdit={state.mode === 'new' ? () => onEdit(4) : undefined}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm space-y-1">
                <p className="font-medium">Microsoft Teams Notifications</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {state.enableTeamsNotifications
                    ? 'Ticket & support events are posted to Microsoft Teams with the involved users mentioned. In-app & email notifications always continue.'
                    : 'Teams notifications are disabled for this customer. In-app & email notifications always continue.'}
                </p>
              </div>
              <Switch
                checked={state.enableTeamsNotifications}
                onCheckedChange={(v) => onFieldChange('enableTeamsNotifications', v)}
                aria-label="Enable Microsoft Teams notifications"
              />
            </div>
          </ReviewSection>
        </CardContent>
      </Card>
    </motion.div>
  )
})

function ReviewSection({ title, icon, onEdit, children }: { title: string; icon: React.ReactNode; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">{icon}{title}</h3>
        {onEdit && <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>}
      </div>
      {children}
    </div>
  )
}
