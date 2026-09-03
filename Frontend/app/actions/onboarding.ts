'use server'

import { db } from '@/lib/db'
import {
  user,
  account,
  project,
  module as moduleTable,
  projectClient,
  supportWallet,
  walletTransaction,
  ticketHistory,
} from '@/lib/db/schema'
import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-utils'
import { getPortalUrl } from '@/lib/urls'
import { wrapServerAction } from '@/lib/performance-profiler'
import type {
  OnboardingFormData,
  OnboardingResult,
  UserRole,
} from '@/lib/types'
import { isValidPhoneForCountry } from '@/lib/phone'
import { dispatchNotification } from '@/lib/notify-all'

const PASSWORD_MIN_LENGTH = 12

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function generateProjectCode(name: string): string {
  const prefix = (name.split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 6)) || 'PRJ'
  return `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}`
}

function canCreateOnboarding(role: UserRole): boolean {
  return role === 'admin' || role === 'project_manager'
}

/**
 * Recursively dig into nested Drizzle/pg error wrappers to find the actual
 * PostgreSQL error object with its native properties (code, detail, hint, ...).
 * Drizzle ORM often wraps the raw pg DatabaseError inside a DrizzleError,
 * hiding the PostgreSQL-specific properties under .cause, .wrapperError, etc.
 */
function extractPgError(err: unknown, depth = 0): Record<string, unknown> | null {
  if (!err || typeof err !== 'object' || depth > 5) return null
  const e = err as Record<string, unknown>
  // PostgreSQL SQLSTATE codes are exactly 5 characters, uppercase or digits
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
    return e
  }
  // Check common Drizzle/pg nesting keys
  for (const key of ['cause', 'wrapperError', 'originalError', 'innerError', 'prev', 'error', 'sourceError'] as const) {
    if (e[key] !== undefined && e[key] !== null) {
      const found = extractPgError(e[key], depth + 1)
      if (found) return found
    }
  }
  return null
}

/** Format a PostgreSQL error into a single string for logging */
function formatPgError(err: Record<string, unknown>): string {
  const parts: string[] = []
  if (err.code) parts.push(`[${err.code}]`)
  if (err.detail) parts.push(String(err.detail))
  if (err.hint) parts.push(`(Hint: ${err.hint})`)
  if (err.constraint) parts.push(`Constraint: ${err.constraint}`)
  if (err.column) parts.push(`Column: ${err.column}`)
  if (err.table) parts.push(`Table: ${err.table}`)
  return parts.join(' ') || String(err.message || '(no detail)')
}

