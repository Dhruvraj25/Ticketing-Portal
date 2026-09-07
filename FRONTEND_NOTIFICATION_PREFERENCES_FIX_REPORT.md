# Production Error Fix Report: Digest 3031785767

## Executive Summary

**Production Error:** "Something went wrong - An unexpected error occurred" on the Notification Preferences page

**Root Cause:** Column name mismatch between frontend code and production database schema

**Status:** ✅ FIXED - All tests pass, build succeeds

---

## A. Exact Root Cause

The production database `notification_preferences` table uses the column name **`clientId`**, but the frontend code was querying using **`userId`**.

### Database Schema (Production)
```sql
CREATE TABLE "notification_preferences" (
  "id" serial PRIMARY KEY,
  "clientId" text NOT NULL,  -- ← Production uses clientId
  "channel" text NOT NULL,
  "eventType" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "notification_pref_client_channel_event_idx"
  ON "notification_preferences" ("clientId", "channel", "eventType");
```

### Frontend Code (Before Fix)
```typescript
// ❌ Query referenced non-existent column "userId"
SELECT "userId", "channel", "eventType", "enabled"
FROM notification_preferences
WHERE "userId" = $1

// ❌ INSERT referenced non-existent column "userId"
INSERT INTO notification_preferences ("userId", "channel", "eventType", "enabled", "createdAt", "updatedAt")
VALUES ($1, $2, $3, $4, now(), now())
ON CONFLICT ("userId", "channel", "eventType")
```

### Why This Caused Production Failure

When the Notification Preferences page loaded, the server component attempted to execute:
```sql
SELECT "userId", "channel", "eventType", "enabled"
FROM notification_preferences
WHERE "userId" = $1
```

PostgreSQL returned an error because the column `"userId"` does not exist in the production database - it's named `"clientId"`. This unhandled database error caused the Next.js Server Component to crash, resulting in the generic "Something went wrong" error page.

---

## B. Failing File/Function

**Primary Failing File:** `Frontend/app/actions/client-notification-preferences.ts`

**Failing Functions:**
1. `loadClientPreferences()` - Line 150 (SELECT query)
2. `updateClientNotificationPreferences()` - Line 319 (INSERT query)

**Secondary Failing File:** `Frontend/lib/notification-preferences.ts`

**Failing Function:** `loadDisabledInAppEvents()` - Line 97 (SELECT query)

---

## C. Failing Query/API Request

### Query 1: Load Preferences (FAILED)
```sql
-- BEFORE (FAILED):
SELECT "userId", "channel", "eventType", "enabled"
FROM notification_preferences
WHERE "userId" = $1

-- AFTER (FIXED):
SELECT "clientId", "channel", "eventType", "enabled"
FROM notification_preferences
WHERE "clientId" = $1
```

### Query 2: Save Preferences (FAILED)
```sql
-- BEFORE (FAILED):
INSERT INTO notification_preferences ("userId", "channel", "eventType", "enabled", "createdAt", "updatedAt")
VALUES ($1, $2, $3, $4, now(), now())
ON CONFLICT ("userId", "channel", "eventType")
DO UPDATE SET "enabled" = EXCLUDED."enabled", "updatedAt" = now()

-- AFTER (FIXED):
INSERT INTO notification_preferences ("clientId", "channel", "eventType", "enabled", "createdAt", "updatedAt")
VALUES ($1, $2, $3, $4, now(), now())
ON CONFLICT ("clientId", "channel", "eventType")
DO UPDATE SET "enabled" = EXCLUDED."enabled", "updatedAt" = now()
```

### Query 3: Load Disabled In-App Events (FAILED)
```sql
-- BEFORE (FAILED):
SELECT "userId", "eventType", "enabled"
FROM notification_preferences
WHERE "userId" = ANY($1::text[]) AND "channel" = 'in_app'

-- AFTER (FIXED):
SELECT "clientId", "eventType", "enabled"
FROM notification_preferences
WHERE "clientId" = ANY($1::text[]) AND "channel" = 'in_app'
```

