# Explore This Page — Functional Audit Report

Audit date: 2026-08-11 · Scope: `8/` (Next.js app) · Status: **FIXED (static + code review verified)**

## 1. Root Causes Found

Every item below is backed by code inspection, not hypothesis.

| # | Root cause | Evidence | Impact |
|---|---|---|---|
| RC-1 | **The floating "Explore this page" button was commented out** in `tour-provider.tsx` — the feature was only reachable through the Help Hub menu | `tour-provider.tsx` JSX comment block `{/* Page tour trigger … */}` | Users on a page with a tour saw no visible entry point |
| RC-2 | **Excessive per-step waits on absent/optional elements** — default element wait was 10s; role-conditional or empty-state steps (no-wallet client, non-relevant ticket-detail sections) each burned the full wait before skipping | `advanceToCore` → `waitForStepElement` default `10_000`; support-wallet steps with explicit 15s/5s waits | "Highlights only 1–2 components", "waits then moves on", "skips steps unexpectedly" |
| RC-3 | **Support Wallet waits were wrong for its rendering model** — the page is server-rendered and `data-tour="wallet-card"` renders in BOTH the has-wallet and no-wallet branches (`support-wallet-client.tsx` lines 114 & 146), so the 15s/5s waits only ever delayed the "skip to Notifications" path | `config.ts` client-wallet `waitForElement: 15_000`; page-wallet-header `15_000`; page-wallet-summary `5_000` | Phase-10 symptom: "waits for some time, then automatically moves to Notifications" |
| RC-4 | **Module Detail page (`/dashboard/modules/[id]`) had no page tour and no route mapping** — `resolvePageTourKey` had no rule and `PAGE_TOURS` had no entry, so "Explore This Page" was unavailable on a page we ship | `resolvePageTourKey` (config.ts) + PAGE_TOURS key list | Missing coverage for a supported page |
| RC-5 | **No re-entrancy guard on tour start** — `isActive` flips only after the async driver bootstrap, so rapid double-clicks could start two tours; Help Hub's `isActive` check alone was racy | `startRoleTour`/`startPageTour`/`startFeatureTour` had no guard | Phase-16/17 risks: duplicate drivers, stale callbacks |
| RC-6 | **Start-probe capped explicit waits** — `runTour`'s first-step probe used `Math.min(waitForElement ?? 5_000, 5_000)`, capping even explicitly-configured waits (Analytics kpis = 8s) | `runTour` probe timeout | On slow server pages the probe could skip the first steps and start the tour at a later step |

Not found (audited, no defect): missing/duplicate `data-tour` selectors (0/210), cross-page steps inside page tours (all page tours are single-page), stale-driver leaks after navigation (`advanceToCore` re-checks `driverRef.current` and `mountedRef`), timer/listener leaks (`waitForTourElement`/`waitForRouteChange` clear their intervals on resolve).

## 2. Files Changed

| File | Change |
|---|---|
| `components/tour/tour-provider.tsx` | Restored the floating "Explore this page" button (hidden while a tour is active, welcome modal open, or bootstrap in progress). Added `startingRef`/`starting` re-entrancy guard to all three start functions. Default element wait 10s → **2.5s** (explicit `waitForElement` overrides honored everywhere, including the start probe — fixes RC-6). |
| `lib/tour/config.ts` | Added `'/dashboard/modules/[id]'` page tour (3 steps) + `resolvePageTourKey` rule for `/dashboard/modules/:id` (fixes RC-4). Reduced wallet waits: client-wallet 15s→4s, page-wallet-header 15s→4s, page-wallet-summary 5s→3s (fixes RC-3). |
| `scripts/tour-selector-audit.mjs` | Added per-page route-file attribution reporting (`? shared/other-page` flags, informational) and made the root `/dashboard` attribution non-recursive (Phase 22). |

## 3. Tour Architecture (final flow)

```
Explore This Page (floating button or Help Hub)
   ↓  startPageTour() — guarded: only one tour (startingRef + driverRef)
   ↓  resolvePageTourKey(pathname) — exact key or dynamic-route template
   ↓  runTour() — probe from the first drivable step:
        navigate if href ≠ current → waitForRouteChange → waitForNextPaint
        activate clickElement (tabs/accordions) → wait for element (explicit wait honored)
   ↓  createDriver() — destroys any previous driver first (no stale instances)
   ↓  driver.drive(startIndex)
   ↓  Next/Back → advanceTo() [re-entrancy guarded] → advanceToCore():
        route navigation → waitForRouteChange → waitForNextPaint
        clickElement activation → waitForTourElement (poll 100ms; explicit wait honored)
        needsTicketContext → open first ticket and re-wait
        missing element → log + skip ONLY that step (never freeze)
        stale driver check → abort safely if driver changed while waiting
   ↓  driver.moveTo(index) → popover (skip button + progress injected per render)
   ↓  Finish / × / Esc / Skip → onDestroyed resets all state, refs, progress
```