export const createCustomerOnboarding = wrapServerAction(
  'createCustomerOnboarding',
  async function createCustomerOnboarding(data: OnboardingFormData): Promise<OnboardingResult> {
    const currentUser = await getCurrentUser()

    if (!canCreateOnboarding(currentUser.role)) {
      throw new Error('Access denied. Only admins and project managers can create onboarding.')
    }

    if (currentUser.role === 'project_manager' && data.project.managerId !== currentUser.id) {
      throw new Error('Project managers can only create onboarding for projects they manage.')
    }

    if (!data.project.projectName?.trim()) throw new Error('Project name is required.')
    if (!data.project.managerId) throw new Error('Project manager is required.')

    const [dupProject] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(
        eq(project.projectName, data.project.projectName.trim()),
        ne(project.status, 'archived'),
      ))
      .limit(1)
    if (dupProject) {
      throw new Error(`A project named "${data.project.projectName.trim()}" already exists.`)
    }

    const projectCode = generateProjectCode(data.project.projectName)

    if (!data.modules || data.modules.length === 0) {
      throw new Error('At least one module is required.')
    }
    // Validate each module has a non-empty name
    for (const mod of data.modules) {
      if (!mod.moduleName?.trim()) {
        throw new Error('Each module must have a name.')
      }
    }
    const nameSet = new Set(data.modules.map((m) => m.moduleName.trim().toLowerCase()))
    if (nameSet.size !== data.modules.length) {
      throw new Error('Duplicate module names are not allowed.')
    }

    if (!data.clientUsers || data.clientUsers.length === 0) {
      throw new Error('At least one client user is required.')
    }

    for (let i = 0; i < data.clientUsers.length; i++) {
      const cu = data.clientUsers[i]
      const idx = i + 1
      if (!cu.firstName?.trim()) throw new Error(`User #${idx}: First name is required.`)
      if (!cu.lastName?.trim()) throw new Error(`User #${idx}: Last name is required.`)
      if (!cu.email?.trim()) throw new Error(`User #${idx}: Email is required.`)
      if (!validateEmail(cu.email.trim())) throw new Error(`User #${idx}: Invalid email format.`)
      if (!cu.phoneNumber?.trim()) throw new Error(`User #${idx}: Phone number is required.`)
      if (cu.phoneNumber?.trim() && cu.countryCode && !isValidPhoneForCountry(cu.phoneNumber, cu.countryCode)) {
        throw new Error(`User #${idx}: Phone number is not valid for the selected country.`)
      }
      if (!cu.password || cu.password.length < PASSWORD_MIN_LENGTH) {
        throw new Error(`User #${idx}: Password must be at least 12 characters.`)
      }
    }
    // Check for duplicate emails in the payload
    const emailsSet = new Set(data.clientUsers.map((u) => u.email.trim().toLowerCase()))
    if (emailsSet.size !== data.clientUsers.length) {
      throw new Error('Duplicate email addresses found in client users.')
    }
    // Check all emails against DB (batch query)
    const allEmails = data.clientUsers.map((u) => u.email.trim().toLowerCase())
    const existingEmails = await db
      .select({ email: user.email })
      .from(user)
      .where(inArray(user.email, allEmails))
    if (existingEmails.length > 0) {
      throw new Error(`The following email(s) already exist: ${existingEmails.map((e) => e.email).join(', ')}`)
    }

    const isHypercare = data.supportWallet.contractType === 'hypercare'

    if (isHypercare) {
      // Hypercare: no support hours validation, start + end dates are calculated from duration
      if (!data.supportWallet.supportStartDate) throw new Error('Support start date is required.')
      if (!data.supportWallet.hypercareDuration) throw new Error('Hypercare duration is required.')
      if (!data.supportWallet.supportEndDate) throw new Error('Support end date is required.')
    } else {
      // Standard support: validate hours and dates
      if (!data.supportWallet.supportHours || data.supportWallet.supportHours <= 0) {
        throw new Error('Support hours must be greater than zero.')
      }
      if (!data.supportWallet.supportStartDate) throw new Error('Support start date is required.')
      if (!data.supportWallet.supportEndDate) throw new Error('Support end date is required.')

      const startDate = new Date(data.supportWallet.supportStartDate)
      const endDate = new Date(data.supportWallet.supportEndDate)
      if (endDate < startDate) {
        throw new Error('Support end date cannot be earlier than start date.')
      }
    }
    let result: OnboardingResult

    try {
      result = await db.transaction(async (tx) => {
        // Create FIRST client user as the project owner/client
        const firstUser = data.clientUsers[0]
        const primaryUserFullName = `${firstUser.firstName.trim()} ${firstUser.lastName.trim()}`
        const primaryUserId = crypto.randomUUID()
        
        const [primaryUser] = await tx.insert(user).values({
          id: primaryUserId,
          name: primaryUserFullName,
          email: firstUser.email.trim().toLowerCase(),
          role: 'client',
          userType: firstUser.userType,
          emailVerified: false,
          phone: firstUser.phoneNumber?.trim() || null,
          countryCode: firstUser.countryCode?.trim() || null,
          enableTeamsNotifications: !!data.enableTeamsNotifications,
        }).returning()
        
        const primaryHashedPassword = await bcrypt.hash(firstUser.password, 10)
        const primaryAccountId = crypto.randomUUID()
        await tx.insert(account).values({
          id: primaryAccountId,
          userId: primaryUser.id,
          providerId: 'credential',
          accountId: primaryUser.id,
          password: primaryHashedPassword,
        })
        // Create remaining client users
        const createdUserIds = [primaryUser.id]
        const createdUserEmails: string[] = [firstUser.email.trim()]

        for (let i = 1; i < data.clientUsers.length; i++) {
          const cu = data.clientUsers[i]
          const userFullName = `${cu.firstName.trim()} ${cu.lastName.trim()}`
          const newUserId = crypto.randomUUID()

          const [newUser] = await tx.insert(user).values({
            id: newUserId,
            name: userFullName,
          email: cu.email.trim().toLowerCase(),
          role: 'client',
          userType: cu.userType,
          emailVerified: false,
            phone: cu.phoneNumber?.trim() || null,
            countryCode: cu.countryCode?.trim() || null,
            enableTeamsNotifications: !!data.enableTeamsNotifications,
          }).returning()

          const hashedPassword = await bcrypt.hash(cu.password, 10)
          const accountId = crypto.randomUUID()
          await tx.insert(account).values({
            id: accountId,
            userId: newUser.id,
            providerId: 'credential',
            accountId: newUser.id,
            password: hashedPassword,
          })

          createdUserIds.push(newUser.id)
          createdUserEmails.push(cu.email.trim().toLowerCase())
        }

        const [newProject] = await tx.insert(project).values({
          projectName: data.project.projectName.trim(),
          projectCode,
          clientId: primaryUser.id,
          managerId: data.project.managerId,
          description: data.project.description?.trim() ?? null,
          startDate: data.project.startDate || null,
          endDate: data.project.endDate || null,
          status: 'active',
        }).returning()

        // Link ALL created client users to the project (so they can see it in create ticket page)
        const now = new Date()
        await tx.insert(projectClient).values(
          createdUserIds.map((uid) => ({
            projectId: newProject.id,
            userId: uid,
            assignedBy: currentUser.id,
            assignedAt: now,
          })),
        )

        const createdModuleIds: number[] = []
        for (const mod of data.modules) {
          if (mod.isExisting && mod.existingModuleId) {
            const [clonedModule] = await tx.insert(moduleTable).values({
              projectId: newProject.id,
              moduleName: mod.moduleName.trim(),
              description: mod.description?.trim() ?? null,
              status: 'active',
            }).returning()
            createdModuleIds.push(clonedModule.id)
          } else {
            const [newModule] = await tx.insert(moduleTable).values({
              projectId: newProject.id,
              moduleName: mod.moduleName.trim(),
              description: mod.description?.trim() ?? null,
              status: 'active',
            }).returning()
            createdModuleIds.push(newModule.id)
          }
        }

        // Calculate contract status based on dates
        const todayStr = new Date().toISOString().split('T')[0]
        let contractStatus = 'scheduled'
        if (data.supportWallet.supportStartDate && data.supportWallet.supportEndDate) {
          if (todayStr >= data.supportWallet.supportStartDate && todayStr <= data.supportWallet.supportEndDate) {
            contractStatus = 'active'
          } else if (todayStr > data.supportWallet.supportEndDate) {
            contractStatus = 'expired'
          }
        }

        if (isHypercare) {
          // Hypercare: create minimal wallet record (no hours, no transactions)
          const [newWallet] = await tx.insert(supportWallet).values({
            clientId: primaryUser.id,
            projectId: null,
            totalPurchasedHours: 0,
            reservedHours: 0,
            consumedHours: 0,
            remainingHours: 0,
            contractStartDate: data.supportWallet.supportStartDate || null,
            contractEndDate: data.supportWallet.supportEndDate || null,
            contractType: 'hypercare',
            hypercareDuration: data.supportWallet.hypercareDuration || null,
            contractStatus,
            status: 'active',
          }).returning()
        } else {
          // Standard support: create wallet + initial transaction
          const [newWallet] = await tx.insert(supportWallet).values({
            clientId: primaryUser.id,
            projectId: null,
            totalPurchasedHours: data.supportWallet.supportHours,
            reservedHours: 0,
            consumedHours: 0,
            remainingHours: data.supportWallet.supportHours,
            contractStartDate: data.supportWallet.supportStartDate || null,
            contractEndDate: data.supportWallet.supportEndDate || null,
            contractType: data.supportWallet.contractType || null,
            hypercareDuration: null,
            contractStatus,
            status: 'active',
          }).returning()

          // Business rule: validFrom = current system date, validTo = validFrom + 1 year
          const today = new Date()
          const validFromStr = today.toISOString().split('T')[0]
          const validToDate = new Date(today)
          validToDate.setFullYear(validToDate.getFullYear() + 1)
          const validToStr = validToDate.toISOString().split('T')[0]

          await tx.insert(walletTransaction).values({
            walletId: newWallet.id,
            transactionType: 'Add Hours',
            hours: data.supportWallet.supportHours,
            previousBalance: 0,
            newBalance: data.supportWallet.supportHours,
            reason: 'Opening balance - Customer Onboarding',
            remarks: data.supportWallet.remarks?.trim() ?? null,
            performedBy: currentUser.name || currentUser.id,
            validFrom: validFromStr || null,
            validTo: validToStr || null,
          })
        }
        const userNamesString = data.clientUsers.map((u) => `${u.firstName} ${u.lastName} (${u.email})`).join(', ')
        const approverCount = data.clientUsers.filter((u) => u.userType === 'approver').length
        const contractLabel = isHypercare ? `${data.supportWallet.hypercareDuration}-day Hypercare` : `${data.supportWallet.supportHours} support hours`
        const activities = [
          { ticketId: 0, userId: currentUser.id, action: 'Project Created', newValue: `Project "${newProject.projectName}" created via onboarding` },
          { ticketId: 0, userId: currentUser.id, action: 'Modules Created', newValue: `${createdModuleIds.length} module(s) created/assigned` },
          { ticketId: 0, userId: currentUser.id, action: 'Client Users Created', newValue: `${data.clientUsers.length} user(s) created: ${userNamesString}` },
          { ticketId: 0, userId: currentUser.id, action: 'Support Contract Created', newValue: `${contractLabel} (${data.supportWallet.supportStartDate} to ${data.supportWallet.supportEndDate})` },
          { ticketId: 0, userId: currentUser.id, action: 'Customer Onboarding Completed', newValue: `Onboarding for "${newProject.projectName}" completed with ${data.clientUsers.length} users (${approverCount} approver(s))` },
        ]
        for (const activity of activities) {
          await tx.insert(ticketHistory).values(activity)
        }



        return {
          projectId: newProject.id,
          projectName: newProject.projectName,
          clientId: primaryUser.id,
          userEmail: primaryUser.email,
          clientName: primaryUserFullName,
          supportHours: isHypercare ? 0 : data.supportWallet.supportHours,
          validUntil: data.supportWallet.supportEndDate,
          success: true,
        }
      })
    } catch (error: any) {
      // ── Extract PostgreSQL error details ────────────────────────────
      const pgError = extractPgError(error)

      // ── Generate user-friendly error message ─────────────────────────
      let userMessage = 'Onboarding failed. '
      
      // Use the extracted PostgreSQL error if available
      if (pgError) {
        const pgCode = String(pgError.code || '')
        const pgDetail = String(pgError.detail || pgError.message || '')
        const pgConstraint = String(pgError.constraint || '')
        const pgColumn = String(pgError.column || '')
        
        if (pgCode === '42703') {
          // Undefined column — column doesn't exist in table
          // Column name may be empty in nested Drizzle errors, use message as fallback
          if (pgColumn && pgColumn !== 'undefined' && pgColumn !== 'null') {
            userMessage += `Column "${pgColumn}" does not exist in the database table. Please run pending migrations.`
          } else {
            // Extract column name from the error message if available
            const msgMatch = pgError.message ? String(pgError.message).match(/column "([^"]+)"/) : null
            if (msgMatch) {
              userMessage += `Column "${msgMatch[1]}" does not exist in the database table. Please run pending migrations.`
            } else {
              userMessage += 'The database schema is missing required columns. Please run pending migrations: node frontend/apply-migration.mjs "$DATABASE_URL" 0016_add_wallet_transaction_validity'
            }
          }
        } else if (pgCode === '23505') {
          // Unique violation
          const field = pgConstraint.replace(/_/g, ' ') || 'a field'
          userMessage += `A record with this ${field} already exists. Please use a different value.`
        } else if (pgCode === '23503') {
          // Foreign key violation
          userMessage += `Referenced record not found${pgDetail ? ': ' + pgDetail : '. Please contact your administrator.'}`
        } else if (pgCode === '23502') {
          // NOT NULL violation
          userMessage += `The field "${pgColumn}" cannot be empty. Please check your input and try again.`
        } else if (pgCode === '22P02') {
          // Invalid input syntax
          userMessage += `An invalid value was provided for a date, numeric, or enum field (${pgDetail}). Please check your input.`
        } else if (pgCode === '42P01') {
          // Undefined table
          userMessage += 'A required database table is missing. Please run pending migrations.'
        } else {
          // Fallback: show the real PostgreSQL error
          userMessage += `Database error: ${formatPgError(pgError)}`
        }
      } else if (error?.message?.includes('Failed query')) {
        // Drizzle query failure — no nested PostgreSQL error found
        userMessage += 'Database query failed. Please check the server logs for details and contact your administrator.'
      } else if (error?.message?.includes('password')) {
        userMessage += error.message
      } else if (error?.message) {
        userMessage += error.message
      } else {
        userMessage += 'An unexpected error occurred. All changes have been rolled back. Please contact your administrator.'
      }
      
      throw new Error(userMessage)
    }


    try {
      // ── In-App notifications via the unified dispatcher ───────────────────
      const inAppNotifications: Parameters<typeof dispatchNotification>[0]['recipients'] = []
      if (data.project.managerId) {
        inAppNotifications.push({ userId: data.project.managerId, channels: ['inApp'], inApp: { title: 'New Customer Onboarding', message: `Customer "${result.clientName}" has been onboarded for project "${result.projectName}".`, link: `/dashboard/projects/${result.projectId}` } })
      }
      if (result.clientId) {
        const welcomeMsg = isHypercare
          ? `Your account has been created. Project "${result.projectName}" is ready with Hypercare support for ${data.supportWallet.hypercareDuration} days.`
          : `Your account has been created. Project "${result.projectName}" is ready. You have ${data.supportWallet.supportHours} support hours allocated.`
        inAppNotifications.push({ userId: result.clientId, channels: ['inApp'], inApp: { title: 'Welcome to Support Hero', message: welcomeMsg, link: `/dashboard/projects/${result.projectId}` } })
      }
      if (result.userEmail) {
        const [clientUserRecord] = await db.select({ id: user.id }).from(user).where(eq(user.email, result.userEmail)).limit(1)
        if (clientUserRecord) {
          const welcomeMsg = isHypercare
            ? `Welcome! Your project "${result.projectName}" has been set up with Hypercare support for ${data.supportWallet.hypercareDuration} days.`
            : `Welcome! Your project "${result.projectName}" has been set up with ${data.supportWallet.supportHours} support hours.`
          inAppNotifications.push({ userId: clientUserRecord.id, channels: ['inApp'], inApp: { title: 'Your Support Portal is Ready', message: welcomeMsg, link: `/dashboard/projects/${result.projectId}` } })
        }
      }
      const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin'))
      for (const admin of admins) {
        inAppNotifications.push({ userId: admin.id, channels: ['inApp'], inApp: { title: 'Customer Onboarding Completed', message: `Customer "${result.clientName}" has been onboarded for project "${result.projectName}" by ${currentUser.name}.`, link: `/dashboard/projects/${result.projectId}` } })
      }
      if (inAppNotifications.length > 0) {
        await dispatchNotification({
          eventType: 'customer_onboarding',
          triggeredBy: currentUser.id,
          dedup: { scope: `onboarding:${result.projectId}` },
          recipients: inAppNotifications,
        })
      }

      // ── Primary client also receives the customer_created Email + Teams ────
      if (result.clientId && result.userEmail) {
        await dispatchNotification({
          eventType: 'customer_created',
          triggeredBy: currentUser.id,
          dedup: { scope: `user:${result.clientId}` },
          recipients: [
            {
              userId: result.clientId,
              email: {
                templateData: {
                  customerName: result.clientName,
                  customerEmail: result.userEmail,
                  createdBy: currentUser.name || 'Admin',
                  portalUrl: getPortalUrl(),
                  projectName: result.projectName,
                },
              },
              teams: {
                payload: {
                  customerName: result.clientName,
                  customerEmail: result.userEmail,
                  createdBy: currentUser.name || 'Admin',
                  projectName: result.projectName,
                },
              },
            },
          ],
        })
      }

      // ── Login Credentials (admin opt-in per user) — email-only ─────────────
      // Wires up the "Send login credentials via email" checkbox from the
      // onboarding wizard. Only users with sendEmail=true receive the email;
      // credentials are sensitive, so the channel is email-only (no Teams).
      const credentialsPortalUrl = getPortalUrl()
      for (const cu of data.clientUsers) {
        if (!cu.sendEmail) continue
        const [createdUser] = await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, cu.email.trim()))
          .limit(1)
        if (!createdUser) continue
        await dispatchNotification({
          eventType: 'login_credentials',
          triggeredBy: currentUser.id,
          dedup: { scope: `user:${createdUser.id}` },
          recipients: [
            {
              userId: createdUser.id,
              channels: ['email'],
              email: {
                templateData: {
                  userEmail: cu.email.trim(),
                  initialPassword: cu.password,
                  loginUrl: `${credentialsPortalUrl}/sign-in`,
                  portalUrl: credentialsPortalUrl,
                  recipientName: `${cu.firstName.trim()} ${cu.lastName.trim()}`,
                },
              },
            },
          ],
        }).catch((err: Error) => console.error('[Onboarding] login_credentials dispatch failed:', err.message))
      }
    } catch (err) {
      console.error('[Onboarding] Notification creation error (non-fatal):', err)
    }

    // Clear caches so fresh data loads next time
    managersCache.clear()
    modulesCache.clear()

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/projects')
    revalidatePath('/dashboard/wallets')
    revalidatePath('/dashboard/customer-onboarding')

    return result
  },
)

