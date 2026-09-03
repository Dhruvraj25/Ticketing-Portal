'use server'

import { getCurrentUser, invalidateAuthUserCache } from '@/lib/auth-utils'
import { getPortalUrl } from '@/lib/urls'
import { db } from '@/lib/db'
import { user, passwordResetRequest, verification } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import { headers } from 'next/headers'
import { VALIDATION, validateField } from '@/lib/types'
import { wrapServerAction } from '@/lib/performance-profiler'
import { isValidPhoneForCountry } from '@/lib/phone'
import { auth } from '@/lib/auth'
import { sendNotification } from '@/lib/email-backend'
import { dispatchNotification } from '@/lib/notify-all'
import { logPasswordAudit } from '@/lib/password-audit'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  project_manager: 'Project Manager',
  developer: 'Developer / Resource',
  client: 'Client',
}

// ── Strict role-based password policy ────────────────────────────────────
// Only Admin and Project Manager may change a password directly (their own
// via this action, or other users' via resetUserPassword in actions/admin.ts).
// Client and Developer must request a reset through Support instead.
function canChangePasswordDirectly(role: string): boolean {
  return role === 'admin' || role === 'project_manager'
}

const PROFILE_ABOUT_MAX_LENGTH = 2048
const ALLOWED_LANGUAGES = ['en', 'es', 'fr', 'de', 'ja']
const ALLOWED_TIME_FORMATS = ['12h', '24h']
const ALLOWED_DATE_FORMATS = ['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd']

export const updateProfile = wrapServerAction('updateProfile', async function updateProfile(data: {
  name: string
  phone?: string
  countryCode?: string
  timezone?: string
  about?: string
  language?: string
  timeFormat?: string
  dateFormat?: string
  emailNotificationsEnabled?: boolean
}) {
  const currentUser = await getCurrentUser()

  // ── Validation ─────────────────────────────────────────────────────────
  const nameErr = validateField(data.name, VALIDATION.USER_NAME_MAX_LENGTH, 'Name')
  if (nameErr) throw new Error(nameErr)

  if (data.about !== undefined && data.about.length > PROFILE_ABOUT_MAX_LENGTH) {
    throw new Error(`About must be at most ${PROFILE_ABOUT_MAX_LENGTH} characters.`)
  }

  // Phone: only validated when a non-empty number is provided. Empty phone is
  // allowed (field is optional). When provided, it must be valid for the
  // selected country so malformed or wrong-country numbers are rejected.
  const phone = data.phone?.trim() ?? ''
  if (phone && !isValidPhoneForCountry(phone, data.countryCode)) {
    throw new Error('Please enter a valid phone number for the selected country.')
  }

  if (data.timezone !== undefined && data.timezone.trim().length > 100) {
    throw new Error('Timezone is invalid.')
  }

  if (data.language !== undefined && !ALLOWED_LANGUAGES.includes(data.language)) {
    throw new Error('Language selection is invalid.')
  }
  if (data.timeFormat !== undefined && !ALLOWED_TIME_FORMATS.includes(data.timeFormat)) {
    throw new Error('Time format selection is invalid.')
  }
  if (data.dateFormat !== undefined && !ALLOWED_DATE_FORMATS.includes(data.dateFormat)) {
    throw new Error('Date format selection is invalid.')
  }

  await db
    .update(user)
    .set({
      name: data.name.trim(),
      phone: phone || null,
      countryCode: data.countryCode?.trim() || null,
      timezone: data.timezone?.trim() || null,
      about: data.about?.trim() || null,
      language: data.language || undefined,
      timeFormat: data.timeFormat || undefined,
      dateFormat: data.dateFormat || undefined,
      emailNotificationsEnabled: data.emailNotificationsEnabled,
      updatedAt: new Date(),
    })
    .where(eq(user.id, currentUser.id))

  // Drop the stale in-memory auth entry so the next render (router.refresh,
  // page reload) reflects the newly saved about/timezone/name immediately.
  invalidateAuthUserCache(currentUser.id)

  revalidatePath('/dashboard/profile')
  revalidateTag('auth-user', { expire: 300 })
  return { success: true }
})

