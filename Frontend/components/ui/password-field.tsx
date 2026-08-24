'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Copy, RefreshCw, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  generateSecurePassword,
  evaluateStrength,
  validatePassword,
  STRENGTH_CONFIG,
  CHECK_LABELS,
} from '@/lib/password-utils'
import type { PasswordStrength, PasswordValidation } from '@/lib/password-utils'

export type { PasswordStrength, PasswordValidation }

export interface PasswordFieldProps {
  value: string
  onChange: (password: string) => void
  label?: string
  showEmailOption?: boolean
  sendEmail?: boolean
  onSendEmailChange?: (send: boolean) => void
  error?: string | null
  placeholder?: string
  name?: string
  autoGenerate?: boolean
  showValidation?: boolean
  className?: string
}

export function PasswordField({
  value,
  onChange,
  label = 'Password',
  showEmailOption = false,
  sendEmail = false,
  onSendEmailChange,
  error = null,
  placeholder = '',
  name = 'password',
  autoGenerate = true,
  showValidation = true,
  className = '',
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [useManual, setUseManual] = useState(false)

  useEffect(() => {
    if (autoGenerate && !value) {
      onChange(generateSecurePassword())
    }
  }, [])

  const validation = useMemo(() => validatePassword(value), [value])
  const strength = useMemo(() => evaluateStrength(value), [value])
  const strengthCfg = STRENGTH_CONFIG[strength]

  const handleGenerate = useCallback(() => {
    onChange(generateSecurePassword())
  }, [onChange])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Password copied to clipboard')
    } catch {
      toast.error('Failed to copy password')
    }
  }, [value])

  return (
    <div className={'space-y-3 ' + className}>
      <div className="flex items-center justify-between">
        <Label htmlFor={name}>{label}</Label>
        <Label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={useManual} onCheckedChange={(c) => {
            setUseManual(!!c)
            if (!c) onChange(generateSecurePassword())
          }} />
          Use Manual Password
        </Label>
      </div>

      <div className="p-4 rounded-lg border bg-card/50 space-y-3">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              id={name}
              type={showPassword ? 'text' : 'password'}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              readOnly={!useManual}
              placeholder={placeholder || (useManual ? 'Enter password' : 'Auto-generated password')}
              className={'pr-20 font-mono text-sm' + (error ? ' border-destructive' : '') + (!useManual ? ' bg-muted/50' : '')}
              autoComplete="new-password"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'} tabIndex={-1}>
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button type="button" onClick={handleCopy}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                aria-label="Copy password" tabIndex={-1}>
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleGenerate} type="button">
            <RefreshCw className={'h-3.5 w-3.5 mr-1'} />
            {value ? 'Regenerate' : 'Generate'}
          </Button>
          {value && (
            <Badge variant="outline" className={'text-[11px] px-1.5 py-0.5 ' + strengthCfg.color}>
              {strengthCfg.label}
            </Badge>
          )}
        </div>

        {value && showValidation && (
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: strengthCfg.width === 'w-full' ? '100%' : strengthCfg.width === 'w-3/4' ? '75%' : strengthCfg.width === 'w-2/4' ? '50%' : '25%' }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={'h-full rounded-full ' + strengthCfg.bgColor}
            />
          </div>
        )}

        {showValidation && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CHECK_LABELS).map(([key, lbl]) => {
              const passed = validation.checks[key as keyof typeof validation.checks]
              return (
                <Badge key={key} variant={passed ? 'default' : 'outline'}
                  className={'text-[11px] px-1.5 py-0.5 transition-colors duration-200' +
                    (passed ? ' bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30' : '')}>
                  {passed ? <Check className="h-2.5 w-2.5 mr-0.5 shrink-0" /> : <X className="h-2.5 w-2.5 mr-0.5 shrink-0 text-muted-foreground" />}
                  <span>{lbl}</span>
                </Badge>
              )
            })}
          </div>
        )}
      </div>

      {showEmailOption && (
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-card/50">
          <Checkbox id={name + '-send-email'} checked={sendEmail}
            onCheckedChange={(c) => onSendEmailChange?.(!!c)} />
          <Label htmlFor={name + '-send-email'} className="text-sm cursor-pointer">
            Send login credentials via email (queued after creation)
          </Label>
        </div>
      )}
    </div>
  )
}
