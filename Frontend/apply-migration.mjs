import pg from 'pg'
import fs from 'fs'
import path from 'path'

/**
 * Split SQL text into individual statements by semicolons,
 * but NOT inside dollar-quoted strings ($$ ... $$ or $tag$ ... $tag$).
 * This ensures DO blocks and function definitions stay intact.
 */
function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let inDollar = false
  let dollarTag = ''
  let i = 0

  while (i < sql.length) {
    // Check for start of dollar-quoted string
    if (!inDollar && sql[i] === '$') {
      let tag = ''
      let j = i + 1
      while (j < sql.length && sql[j] !== '$' && sql[j] !== ' ' && sql[j] !== '\n' && sql[j] !== '\r') {
        tag += sql[j]
        j++
      }
      if (j < sql.length && sql[j] === '$') {
        // Found $$ or $tag$ — opening
        inDollar = true
        dollarTag = tag  // empty string for $$, or content for $tag$
        current += sql.slice(i, j + 1)
        i = j + 1
        continue
      }
    }

    // Check for end of dollar-quoted string
    if (inDollar) {
      if (sql[i] === '$') {
        let j = i + 1
        let tag = ''
        while (j < sql.length && sql[j] !== '$' && sql[j] !== ' ' && sql[j] !== '\n' && sql[j] !== '\r') {
          tag += sql[j]
          j++
        }
        if (j < sql.length && sql[j] === '$' && tag === dollarTag) {
          // Closing $$ or $tag$
          inDollar = false
          dollarTag = ''
          current += sql.slice(i, j + 1)
          i = j + 1
          continue
        }
      }
    }

    // Split by semicolon only if not inside dollar-quoted string
    if (!inDollar && sql[i] === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      i++
      continue
    }

    current += sql[i]
    i++
  }

  // Don't forget the last statement (may not end with ;)
  const trimmed = current.trim()
  if (trimmed) statements.push(trimmed)

  return statements
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.argv[2],
})

async function applyMigration(tag) {
  const client = await pool.connect()
  try {
    const migrationDir = path.join(import.meta.dirname, 'lib/db/migrations')
    const sqlFile = path.join(migrationDir, `${tag}.sql`)
    
    if (!fs.existsSync(sqlFile)) {
      console.error(`Migration file not found: ${sqlFile}`)
      process.exit(1)
    }

    const sql = fs.readFileSync(sqlFile, 'utf8')

    // Strip comments and split into individual statements
    const cleaned = sql
      .replace(/--\s*Benchmark Queries[\s\S]*$/, '')
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && !line.trim().startsWith('/*'))
      .join('\n')

    // Split by semicolons, but NOT inside dollar-quoted strings ($$, $function$, etc.)
    const statements = splitSqlStatements(cleaned)

    console.log(`Applying migration: ${tag}\n`)

    for (const stmt of statements) {
      try {
        await client.query(stmt + ';')
        const match = stmt.match(/(?:CREATE|ALTER|DROP)\s+\S+\s+(?:IF NOT EXISTS\s+)?(\S+)/i)
        console.log(`  ✓ ${match ? match[1] : 'executed'}`)
      } catch (err) {
        if (err.message?.includes('already exists')) {
          console.log(`  - already exists: ${stmt.substring(0, 80)}...`)
        } else {
          console.error(`  ✗ Error:`, err.message?.substring(0, 200))
          throw err
        }
      }
    }

    // Update migration journal
    const journalPath = path.join(migrationDir, 'meta/_journal.json')
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
    
    const idx = journal.entries.length
    journal.entries.push({
      idx,
      version: '7',
      when: Date.now(),
      tag,
      breakpoints: true,
    })
    
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n')
    
    console.log(`\nMigration ${tag} applied successfully!`)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

const tag = process.argv[3] || '0008_add_indexes'
applyMigration(tag)
