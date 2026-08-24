/**
 * Backfill Support Wallets for Existing Clients
 *
 * Ensures every client user in the system has a linked support wallet.
 * Creates one with default values (0 hours, inactive) if none exists.
 * Also creates project-linked wallets for projects that don't have one.
 *
 * Usage:
 *   npx tsx frontend/scripts/backfill-client-wallets.ts
 *
 * Note: Run from the project root so the @/ path alias resolves correctly
 * (requires tsconfig paths configured).
 * If @/ alias does not resolve, use: npx tsx --tsconfig frontend/tsconfig.json frontend/scripts/backfill-client-wallets.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq, and, isNull, count } from 'drizzle-orm'
import { user, project, supportWallet } from '@/lib/db/schema'

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  const db = drizzle(pool)

  console.log('🔍 Scanning for clients without support wallets...')

  // Get all client users
  const allClients = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, 'client'))

  console.log(`   Found ${allClients.length} total client users`)

  // Get all existing wallets grouped by client
  const existingWallets = await db
    .select({ clientId: supportWallet.clientId })
    .from(supportWallet)

  const walletClientIds = new Set(existingWallets.map((w) => w.clientId))

  // Find clients without wallets (no wallet record at all)
  const clientsWithoutWallets = allClients.filter((c) => !walletClientIds.has(c.id))

  if (clientsWithoutWallets.length === 0) {
    console.log('✅ All clients already have support wallets. Nothing to backfill for clients.')
  } else {
    console.log(`   ${clientsWithoutWallets.length} clients missing support wallets`)

    // Create wallets for each client without one
    let created = 0
    for (const c of clientsWithoutWallets) {
      await db.insert(supportWallet).values({
        clientId: c.id,
        projectId: null,
        totalPurchasedHours: 0,
        reservedHours: 0,
        consumedHours: 0,
        remainingHours: 0,
        status: 'inactive',
      })
      created++
      console.log(`   ✅ Created wallet for client #${c.id} — ${c.name || c.email}`)
    }

    console.log()
    console.log(`🎉 Created ${created} client support wallet(s).`)
    console.log('   These wallets are inactive with 0 hours. Add hours to activate them.')
    console.log()
  }

  // Also check for projects without wallets
  console.log('🔍 Scanning for projects without support wallets...')

  const allProjects = await db
    .select({ id: project.id, projectName: project.projectName, clientId: project.clientId })
    .from(project)

  console.log(`   Found ${allProjects.length} total projects`)

  // Get all existing wallets that are linked to a project
  const allProjectWallets = await db
    .select({ projectId: supportWallet.projectId })
    .from(supportWallet)

  const walletProjectIds = new Set(
    allProjectWallets
      .filter((w) => w.projectId !== null)
      .map((w) => w.projectId as number)
  )

  const projectsWithoutWallets = allProjects.filter((p) => !walletProjectIds.has(p.id))

  if (projectsWithoutWallets.length === 0) {
    console.log('✅ All projects already have support wallets. Nothing to backfill for projects.')
  } else {
    console.log(`   ${projectsWithoutWallets.length} projects missing support wallets`)

    let created = 0
    for (const p of projectsWithoutWallets) {
      await db.insert(supportWallet).values({
        clientId: p.clientId,
        projectId: p.id,
        totalPurchasedHours: 0,
        reservedHours: 0,
        consumedHours: 0,
        remainingHours: 0,
        status: 'inactive',
      })
      created++
      console.log(`   ✅ Created wallet for project #${p.id} — ${p.projectName}`)
    }

    console.log()
    console.log(`🎉 Created ${created} project support wallet(s).`)
  }

  // Summary
  const [totalWalletCount] = await db
    .select({ value: count() })
    .from(supportWallet)

  const [totalClientCount] = await db
    .select({ value: count() })
    .from(user)
    .where(eq(user.role, 'client'))

  await pool.end()
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err)
  process.exit(1)
})
