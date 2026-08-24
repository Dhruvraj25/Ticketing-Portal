#!/usr/bin/env node
/**
 * ────────────────────────────────────────────────────────────────────────────
 * Tour Selector Audit
 * ────────────────────────────────────────────────────────────────────────────
 * Development/audit utility that compares the tour configuration selectors
 * (lib/tour/config.ts) against the actual `data-tour` attributes present in
 * the source tree.
 *
 * Usage:
 *   node scripts/tour-selector-audit.mjs
 *   node scripts/tour-selector-audit.mjs --json      # machine-readable output
 *   node scripts/tour-selector-audit.mjs --page tickets  # filter by page key
 *
 * Report format:
 *   Total configured steps: 120
 *   Existing selectors:     116
 *   Missing selectors:      4
 *   Duplicate selectors:    0
 *
 * Exit code is 0 even when selectors are missing (this is an audit, not a
 * gate), unless `--fail` is passed — useful for CI.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CONFIG_PATH = join(ROOT, 'lib', 'tour', 'config.ts')
const SRC_DIRS = [
  join(ROOT, 'app'),
  join(ROOT, 'components'),
  join(ROOT, 'lib'),
]
const IGNORE = new Set(['node_modules', '.next', 'dist', 'scripts'])
// The tour config is the *source of truth* for configured selectors; scanning
// it as a "source file" too would make every config-referenced selector count
// as "found" even when no component actually has the attribute.
const CONFIG_REL = 'lib/tour/config.ts'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const failOnMissing = args.includes('--fail')
const pageFilter = (() => {
  const i = args.indexOf('--page')
  return i >= 0 && args[i + 1] ? args[i + 1] : null
})()

// ── Helpers ────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(tsx|ts|jsx|js)$/.test(entry)) out.push(full)
  }
  return out
}

function unique(arr) {
  return Array.from(new Set(arr))
}

/**
 * Extract `data-tour` attribute names from a source blob (components AND
 * config). Handles three syntaxes:
 *
 *   1. Static:     data-tour="nav-tickets"   (or single quotes)
 *   2. Template:   data-tour={`profile-tab-${tab.id}`} — placeholders are
 *                  expanded from `id: '...'` literals in the same file, so
 *                  `profile-tab-personal` and `profile-tab-preferences` are
 *                  both discovered.
 *   3. Map lookup: data-tour={NAV_TOUR_ATTR[item.href]} — the string VALUES
 *                  of the referenced map literal are registered.
 */
