// Profile header shows the client's Account Type badge beside the role badge,
// from the same source as the Personal Information "Account Type" field.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clientAccountTypeLabel } from '../lib/account-type.ts'

const PROFILE = readFileSync(join(import.meta.dirname, '..', 'app/dashboard/profile/profile-client.tsx'), 'utf8')

test('labels come from the actual account type (never hardcoded)', () => {
  assert.equal(clientAccountTypeLabel('approver'), 'Approver Account')
  assert.equal(clientAccountTypeLabel('standard'), 'Standard Account')
  assert.equal(clientAccountTypeLabel(null), 'Standard Account', 'column default is standard')
  assert.equal(clientAccountTypeLabel(' Approver '), 'Approver Account')
  assert.equal(clientAccountTypeLabel('read_only'), 'Read Only Account', 'any other type gets a readable label')
})

test('Account Type appears only in the header — no duplicate Personal Information field', () => {
  assert.match(PROFILE, /const accountTypeLabel = user\.role === 'client' \? clientAccountTypeLabel\(user\.userType\) : null/)
  assert.equal(PROFILE.match(/\{accountTypeLabel\}/g)?.length, 1, 'rendered once (header badge)')
  assert.doesNotMatch(PROFILE, /id="accountType"|>Account Type<|Account type is set by an administrator/)
  assert.doesNotMatch(PROFILE, /'Approver Account'|'Standard Account'/, 'no hardcoded labels in the page')
})

test('badge sits immediately after the role badge, inline in the wrapping name row', () => {
  const header = PROFILE.slice(PROFILE.indexOf('<h1 className="text-lg font-semibold'), PROFILE.indexOf('<Mail className="h-3.5 w-3.5 shrink-0" />'))
  assert.ok(header.indexOf('{roleConfig.label}') < header.indexOf('{accountTypeLabel}'))
  const rowStart = PROFILE.lastIndexOf('<div className="flex items-center gap-2 flex-wrap">', PROFILE.indexOf('<h1 className="text-lg font-semibold'))
  assert.ok(rowStart > 0, 'badges share the name row, which wraps on small screens')
  // Not colour-only: icon + text label; icon is decorative.
  assert.match(header, /<ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" \/>/)
  assert.match(header, /<User className="h-3 w-3 shrink-0" aria-hidden="true" \/>/)
  // Not near the Active badge.
  const active = PROFILE.slice(PROFILE.indexOf('Member since'), PROFILE.indexOf('>Active</span>'))
  assert.doesNotMatch(active, /accountTypeLabel/)
})
