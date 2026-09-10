// ============================================================================
// Centralized Error Handling Utility
// ============================================================================
// Converts known backend errors into safe, user-facing messages.
// Every page should use these utilities instead of parsing raw error strings.
//
// Usage:
//   import { getFriendlyError, getErrorToast } from '@/lib/error-utils'
//   const message = getFriendlyError(error)
//   toast.error(message)
// ============================================================================

// ─── Error Code Constants ───────────────────────────────────────────────────
// Stable, machine-readable codes returned by the backend.
// Frontend maps these to user-facing messages.

export type ErrorCode =
  | 'USER_VALIDATION_ERROR'
  | 'USER_EMAIL_EXISTS'
  | 'USER_NOT_FOUND'
  | 'USER_CREATE_FAILED'
  | 'USER_DELETE_FAILED'
  | 'USER_DELETE_FORBIDDEN'
  | 'USER_DELETE_DEPENDENCY'
  | 'AUTH_ACCOUNT_CREATE_FAILED'
  | 'EMAIL_SEND_FAILED'
  | 'EMAIL_PROVIDER_UNAUTHORIZED'
  | 'EMAIL_PROVIDER_UNAVAILABLE'
  | 'PASSWORD_INVALID'
  | 'PASSWORD_MISMATCH'
  | 'PASSWORD_RESET_EXPIRED'
  | 'ACCOUNT_INACTIVE'
  | 'ACCOUNT_DELETED'
  | 'ACCOUNT_BANNED'
  | 'SESSION_CREATE_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN_ERROR'

// ─── Error Message Map ──────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  USER_VALIDATION_ERROR: 'Please complete all required fields.',
  USER_EMAIL_EXISTS: 'A user with this email address already exists.',
  USER_NOT_FOUND: 'The user could not be found. They may have already been deleted.',
  USER_CREATE_FAILED: 'We couldn\'t create the user right now. Please try again.',
  USER_DELETE_FAILED: 'We couldn\'t delete the user right now. Please try again.',
  USER_DELETE_FORBIDDEN: 'You do not have permission to delete this user.',
  USER_DELETE_DEPENDENCY: 'This account cannot be deleted because it is still associated with existing tickets, projects, or work records. Please reassign or remove those associations first, or deactivate the user instead.',
  AUTH_ACCOUNT_CREATE_FAILED: 'The user profile was created, but the login account could not be created. Please try again or contact an administrator.',
  EMAIL_SEND_FAILED: 'The user was created, but the onboarding email could not be sent.',
  EMAIL_PROVIDER_UNAUTHORIZED: 'The email service is not authorized to send this message. Please contact an administrator.',
  EMAIL_PROVIDER_UNAVAILABLE: 'The email service is temporarily unavailable. Please try again later.',
  PASSWORD_INVALID: 'Password does not meet the required security requirements.',
  PASSWORD_MISMATCH: 'Passwords do not match.',
  PASSWORD_RESET_EXPIRED: 'This password reset link has expired. Please request a new one.',
  ACCOUNT_INACTIVE: 'Your account is not active. Please contact an administrator.',
  ACCOUNT_DELETED: 'This account is no longer available.',
  ACCOUNT_BANNED: 'Your account has been deactivated.',
  SESSION_CREATE_FAILED: 'We couldn\'t sign you in right now. Please try again.',
  UNAUTHORIZED: 'You need to sign in to access this page.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NETWORK_ERROR: 'Unable to connect to the server. Please check your connection and try again.',
  INTERNAL_ERROR: 'Something went wrong. Please try again later.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
}

// ─── Pattern Matching for Error Messages ────────────────────────────────────
// Maps common error message patterns (from Better Auth, Prisma, etc.) to
// user-friendly messages. Order matters — more specific patterns first.