export const getOnboardingClients = wrapServerAction('getOnboardingClients', async function getOnboardingClients() {
  const currentUser = await getCurrentUser()
  if (!canCreateOnboarding(currentUser.role)) throw new Error('Access denied')
  return db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'client')).orderBy(user.name)
})

// ── Cached lookup for managers (used by step 2) ────────────────────────
const managersCache = new Map<string, { data: any; expiresAt: number }>()
const MANAGERS_CACHE_TTL = 60_000

export const getOnboardingManagers = wrapServerAction('getOnboardingManagers', async function getOnboardingManagers() {
  const currentUser = await getCurrentUser()
  if (!canCreateOnboarding(currentUser.role)) throw new Error('Access denied')
  const cached = managersCache.get('managers')
  if (cached && cached.expiresAt > Date.now()) return cached.data
  const data = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.role, 'project_manager')).orderBy(user.name)
  managersCache.set('managers', { data, expiresAt: Date.now() + MANAGERS_CACHE_TTL })
  return data
})

// ── Cached lookup for existing modules (used by step 3) ──────────────────
const modulesCache = new Map<string, { data: any; expiresAt: number }>()
const MODULES_CACHE_TTL = 60_000

export const getOnboardingExistingModules = wrapServerAction('getOnboardingExistingModules', async function getOnboardingExistingModules() {
  const currentUser = await getCurrentUser()
  if (!canCreateOnboarding(currentUser.role)) throw new Error('Access denied')
  const cached = modulesCache.get('modules')
  if (cached && cached.expiresAt > Date.now()) return cached.data
  const modules = await db.select({ id: moduleTable.id, moduleName: moduleTable.moduleName, projectId: moduleTable.projectId })
    .from(moduleTable).where(eq(moduleTable.status, 'active')).orderBy(moduleTable.moduleName)
  const seen = new Set<string>()
  const deduped = modules.filter((m: { id: number; moduleName: string; projectId: number }) => {
    const lower = m.moduleName.toLowerCase()
    if (seen.has(lower)) return false
    seen.add(lower)
    return true
  })
  modulesCache.set('modules', { data: deduped, expiresAt: Date.now() + MODULES_CACHE_TTL })
  return deduped
})