/**
 * Self-service password change via Better Auth. Verifies the current password,
 * enforces the 12-char minimum, and revokes other sessions after the change.
 */
export const changePassword = wrapServerAction('changePassword', async function changePassword(data: {
  currentPassword: string
  newPassword: string
}) {
  const currentUser = await getCurrentUser()

  // Strict role policy: only Admin and Project Manager may change a password
  // directly. Client/Developer must use the Support reset request instead.
  if (!canChangePasswordDirectly(currentUser.role)) {
    await logPasswordAudit({
      eventType: 'unauthorized_password_attempt',
      actorUserId: currentUser.id,
      actorName: currentUser.name,
      targetUserId: currentUser.id,
      targetEmail: currentUser.email,
      action: 'change_own_password',
      result: 'denied',
      detail: 'role is not permitted to change passwords directly',
    })
    throw new Error(
      'Your role does not permit direct password changes. ' +
      'Use the "Request Password Reset" option and our Support team will assist you.'
    )
  }

  if (!data.currentPassword) throw new Error('Current password is required.')
  if (!data.newPassword || data.newPassword.length < 12) {
    throw new Error('New password must be at least 12 characters.')
  }
  if (data.newPassword === data.currentPassword) {
    throw new Error('New password must be different from your current password.')
  }

  try {
    const h = await headers()
    await auth.api.changePassword({
      body: {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        revokeOtherSessions: true,
      },
      headers: h,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/incorrect|invalid|wrong|does not match/i.test(msg)) {
      throw new Error('Current password is incorrect.')
    }
    if (/too short|min|at least/i.test(msg)) {
      throw new Error('New password must be at least 12 characters.')
    }
    throw new Error('Failed to change password. Please try again.')
  }

  await logPasswordAudit({
    eventType: 'password_changed',
    actorUserId: currentUser.id,
    actorName: currentUser.name,
    targetUserId: currentUser.id,
    targetEmail: currentUser.email,
    action: 'change_own_password',
    result: 'success',
  })

  revalidatePath('/dashboard/profile')
  return { success: true }
})

/**
 * Self-service "Forgot password" email-token reset (sign-in page).
 *
 * Strict role-based policy: only Admin and Project Manager may reset their own
 * password via the emailed link. Client/Developer accounts are rejected at the
 * backend and directed to the Support reset request instead. Unknown emails
 * receive the same generic success as better-auth's own endpoint so account
 * existence is never disclosed.
 */
export const requestPasswordResetEmail = wrapServerAction('requestPasswordResetEmail', async function requestPasswordResetEmail(email: string) {
  const normalized = (email ?? '').trim().toLowerCase()
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Please enter a valid email address.')
  }

  const [target] = await db
    .select({ id: user.id, email: user.email, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.email, normalized))
    .limit(1)

  // Anti-enumeration: unknown accounts get the generic success response.
  if (!target) {
    return { success: true, sent: false }
  }

  if (target.role !== 'admin' && target.role !== 'project_manager') {
    // Denied — but respond with the same generic success used for unknown
    // emails so account existence is never disclosed (anti-enumeration). The
    // sendResetPassword guard in lib/auth.ts additionally guarantees no reset
    // email is ever dispatched for this account. The denial is still recorded
    // in the audit trail for monitoring.
    await logPasswordAudit({
      eventType: 'unauthorized_password_attempt',
      actorUserId: target.id,
      actorName: target.name,
      targetUserId: target.id,
      targetEmail: target.email,
      action: 'email_token_reset',
      result: 'denied',
      detail: 'client/developer roles must use the Support password-reset request',
    })
    return { success: true, sent: false }
  }

  try {
    // Triggers the sendResetPassword callback in lib/auth.ts, which sends the
    // password_reset email through the unified notification dispatcher.
    await auth.api.requestPasswordReset({
      body: { email: target.email, redirectTo: '/reset-password' },
    })
  } catch (err) {
    console.error('[PasswordReset] Failed to send reset email:', err)
    throw new Error('Could not send the password reset email. Please try again.')
  }

  await logPasswordAudit({
    eventType: 'password_reset_requested',
    actorUserId: target.id,
    actorName: target.name,
    targetUserId: target.id,
    targetEmail: target.email,
    action: 'email_token_reset',
    result: 'success',
  })

  return { success: true, sent: true }
})