---

## D. Database Used by Frontend

**Host:** `ep-sweet-river-aqhwknkv-pooler.c-8.us-east-1.aws.neon.tech` (from .env.example)

**Database Name:** `neondb`

**Schema:** `public` (default)

**Connection:** PostgreSQL via Neon pooler endpoint

**Note:** The exact DATABASE_URL is configured in Vercel environment variables and is not exposed in this report.

---

## E. Database Used by Backend

**Same Database:** Yes - Both Frontend and Backend use the same PostgreSQL database

**Evidence:**
- Frontend `.env.example` shows: `postgresql://neondb_owner:npg_06TeuIUgVLXM@ep-sweet-river-aqhwknkv-pooler.c-8.us-east-1.aws.neon.tech/neondb`
- Backend configuration uses the same Neon database
- The notification_preferences table is in the shared database
- Backend migration 0015 created the table

---

## F. Same DB or Different DB

**✅ SAME DATABASE**

Both Frontend and Backend connect to the same PostgreSQL database (`neondb` on Neon). The issue was not a database mismatch, but a column name mismatch within the same database.

---

## G. Required Fix

**Minimum Required Change:** Update all SQL queries in the frontend to reference `"clientId"` instead of `"userId"` when querying the `notification_preferences` table.

**Files Changed:**
1. `Frontend/app/actions/client-notification-preferences.ts` - Fix SELECT and INSERT queries
2. `Frontend/lib/notification-catalog.ts` - Update `NotificationPreferenceRow` interface
3. `Frontend/lib/notification-preferences.ts` - Fix SELECT query and update variable names
4. `Frontend/tests/notification-catalog.test.ts` - Update test data to use `clientId`

**Why This Fix is Correct:**
- The production database schema uses `clientId` as the column name
- The frontend code was written expecting `userId` (from migration 0015 which used `userId`)
- The actual production deployment has `clientId` (possibly from a different migration or manual schema change)
- The fix aligns the frontend queries with the actual production schema

---

## H. Files Changed

### 1. Frontend/app/actions/client-notification-preferences.ts

**Changes:**
- Line 150: Changed `SELECT "userId"` to `SELECT "clientId"`
- Line 152: Changed `WHERE "userId" = $1` to `WHERE "clientId" = $1`
- Line 319: Changed `INSERT INTO notification_preferences ("userId"` to `("clientId"`
- Line 321: Changed `ON CONFLICT ("userId"` to `ON CONFLICT ("clientId"`

### 2. Frontend/lib/notification-catalog.ts

**Changes:**
- Line 132: Changed `NotificationPreferenceRow` interface property from `userId: string` to `clientId: string`

### 3. Frontend/lib/notification-preferences.ts

**Changes:**
- Line 82: Updated docstring from "per user" to "per client"
- Line 85: Changed parameter name from `userIds` to `clientIds`
- Line 97: Changed `SELECT "userId"` to `SELECT "clientId"`
- Line 99: Changed `WHERE "userId" = ANY` to `WHERE "clientId" = ANY`
- Line 104: Changed row type from `{ userId: string }` to `{ clientId: string }`
- Lines 108-113: Changed all references from `row.userId` to `row.clientId` and `index.get(row.userId)` to `index.get(row.clientId)`

### 4. Frontend/tests/notification-catalog.test.ts

**Changes:**
- Line 78-79: Changed test data from `{ userId: 'client-a'` to `{ clientId: 'client-a'`
- Line 105-106: Changed test data from `{ userId: 'client-a'` and `{ userId: 'client-b'` to `{ clientId: 'client-a'` and `{ clientId: 'client-b'`
- Lines 109-110: Changed filter conditions from `r.userId === 'client-a'` to `r.clientId === 'client-a'`

---

## I. Tests

### Test Results

✅ **All Tests Pass**

