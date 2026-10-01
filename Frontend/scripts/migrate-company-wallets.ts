/**
 * Company-wide Support Wallet — data migration.
 *
 *   node --env-file=.env --experimental-strip-types scripts/migrate-company-wallets.ts            # DRY RUN (default): report only
 *   node --env-file=.env --experimental-strip-types scripts/migrate-company-wallets.ts --apply    # apply (one transaction)
 *   ... --apply --consolidate   # also merge companies that own 2+ wallets (only after reviewing the dry run)
 *
 * Run from Frontend/. Idempotent: users/wallets already linked are left alone,
 * so it can be re-run after deploy to link rows created by older code.
 *
 * Safety:
 *   - schema migration 0035 (additive, idempotent) is applied first in --apply;
 *   - the plan comes from lib/company-wallet-migration.ts (pure, tested);
 *   - ANY ambiguity → nothing is written (exit 2);
 *   - companies with 2+ wallets → nothing is written unless --consolidate (exit 3);
 *   - wallet rows keep their ids, balances and transactions; nothing is deleted
 *     except, with --consolidate, a merged wallet's empty shell AFTER all its
 *     transactions/alerts are moved and its hours added to the survivor;
 *   - before/after reconciliation is verified INSIDE the transaction — any
 *     mismatch rolls everything back.
 * Never prints DATABASE_URL or other secrets.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { planCompanyWalletMigration, type CompanyMigrationPlan } from '../lib/company-wallet-migration.ts'

const APPLY = process.argv.includes('--apply')
const CONSOLIDATE = process.argv.includes('--consolidate')
const SCHEMA_SQL = join(import.meta.dirname, '..', 'lib', 'db', 'migrations', '0035_add_company_wallet.sql')

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }

async function hasCompanySchema(c: Q) {
  const r = await c.query(`SELECT
    to_regclass('public.company') IS NOT NULL AS company,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='companyId') AS user_col,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='support_wallet' AND column_name='companyId') AS wallet_col`)
  const x = r.rows[0]
  return x.company && x.user_col && x.wallet_col
}

async function load(c: Q, schema: boolean) {
  const cid = schema ? `"companyId"` : `NULL::int`
  const hasAccountId = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'accountId'`)).rowCount
  const accountCol = hasAccountId ? `"accountId"` : `NULL::text`
  const [users, companies, wallets, projects, tickets] = await Promise.all([
    c.query(`SELECT id, name, email, role, user_type AS "userType", "companyName", "companyCode", ${cid} AS "companyId", ${accountCol} AS "accountId", "createdAt" FROM "user" ORDER BY "createdAt", id`),
    schema ? c.query(`SELECT id, name, code FROM company ORDER BY id`) : Promise.resolve({ rows: [], rowCount: 0 }),
    c.query(`SELECT w.id, w."clientId", ${schema ? 'w."companyId"' : 'NULL::int'} AS "companyId",
        w."totalPurchasedHours", w."reservedHours", w."consumedHours", w."remainingHours",
        to_char(w."contractStartDate", 'YYYY-MM-DD') AS "contractStartDate", to_char(w."contractEndDate", 'YYYY-MM-DD') AS "contractEndDate",
        w.contract_type AS "contractType", w.status,
        (SELECT count(*)::int FROM wallet_transaction t WHERE t."walletId" = w.id) AS "transactionCount",
        (SELECT count(*)::int FROM wallet_alert a WHERE a."walletId" = w.id) AS "alertCount"
      FROM support_wallet w ORDER BY w.id`),
    c.query(`SELECT p.id, p."projectCode", p."clientId" AS "ownerId",
        COALESCE(array_agg(pc."userId") FILTER (WHERE pc."userId" IS NOT NULL), '{}') AS "memberIds"
      FROM project p LEFT JOIN project_client pc ON pc."projectId" = p.id GROUP BY p.id ORDER BY p.id`),
    c.query(`SELECT id, "ticketNumber", "clientId", "projectId" FROM ticket`),
  ])
  return { users: users.rows, companies: companies.rows, wallets: wallets.rows, projects: projects.rows, tickets: tickets.rows }
}

async function snapshot(c: Q) {
  const [w, t, a, r] = await Promise.all([
    c.query(`SELECT count(*)::int AS wallets, COALESCE(sum("totalPurchasedHours"),0)::int AS purchased, COALESCE(sum("reservedHours"),0)::int AS reserved,
      COALESCE(sum("consumedHours"),0)::int AS consumed, COALESCE(sum("remainingHours"),0)::int AS remaining FROM support_wallet`),
    c.query(`SELECT count(*)::int AS transactions, COALESCE(sum(hours),0)::int AS hours FROM wallet_transaction`),
    c.query(`SELECT count(*)::int AS alerts FROM wallet_alert`),
    c.query(`SELECT COALESCE(sum("reservedHours"),0)::int AS ticket_reserved FROM ticket`),
  ])
  return { ...w.rows[0], ...t.rows[0], ...a.rows[0], ...r.rows[0] }
}

function printPlan(plan: CompanyMigrationPlan, users: any[]) {
  const name = new Map(users.map((u) => [u.id, `${u.name} <${u.email}> [${u.userType ?? '-'}]`]))
  console.log('\n=== COMPANY WALLET MIGRATION REPORT ===')
  for (const c of plan.companies) {
    console.log(`\nCompany: ${c.name}${c.code ? ` (${c.code})` : ''}  —  ${c.existingCompanyId ? `existing #${c.existingCompanyId}` : 'NEW'}`)
    console.log(`  Users (${c.userIds.length}):`)
    for (const id of c.userIds) console.log(`    - ${name.get(id) ?? id}${c.usersToLink.includes(id) ? '  → link' : '  (already linked)'}`)
    if (!c.wallets.length) console.log('  Wallets: none (no wallet is created)')
    for (const w of c.wallets) {
      console.log(`  Wallet #${w.id} (user ${name.get(w.clientId) ?? w.clientId}): purchased ${w.totalPurchasedHours}, reserved ${w.reservedHours}, consumed ${w.consumedHours}, remaining ${w.remainingHours}, ${w.contractStartDate ?? '—'} → ${w.contractEndDate ?? '—'}, ${w.transactionCount} txns, ${w.alertCount} alerts${w.companyId ? ' (already linked)' : ''}`)
    }
    if (c.resulting) {
      const r = c.resulting
      console.log(`  ⇒ Company wallet #${c.walletId}: purchased ${r.totalPurchasedHours}, reserved ${r.reservedHours}, consumed ${r.consumedHours}, remaining ${r.remainingHours}, ${r.contractStartDate ?? '—'} → ${r.contractEndDate ?? '—'}, ${r.transactions} txns${c.mergedWalletIds.length ? `  [CONSOLIDATES ${c.mergedWalletIds.map((i) => `#${i}`).join(', ')}]` : ''}`)
    }
  }
  console.log('\nTotals:', plan.totals)
  if (plan.ambiguities.length) {
    console.log(`\n!!! ${plan.ambiguities.length} AMBIGUITIES — nothing will be applied:`)
    for (const a of plan.ambiguities) console.log(`  - [${a.kind}] ${a.message}`)
  } else console.log('\nAmbiguities: none')
}

async function verify(c: Q, before: any) {
  const after = await snapshot(c)
  const problems: string[] = []
  for (const k of ['purchased', 'reserved', 'consumed', 'remaining', 'transactions', 'hours', 'alerts', 'ticket_reserved']) {
    if (Number(before[k]) !== Number(after[k])) problems.push(`${k}: before ${before[k]} ≠ after ${after[k]}`)
  }
  const checks: [string, string][] = [
    ['companies with more than one wallet', `SELECT "companyId" FROM support_wallet WHERE "companyId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1`],
    ['wallets without a valid company', `SELECT w.id FROM support_wallet w LEFT JOIN company c ON c.id = w."companyId" WHERE c.id IS NULL`],
    ['client users without a company', `SELECT id FROM "user" WHERE role = 'client' AND "companyId" IS NULL`],
    ['transactions pointing at a missing wallet', `SELECT t.id FROM wallet_transaction t LEFT JOIN support_wallet w ON w.id = t."walletId" WHERE w.id IS NULL`],
    ['wallets whose primary contact is in another company', `SELECT w.id FROM support_wallet w JOIN "user" u ON u.id = w."clientId" WHERE u."companyId" IS DISTINCT FROM w."companyId"`],
    ['projects with members from another company', `SELECT p.id FROM project p JOIN "user" o ON o.id = p."clientId" JOIN project_client pc ON pc."projectId" = p.id JOIN "user" m ON m.id = pc."userId" WHERE m.role = 'client' AND m."companyId" IS DISTINCT FROM o."companyId"`],
  ]
  for (const [label, sql] of checks) {
    const r = await c.query(sql)
    if (r.rowCount) problems.push(`${label}: ${r.rows.map((x) => Object.values(x)[0]).join(', ')}`)
  }
  return { after, problems }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (use --env-file=.env)')
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    let schema = await hasCompanySchema(client)
    const before = await snapshot(client)
    const data = await load(client, schema)
    const plan = planCompanyWalletMigration(data)
    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN (no changes)'}${schema ? '' : '  — schema 0035 not applied yet'}`)
    console.log('Before:', before)
    printPlan(plan, data.users)

    if (plan.ambiguities.length) { process.exitCode = 2; return }
    if (plan.consolidations.length && !CONSOLIDATE) {
      console.log(`\n${plan.consolidations.length} company(ies) own 2+ wallets. Review the report above, then re-run with --apply --consolidate.`)
      process.exitCode = 3
      return
    }
    if (!APPLY) { console.log('\nDry run only. Re-run with --apply to perform the migration.'); return }

    await client.query('BEGIN')
    if (!schema) { await client.query(readFileSync(SCHEMA_SQL, 'utf8')); schema = true }
    // Re-plan inside the transaction on locked rows (no concurrent drift).
    await client.query('LOCK TABLE support_wallet, wallet_transaction, wallet_alert IN SHARE ROW EXCLUSIVE MODE')
    const locked = planCompanyWalletMigration(await load(client, true))
    if (locked.ambiguities.length || (locked.consolidations.length && !CONSOLIDATE)) throw new Error('Data changed while migrating — re-run the dry run.')

    for (const c of locked.companies) {
      let companyId = c.existingCompanyId
      if (!companyId) {
        const r = await client.query(`INSERT INTO company (name, code) VALUES ($1, $2) RETURNING id`, [c.name, c.code])
        companyId = r.rows[0].id
      }
      if (c.usersToLink.length) {
        await client.query(`UPDATE "user" SET "companyId" = $1 WHERE id = ANY($2::text[]) AND role = 'client' AND "companyId" IS NULL`, [companyId, c.usersToLink])
      }
      if (c.walletId === null) continue
      if (c.mergedWalletIds.length) {
        const r = c.resulting!
        for (const mergedId of c.mergedWalletIds) {
          const m = c.wallets.find((w) => w.id === mergedId)!
          await client.query(`UPDATE wallet_transaction SET "walletId" = $1 WHERE "walletId" = $2`, [c.walletId, mergedId])
          await client.query(`UPDATE wallet_alert SET "walletId" = $1 WHERE "walletId" = $2`, [c.walletId, mergedId])
          await client.query(
            `INSERT INTO wallet_transaction ("walletId", "transactionType", hours, "previousBalance", "newBalance", reason, remarks, "performedBy")
             VALUES ($1, 'Adjustment', 0, $2, $2, 'Company wallet consolidation', $3, 'System migration')`,
            [c.walletId, r.remainingHours, `[Consolidated] Wallet #${mergedId} merged into company wallet: purchased ${m.totalPurchasedHours}, reserved ${m.reservedHours}, consumed ${m.consumedHours}, remaining ${m.remainingHours}`],
          )
          await client.query(`DELETE FROM support_wallet WHERE id = $1`, [mergedId])
        }
        await client.query(
          `UPDATE support_wallet SET "totalPurchasedHours" = $2, "reservedHours" = $3, "consumedHours" = $4, "remainingHours" = $5,
             "contractStartDate" = $6, "contractEndDate" = $7, status = CASE WHEN $8 THEN 'active' ELSE status END, "updatedAt" = now() WHERE id = $1`,
          [c.walletId, r.totalPurchasedHours, r.reservedHours, r.consumedHours, r.remainingHours, r.contractStartDate, r.contractEndDate, c.wallets.some((w) => w.status === 'active')],
        )
      }
      await client.query(`UPDATE support_wallet SET "companyId" = $1 WHERE id = $2 AND "companyId" IS NULL`, [companyId, c.walletId])
    }

    // Consolidation adds one audit transaction per merged wallet (0 hours).
    const expected = { ...before, transactions: Number(before.transactions) + locked.totals.walletsConsolidated }
    const { after, problems } = await verify(client, expected)
    if (problems.length) {
      await client.query('ROLLBACK')
      console.log('\n!!! VERIFICATION FAILED — rolled back, nothing changed:')
      for (const p of problems) console.log('  - ' + p)
      process.exitCode = 4
      return
    }
    await client.query('COMMIT')
    console.log('\nApplied. After:', after)
    console.log('Verification: all checks passed.')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
}

main().catch((err) => { console.error('Migration failed:', err instanceof Error ? err.message : err); process.exitCode = 1 })