/**
 * Validate a password-reset token and its target user's role before the
 * /reset-password form is shown. Clients/Developers are blocked here too, so
 * even a stale token issued before the policy cannot be used to set a password.
 */
export const validatePasswordResetToken = wrapServerAction('validatePasswordResetToken', async function validatePasswordResetToken(token: string) {
  if (!token || typeof token !== 'string' || token.length === 0) {
    return { valid: false, reason: 'invalid' as const }
  }

  const [row] = await db
    .select({ value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, `reset-password:${token}`))
    .limit(1)
  if (!row) return { valid: false, reason: 'invalid' as const }
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    return { valid: false, reason: 'expired' as const }
  }

  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, row.value))
    .limit(1)
  if (!target) return { valid: false, reason: 'invalid' as const }

  if (target.role !== 'admin' && target.role !== 'project_manager') {
    return { valid: false, reason: 'role' as const }
  }

  return { valid: true, reason: 'ok' as const }
})

/**
 * Request a password reset (Client / Developer / any role that cannot change
 * their password directly). Creates a pending request and notifies the Support
 * team — every Admin and Project Manager gets an in-app notification and an
 * email through the application's email bridge, and the configured
 * SUPPORT_EMAIL inbox (if set) is included as an additional recipient.
 *
 * Never sends passwords or tokens — only request metadata (name, email, role,
 * date/time, reference). Duplicate protection: only one pending request per
 * user at a time. Notification dispatch is fire-and-forget (the app-wide
 * pattern for business emails); the request row + audit trail remain so
 * failures are traceable and retryable.
 */
