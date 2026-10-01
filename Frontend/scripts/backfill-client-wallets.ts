/**
 * Backfill Support Wallets — Company-Level Architecture
 *
 * Ensures every company that has client users owns exactly ONE support
 * wallet (support_wallet.companyId). A company without one gets an empty,
 * inactive wallet (0 hours) whose primary contact is its Approver (else its
 * earliest client user). Never creates per-user or per-project wallets.
 *
 * Client users without a company must be linked first:
 *   node --env-file=.env --experimental-strip-types scripts/migrate-company-wallets.ts
 *
 * Usage (from Frontend/):
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-client-wallets.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { user, company, supportWallet } from '@/lib/db/schema'

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool)

  const unlinked = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, 'client'), isNull(user.companyId)))
  if (unlinked.length > 0) {
    console.log(`⚠️  ${unlinked.length} client user(s) have no company. Run scripts/migrate-company-wallets.ts first.`)
  }

  const companies = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .leftJoin(supportWallet, eq(supportWallet.companyId, company.id))
    .where(isNull(supportWallet.id))

  let created = 0
  for (const c of companies) {
    const members = await db
      .select({ id: user.id, userType: user.userType })
      .from(user)
      .where(and(eq(user.companyId, c.id), eq(user.role, 'client')))
      .orderBy(asc(user.createdAt), asc(user.id))
    if (members.length === 0) continue
    const contact = members.find((m) => m.userType === 'approver') ?? members[0]
    const rows = await db
      .insert(supportWallet)
      .values({
        clientId: contact.id, companyId: c.id, projectId: null,
        totalPurchasedHours: 0, reservedHours: 0, consumedHours: 0, remainingHours: 0,
        status: 'inactive',
      })
      .onConflictDoNothing()
      .returning({ id: supportWallet.id })
    if (rows.length) {
      created++
      console.log(`   ✅ Created company wallet #${rows[0].id} — ${c.name}`)
    }
  }
  console.log(created ? `🎉 Created ${created} company wallet(s) (inactive, 0 hours).` : '✅ Every company already has its wallet.')

  const duplicates = await db
    .select({ companyId: supportWallet.companyId, n: sql<number>`count(*)::int` })
    .from(supportWallet)
    .where(sql`${supportWallet.companyId} IS NOT NULL`)
    .groupBy(supportWallet.companyId)
    .having(sql`count(*) > 1`)
  if (duplicates.length) console.log('⚠️  Companies with more than one wallet:', duplicates)

  await pool.end()
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
