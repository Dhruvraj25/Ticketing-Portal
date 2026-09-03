import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { pool } from '@/lib/db'
import { getPortalUrl } from '@/lib/urls'
import { db } from '@/lib/db'
import { user as userTable } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

// ── Required environment variable check ──────────────────────────────────
// better-auth reads BETTER_AUTH_SECRET from process.env automatically, but
// never fails fast — it only blows up at the first session token operation.
// Validate eagerly so the error surfaces at startup, not during a page render.
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    'Missing BETTER_AUTH_SECRET environment variable. ' +
    'Set it in your .env.local file. Example:\n' +
    '  BETTER_AUTH_SECRET=your-secret-key-change-this-in-production\n' +
    'Generate one with: openssl rand -hex 32',
  )
}

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL) ??
    'http://localhost:3000',
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Disable public self-registration — only admins can create accounts
    disableSignUp: true,
    // Send password reset emails via the unified notification dispatcher
    sendResetPassword: async ({ user, url }) => {
      try {
        // Strict role-based policy: only Admin and Project Manager may reset
        // their password through the email-token flow. Client/Developer must
        // use the "Request Password Reset" Support flow instead. This guard
        // runs at the point of sending, so even a direct call to the raw
        // /api/auth/request-password-reset endpoint can never email a reset
        // link to a Client or Developer account.
        const [roleRow] = await db
          .select({ role: userTable.role })
          .from(userTable)
          .where(eq(userTable.id, user.id))
          .limit(1)
        const role = roleRow?.role
        if (role !== 'admin' && role !== 'project_manager') {
          // Dynamic import keeps the better-auth config free of module-load cycles.
          const { logPasswordAudit } = await import('@/lib/password-audit')
          await logPasswordAudit({
            eventType: 'unauthorized_password_attempt',
            actorUserId: user.id,
            actorName: user.name,
            targetUserId: user.id,
            targetEmail: user.email,
            action: 'email_token_reset',
            result: 'denied',
            detail: 'client/developer roles must use the Support password-reset request',
          })
          console.warn(
            `[PasswordReset] Blocked email-token reset for role "${role}" (${user.email}). ` +
            'Clients/Developers must use the Support request flow.',
          )
          return
        }

        // The app's /reset-password page reads the token from the query string
        // (?token=...), while better-auth builds path-based URLs of the form
        // /reset-password/{token}?callbackURL=... — rewrite the link so the
        // emailed button lands on a route the app actually serves.
        const portalUrl = getPortalUrl()
        const match = url.match(/\/reset-password\/([^/?]+)/)
        const appResetUrl = match
          ? `${portalUrl}/reset-password?token=${encodeURIComponent(match[1])}`
          : url

        // Dynamic import keeps the better-auth config free of module-load cycles.
        const { dispatchNotification } = await import('@/lib/notify-all')
        await dispatchNotification({
          eventType: 'password_reset',
          triggeredBy: user.id,
          // Allow a repeated reset request after 30 minutes; suppress rapid doubles.
          dedup: { scope: `user:${user.id}`, windowMinutes: 30 },
          recipients: [
            {
              userId: user.id,
              channels: ['email'],
              email: {
                templateData: {
                  recipientName: user.name || undefined,
                  userEmail: user.email,
                  resetLink: appResetUrl,
                  expiryMinutes: 60,
                },
              },
            },
          ],
        })
      } catch (err) {
        // Never block the reset request on email failure
        console.error('[PasswordReset] Send failed:', err instanceof Error ? err.message : err)
      }
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'client',
        input: false,
      },
      user_type: {
        type: 'string',
        defaultValue: 'standard',
        input: false,
      },
      avatarUrl: {
        type: 'string',
        required: false,
        input: false,
      },
      phone: {
        type: 'string',
        required: false,
        input: false,
      },
      countryCode: {
        type: 'string',
        required: false,
        input: false,
      },
      timezone: {
        type: 'string',
        required: false,
        input: false,
      },
      about: {
        type: 'string',
        required: false,
        input: false,
      },
      language: {
        type: 'string',
        required: false,
        input: false,
      },
      timeFormat: {
        type: 'string',
        required: false,
        input: false,
      },
      dateFormat: {
        type: 'string',
        required: false,
        input: false,
      },
      emailNotificationsEnabled: {
        type: 'boolean',
        required: false,
        input: false,
      },
    },
  },
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Reject session creation for banned users
          const [userData] = await db
            .select({ banned: userTable.banned, welcomeEmailSent: userTable.welcomeEmailSent, name: userTable.name, email: userTable.email })
            .from(userTable)
            .where(eq(userTable.id, session.userId))
            .limit(1)
          if (userData?.banned) {
            throw new Error('Your account has been deactivated. Contact your administrator.')
          }

          // Fire-and-forget: send Welcome Email if this is the user's first login
          if (userData && !userData.welcomeEmailSent) {
            sendWelcomeEmailForUser(session.userId, userData.name, userData.email).catch((err: Error) => {
              console.error(`[WelcomeEmail] Failed - User: ${userData.name}, Email: ${userData.email}, Reason: ${err.message}`)
            })
          }

          return { data: session }
        },
      },
    },
  },
  plugins: [
    nextCookies(),
  ],
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'lax' as const,
          },
        },
      }
    : {}),
})

// ─── Welcome Email Helper ───────────────────────────────────────────────────
// Fires after first successful login. Atomic update prevents duplicate sends
// even under concurrent login requests.

async function sendWelcomeEmailForUser(userId: string, userName: string, userEmail: string): Promise<void> {
  try {
    // Atomically claim the flag — only succeeds if welcomeEmailSent is currently false
    const [updated] = await db
      .update(userTable)
      .set({ welcomeEmailSent: true, updatedAt: new Date() })
      .where(and(eq(userTable.id, userId), eq(userTable.welcomeEmailSent, false)))
      .returning({ id: userTable.id })

    if (!updated) {
      // Another concurrent login already sent the email — skip silently
      return
    }

    // Welcome notification via the unified dispatcher (In-App + Email + Teams)
    const portalUrl = getPortalUrl()
    try {
      // Dynamic import keeps the better-auth config free of module-load cycles.
      const { dispatchNotification } = await import('@/lib/notify-all')
      await dispatchNotification({
        eventType: 'welcome',
        triggeredBy: userId,
        dedup: { scope: `user:${userId}` },
        recipients: [
          {
            userId,
            inApp: {
              title: 'Welcome to Support Hero',
              message: `Welcome, ${userName}! Your account is ready.`,
              link: '/dashboard',
            },
            email: {
              templateData: {
                userEmail,
                recipientName: userName,
                recipientEmail: userEmail,
                loginUrl: `${portalUrl}/sign-in`,
                companyName: process.env.COMPANY_NAME || 'Support Hero',
                portalUrl,
              },
            },
            teams: {
              payload: {
                recipientName: userName,
                userEmail,
                companyName: process.env.COMPANY_NAME || 'Support Hero',
                portalUrl,
              },
            },
          },
        ],
      })
    } catch (innerErr) {
      // Email failure must never block login — log and continue
      console.error(`[WelcomeEmail] Failed - User: ${userName}, Email: ${userEmail}, Reason:`, innerErr instanceof Error ? innerErr.message : innerErr)
    }
  } catch (err) {
    // Database error should not block login either
    console.error(`[WelcomeEmail] Error - User: ${userName}, Email: ${userEmail}, Reason:`, err instanceof Error ? err.message : err)
  }
}
