// Timer state is ONE authoritative derivation (lib/timer-rules.ts) read by both
// the Time Tracking page and Ticket Detail: RUNNING / PAUSED / STOPPED.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deriveTimerSession, sessionElapsedSeconds, timerStateFor, type TimerSessionEntry } from '../lib/timer-rules.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const ACTIONS = read('app/actions/tickets/timelogs.ts')
const DETAIL = read('components/dashboard/ticket-status-actions.tsx')
const TT_CLIENT = read('app/dashboard/time-tracking/time-tracking-client.tsx')
const TT_PAGE = read('app/dashboard/time-tracking/page.tsx')

// ── In-memory model of what each server action writes (same rules as timelogs.ts)
const T0 = Date.parse('2026-09-30T04:41:00Z')
function store() {
  const rows: (TimerSessionEntry & { startTime: string })[] = []
  let id = 60, clock = T0
  const at = (s: number) => new Date(clock += s * 1000).toISOString()
  const newest = () => [...rows].sort((a, b) => b.startTime.localeCompare(a.startTime) || b.id - a.id)
  return {
    rows, newest,
    start(afterSec = 0) { if (rows.some((r) => !r.endTime)) throw new Error('You already have an active timer'); rows.push({ id: ++id, ticketId: 1998, startTime: at(afterSec), endTime: null, description: 'Started working' }) },
    pause(afterSec: number) { const r = rows.find((x) => !x.endTime)!; r.endTime = at(afterSec); r.description += ` [Paused at ${Math.round(afterSec / 60)}m]` },
    resume(afterSec: number) {
      const latest = newest()[0]
      if (!latest.endTime || !latest.description?.includes('[Paused at')) throw new Error('This timer is not paused.')
      if (rows.some((x) => !x.endTime)) throw new Error('You already have an active timer')
      rows.push({ id: ++id, ticketId: 1998, startTime: at(afterSec), endTime: null, description: 'Resumed work' })
    },
    stop(afterSec: number) {
      const running = rows.find((x) => !x.endTime)
      if (running) { running.endTime = at(afterSec); return }
      const latest = newest()[0]
      if (!latest.description?.includes('[Paused at')) throw new Error('Timer already stopped')
      latest.description = latest.description.replace(/\s*\[Paused at.*?\]/g, '')
    },
    session: () => deriveTimerSession(newest()),
    now: () => clock,
  }
}

test('1–4, 11: Start → RUNNING, Pause → PAUSED (never STOPPED), Resume → RUNNING, Stop → STOPPED', () => {
  const s = store()
  s.start(); assert.equal(s.session().state, 'running')
  s.pause(135); assert.equal(s.session().state, 'paused', 'pause is PAUSED, not STOPPED')
  s.resume(60); assert.equal(s.session().state, 'running')
  s.stop(30); assert.equal(s.session().state, 'stopped')
})

test('12: Resume does not reset the accumulated duration (02:15 → 02:15, 02:16 …)', () => {
  const s = store()
  s.start(); s.pause(135)
  const paused = s.session()
  assert.equal(sessionElapsedSeconds(paused, s.now()), 135, 'paused shows 00:02:15')
  s.resume(600) // resumed 10 minutes later
  const running = s.session()
  assert.equal(sessionElapsedSeconds(running, s.now()), 135, 'resumes from 00:02:15, not 00:00:00')
  assert.equal(sessionElapsedSeconds(running, s.now() + 2000), 137)
})

test('Stop from PAUSED ends the session (no longer resumable); Stop twice is refused', () => {
  const s = store()
  s.start(); s.pause(60); s.stop(0)
  assert.equal(s.session().state, 'stopped')
  assert.throws(() => s.resume(0), /This timer is not paused/)
  assert.throws(() => s.stop(0), /Timer already stopped/)
})

test('13: no duplicate running timers — resume while running is refused; a new start after stop is a new session', () => {
  const s = store()
  s.start(); s.pause(30); s.resume(5)
  assert.throws(() => s.resume(5), /not paused|active timer/)
  assert.equal(s.rows.filter((r) => !r.endTime).length, 1)
  s.stop(10); s.start(20)
  const session = s.session()
  assert.equal(session.state, 'running')
  assert.equal(sessionElapsedSeconds(session, s.now()), 0, 'a stopped session is not carried into the next one')
})