// ── Fetch modules for a specific existing project (used in existing mode) ──
export const getOnboardingProjectModules = wrapServerAction('getOnboardingProjectModules', async function getOnboardingProjectModules(projectId: number) {
  const currentUser = await getCurrentUser()
  if (!canCreateOnboarding(currentUser.role)) throw new Error('Access denied')
  return db
    .select({ id: moduleTable.id, moduleName: moduleTable.moduleName, projectId: moduleTable.projectId })
    .from(moduleTable)
    .where(and(eq(moduleTable.projectId, projectId), eq(moduleTable.status, 'active')))
    .orderBy(asc(moduleTable.moduleName))
})

export const getOnboardingHistory = wrapServerAction('getOnboardingHistory', async function getOnboardingHistory() {
  const currentUser = await getCurrentUser()
  if (currentUser.role === 'client') throw new Error('Access denied')
  const history = await db.select({ id: ticketHistory.id, userId: ticketHistory.userId, action: ticketHistory.action, newValue: ticketHistory.newValue, createdAt: ticketHistory.createdAt })
    .from(ticketHistory).where(eq(ticketHistory.action, 'Customer Onboarding Completed')).orderBy(ticketHistory.createdAt).limit(50)
  if (history.length === 0) return []
  const userIds = [...new Set(history.map((h: { userId: string }) => h.userId))]
  const users = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
  const userMap = new Map(users.map((u: { id: string; name: string }) => [u.id, u.name]))
  return history.map((h: { id: number; action: string; newValue: string | null; userId: string; createdAt: Date }) => ({
    id: h.id, action: h.action, details: h.newValue, performedBy: userMap.get(h.userId) || 'Unknown', createdAt: h.createdAt,
  }))
})

