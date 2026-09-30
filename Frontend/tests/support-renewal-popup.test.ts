// Client Dashboard → Support Renewal popup: "Renew Support Contract" sends the
// existing renewal email, then closes the popup for good (no reopen loop).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dirname, '..', 'components', 'dashboard', 'support-renewal-reminder.tsx'), 'utf8')
const handler = SRC.slice(SRC.indexOf('const handleRenewSupport = useCallback'), SRC.indexOf('const handleDismissBanner'))

test('button renamed to "Renew Support Contract" and still runs the existing renewal action', () => {
  assert.match(SRC, /onClick=\{handleRenewSupport\} disabled=\{requesting\}[\s\S]{0,200}Renew Support Contract<\/Button>/)
  assert.doesNotMatch(SRC, /\} Renew Support<\/Button>/)
  assert.match(handler, /const result = await requestSupportRenewal\(\)/)
})

test('on success the popup closes AND is marked handled, so the auto-open effect cannot reopen it', () => {
  const success = handler.slice(handler.indexOf('if (result.success) {'), handler.indexOf('} else {'))
  assert.match(success, /setShowPopup\(false\)/)
  assert.match(success, /setDismissedThisSession\(true\)/)
  assert.match(success, /sessionStorage\.setItem\(SESSION_KEY, 'true'\)/, 'survives navigation / reload within the session')
  assert.match(success, /toast\.success\(/)
  // The auto-open effect is gated on the same flag.
  assert.match(SRC, /if \(tourLayerActive \|\| !status\.showReminder \|\| dismissedThisSession \|\| showPopup\) return/)
})

test('on failure the popup stays open with an error; double-clicks still send only one email', () => {
  const failure = handler.slice(handler.indexOf('} else {'))
  assert.match(failure, /toast\.error\(/)
  assert.doesNotMatch(failure.slice(0, failure.indexOf('} catch')), /setDismissedThisSession/)
  assert.match(handler, /if \(requestInFlight\.current\) return/)
})
