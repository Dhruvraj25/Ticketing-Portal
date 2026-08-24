/**
 * Backfill Script: populate project_client for existing onboarding data.
 *
 * Secondary client users created during customer onboarding before the
 * project_client table existed have no link to their project. This script
 * parses the onboarding ticket history records to reconstruct those links.
 *
 * How it works:
 *   1. Fetches all "Client Users Created" and "Client Users Added" history records
 *   2. Extracts emails from the newValue field (format: "N users: Name (e), ...")
 *   3. Finds the associated project by matching "Project Created" or
 *      "Customer Onboarding Completed" records by the same user + close timing
 *   4. Looks up user IDs by email
 *   5. Inserts project_client records (skipping duplicates)
 *
 * Usage:
 *   node scripts/backfill-project-client.mjs "postgresql://..."
 */

import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.argv[2],
})

// Regex to extract emails from: "3 user(s) created: John (a@b.com), Jane (c@d.com)"
const EMAIL_REGEX = /\(([^)]+@[^)]+)\)/g

async function backfill() {
  const client = await pool.connect()
  try {
    console.log('Fetching onboarding history records...')

    // Get all "Client Users Created" and "Client Users Added" records (the ones that have user emails)
    const userRecords = await client.query(`
      SELECT id, "userId", "newValue", "createdAt"
      FROM "tickethistory"
      WHERE "action" IN ('Client Users Created', 'Client Users Added')
      ORDER BY "createdAt" ASC
    `)

    // Get all "Project Created" records (to map history -> project)
    const projectRecords = await client.query(`
      SELECT id, "userId", "newValue", "createdAt"
      FROM "tickethistory"
      WHERE "action" = 'Project Created'
      ORDER BY "createdAt" ASC
    `)

    // Get all "Customer Onboarding Completed" records (alternative project match)
    const completedRecords = await client.query(`
      SELECT id, "userId", "newValue", "createdAt"
      FROM "tickethistory"
      WHERE "action" = 'Customer Onboarding Completed'
      ORDER BY "createdAt" ASC
    `)

    console.log(`Found ${userRecords.rows.length} 'Client Users Created' records`)
    console.log(`Found ${projectRecords.rows.length} 'Project Created' records`)
    console.log(`Found ${completedRecords.rows.length} 'Customer Onboarding Completed' records`)

    if (userRecords.rows.length === 0) {
      console.log('No onboarding history found. Nothing to backfill.')
      return
    }

    let totalInserted = 0
    let totalSkipped = 0

    for (const userRec of userRecords.rows) {
      // Extract emails from newValue
      // Format: "N user(s) created: Name1 (email1), Name2 (email2), ..."
      // or: "N user(s) added to project 'X': Name1 (email1), ..."
      const emails = [...userRec.newValue.matchAll(EMAIL_REGEX)].map((m) => m[1].trim().toLowerCase())

      if (emails.length === 0) {
        console.warn(`  ⚠️  No emails found in history #${userRec.id}: ${userRec.newValue?.substring(0, 100)}`)
        continue
      }

      // Find the project name from a nearby record by the same user
      // Look for "Project Created" or "Customer Onboarding Completed"
      // within a 5-minute window of this record
      const userCreatedAt = new Date(userRec.createdAt).getTime()
      const WINDOW_MS = 5 * 60 * 1000

      let projectName = null

      // First try: match by project name in "Customer Onboarding Completed"
      for (const comp of completedRecords.rows) {
        if (comp.userId !== userRec.userId) continue
        const compTime = new Date(comp.createdAt).getTime()
        if (Math.abs(compTime - userCreatedAt) > WINDOW_MS) continue
        // Extract project name from: "Onboarding for \"ProjectName\" completed..."
        const nameMatch = comp.newValue.match(/"([^"]+)"/)
        if (nameMatch) {
          projectName = nameMatch[1]
          break
        }
      }

      // Second try: match by project name in "Project Created"
      if (!projectName) {
        for (const proj of projectRecords.rows) {
          if (proj.userId !== userRec.userId) continue
          const projTime = new Date(proj.createdAt).getTime()
          if (Math.abs(projTime - userCreatedAt) > WINDOW_MS) continue
          // Extract project name from: "Project \"ProjectName\" created..."
          const nameMatch = proj.newValue.match(/"([^"]+)"/)
          if (nameMatch) {
            projectName = nameMatch[1]
            break
          }
        }
      }

      if (!projectName) {
        console.warn(`  ⚠️  Could not find project for history #${userRec.id}`)
        continue
      }

      // Look up the project by name
      const projectResult = await client.query(
        `SELECT id FROM "project" WHERE "projectName" = $1 AND "status" = 'active' LIMIT 1`,
        [projectName],
      )

      if (projectResult.rows.length === 0) {
        console.warn(`  ⚠️  Project "${projectName}" not found or not active (history #${userRec.id})`)
        continue
      }

      const projectId = projectResult.rows[0].id

      // Look up user IDs by email
      const userResult = await client.query(
        `SELECT id, email FROM "user" WHERE LOWER("email") = ANY($1)`,
        [emails],
      )

      if (userResult.rows.length === 0) {
        console.warn(`  ⚠️  No users found for emails in history #${userRec.id}: ${emails.join(', ')}`)
        continue
      }

      // Insert into project_client (skip duplicates)
      for (const u of userResult.rows) {
        try {
          await client.query(
            `INSERT INTO "project_client" ("projectId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [projectId, u.id],
          )
          console.log(`  ✓ Linked user ${u.id} (${u.email}) to project #${projectId} (${projectName})`)
          totalInserted++
        } catch (err) {
          // project_client has no unique constraint declared (composite index only),
          // but ON CONFLICT DO NOTHING handles any duplicates gracefully
          if (err.code === '42P01') {
            console.error('  ✗ Table project_client does not exist. Run migration 0023 first.')
            throw err
          }
          console.warn(`  ~ Skipped duplicate or error for user ${u.id}: ${err.message}`)
          totalSkipped++
        }
      }
    }

    console.log(`\n=== Backfill Complete ===`)
    console.log(`Inserted: ${totalInserted}`)
    console.log(`Skipped: ${totalSkipped}`)
  } catch (err) {
    console.error('Backfill failed:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

backfill()