test('live regression: TKT-MUL7YXIW-AKA9 entries #59–#61 read as PAUSED 00:03:00 on entry #61', () => {
  const live: TimerSessionEntry[] = [
    { id: 61, ticketId: 1998, startTime: '2026-09-30T04:41:12.553Z', endTime: '2026-09-30T04:43:33.494Z', description: 'Started working [Paused at 2m]' },
    { id: 60, ticketId: 1998, startTime: '2026-09-30T04:40:13.734Z', endTime: '2026-09-30T04:40:41.721Z', description: 'Started working [Paused at 0m]' },
    { id: 59, ticketId: 1998, startTime: '2026-09-30T04:39:49.323Z', endTime: '2026-09-30T04:40:02.747Z', description: 'Started working [Paused at 0m]' },
  ]
  const s = deriveTimerSession(live)
  assert.deepEqual({ state: s.state, entryId: s.entryId, runningSince: s.runningSince }, { state: 'paused', entryId: 61, runningSince: null })
  assert.equal(sessionElapsedSeconds(s), 180)
  assert.equal(timerStateFor(live[0]), 'paused', 'the Timer dropdown agrees')
})

test('6–10: both pages read the same server state (refresh/navigation re-read it; nothing kept locally)', () => {
  // Server: one derivation behind both reads.
  assert.match(ACTIONS, /return deriveTimerSession\(entries\)/)
  assert.match(ACTIONS, /export const getTicketTimerState = [\s\S]*?return sessionForTicket\(currentUser\.id, ticketId\)/)
  assert.match(ACTIONS, /export const getMyTimerState = [\s\S]*?const session = await sessionForTicket\(currentUser\.id, latest\.ticketId\)/)
  // Ticket Detail: loads on mount + after every action; no local timer state.
  assert.match(DETAIL, /setSession\(await getTicketTimerState\(ticketId\)\)/)
  assert.match(DETAIL, /useEffect\(\(\) => \{ loadTimer\(\) \}, \[loadTimer\]\)/)
  assert.match(DETAIL, /\/\/ Re-read the authoritative timer state \(also after a failure\)\.\s*\n\s*await loadTimer\(\)/)
  assert.doesNotMatch(DETAIL, /setTimerState\(|getActiveTimer|setElapsedSeconds\(s => s \+ 1\)/)
  // Time Tracking: server-rendered state + re-read after every action.
  assert.match(TT_PAGE, /getMyTimerState\(\),/)
  assert.match(TT_CLIENT, /setTimer\(await getMyTimerState\(\)\)/)
  assert.doesNotMatch(TT_CLIENT, /setActiveTimer|localStorage/)
  // Display: accumulated + running segment — never Date.now() at mount as a start.
  for (const src of [DETAIL, TT_CLIENT]) assert.match(src, /sessionElapsedSeconds\(/)
})

test('7: Time Tracking shows PAUSED with Resume + Stop; RUNNING with Pause + Stop', () => {
  assert.match(TT_CLIENT, /\{isRunning \|\| isPaused \? \(/)
  assert.match(TT_CLIENT, /\{isPaused \? 'Paused' : 'Working on'\}/)
  assert.match(TT_CLIENT, /\{isRunning && \(\s*\n\s*<motion\.div[^>]*>\s*\n\s*<Button\s*\n\s*onClick=\{handlePause\}/)
  assert.match(TT_CLIENT, /\{isPaused && \(\s*\n\s*<motion\.div[^>]*>\s*\n\s*<Button\s*\n\s*onClick=\{handleResume\}/)
})

test('5 + 10: Ticket Detail — PAUSED shows Resume/Stop and "Stop & Complete" (not just Mark Completed)', () => {
  assert.match(DETAIL, /const timerState: TimerState = session\?\.state === 'running' \? 'running' : session\?\.state === 'paused' \? 'paused' : 'idle'/)
  assert.match(DETAIL, /\{timerState === 'paused' && activeTimerId && \(/)
  assert.match(DETAIL, /\{\(timerState === 'running' \|\| timerState === 'paused'\) && activeTimerId && \(/)
  assert.match(DETAIL, /\{timerState !== 'idle' \? 'Stop & Complete' : 'Mark Completed'\}/)
  // Stop & Complete: stop (running or paused) then the existing Manager Review transition.
  assert.match(DETAIL, /await stopTimer\(activeTimerId\)\s*\n\s*\}\s*\n\s*await updateTicketStatus\(ticketId, TicketStatus\.RESOLVED\)/)
})

test('server: Pause/Resume/Stop semantics and activity entries are kept', () => {
  assert.match(ACTIONS, /action: 'timer_paused'/)
  assert.match(ACTIONS, /action: 'timer_resumed'/)
  assert.match(ACTIONS, /action: 'timer_stopped'/)
  const stop = ACTIONS.slice(ACTIONS.indexOf('export const stopTimer'), ACTIONS.indexOf('export const pauseTimer'))
  assert.match(stop, /if \(!isPausedEntry\(log\) \|\| latest\?\.id !== log\.id\) throw new Error\('Timer already stopped'\)/)
  const resume = ACTIONS.slice(ACTIONS.indexOf('export const resumeTimer'))
  assert.match(resume, /if \(!isPausedEntry\(log\) \|\| latestEntry\?\.id !== log\.id\) throw new Error\('This timer is not paused\.'\)/)
})