export const checkDuplicateProjectName = wrapServerAction('checkDuplicateProjectName', async function checkDuplicateProjectName(projectName: string, clientId: string) {
  const [existing] = await db.select({ id: project.id }).from(project)
    .where(and(eq(project.projectName, projectName.trim()), eq(project.clientId, clientId), ne(project.status, 'archived'))).limit(1)
  return !!existing
})

export const checkDuplicateEmail = wrapServerAction('checkDuplicateEmail', async function checkDuplicateEmail(email: string) {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.trim())).limit(1)
  return !!existing
})

// ── Existing Projects for Onboarding (used by step 2) ────────────────────
export const getOnboardingExistingProjects = wrapServerAction('getOnboardingExistingProjects', async function getOnboardingExistingProjects() {
  const currentUser = await getCurrentUser()
  if (!canCreateOnboarding(currentUser.role)) throw new Error('Access denied')
  const projects = await db
    .select({
      id: project.id,
      projectName: project.projectName,
      projectCode: project.projectCode,
      clientId: project.clientId,
      clientName: user.name,
      clientEmail: user.email,
    })
    .from(project)
    .leftJoin(user, eq(project.clientId, user.id))
    .where(and(eq(project.status, 'active'), ne(project.clientId, '')))
    .orderBy(project.projectName)
  return projects
})

