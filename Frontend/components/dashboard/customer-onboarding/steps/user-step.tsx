'use client'

import { memo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PasswordField } from '@/components/ui/password-field'
import { PhoneInput } from '@/components/ui/phone-input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  UserPlus, Plus, Trash2, Pencil, X, Users, ShieldCheck, UserCircle,
} from 'lucide-react'
import { Field } from '../components/field'
import type { OnboardingState, FormErrors, ClientUserEntry } from '../hooks/use-onboarding'

interface UserStepProps {
  state: OnboardingState
  errors: FormErrors
  onFieldChange: (field: string, value: any) => void
}

const stepVariants = {
  enter: { opacity: 0, x: 60, scale: 0.98 },
  center: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -60, scale: 0.98 },
}

function canSaveUserForm(state: OnboardingState): boolean {
  return (
    state.userFormFirstName.trim().length > 0 &&
    state.userFormLastName.trim().length > 0 &&
    state.userFormEmail.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.userFormEmail.trim()) &&
    state.userFormPhoneNumber.trim().length > 0 &&
    state.userFormPassword.length >= 12
  )
}

export const UserStep = memo(function UserStep({ state, errors, onFieldChange }: UserStepProps) {
  // Parent provides: addUser, updateUser, removeUser, startEditingUser, cancelEditing, setUserFormField
  // These are accessed via closures in the wizard, so we call onFieldChange with special keys
  const isEditing = !!state.editingUserTempId

  const handleSaveUser = useCallback(() => {
    // Signal to the parent via a special field key
    if (isEditing) {
      onFieldChange('__update_user', state.editingUserTempId)
    } else {
      onFieldChange('__add_user', true)
    }
  }, [isEditing, state.editingUserTempId, onFieldChange])

  const handleCancel = useCallback(() => {
    onFieldChange('__cancel_edit', true)
  }, [onFieldChange])

  const handleEditUser = useCallback((user: ClientUserEntry) => {
    onFieldChange('__start_edit', user)
  }, [onFieldChange])

  const handleDeleteUser = useCallback((tempId: string) => {
    onFieldChange('__remove_user', tempId)
  }, [onFieldChange])

  return (
    <motion.div
      key="step-user"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* ── Add / Edit User Form ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500">
              <UserPlus className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Client User Creation</CardTitle>
              <CardDescription>
                {isEditing ? 'Edit the client user details' : 'Add client users with portal access'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field
              name="userFormFirstName"
              label="First Name"
              required
              error={errors.userFormFirstName}
            >
              <Input
                placeholder="John"
                value={state.userFormFirstName}
                onChange={(e) => onFieldChange('userFormFirstName', e.target.value)}
                className={errors.userFormFirstName ? 'border-destructive' : ''}
              />
            </Field>
            <Field
              name="userFormLastName"
              label="Last Name"
              required
              error={errors.userFormLastName}
            >
              <Input
                placeholder="Doe"
                value={state.userFormLastName}
                onChange={(e) => onFieldChange('userFormLastName', e.target.value)}
                className={errors.userFormLastName ? 'border-destructive' : ''}
              />
            </Field>
            <Field
              name="userFormEmail"
              label="Email"
              required
              error={errors.userFormEmail}
            >
              <Input
                type="email"
                placeholder="john@example.com"
                value={state.userFormEmail}
                onChange={(e) => onFieldChange('userFormEmail', e.target.value)}
                className={errors.userFormEmail ? 'border-destructive' : ''}
              />
            </Field>
            <Field
              name="userFormPhoneNumber"
              label="Phone Number"
              required
              error={errors.userFormPhoneNumber}
            >
              <PhoneInput
                value={state.userFormPhoneNumber}
                country={state.userFormCountryCode}
                onValueChange={(v) => onFieldChange('userFormPhoneNumber', v)}
                onCountryChange={(iso2) => onFieldChange('userFormCountryCode', iso2)}
                placeholder="Enter phone number"
                error={errors.userFormPhoneNumber}
              />
            </Field>
            <Field
              name="userFormDesignation"
              label="Designation"
            >
              <Input
                placeholder="Project Manager"
                value={state.userFormDesignation}
                onChange={(e) => onFieldChange('userFormDesignation', e.target.value)}
              />
            </Field>
            <Field
              name="userFormUserType"
              label="User Type"
              required
              error={errors.userFormUserType}
            >
              <Select
                value={state.userFormUserType}
                onValueChange={(v) => onFieldChange('userFormUserType', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approver">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                      <span>Approver</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="standard">
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                      <span>Standard</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <PasswordField
            value={state.userFormPassword}
            onChange={(v) => onFieldChange('userFormPassword', v)}
            error={errors.userFormPassword}
            showEmailOption
            sendEmail={state.userFormSendEmail}
            onSendEmailChange={(v) => onFieldChange('userFormSendEmail', v)}
            autoGenerate={!state.userFormUseManualPassword}
          />

          <div className="flex items-center gap-2 pt-2">
            {isEditing ? (
              <>
                <Button onClick={handleSaveUser} disabled={!canSaveUserForm(state)}>
                  <UserPlus className="h-4 w-4 mr-1" /> Update User
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
              </>
            ) : (
              <Button onClick={handleSaveUser} disabled={!canSaveUserForm(state)}>
                <Plus className="h-4 w-4 mr-1" /> Add User
              </Button>
            )}
            {!isEditing && state.clientUsers.length === 0 && canSaveUserForm(state) && (
              <p className="text-xs text-muted-foreground ml-2">
                Then click <strong>Next</strong> to continue
              </p>
            )}
          </div>

          {/* User Type Descriptions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                <ShieldCheck className="h-4 w-4" /> Approver
              </div>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-1">
                Can create/close tickets, approve estimates, approve additional hours, approve reviews, view company tickets, comment, and upload attachments.
              </p>
            </div>
            <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400">
                <UserCircle className="h-4 w-4" /> Standard
              </div>
              <p className="text-xs text-blue-600/80 dark:text-blue-400/70 mt-1">
                Can create/close tickets, view tickets, comment, and upload attachments. Cannot approve estimates, additional hours, or reviews.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Users Table ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-950">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Added Users ({state.clientUsers.length})</CardTitle>
              <CardDescription>
                Review, edit, or remove client users
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {errors.clientUsers && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {errors.clientUsers}
            </div>
          )}

          {state.clientUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No users added yet</p>
              <p className="text-xs mt-1">Use the form above to add client users</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>User Type</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.clientUsers.map((user, index) => (
                    <TableRow key={user.tempId} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                      <TableCell className="font-medium">
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            user.userType === 'approver'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          }
                        >
                          {user.userType === 'approver' ? (
                            <><ShieldCheck className="h-3 w-3 mr-1" /> Approver</>
                          ) : (
                            <><UserCircle className="h-3 w-3 mr-1" /> Standard</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.designation || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditUser(user)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteUser(user.tempId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
})