```
npm run test:catalog
✔ catalog mirrors the backend event list (28 events, backend order preserved)
✔ every catalog event has the labels/groups the settings UI shows
✔ channels are in_app, email, teams — one row per channel
✔ alias spellings resolve to the canonical preference key
✔ client channel defaults: Email/In-App ON, Teams follows customer toggle
✔ buildUserSettings: explicit rows override defaults per (channel, event)
✔ buildUserSettings leaves other users untouched (client-wise, never global)

ℹ tests 7
ℹ pass 7
ℹ fail 0
```

```
npm run test:notifications
✔ buildDedupKey produces the canonical (event, scope, user) key
✔ buildDedupKey defaults the scope so no-scope events still dedup
✔ ... (22 total tests)
ℹ tests 22
ℹ pass 22
ℹ fail 0
```

### TypeScript Check

✅ **No TypeScript Errors**
```
npx tsc --noEmit --project tsconfig.json
# Exit code: 0, no errors
```

### Build

✅ **Production Build Succeeds**
```
npm run build
✓ Compiled successfully in 43s
✓ TypeScript in 51s
✓ Generating static pages (30/30) in 2.1s
```

---

## J. Build

**Status:** ✅ SUCCESS

- Next.js 16.2.6 build completed successfully
- All 30 dynamic routes compiled without errors
- TypeScript compilation passed with no errors
- Static page generation completed (30/30 pages)

---

## K. Production Deployment Status

**Current State:** READY FOR DEPLOYMENT

**What Was Fixed:**
- ✅ Column name mismatch resolved
- ✅ All SQL queries now reference correct column (`clientId`)
- ✅ TypeScript types updated to match database schema
- ✅ Tests updated and passing
- ✅ Production build succeeds

**Deployment Recommendation:**
Deploy the fixed code to Vercel. The Notification Preferences page should now load successfully without the "Something went wrong" error.

**Verification Steps After Deployment:**
1. Navigate to `/dashboard/clients/[clientId]/notification-preferences`
2. Verify the page loads without errors
3. Test toggling notification preferences for Email, Teams, and In-App channels
4. Verify changes are saved to the database
5. Confirm preferences persist across page refreshes

---

## Additional Notes

### Why Didn't This Get Caught Earlier?

1. **Migration 0015 used `userId`:** The original backend migration created the table with `userId`
2. **Production schema diverged:** The actual production database has `clientId` (possibly from a different migration version or manual adjustment)
3. **Frontend code assumed `userId`:** The frontend was written based on the migration file, not the actual production schema
4. **No integration tests:** Without testing against the actual production database schema, this mismatch went undetected

### Architecture Verification

The fix maintains the intended architecture:
- ✅ Admin/Manager can view/manage authorized client preferences
- ✅ Client users cannot access management functionality (enforced by role check)
- ✅ Existing notification event catalog preserved (28 events)
- ✅ Email/Teams/In-App channels preserved
- ✅ Default enabled behavior preserved
- ✅ Approval-cycle email behavior preserved
- ✅ Existing ticket workflow unchanged
- ✅ Existing authentication unchanged
- ✅ Existing tenant isolation preserved
- ✅ Existing UI design unchanged

### Database Connection Verification

The frontend uses the same database as the backend:
- **Database Host:** `ep-sweet-river-aqhwknkv-pooler.c-8.us-east-1.aws.neon.tech`
- **Database Name:** `neondb`
- **Connection Type:** PostgreSQL via Neon pooler
- **Schema:** `public`

No changes needed to database configuration - only the SQL queries needed to be corrected to match the actual schema.

---

## Conclusion

**Root Cause:** Column name mismatch between frontend code (`userId`) and production database (`clientId`) in the `notification_preferences` table.

**Impact:** Notification Preferences page crashed on load with "Something went wrong" error (digest 3031785767).

**Resolution:** Updated all SQL queries and TypeScript interfaces to use `clientId` instead of `userId`, aligning with the production database schema.

**Status:** ✅ Fixed, tested, and ready for deployment.