// ── Check if a project has an active Approver client user ────────────────
export const checkProjectHasApprover = wrapServerAction('checkProjectHasApprover', async function checkProjectHasApprover(projectId: number): Promise<boolean> {
  const currentUser = await getCurrentUser()
  if (!canCreateOnboarding(currentUser.role)) throw new Error('Access denied')

  // Check the project's primary client user
  const [projectInfo] = await db
    .select({ clientId: project.clientId })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!projectInfo) throw new Error('Project not found')

  // One wallet per client — use project.clientId directly
  const uniqueClientIds = [projectInfo.clientId]

  if (uniqueClientIds.length === 0) return false

  const approvers = await db
    .select({ id: user.id })
    .from(user)
    .where(and(
      inArray(user.id, uniqueClientIds),
      eq(user.role, 'client'),
      eq(user.userType, 'approver'),
    ))
    .limit(1)

  return approvers.length > 0
})

// ── Add client users to an EXISTING project ──────────────────────────────
export interface AddUsersToProjectData {
  projectId: number
  clientUsers: {
    firstName: string
    lastName: string
    email: string
    phoneNumber: string
    /** ISO-3166 alpha-2 country code for the phone number. */
    countryCode?: string
    designation?: string
    userType: 'approver' | 'standard'
    password: string
    isAutoGenerated: boolean
    sendEmail: boolean
  }[]
  newModules?: { moduleName: string; description?: string }[]
  /** Customer-level preference: whether these client users receive Microsoft Teams notifications (default false) */
  enableTeamsNotifications?: boolean
}

