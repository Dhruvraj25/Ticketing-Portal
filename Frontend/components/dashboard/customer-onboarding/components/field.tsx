'use client'

import { memo } from 'react'

interface FieldProps {
  name: string
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}

export const Field = memo(function Field({ name, label, required, error, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
})
