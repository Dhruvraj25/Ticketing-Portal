'use client'

import { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { getCountryOptions, getCountryDialCode, flagEmoji } from '@/lib/phone'
import { cn } from '@/lib/utils'

interface PhoneInputProps {
  id?: string
  /** National number without the dial code. */
  value: string
  /** ISO-3166 alpha-2 country code (e.g. 'IN'). */
  country: string
  onValueChange: (nationalNumber: string) => void
  onCountryChange: (iso2: string) => void
  placeholder?: string
  error?: string
  disabled?: boolean
  className?: string
}

/**
 * Country selector + national phone number input. Uses the same design tokens
 * as the rest of the form system (muted background, rounded-lg, emerald focus).
 */
export function PhoneInput({
  id,
  value,
  country,
  onValueChange,
  onCountryChange,
  placeholder = 'Phone number',
  error,
  disabled,
  className,
}: PhoneInputProps) {
  const options = useMemo(getCountryOptions, [])
  const dialCode = getCountryDialCode(country)

  return (
    <div
      className={cn(
        'flex items-stretch overflow-hidden rounded-lg border border-border/50 bg-muted/20 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background',
        error && 'border-destructive',
        disabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      <Select value={country || undefined} onValueChange={onCountryChange} disabled={disabled}>
        <SelectTrigger
          aria-label="Country code"
          className="w-[132px] shrink-0 h-10 rounded-none border-0 bg-transparent px-3 shadow-none focus:ring-0 focus:ring-offset-0 data-[placeholder]:text-muted-foreground"
        >
          <SelectValue>
            {country ? (
              <span className="flex items-center gap-1.5 text-foreground">
                <span className="text-base leading-none">{flagEmoji(country)}</span>
                <span className="text-xs font-medium">+{dialCode}</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Country</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80 overflow-y-auto">
          {options.map((c) => (
            <SelectItem key={c.iso2} value={c.iso2}>
              <span className="flex items-center gap-2 pr-2">
                <span className="text-base leading-none">{c.flag}</span>
                <span className="text-sm">{c.name}</span>
                <span className="text-xs text-muted-foreground">+{c.dialCode}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="tel"
        className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
      />
    </div>
  )
}