export const addClientUsersToExistingProject = wrapServerAction(
  'addClientUsersToExistingProject',
  async function addClientUsersToExistingProject(data: AddUsersToProjectData): Promise<OnboardingResult> {
    const currentUser = await getCurrentUser()
    if (!canCreateOnboarding(currentUser.role)) {
      throw new Error('Access denied. Only admins and project managers can add users.')
    }

    if (!data.clientUsers || data.clientUsers.length === 0) {
      throw new Error('At least one client user is required.')
    }

    // Validate the project exists
    const [projectInfo] = await db
      .select({ id: project.id, projectName: project.projectName, projectCode: project.projectCode })
      .from(project)
      .where(and(eq(project.id, data.projectId), ne(project.status, 'archived')))
      .limit(1)

    if (!projectInfo) {
      throw new Error('Project not found or is archived.')
    }

    // Validate users
    for (let i = 0; i < data.clientUsers.length; i++) {
      const cu = data.clientUsers[i]
      const idx = i + 1
      if (!cu.firstName?.trim()) throw new Error(`User #${idx}: First name is required.`)
      if (!cu.lastName?.trim()) throw new Error(`User #${idx}: Last name is required.`)
      if (!cu.email?.trim()) throw new Error(`User #${idx}: Email is required.`)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cu.email.trim())) throw new Error(`User #${idx}: Invalid email format.`)
      if (!cu.phoneNumber?.trim()) throw new Error(`User #${idx}: Phone number is required.`)
      if (cu.phoneNumber?.trim() && cu.countryCode && !isValidPhoneForCountry(cu.phoneNumber, cu.countryCode)) {
        throw new Error(`User #${idx}: Phone number is not valid for the selected country.`)
      }
      if (!cu.password || cu.password.length < PASSWORD_MIN_LENGTH) {
        throw new Error(`User #${idx}: Password must be at least 12 characters.`)
      }
    }

    // Check for duplicate emails in payload
    const emailsSet = new Set(data.clientUsers.map((u) => u.email.trim().toLowerCase()))
    if (emailsSet.size !== data.clientUsers.length) {
      throw new Error('Duplicate email addresses found in client users.')
    }

    // Check all emails against DB
    const allEmails = data.clientUsers.map((u) => u.email.trim().toLowerCase())
    const existingEmails = await db
      .select({ email: user.email })
      .from(user)
      .where(inArray(user.email, allEmails))
    if (existingEmails.length > 0) {
      throw new Error(`The following email(s) already exist: ${existingEmails.map((e) => e.email).join(', ')}`)
    }

    // Create users in a transaction
    try {
      const result = await db.transaction(async (tx) => {
        const createdUserIds: string[] = []
        const createdUserEmails: string[] = []
        const createdUserNames: string[] = []

        for (const cu of data.clientUsers) {
          const userFullName = `${cu.firstName.trim()} ${cu.lastName.trim()}`
          const newUserId = crypto.randomUUID()

          const [newUser] = await tx.insert(user).values({
            id: newUserId,
            name: userFullName,
          email: cu.email.trim().toLowerCase(),
          role: 'client',
          userType: cu.userType,
          emailVerified: false,
            phone: cu.phoneNumber?.trim() || null,
            countryCode: cu.countryCode?.trim() || null,
            enableTeamsNotifications: !!data.enableTeamsNotifications,
          }).returning()

          const hashedPassword = await bcrypt.hash(cu.password, 10)
          const accountId = crypto.randomUUID()
          await tx.insert(account).values({
            id: accountId,
            userId: newUser.id,
            providerId: 'credential',
            accountId: newUser.id,
            password: hashedPassword,
          })

          createdUserIds.push(newUser.id)
          createdUserEmails.push(cu.email.trim().toLowerCase())
          createdUserNames.push(userFullName)
        }
        // Link ALL created client users to the project (so they can see it in create ticket page)
        if (createdUserIds.length > 0) {
          const now = new Date()
          await tx.insert(projectClient).values(
            createdUserIds.map((uid) => ({
              projectId: projectInfo.id,
              userId: uid,
              assignedBy: currentUser.id,
              assignedAt: now,
            })),
          )
        }

        // Create new modules if provided
        const newModuleIds: number[] = []
        if (data.newModules && data.newModules.length > 0) {
          for (const mod of data.newModules) {
            if (!mod.moduleName?.trim()) continue
            const [createdModule] = await tx.insert(moduleTable).values({
              projectId: projectInfo.id,
              moduleName: mod.moduleName.trim(),
              description: mod.description?.trim() ?? null,
              status: 'active',
            }).returning()
            newModuleIds.push(createdModule.id)
          }
        }

        // Log activity
        const userNamesString = data.clientUsers.map((cu) => `${cu.firstName} ${cu.lastName} (${cu.email})`).join(', ')
        const approverCount = data.clientUsers.filter((cu) => cu.userType === 'approver').length
        await tx.insert(ticketHistory).values({
          ticketId: 0,
          userId: currentUser.id,
          action: 'Client Users Added',
          newValue: `${data.clientUsers.length} user(s) added to project "${projectInfo.projectName}": ${userNamesString} (${approverCount} approver(s))`,
        })

        return {
          projectId: projectInfo.id,
          projectName: projectInfo.projectName,
          userEmail: data.clientUsers[0].email.trim(),
          clientName: createdUserNames[0],
          clientId: createdUserIds[0],
          success: true,
        }
      })

      // Create notifications
      try {
        const notifications: { userId: string; title: string; message: string; link?: string }[] = [
          {
            userId: currentUser.id,
            title: 'Client Users Added',
            message: `${data.clientUsers.length} user(s) added to project "${result.projectName}".`,
            link: `/dashboard/projects/${result.projectId}`,
          },
        ]
        for (const cu of data.clientUsers) {
          const [newUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, cu.email.trim())).limit(1)
          if (newUser) {
            notifications.push({
              userId: newUser.id,
              title: 'Welcome to Support Hero',
              message: `Your account has been created and linked to project "${result.projectName}".`,
              link: `/dashboard/projects/${result.projectId}`,
            })
            dispatchNotification({
              eventType: 'customer_created',
              triggeredBy: currentUser.id,
              dedup: { scope: `user:${newUser.id}` },
              recipients: [
                {
                  userId: newUser.id,
                  email: {
                    templateData: {
                      customerName: `${cu.firstName} ${cu.lastName}`,
                      customerEmail: cu.email.trim(),
                      createdBy: currentUser.name || 'Admin',
                      portalUrl: getPortalUrl(),
                      projectName: result.projectName,
                    },
                  },
                  teams: {
                    payload: {
                      customerName: `${cu.firstName} ${cu.lastName}`,
                      customerEmail: cu.email.trim(),
                      createdBy: currentUser.name || 'Admin',
                      projectName: result.projectName,
                    },
                  },
                },
              ],
            }).catch((err: Error) => console.error('[Notify] customer_created failed:', err))

            // Login Credentials (admin opt-in per user) — email-only.
            // Wires up the "Send login credentials via email" checkbox from the
            // onboarding wizard for users added to an existing project.
            if (cu.sendEmail) {
              const credentialsPortalUrl = getPortalUrl()
              dispatchNotification({
                eventType: 'login_credentials',
                triggeredBy: currentUser.id,
                dedup: { scope: `user:${newUser.id}` },
                recipients: [
                  {
                    userId: newUser.id,
                    channels: ['email'],
                    email: {
                      templateData: {
                        userEmail: cu.email.trim(),
                        initialPassword: cu.password,
                        loginUrl: `${credentialsPortalUrl}/sign-in`,
                        portalUrl: credentialsPortalUrl,
                        recipientName: `${cu.firstName} ${cu.lastName}`,
                      },
                    },
                  },
                ],
              }).catch((err: Error) => console.error('[Notify] login_credentials failed:', err))
            }
          }
        }
        const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin'))
        for (const admin of admins) {
          notifications.push({
            userId: admin.id,
            title: 'Client Users Added',
            message: `${data.clientUsers.length} user(s) added to project "${result.projectName}" by ${currentUser.name}.`,
            link: `/dashboard/projects/${result.projectId}`,
          })
        }
        await dispatchNotification({
          eventType: 'customer_onboarding',
          triggeredBy: currentUser.id,
          dedup: { scope: `onboarding:${result.projectId}` },
          recipients: notifications.map((n) => ({
            userId: n.userId,
            channels: ['inApp'] as const,
            inApp: { title: n.title, message: n.message, link: n.link },
          })),
        }).catch((err: Error) => console.error('[Onboarding] Failed to dispatch notifications:', err.message))
      } catch (err) {
        console.error('[Onboarding] Notification creation error (non-fatal):', err)
      }

      revalidatePath('/dashboard')
      revalidatePath('/dashboard/projects')
      revalidatePath('/dashboard/customer-onboarding')

      return result
    } catch (error: any) {
      throw new Error('Failed to add client users. ' + error.message)
    }
    
  },
)

// ── Consolidated Validation ─────────────────────────────────────────────
// Replaces checkDuplicateProjectName() + checkDuplicateEmail() with one call.

export interface OnboardingValidationResult {
  isDuplicateProjectName: boolean
  isDuplicateEmail: boolean
}

export const validateOnboarding = wrapServerAction('validateOnboarding', async function validateOnboarding(projectName: string, email: string) {
  const currentUser = await getCurrentUser()
  if (!canCreateOnboarding(currentUser.role)) throw new Error('Access denied')

  const [dupProject, dupEmail] = await Promise.all([
    db.select({ id: project.id }).from(project)
      .where(and(eq(project.projectName, projectName.trim()), ne(project.status, 'archived'))).limit(1),
    db.select({ id: user.id }).from(user).where(eq(user.email, email.trim())).limit(1),
  ])

  return {
    isDuplicateProjectName: dupProject.length > 0,
    isDuplicateEmail: dupEmail.length > 0,
  } as OnboardingValidationResult
})