All timers/intervals clear on resolve; the keydown listener and driver are torn down on unmount.

## 4. Page Coverage (static audit: selectors exist, route files carry them)

32 page tours + 4 role tours. Every page tour: **✓ complete** (0 missing selectors). Shared-component selectors flagged `? shared/other-page` were verified to be legitimate shared components (`components/dashboard/*`: sidebar-*, ticket-*, estimate-section, etc.), not cross-page mistakes.

| Role | Page tour | Steps | Result |
|---|---|---|---|
| All | Dashboard | 10 | ✓ complete |
| All | Tickets | 11 | ✓ complete |
| Client+ | Create Ticket (`/tickets/new`) | 14 | ✓ complete |
| All | Ticket Details (`/tickets/[id]`) | 20 | ✓ complete |
| All | Projects / New / Detail / Edit | 5 / 7 / 7 / 6 | ✓ complete |
| Mgr/Admin | Modules / Create / Detail (`[id]`) / Edit | 5 / 5 / **3 (new)** / 5 | ✓ complete |
| Client | Support Wallet | 4 | ✓ complete |
| All | Notifications | 5 | ✓ complete |
| Admin | Analytics | 8 | ✓ complete |
| Mgr/Admin | Report Center / Customer Reviews | 6 / 5 | ✓ complete |
| Mgr | Assignments / Review Queue / Team | 6 / 4 / 5 | ✓ complete |
| All | Time Tracking / Worklogs | 6 / 4 | ✓ complete |
| Admin | Wallets / Wallet Detail | 6 / 5 | ✓ complete |
| Dev | Resources | 6 | ✓ complete |
| Admin | Customer Onboarding / Admin / Users / Teams | 3 / 4 / 4 / 5 | ✓ complete |
| All | Profile / Help / Reviews | 6 / 2 / 5 | ✓ complete |

Role tours: Client (13 steps), Manager (10), Resource (9), Admin (10) — audited: every `go()`/`el()` target exists; manager/admins never point at role-redirected pages; the only role-guarded page tour (support-wallet) is only startable by clients who can reach it.

## 5. Selector Audit (Phase 22 — `node scripts/tour-selector-audit.mjs`)

```
Total configured steps: 210      Existing selectors: 210
Missing selectors: 0             Duplicate selectors: 0
```
Dynamic/context-dependent targets (wallet summary/usage/transactions, ticket-detail role sections, resources charts) are handled by short explicit waits + skip-with-log; they are **not** reported as missing.

## 6. Cross-Page Testing

- Role tours are the only cross-page tours (`go()` steps). Sequence is strictly: navigate → `waitForRouteChange` → paint → element wait → highlight. No `router.push()` + `moveNext()` race exists (verified in `advanceToCore`).
- Ticket-context steps (`needsTicketContext`) land on the tickets list, open the first real ticket, and re-wait — verified in code (`findFirstTicketUrl`).
- **Runtime browser walk of every transition was not executed in this environment** (requires a running server + authenticated session). Recommend a smoke pass after deploy (see §8).

## 7. Error Testing (code-level)

- Uncaught errors: `advanceTo` wraps `advanceToCore` in try/catch and continues to the next step; `runTour` catches and resets `isActive`.
- No infinite waits: every wait has a timeout (explicit wait or 2.5s default; failed routes probe 2s).
- No stale drivers: `createDriver` destroys the previous instance; `advanceToCore` re-checks `driverRef.current`/`mountedRef` after its awaits; `onDestroyed` nulls all refs.
- No duplicate tours: `startingRef` + `driverRef.current` guard all entry points.
- No unexpected redirects on completion: the final `DONE_STEP` is element-less; closing destroys the driver without navigation.

## 8. Final Result

**Explore This Page is statically and architecturally sound across all 32 supported pages and 4 roles**: every selector exists and is unique, every page tour is complete, waits are bounded (2.5s default, explicit overrides honored), navigation is race-free, re-entrancy and stale-driver hazards are closed, and the primary entry button is restored.

**Verification status — honest label:** selector/config/build verification = PASS (audit script, `npx tsc --noEmit`, `npm run build` ✓ 31/31). **Live end-to-end browser walk of the tours was NOT executed** (no running authenticated server in this environment). Recommended post-deploy smoke: run one page tour per role (esp. Client → Support Wallet, Resource → Time Tracking) with `?tourDebug=true` on `localhost:3000` and confirm the debug log sequence `route-changed → waiting-for-element → element-found → highlight-started → step-completed`.