function extractDataTourAttributes(blob) {
  const names = []
  const push = (n) => names.push(n)

  // 1. Static attributes.
  const staticRe = /data-tour\s*=\s*["']([^"']+)["']/g
  let m
  while ((m = staticRe.exec(blob)) !== null) push(m[1])

  // 2. Template-literal attributes (`data-tour={...}` with a template).
  const tplRe = /data-tour\s*=\s*\{\s*`([^`]+)`\s*\}/g
  while ((m = tplRe.exec(blob)) !== null) {
    const tpl = m[1]
    if (!tpl.includes('${')) {
      push(tpl)
      continue
    }
    // Expand `${placeholder}` from `id: 'value'` literals in the same file.
    const ids = [...blob.matchAll(/\bid:\s*["']([^"']+)["']/g)].map((x) => x[1])
    for (const id of unique(ids)) push(tpl.replace(/\$\{[^}]+\}/g, id))
  }

  // 3. Map-lookup attributes — register the values of the referenced map.
  const exprRe = /data-tour\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\[/g
  while ((m = exprRe.exec(blob)) !== null) {
    const mapName = m[1]
    const mapRe = new RegExp(`${mapName}[^{]*\\{([^}]*)\\}`, 'g')
    const mapMatch = mapRe.exec(blob)
    if (!mapMatch) continue
    const valueRe = /:\s*["']([^"']+)["']/g
    let vm
    while ((vm = valueRe.exec(mapMatch[1])) !== null) push(vm[1])
  }

  return names
}
// Same parser reused for configured selectors — the blob is the same syntax.
const extractConfiguredSelectors = extractDataTourAttributes

// ── 1. Configured selectors (from lib/tour/config.ts) ────────────────────

const configBlob = readFileSync(CONFIG_PATH, 'utf8')
const configuredSelectors = unique(extractConfiguredSelectors(configBlob))

// ── 2. Actual selectors (across the source tree) ─────────────────────────

const sourceFiles = SRC_DIRS.flatMap((dir) => (statSync(dir).isDirectory() ? walk(dir) : [])).filter(
  // Never count the tour config itself as a "component" — its selectors are
  // the configured expectations, not DOM facts.
  (f) => resolve(f) !== resolve(CONFIG_PATH) && !f.replace(/\\/g, '/').endsWith(CONFIG_REL),
)
const actualSelectors = new Set()
for (const file of sourceFiles) {
  const blob = readFileSync(file, 'utf8')
  for (const name of extractDataTourAttributes(blob)) actualSelectors.add(name)
}

// ── 3. Per-page analysis (parse PAGE_TOURS blocks) ────────────────────────

/**
 * Crude but reliable block parser: find every `'<path>': [` entry in the
 * PAGE_TOURS record and collect the `data-tour="..."` selectors referenced
 * inside that block. Used only for the per-page report.
 */
function parsePageBlocks(blob) {
  const pages = []
  const pageStartRe = /^  (['"])(\/dashboard(?:\/[^'"]*)?)\1:\s*\[$/gm
  let m
  while ((m = pageStartRe.exec(blob)) !== null) {
    const key = m[2]
    const start = m.index + m[0].length
    // Find the matching closing `],` at indentation level 0 of the record.
    let depth = 1
    let i = start
    while (i < blob.length && depth > 0) {
      const ch = blob[i]
      if (ch === '[') depth++
      else if (ch === ']') depth--
      i++
    }
    const block = blob.slice(start, i)
    const selectors = unique(extractConfiguredSelectors(block))
    pages.push({ key, selectors })
  }
  return pages
}

const pageBlocks = parsePageBlocks(configBlob).filter(
  (p) => !pageFilter || p.key.includes(pageFilter),
)

// ── 4b. Per-page source attribution (Phase 22: "route matches expected page") ──
// For each page key, collect the selectors that appear in the ROUTE's own app
// files (app/dashboard/<route>/...). Selectors that exist globally but NOT in
// the route's files are reported as "shared-or-mismatch": they usually live in
// a shared component under components/dashboard/, but they could also be a
// copy-paste error pointing at another page's element. Informational — never
// a hard failure.

function routeDirFor(key) {
  if (key === '/dashboard') return join(ROOT, 'app', 'dashboard')
  return join(ROOT, 'app', ...key.replace(/^\//, '').split('/'))
}

function collectRouteSelectors(dir, recursive = true) {
  const out = new Set()
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out
  // The root dashboard route owns only its own files — recursing would pull in
  // every subpage's selectors and make the attribution meaningless.
  const files = recursive
    ? walk(dir)
    : readdirSync(dir)
        .filter((f) => /^.+\.(tsx|ts|jsx|js)$/.test(f))
        .map((f) => join(dir, f))
  for (const file of files) {
    if (file.includes('node_modules')) continue
    try {
      for (const name of extractDataTourAttributes(readFileSync(file, 'utf8'))) out.add(name)
    } catch {
      /* unreadable file — ignore */
    }
  }
  return out
}

const pageSource = new Map()
for (const p of pageBlocks) {
  pageSource.set(p.key, collectRouteSelectors(routeDirFor(p.key), p.key !== '/dashboard'))
}

// ── 4. Report ─────────────────────────────────────────────────────────────

function missingFor(selectors) {
  return selectors.filter((s) => !actualSelectors.has(s))
}

const allConfigured = pageBlocks.flatMap((p) => p.selectors)
const duplicates = allConfigured.filter((s, i) => allConfigured.indexOf(s) !== i)

// Global counts (all selectors referenced anywhere in config, incl. role tours)
const globalMissing = configuredSelectors.filter((s) => !actualSelectors.has(s))

if (asJson) {
  console.log(
    JSON.stringify(
      {
        totalConfiguredSteps: configuredSelectors.length,
        existingSelectors: configuredSelectors.length - globalMissing.length,
        missingSelectors: globalMissing,
        duplicateSelectors: unique(duplicates),
        pages: pageBlocks.map((p) => ({
          page: p.key,
          configured: p.selectors.length,
          missing: missingFor(p.selectors),
          notInRouteFiles: p.selectors.filter((s) => !pageSource.get(p.key)?.has(s) && actualSelectors.has(s)),
        })),
      },
      null,
      2,
    ),
  )
} else {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║   SupportHub Tour Selector Audit                              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log('')

  // Per-page coverage
  console.log('── Page coverage ─────────────────────────────────────────────')
  for (const page of pageBlocks) {
    const missing = missingFor(page.selectors)
    const routeMissing = page.selectors.filter(
      (s) => !pageSource.get(page.key)?.has(s) && actualSelectors.has(s),
    )
    const status = missing.length === 0 ? '✓ complete' : `✗ ${missing.length} missing`
    console.log(`  ${page.key.padEnd(34)} ${String(page.selectors.length).padStart(3)} steps  ${status}`)
    for (const sel of missing) console.log(`      MISSING  ${sel}`)
    for (const sel of routeMissing) console.log(`      ? shared/other-page  ${sel}`)
  }
  console.log('')

  // Global rollup
  console.log('── Global rollup ──────────────────────────────────────────────')
  console.log(`  Total configured steps: ${configuredSelectors.length}`)
  console.log(`  Existing selectors:     ${configuredSelectors.length - globalMissing.length}`)
  console.log(`  Missing selectors:      ${globalMissing.length}`)
  console.log(`  Duplicate selectors:    ${unique(duplicates).length}`)
  console.log('')

  if (globalMissing.length > 0) {
    console.log('  Missing selectors (not found in any source file):')
    for (const sel of globalMissing) console.log(`    • ${sel}`)
    console.log('')
  }

  // Duplicate report
  const dupNames = unique(duplicates)
  if (dupNames.length > 0) {
    console.log('  Selectors used by more than one page step:')
    for (const sel of dupNames) console.log(`    • ${sel}`)
    console.log('')
  }

  // Steps that have NO element selector (intentional, e.g. done steps)
  console.log(`  Audited source files: ${sourceFiles.length}`)
  console.log(`  Distinct data-tour attrs in source: ${actualSelectors.size}`)
  console.log('')

  if (failOnMissing && globalMissing.length > 0) {
    console.error(`FAIL: ${globalMissing.length} configured selectors missing.`)
    process.exit(1)
  }
  console.log('Audit complete.')
}