export const requestPasswordReset = wrapServerAction('requestPasswordReset', async function requestPasswordReset() {
  const currentUser = await getCurrentUser()

  // ── Duplicate protection: one pending request per user ────────────────
  const [existing] = await db
    .select({ id: passwordResetRequest.id, reference: passwordResetRequest.reference })
    .from(passwordResetRequest)
    .where(and(
      eq(passwordResetRequest.userId, currentUser.id),
      eq(passwordResetRequest.status, 'pending'),
    ))
    .limit(1)
  if (existing) {
    throw new Error(
      'A password reset request is already pending. ' +
      'Our Support team will review it shortly — please check your inbox or contact Support directly.'
    )
  }

  const reference = 'SUP-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  const requestedAt = new Date()
  const portalUrl = getPortalUrl()

  // ── Recipients: every Admin + Project Manager (+ SUPPORT_EMAIL if set) ─
  const staff = await db
    .select({ id: user.id, email: user.email, name: user.name, role: user.role })
    .from(user)
    .where(inArray(user.role, ['admin', 'project_manager']))

  const supportEmail = process.env.SUPPORT_EMAIL?.trim().toLowerCase()
  const recipients = new Map<string, { email: string; name: string | null; role: string }>()
  for (const u of staff) recipients.set(u.email.toLowerCase(), { email: u.email, name: u.name, role: u.role })
  if (supportEmail) recipients.set(supportEmail, { email: supportEmail, name: 'Support Team', role: 'support' })

  if (recipients.size === 0) {
    console.error('[PasswordReset] No support recipients configured (no admins/managers and no SUPPORT_EMAIL).')
    throw new Error('Support is not configured to receive password reset requests. Please contact an administrator.')
  }

  // ── Create the request record ─────────────────────────────────────────
  try {
    await db
      .insert(passwordResetRequest)
      .values({
        userId: currentUser.id,
        requesterName: currentUser.name,
        requesterEmail: currentUser.email,
        requesterRole: currentUser.role,
        reference,
        status: 'pending',
      })
  } catch (err) {
    console.error('[PasswordReset] Failed to create request:', err)
    throw new Error('Failed to create the password reset request. Please try again.')
  }

  // ── Notify Admins + Managers (in-app + email via the email bridge) ────
  const templateData = {
    requesterName: currentUser.name ?? '',
    requesterEmail: currentUser.email,
    requesterRole: ROLE_LABELS[currentUser.role] || currentUser.role,
    requestedAt: requestedAt.toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'UTC',
    }) + ' (UTC)',
    reference,
    adminUrl: `${portalUrl}/dashboard/admin/users`,
    portalUrl,
  }

  dispatchNotification({
    eventType: 'password_reset_requested',
    triggeredBy: currentUser.id,
    // Unique per request so a later request (after the previous is resolved)
    // can notify again. The pending-request check above prevents spam.
    dedup: { scope: `user:${currentUser.id}:${reference}` },
    recipients: staff.map((u) => ({
      userId: u.id,
      channels: ['inApp', 'email'],
      inApp: {
        title: 'Password Reset Request',
        message: `${currentUser.name || currentUser.email} (${currentUser.role}) requested a password reset. Reference: ${reference}.`,
        link: u.role === 'admin' ? '/dashboard/admin/users' : '/dashboard/team',
      },
      email: { templateData },
    })),
  }).catch((err: Error) => console.error('[Notify] password_reset_requested failed:', err.message))

  // SUPPORT_EMAIL inbox (if configured and not already an admin/manager)
  if (supportEmail && !staff.some((u) => u.email.toLowerCase() === supportEmail)) {
    sendNotification('password_reset_requested', supportEmail, templateData)
  }

  await logPasswordAudit({
    eventType: 'password_reset_requested',
    actorUserId: currentUser.id,
    actorName: currentUser.name,
    targetUserId: currentUser.id,
    targetEmail: currentUser.email,
    action: 'request_password_reset',
    result: 'success',
    detail: `reference=${reference} recipients=${recipients.size}`,
  })

  revalidatePath('/dashboard/profile')
  return { success: true, reference }
})

export const updateProfileImage = wrapServerAction('updateProfileImage', async function updateProfileImage(avatarUrl: string, publicId: string) {
  const currentUser = await getCurrentUser()

  // Delete old avatar from Cloudinary if exists
  if (currentUser.avatarUrl && currentUser.image) {
    try {
      const cloudinary = (await import('cloudinary')).v2
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      })
      // The publicId for the old avatar is stored in the image field
      if (currentUser.image) {
        await cloudinary.uploader.destroy(currentUser.image)
      }
    } catch (err) {
      console.error('[profile] Failed to delete old avatar:', err)
    }
  }

  await db
    .update(user)
    .set({
      avatarUrl,
      image: publicId,
      updatedAt: new Date(),
    })
    .where(eq(user.id, currentUser.id))

  revalidatePath('/dashboard/profile')
  revalidateTag('auth-user', { expire: 300 })
  return { success: true }
})

export const removeProfileImage = wrapServerAction('removeProfileImage', async function removeProfileImage() {
  const currentUser = await getCurrentUser()

  if (currentUser.image) {
    try {
      const cloudinary = (await import('cloudinary')).v2
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      })
      await cloudinary.uploader.destroy(currentUser.image)
    } catch (err) {
      console.error('[profile] Failed to delete avatar:', err)
    }
  }

  await db
    .update(user)
    .set({ avatarUrl: null, image: null, updatedAt: new Date() })
    .where(eq(user.id, currentUser.id))

  revalidatePath('/dashboard/profile')
  revalidateTag('auth-user', { expire: 300 })
  return { success: true }
})
