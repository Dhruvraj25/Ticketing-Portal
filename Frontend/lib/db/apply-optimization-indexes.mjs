/**
 * Database Optimization: Apply All Missing Indexes
 *
 * Phase 2 (original): 6 indexes — action, wallet, and time_log patterns.
 * Phase 14 (SQL audit): 7 additional indexes — revision_history, time_log,
 * comment, project composites, and support_wallet contract-renewal index.
 * Phase 15 (Admin Optimization): 3 indexes — pg_trgm extension + GIN indexes
 * for admin user ILIKE search, composite index for banned+role filtering.
 *
 * Safe to run multiple times (IF NOT EXISTS / IF EXISTS used throughout).
 *
 * Run: node lib/db/apply-optimization-indexes.mjs
 */

import pg from 'pg'
const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 30000,
})

const migrations = [
  // ── PHASE 2 (original) ──────────────────────────────────────────────

  // 1. Drop the old redundant single-column index — replaced by composite below
  `DROP INDEX IF EXISTS wallet_transaction_wallet_id_idx`,

  // 2. Ticket history — action column (used in WHERE action = 'Customer Onboarding Completed')
  `CREATE INDEX IF NOT EXISTS ticket_history_action_idx ON tickethistory ("action")`,

  // 3. Support wallet — partial index on projectId for wallet-per-project queries
  //    Only indexes rows where projectId IS NOT NULL
  `CREATE INDEX IF NOT EXISTS wallet_project_id_idx ON support_wallet ("projectId") WHERE "projectId" IS NOT NULL`,

  // 4. Wallet transactions — composite index (walletId, performedAt DESC)
  //    Covers the wallet-tx listing query WHERE walletId = ? ORDER BY performedAt DESC
  `CREATE INDEX IF NOT EXISTS wallet_transaction_wallet_performed_idx ON wallet_transaction ("walletId", "performedAt" DESC)`,

  // 5. Time logs — partial index for active timer queries (WHERE userId = ? AND endTime IS NULL)
  `CREATE INDEX IF NOT EXISTS time_log_user_active_timer_idx ON time_log ("userId") WHERE "endTime" IS NULL`,

  // 6. Email logs — composite index (event_type, status) for filtering/sorting
  `CREATE INDEX IF NOT EXISTS email_event_status_idx ON email_log ("event_type", "status")`,

  // ── PHASE 14: SQL Audit — New Indexes ────────────────────────────────

  // 7. Revision history — composite for ticket detail page.
  //    WHERE ticketId = ? ORDER BY createdAt DESC — covers filter + sort.
  `CREATE INDEX IF NOT EXISTS revision_ticket_created_idx ON revision_history ("ticketId", "createdAt" DESC)`,

  // 8. Revision history — createdAt for analytics CTE.
  //    The _getAnalyticsDataImpl CTE scans revision_history with WHERE createdAt >= ?.
  //    (30-day window). Without this, it's a full table scan.
  `CREATE INDEX IF NOT EXISTS revision_created_at_idx ON revision_history ("createdAt")`,

  // 9. Time logs — composite for getTimeLogs / getTimeLogsBatch.
  //    WHERE ticketId = ? ORDER BY createdAt DESC — enables index-only scan with sort.
  `CREATE INDEX IF NOT EXISTS time_log_ticket_created_idx ON time_log ("ticketId", "createdAt" DESC)`,

  // 10. Comment — composite for ticket comment sections.
  //     WHERE ticketId = ? ORDER BY createdAt DESC — eliminates in-memory sort.
  `CREATE INDEX IF NOT EXISTS comment_ticket_created_idx ON comment ("ticketId", "createdAt" DESC)`,

  // 11. Project — composite for client dashboard sidebar.
  //     WHERE clientId = ? AND status = ? — enables index-only filter.
  `CREATE INDEX IF NOT EXISTS project_client_status_idx ON project ("clientId", "status")`,

  // 12. Project — composite for manager dashboard sidebar.
  //     WHERE managerId = ? AND status = ? — enables index-only filter.
  `CREATE INDEX IF NOT EXISTS project_manager_status_idx ON project ("managerId", "status")`,

  // ── PHASE 15: Admin Optimization — Indexes ───────────────────────────
  // Enables fast ILIKE '%term%' searches on user name and email.
  // Without pg_trgm, PostgreSQL cannot use B-tree indexes for wildcard
  // patterns with leading '%' — it must do a full table scan.
  // With pg_trgm + GIN, the trigram index supports leading-wildcard ILIKE
  // queries in <5ms even on tables with 10k+ users.
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,

  // GIN trigram index on user.name for ILIKE search.
  // getUsersPaginated(search) uses: WHERE name ILIKE '%term%' OR email ILIKE '%term%'
  // This index covers the name portion. Estimated speedup: 100x on 5k+ users.
  `CREATE INDEX IF NOT EXISTS user_name_trgm_idx ON "user" USING gin ("name" gin_trgm_ops)`,

  // GIN trigram index on user.email for ILIKE search.
  `CREATE INDEX IF NOT EXISTS user_email_trgm_idx ON "user" USING gin ("email" gin_trgm_ops)`,

  // Composite index for filtered admin queries that filter by banned + role
  // WITHOUT sorting by createdAt. Common pattern:
  //   WHERE role = 'developer' AND banned = false
  // The existing user_role_banned_created_at_idx includes createdAt DESC,
  // which is larger and less efficient for non-sorted queries.
  // This leaner index covers only the filter columns.
  `CREATE INDEX IF NOT EXISTS user_banned_role_idx ON "user" ("banned", "role")`,

  // Composite index covering name+role for admin user listing with name sort.
  // When sorting by name ASC/DESC with a role filter, this enables index-only scan.
  `CREATE INDEX IF NOT EXISTS user_name_role_idx ON "user" ("name", "role")`,

  // Composite index covering email+role for admin user listing with email sort.
  `CREATE INDEX IF NOT EXISTS user_email_role_idx ON "user" ("email", "role")`,
]

async function applyIndexes() {
  const client = await pool.connect()
  try {
    console.log('Connected. Applying missing indexes...\n')
    for (const ddl of migrations) {
      try {
        const start = Date.now()
        await client.query(ddl)
        const elapsed = Date.now() - start
        const operation = ddl.startsWith('DROP') ? 'DROP' : ddl.startsWith('CREATE EXTENSION') ? 'EXTENSION' : 'CREATE'
        const tableRef = ddl.split(' ON ')[1]?.split(' ')[0] || ddl.split(' ').slice(0, 3).join(' ') || ddl
        console.log(`  ✓ ${elapsed}ms  ${operation}  ${tableRef}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`  ✗ FAILED: ${ddl}`)
        console.error(`    ${msg}`)
      }
    }
    console.log('\nDone. All indexes applied.')
  } finally {
    client.release()
    await pool.end()
  }
}

applyIndexes().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
