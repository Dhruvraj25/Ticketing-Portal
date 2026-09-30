// Ticket cards (dashboard Recent Tickets + Tickets page list/grid) show the
// revision count only when it is > 0; 0 / null / undefined render nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CARD = readFileSync(join(import.meta.dirname, '..', 'components', 'dashboard', 'ticket-card.tsx'), 'utf8')

// Mirrors the JSX condition so the truth table is checked, not just the text.
const showsRevisions = (revisionCount: number | null | undefined) => (revisionCount ?? 0) > 0

test('condition is a boolean guard — never `count && …`, which renders a literal 0', () => {
  assert.match(CARD, /\{\(ticket\.revisionCount \?\? 0\) > 0 && \(/)
  assert.doesNotMatch(CARD, /\{ticket\.revisionCount &&/)
})

test('0 / null / undefined hide the count; positive values show it', () => {
  assert.equal(showsRevisions(0), false)
  assert.equal(showsRevisions(null), false)
  assert.equal(showsRevisions(undefined), false)
  assert.equal(showsRevisions(1), true)
  assert.equal(showsRevisions(3), true)
})

test('existing styling kept: orange RefreshCw badge with the count', () => {
  assert.match(CARD, /\(ticket\.revisionCount \?\? 0\) > 0 && \(\s*\n\s*<span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">\s*\n\s*<RefreshCw className="h-3 w-3" \/>\s*\n\s*\{ticket\.revisionCount\}/)
})
