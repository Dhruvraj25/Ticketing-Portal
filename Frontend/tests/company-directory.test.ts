// New Project → Company: unique companies (not users) and company-wide project access.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCompanyDirectory, normalizeCompanyName, resolveCompany, type CompanyDirectoryUser } from '../lib/company-directory.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const CRUD = read('app/actions/projects/crud.ts')
const PAGE = read('app/dashboard/projects/new/page.tsx')

const USERS: CompanyDirectoryUser[] = [
  { id: 'c1', role: 'client', companyName: 'Nirka Business Solutions', companyCode: 'NBS-001', userType: 'standard', createdAt: '2026-01-01' },
  { id: 'c2', role: 'client', companyName: ' Nirka  Business Solutions ', companyCode: 'nbs-001', userType: 'approver', createdAt: '2026-02-01' },
  { id: 'c3', role: 'client', companyName: 'Nirka Business Solutions', companyCode: null, userType: 'standard', createdAt: '2026-03-01' },
  { id: 'x1', role: 'client', companyName: 'Infinixo Technologies', companyCode: null, userType: 'standard', createdAt: '2026-01-05' },
  { id: 'legacy', role: 'client', companyName: null, companyCode: null, createdAt: '2025-01-01' },
  { id: 'admin', role: 'admin', companyName: 'Nirka Business Solutions', companyCode: 'NBS-001' },
  { id: 'pm', role: 'project_manager', companyName: 'Nirka Business Solutions', companyCode: 'NBS-001' },
  { id: 'dev', role: 'developer', companyName: 'Nirka Business Solutions', companyCode: 'NBS-001' },
]

test('1/3. the dropdown source returns companies (name + code), not users', () => {
  const dir = buildCompanyDirectory(USERS)
  assert.deepEqual(dir.map((c) => c.companyName), ['Infinixo Technologies', 'Nirka Business Solutions'])
  assert.equal(dir.find((c) => c.companyName === 'Nirka Business Solutions')!.companyCode, 'NBS-001')
  // The server action only exposes company fields — never names/emails.
  const action = CRUD.slice(CRUD.indexOf('export const getProjectCompanies'), CRUD.indexOf('export const createProject'))
  assert.match(action, /key: c\.key,\s*companyName: c\.companyName,\s*companyCode: c\.companyCode,\s*clientCount: c\.clientUserIds\.length,/)
  assert.doesNotMatch(action, /email|\.name\b/)
})

test('2/11. users of the same company give ONE option (code first, whitespace/case-insensitive)', () => {
  const nirka = buildCompanyDirectory(USERS).filter((c) => c.companyName === 'Nirka Business Solutions')
  assert.equal(nirka.length, 1)
  assert.equal(normalizeCompanyName('  Nirka   Business Solutions '), 'Nirka Business Solutions')
})

test('genuinely different companies are never merged (same name, different codes stay separate)', () => {
  const dir = buildCompanyDirectory([
    { id: 'a', role: 'client', companyName: 'Acme', companyCode: 'ACME-UK' },
    { id: 'b', role: 'client', companyName: 'Acme', companyCode: 'ACME-US' },
    { id: 'c', role: 'client', companyName: 'Acme', companyCode: null },
  ])
  assert.equal(dir.length, 3, 'a name-only user is ambiguous between two coded Acmes, so it is not folded in')
})

test('4/6/7/8/9. resolving a company returns exactly its CLIENT users (no admin/manager/developer/other company)', () => {
  const key = buildCompanyDirectory(USERS).find((c) => c.companyName === 'Nirka Business Solutions')!.key
  const nirka = resolveCompany(USERS, key)!
  assert.deepEqual([...nirka.clientUserIds].sort(), ['c1', 'c2', 'c3'])
  for (const id of ['admin', 'pm', 'dev', 'x1', 'legacy']) assert.ok(!nirka.clientUserIds.includes(id), `${id} must not be linked`)
  assert.equal(nirka.representativeId, 'c2', 'the Approver owns the project')
})

test('clients without a company name are not listed as companies', () => {
  assert.ok(!buildCompanyDirectory(USERS).some((c) => c.clientUserIds.includes('legacy')))
})

test('5. createProject resolves the company server-side and links ALL its client users in one transaction', () => {
  const fn = CRUD.slice(CRUD.indexOf('export const createProject'))
  assert.match(fn, /companyKey: string/)
  assert.doesNotMatch(fn.slice(0, fn.indexOf('{', fn.indexOf('async function createProject'))), /clientId: string/, 'no client id accepted from the frontend')
  assert.match(fn, /const company = resolveCompany\(await loadCompanyDirectoryUsers\(\), data\.companyKey\)/)
  assert.match(CRUD, /\.from\(user\)\s*\n\s*\.where\(eq\(user\.role, 'client'\)\)/, 'only client users are candidates')
  assert.match(fn, /db\.transaction\(async \(tx\) => \{/)
  assert.match(fn, /await tx\.insert\(projectClient\)\.values\(\s*\n\s*company\.clientUserIds\.map/)
  assert.match(fn, /clientId,\s*\n\s*managerId: data\.managerId,/, 'owner = the company representative')
})

test('10. a missing/unknown company or a company with no client users is rejected before anything is written', () => {
  const fn = CRUD.slice(CRUD.indexOf('export const createProject'))
  const guard = fn.indexOf("throw new Error('This company has no client users assigned.')")
  assert.ok(guard !== -1 && guard < fn.indexOf('db.transaction('))
  assert.ok(fn.indexOf("throw new Error('Please select a company')") < fn.indexOf('db.transaction('))
  assert.equal(resolveCompany(USERS, 'code:does-not-exist'), null)
})

test('11/12. existing projects and their client links are untouched (create only inserts)', () => {
  const fn = CRUD.slice(CRUD.indexOf('export const createProject'), CRUD.indexOf('export const updateProject'))
  assert.doesNotMatch(fn, /\.update\(projectClient\)|\.delete\(projectClient\)|\.update\(project\)/)
})

test('New Project page uses companies and sends only the company key', () => {
  assert.match(PAGE, /getProjectCompanies\(\)/)
  assert.match(PAGE, /projectName,\s*\n\s*companyKey,\s*\n\s*managerId,/)
  assert.doesNotMatch(PAGE, /clientId/)
  assert.match(PAGE, /<Label htmlFor="company">Company<\/Label>/)
})
