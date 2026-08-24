export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 64

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SPECIAL = '!@#$%^&*()_+-=[]{}|;:,.<>?'
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS + SPECIAL

function secureRandomIndex(max: number): number {
  const array = new Uint32Array(1)
  const maxValid = Math.floor(0xffffffff / max) * max
  do { crypto.getRandomValues(array) } while (array[0]! >= maxValid)
  return array[0]! % max
}

function pickRandom(chars: string): string {
  return chars[secureRandomIndex(chars.length)]!
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return shuffled
}

export type PasswordStrength = 'weak' | 'medium' | 'strong' | 'very-strong'

export interface PasswordValidation {
  isValid: boolean
  strength: PasswordStrength
  checks: { minLength: boolean; uppercase: boolean; lowercase: boolean; digit: boolean; special: boolean }
  errors: string[]
}

export function generateSecurePassword(length = 16): string {
  const actualLength = Math.max(length, PASSWORD_MIN_LENGTH)
  const guaranteed = [
    pickRandom(UPPERCASE), pickRandom(LOWERCASE),
    pickRandom(DIGITS), pickRandom(SPECIAL),
  ]
  const remaining = Array.from({ length: actualLength - 4 }, () => pickRandom(ALL_CHARS))
  return shuffleArray([...guaranteed, ...remaining]).join('')
}

export function evaluateStrength(password: string): PasswordStrength {
  if (!password) return 'weak'
  let score = 0
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1
  if (password.length >= 16) score += 1
  if (password.length >= 24) score += 1
  if (/[a-z]/.test(password)) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) score += 1
  const unique = new Set(password).size
  if (unique >= 10) score += 1
  if (unique >= 16) score += 1
  if (score >= 8) return 'very-strong'
  if (score >= 6) return 'strong'
  if (score >= 4) return 'medium'
  return 'weak'
}

export function validatePassword(password: string): PasswordValidation {
  const checks = {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password),
  }
  const errors: string[] = []
  if (!checks.minLength) errors.push('At least ' + PASSWORD_MIN_LENGTH + ' characters required')
  if (!checks.uppercase) errors.push('Must contain an uppercase letter')
  if (!checks.lowercase) errors.push('Must contain a lowercase letter')
  if (!checks.digit) errors.push('Must contain a number')
  if (!checks.special) errors.push('Must contain a special character')
  return { isValid: Object.values(checks).every(Boolean), strength: evaluateStrength(password), checks, errors }
}

export const STRENGTH_CONFIG: Record<PasswordStrength, { label: string; color: string; bgColor: string; width: string }> = {
  weak: { label: 'Weak', color: 'text-red-500 dark:text-red-400', bgColor: 'bg-red-500', width: 'w-1/4' },
  medium: { label: 'Medium', color: 'text-amber-500 dark:text-amber-400', bgColor: 'bg-amber-500', width: 'w-2/4' },
  strong: { label: 'Strong', color: 'text-emerald-500 dark:text-emerald-400', bgColor: 'bg-emerald-500', width: 'w-3/4' },
  'very-strong': { label: 'Very Strong', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-600', width: 'w-full' },
}

export const CHECK_LABELS: Record<string, string> = {
  minLength: '12+ characters',
  uppercase: 'Uppercase',
  lowercase: 'Lowercase',
  digit: 'Number',
  special: 'Special character',
}
