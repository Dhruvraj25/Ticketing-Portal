/**
 * Environment Variable Validation
 *
 * Validates that all required environment variables are present at startup.
 * Runs at module import time (server startup) to fail fast with clear
 * error messages rather than cryptic runtime errors.
 */

interface EnvVar {
  name: string
  description: string
  required: boolean
}

const REQUIRED_ENV_VARS: EnvVar[] = [
  { name: 'DATABASE_URL', description: 'PostgreSQL connection string', required: true },
  { name: 'BETTER_AUTH_SECRET', description: 'Secret key for Better Auth session encryption', required: true },
  { name: 'BETTER_AUTH_URL', description: 'Base URL for Better Auth', required: false },
  { name: 'NEXT_PUBLIC_APP_URL', description: 'Public-facing application URL', required: false },
  { name: 'CLOUDINARY_CLOUD_NAME', description: 'Cloudinary cloud name for image uploads', required: false },
  { name: 'CLOUDINARY_API_KEY', description: 'Cloudinary API key', required: false },
  { name: 'CLOUDINARY_API_SECRET', description: 'Cloudinary API secret', required: false },
  // Email delivery is fully handled by the backend email service — the frontend
  // never holds email provider credentials (no SMTP / Resend / Microsoft vars).
  { name: 'SUPPORT_EMAIL', description: 'Support email address that receives password-reset requests', required: false },
  { name: 'NEXT_PUBLIC_SENTRY_DSN', description: 'Sentry DSN for error tracking', required: false },
]

interface ValidationResult {
  valid: boolean
  missing: { name: string; description: string }[]
  warnings: { name: string; description: string }[]
}

export function validateEnv(): ValidationResult {
  const missing: { name: string; description: string }[] = []
  const warnings: { name: string; description: string }[] = []

  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.name]
    if (!value || value.trim() === '') {
      if (envVar.required) {
        missing.push({ name: envVar.name, description: envVar.description })
      } else {
        warnings.push({ name: envVar.name, description: envVar.description })
      }
    }
  }

  return { valid: missing.length === 0, missing, warnings }
}

export function assertValidEnv(): void {
  const result = validateEnv()
  if (result.missing.length > 0) {
    const isDev = process.env.NODE_ENV !== 'production'
    console.error('Missing required environment variables:')
    for (const v of result.missing) {
      console.error('  MISSING: ' + v.name + ' - ' + v.description)
    }
    if (!isDev) {
      throw new Error('Missing required environment variables: ' + result.missing.map(v => v.name).join(', '))
    }
  }
  if (result.warnings.length > 0) {
    console.warn('Optional environment variables not set:')
    for (const v of result.warnings) {
      console.warn('  ' + v.name + ' - ' + v.description)
    }
  }
}