const ERROR_PATTERNS: Array<{ pattern: RegExp; code: ErrorCode }> = [
  // User creation
  { pattern: /already exists|duplicate|unique.*email|email.*already/i, code: 'USER_EMAIL_EXISTS' },
  { pattern: /valid.*email|email.*invalid|invalid.*email/i, code: 'USER_VALIDATION_ERROR' },
  { pattern: /user.*not found|not.*found/i, code: 'USER_NOT_FOUND' },

  // Account states
  { pattern: /deactivated|banned|account.*disabled/i, code: 'ACCOUNT_BANNED' },
  { pattern: /account.*not active|inactive.*account/i, code: 'ACCOUNT_INACTIVE' },
  { pattern: /account.*deleted|deleted.*account/i, code: 'ACCOUNT_DELETED' },

  // Auth
  { pattern: /invalid.*credentials|incorrect.*password|wrong.*password|invalid.*email or password/i, code: 'UNAUTHORIZED' },
  { pattern: /session.*invalid|session.*expired|session.*create/i, code: 'SESSION_CREATE_FAILED' },

  // Password
  { pattern: /password.*match|passwords.*match/i, code: 'PASSWORD_MISMATCH' },
  { pattern: /password.*short|password.*weak|at least.*characters|min.*length/i, code: 'PASSWORD_INVALID' },
  { pattern: /reset.*link.*expired|token.*expired/i, code: 'PASSWORD_RESET_EXPIRED' },

  // Email
  { pattern: /email.*send|email.*fail|email.*error|email.*could not/i, code: 'EMAIL_SEND_FAILED' },

  // Access
  { pattern: /access denied|unauthorized|not.*authenticated/i, code: 'FORBIDDEN' },

  // Delete dependencies
  { pattern: /associated records|cannot be deleted because.*existing|has associated records/i, code: 'USER_DELETE_DEPENDENCY' },

  // Database
  { pattern: /database.*error|prisma|sql|pg_|relation.*constraint|foreign.*key/i, code: 'INTERNAL_ERROR' },

  // Network
  { pattern: /network|fetch.*fail|connection.*refused|timeout|ECONNREFUSED/i, code: 'NETWORK_ERROR' },

  // Generic
  { pattern: /internal server error|500/i, code: 'INTERNAL_ERROR' },
]

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Extract a safe, user-facing error message from any error type.
 *
 * Priority:
 * 1. Structured error with `code` field → lookup in ERROR_MESSAGES
 * 2. Error message matched against ERROR_PATTERNS → corresponding message
 * 3. Generic fallback
 */
export function getFriendlyError(error: unknown): string {
  if (!error) return ERROR_MESSAGES.UNKNOWN_ERROR

  // Handle Error instances
  if (error instanceof Error) {
    const msg = error.message

    // Check if the error has a structured code
    const code = (error as any).code as ErrorCode | undefined
    if (code && ERROR_MESSAGES[code]) {
      return ERROR_MESSAGES[code]
    }

    // Match against known patterns
    for (const { pattern, code: matchedCode } of ERROR_PATTERNS) {
      if (pattern.test(msg)) {
        return ERROR_MESSAGES[matchedCode]
      }
    }

    // If it looks like a clean user-facing message (no SQL, no stack), pass through
    if (msg.length < 200 && !/SQL|Prisma|stack|Error:|at\s/i.test(msg)) {
      return msg
    }
  }

  // Handle string errors
  if (typeof error === 'string') {
    for (const { pattern, code } of ERROR_PATTERNS) {
      if (pattern.test(error)) {
        return ERROR_MESSAGES[code]
      }
    }
    if (error.length < 200) return error
  }

  return ERROR_MESSAGES.UNKNOWN_ERROR
}

/**
 * Get a toast-friendly error object with title and description.
 */
export function getErrorToast(error: unknown): { title: string; description: string } {
  const message = getFriendlyError(error)
  return {
    title: 'Error',
    description: message,
  }
}

/**
 * Get a success toast message for a known operation.
 */
export function getSuccessMessage(operation: string): string {
  const messages: Record<string, string> = {
    'user-created': 'User created successfully.',
    'user-deleted': 'User deleted successfully.',
    'user-updated': 'User updated successfully.',
    'password-reset': 'Password reset successfully.',
    'role-changed': 'User role updated successfully.',
    'profile-updated': 'Profile updated successfully.',
    'saved': 'Changes saved successfully.',
  }
  return messages[operation] || 'Action completed successfully.'
}

/**
 * Check if an error indicates a specific condition.
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  if (error instanceof Error) {
    return (error as any).code === code
  }
  return false
}

/**
 * Create a structured error with a machine-readable code.
 * Use this in server actions to create errors that the frontend can parse.
 */
export function createAppError(message: string, code: ErrorCode): Error & { code: ErrorCode } {
  const err = new Error(message) as Error & { code: ErrorCode }
  err.code = code
  return err
}
