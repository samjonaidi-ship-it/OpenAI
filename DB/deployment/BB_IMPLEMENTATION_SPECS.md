# BB Implementation Specs | v1.0 | 2026-03-14 | BB

> **Purpose:** Captures specifications for implementation gaps identified during the 14-document cross-reference audit. These are areas the architecture documents reference but never fully specify.
>
> **Source:** BB_CROSS_DOC_AUDIT.md v1.5 findings B1-B4, B6-B8

---

## 1. BRIDGE PHASE 1 (DB-1) IMPLEMENTATION PLAN

> **Gap B1:** No dedicated Bridge implementation document with sequenced tasks, dependencies, and acceptance criteria.

### 1.1 Prerequisites (Sam)

| # | Action | Status |
|---|--------|--------|
| P1 | Create Neon project at neon.tech | TODO |
| P2 | Get pooled + direct connection strings | TODO |
| P3 | Create Clerk project at clerk.com | TODO |
| P4 | Get Clerk secret key + publishable key | TODO |
| P5 | Set Railway spending limit | TODO |

### 1.2 Bridge DB-1 Build Sequence

| # | Task | Depends On | Acceptance Criteria |
|---|------|-----------|-------------------|
| 1 | Install `drizzle-orm`, `@neondatabase/serverless`, `ws`, `drizzle-kit` | P1-P2 | `npm ls` shows packages |
| 2 | Create `src/db/index.js` with Neon connection | #1 | `db.execute(sql'SELECT 1')` returns |
| 3 | Create `src/db/schema/` with C1 tables (employees, work_jobcodes) | #2 | Drizzle schema compiles |
| 4 | Create `src/db/schema/` with 6 infra tables | #2 | Drizzle schema compiles |
| 5 | Run `drizzle-kit push` against Neon | #3, #4 | 8 tables visible in Neon console |
| 6 | Write seed script (employees from QBO, jobcodes from QBT) | #5 | Rows appear in Neon |
| 7 | Add `GET /api/master/employees` endpoint | #6 | Returns JSON array of employees |
| 8 | Add `GET /api/master/jobcodes` endpoint | #6 | Returns JSON array of jobcodes |
| 9 | Add `POST /api/master/employees/:id/enrichment` | #7 | Updates enrichment JSONB + bumps enrichment_version |
| 10 | Add `GET /health` endpoint | None | Returns 200 + uptime |
| 11 | Add `SIGTERM` graceful shutdown handler | None | Clean exit on Railway deploy |
| 12 | Add QBO sync cron (`node-cron`, 15-min) | #5, #7 | Employees + jobcodes refresh |
| 13 | Lock CORS (`CORS_ORIGINS` env var) | None | Non-whitelisted origins rejected |

### 1.3 Rollback Plan

If DB-1 fails at any step:
- Steps 1-4: Uninstall packages, delete schema files. Zero impact on existing Bridge.
- Step 5: Drop tables in Neon console. Neon branch can be deleted.
- Steps 6-12: Remove new route files. Existing Bridge routes unaffected.

**Key principle:** All new code is ADDITIVE. Existing Mini_API_Bridge routes (290+) continue working unchanged. New `/api/master/*` routes are added alongside existing `/qbo/*` and `/qbt/*` routes.

### 1.4 Environment Variables (New)

```
# Add to Mini_API_Bridge on Railway
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.region.neon.tech/dbname?sslmode=verify-full
DATABASE_URL_DIRECT=postgresql://user:password@ep-xxx.region.neon.tech/dbname?sslmode=verify-full
CORS_ORIGINS=https://calexp5.bainbridgebuilders.com,https://datamanager.bainbridgebuilders.com
```

---

## 2. CLERK INTEGRATION SPEC

> **Gap B2:** Clerk setup, SMS OTP flow, phone-to-employee matching, and role assignment not specified.

### 2.1 Clerk Project Setup

| Setting | Value |
|---------|-------|
| Auth method | SMS OTP (primary), Email OTP (fallback) |
| Phone format | E.164 (`+14085551234`) |
| Session duration | 7 days (Clerk default) |
| JWT template | Default (includes `sub`, `iat`, `exp`) |
| Multi-session | Disabled (single session per device) |

### 2.2 Phone-to-Employee Matching

When a user signs in via SMS OTP:

```
1. Clerk authenticates user, issues JWT with sub=clerk_user_id
2. Bridge receives JWT on first API call
3. Bridge checks: employees WHERE clerk_id = clerk_user_id
4. If no match:
   a. Parse phone from Clerk user profile (GET /users/{id} via Clerk API)
   b. Search: employees WHERE phone = normalized_phone
   c. If match found: UPDATE employees SET clerk_id = clerk_user_id
   d. If no match: Return 403 "Employee not found — contact admin"
5. Cache clerk_id → employee_id mapping in memory (invalidate on sync)
```

### 2.3 Role Assignment

| Role | Assigned By | Permissions |
|------|------------|-------------|
| `field_worker` | Default on first sign-in | Read own data, submit timesheets |
| `crew_lead` | Sam sets in Clerk dashboard (`user.public_metadata.role`) | Read crew data, approve timesheets |
| `admin` | Sam sets in Clerk dashboard | Full access, Data Manager |

Bridge checks role on every request:
```javascript
// Middleware pattern
const role = jwt.public_metadata?.role || 'field_worker';
if (route.requiresAdmin && role !== 'admin') return 403;
```

### 2.4 New Employee Onboarding

1. Sam creates employee in QBO (triggers next sync → appears in Neon)
2. Sam opens Clerk dashboard → creates user with employee's phone number
3. Employee opens CalExp5 → enters phone → receives SMS OTP → signs in
4. Bridge auto-matches phone → links clerk_id to employee record
5. Employee can now use CalExp5

### 2.5 JWT Verification on Bridge

```javascript
// Bridge auth middleware using jose
import { createRemoteJWKSSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSSet(
  new URL(`https://${CLERK_DOMAIN}/.well-known/jwks.json`)
);

async function verifyClerkJWT(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.auth = { userId: payload.sub, metadata: payload.public_metadata };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

### 2.6 Clerk + API Key Coexistence

During migration, Bridge supports BOTH auth methods:

```
1. Check for Authorization: Bearer <jwt> header → Clerk auth
2. If no JWT, check for X-API-Key header → existing API key auth
3. If neither → 401
```

API key auth is preserved for existing apps that haven't migrated to Clerk yet. Remove once all apps use Clerk.

---

## 3. QBO/QBT SYNC SPECIFICATION

> **Gap B3:** Sync entity order, CDC vs full-fetch, deleted records, error handling, crossref matching not specified.

### 3.1 Sync Schedule

| Setting | Value |
|---------|-------|
| Interval | Every 15 minutes |
| Business hours only | 6:00 AM - 8:00 PM Pacific (configurable via app_settings) |
| Implementation | `node-cron` in Bridge process |
| Manual trigger | `POST /api/sync/trigger` (admin only) |

### 3.2 Sync Entity Order

```
1. QBO Employees    (depends on: nothing)
2. QBT Users        (depends on: nothing)
3. Employee crossref (depends on: #1 + #2)
4. QBO Customers    (depends on: nothing)
5. QBO Vendors      (depends on: nothing)
6. QBT Jobcodes     (depends on: nothing)
7. Properties       (depends on: #4 — derived from sub-customers)
```

Steps 1-2 and 4-6 can run in parallel. Step 3 must wait for 1+2. Step 7 must wait for 4.

### 3.3 Sync Strategy Per Entity

| Entity | Strategy | Why |
|--------|----------|-----|
| Employees (QBO) | CDC via `SELECT * FROM Employee WHERE MetaData.LastUpdatedTime > :lastSync` | QBO supports CDC. Minimizes API calls. |
| Users (QBT) | `GET /api/v1/users?modified_since=:lastSync` | QBT supports modified_since filter. |
| Customers (QBO) | CDC via `SELECT * FROM Customer WHERE MetaData.LastUpdatedTime > :lastSync` | Same as employees. |
| Vendors (QBO) | CDC via `SELECT * FROM Vendor WHERE MetaData.LastUpdatedTime > :lastSync` | Same. |
| Jobcodes (QBT) | `GET /api/v1/jobcodes?modified_since=:lastSync` | QBT supports modified_since. |
| Initial/full sync | `SELECT * FROM [Entity]` (no WHERE clause) | First run only, or manual trigger. |

### 3.4 Sync Write Logic (Per Record)

```
FOR EACH incoming_record:
  existing = SELECT * FROM employees WHERE qbo_id = incoming_record.Id

  IF existing IS NULL:
    INSERT new record with typed columns from QBO/QBT
    Set enrichment = {}, enrichment_version = 1
    Log to sync_log (action: 'insert')

  ELSE IF existing.qbo_sync_token != incoming_record.SyncToken:
    UPDATE typed columns ONLY (display_name, email, phone, etc.)
    DO NOT TOUCH enrichment JSONB (BB owns that)
    DO NOT TOUCH enrichment_version (that's for enrichment changes only)
    Bump version column (optimistic lock)
    Update synced_at, qbo_sync_token, qbo_last_updated
    Log to sync_log (action: 'update', fields_changed: [...])

  ELSE:
    Skip (no changes). Log to sync_log (action: 'skip')
```

### 3.5 Deleted Records

QBO does NOT notify of deletions via CDC. Strategy:

```
ON FULL SYNC (manual trigger only, not on 15-min cycle):
  1. Fetch ALL records from QBO/QBT
  2. Compare against C1 records
  3. Records in C1 but NOT in QBO/QBT:
     → Set is_active = false (soft delete)
     → Log to audit_log (action: 'deactivated_by_sync')
     → DO NOT hard delete (enrichment data may be valuable)
```

### 3.6 Employee Crossref Matching (QBO ↔ QBT)

```
FOR EACH qbo_employee WITHOUT qbt_id:
  1. Exact match: QBT User WHERE display_name = qbo.DisplayName
  2. Email match: QBT User WHERE email = qbo.PrimaryEmailAddr
  3. Name parts match: QBT User WHERE first_name = qbo.GivenName AND last_name = qbo.FamilyName

  IF exactly 1 match:
    UPDATE employees SET qbt_id = matched_user.id
    Log to audit_log (action: 'crossref_auto_matched')

  IF multiple matches OR zero matches:
    Log to audit_log (action: 'crossref_needs_manual', details: { candidates: [...] })
    → Sam resolves in Data Manager ID Reconciliation panel
```

### 3.7 Error Handling

| Error | Action |
|-------|--------|
| QBO 401 (token expired) | Refresh OAuth token. Retry once. If still fails, log to sync_log, skip this cycle. |
| QBO 429 (rate limit) | Wait `Retry-After` seconds. Retry. |
| QBT 401 (token expired) | Refresh QBT token. Retry once. |
| Neon connection failure | Log error. Skip this cycle. Next cycle will pick up changes. |
| Partial sync (some entities failed) | Log partial success. Continue with remaining entities. |
| Single record parse error | Log error with record ID. Skip record. Continue with rest. |

### 3.8 Sync Logging

Every sync cycle writes to `sync_log`:

```
{
  source: 'qbo',
  entity_type: 'employee',
  status: 'success' | 'partial' | 'failed',
  records_checked: 20,
  records_updated: 2,
  records_inserted: 0,
  errors: null | { count: 1, details: [...] },
  duration_ms: 450,
  started_at: '2026-03-14T09:15:00Z'
}
```

---

## 4. ENRICHMENT MIGRATION PLAN (JSON Files to Neon)

> **Gap B4:** No specification for extracting enrichment data from existing JSON config files and loading into Neon.

### 4.1 Source Files Inventory

| Source File | App | Location | Enrichment Data | Target Fields |
|------------|-----|----------|----------------|---------------|
| `unified-settings.json` | TS_Exp5 | `C:\Users\samjo\Desktop\TS_Exp5\data\` | payRate, payType, workSchedule, lunch settings, mileage, overtime | employees.enrichment (18 fields) |
| `Vendor_settings.json` | Mini_API_Bridge | `C:\...\Mini_API_Bridge\Credentials\` | 119 vendor name aliases, auto-trade rules | vendors.enrichment.aliases.gs_receipts |
| `Employee_settings.json` | Mini_API_Bridge | `C:\...\Mini_API_Bridge\Credentials\` | Employee ID mapping (QBO↔QBT), cardLast4 | employees.qbt_id, employees.enrichment.cardLast4 |
| `Jobcode_settings.json` | Mini_API_Bridge | `C:\...\Mini_API_Bridge\Credentials\` | Excluded jobcodes, short names | work_jobcodes.enrichment.excludeFromProcessing |
| `subs.json` | DocEngine | `C:\Users\samjo\Desktop\BB-DocEngine\db\` | Vendor trades, sub-contractor flags | vendors.enrichment.trade, vendors.enrichment.isSub |
| `content-v27.js` | Chase_Validate | `C:\Users\samjo\Desktop\Chase_Exp\` | Cardholder → cardLast4 mapping | employees.enrichment.cardLast4 |
| `settings.json` | CalExp5 | `C:\Users\samjo\Desktop\CalExp5\data\` | Active employee IDs, display defaults | app_settings (calexp5) |

### 4.2 Migration Order

```
Phase 1 (DB-1): Seed typed columns from QBO/QBT sync
  → employees, work_jobcodes get core QBO/QBT data

Phase 2 (DB-2): Migrate enrichment
  Step 1: Employee_settings.json → employees.qbt_id crossref
  Step 2: Employee_settings.json → employees.enrichment.cardLast4
  Step 3: unified-settings.json → employees.enrichment (18 TS fields)
  Step 4: Vendor_settings.json → vendors.enrichment.aliases.gs_receipts
  Step 5: subs.json → vendors.enrichment.trade + isSub
  Step 6: Jobcode_settings.json → work_jobcodes.enrichment
  Step 7: content-v27.js → verify cardLast4 matches Step 2
  Step 8: settings.json → app_settings (calexp5)
```

### 4.3 Conflict Resolution (When Two Sources Disagree)

| Conflict | Winner | Rationale |
|----------|--------|-----------|
| Employee cardLast4: Employee_settings.json vs content-v27.js | Employee_settings.json | Bridge config is more recently maintained |
| Vendor trade: subs.json vs Vendor_settings.json auto-trade | subs.json | DocEngine has Sam's manual assignments |
| Employee pay data: unified-settings.json vs QBO Employee fields | unified-settings.json (→ enrichment) | QBO Employee doesn't have BB-specific pay fields |

### 4.4 Migration Script Pattern

```javascript
// scripts/migrate-enrichment.js
// Run ONCE during DB-2 setup. Idempotent (safe to re-run).

async function migrateEmployeeEnrichment() {
  const tsSettings = JSON.parse(fs.readFileSync('path/to/unified-settings.json'));

  for (const [employeeName, settings] of Object.entries(tsSettings)) {
    // Match by name to find employee in Neon
    const employee = await db.select().from(employees)
      .where(ilike(employees.displayName, `%${employeeName}%`))
      .limit(1);

    if (!employee.length) {
      console.warn(`No match for: ${employeeName}`);
      continue;
    }

    // Merge enrichment (don't overwrite existing fields)
    const existingEnrichment = employee[0].enrichment || {};
    const newEnrichment = {
      ...existingEnrichment,
      payRate: settings.compensation?.payRate,
      payType: settings.compensation?.payType,
      // ... map all 18 fields
    };

    await db.update(employees)
      .set({ enrichment: newEnrichment, enrichmentVersion: sql`enrichment_version + 1` })
      .where(eq(employees.id, employee[0].id));

    // Log to enrichment_history
    for (const [field, value] of Object.entries(newEnrichment)) {
      if (existingEnrichment[field] !== value) {
        await db.insert(enrichmentHistory).values({
          id: `EH-migration-${employee[0].id}-${field}`,
          entityType: 'employee',
          entityId: employee[0].id,
          fieldName: field,
          oldValue: existingEnrichment[field] ?? null,
          newValue: value,
          enrichmentVersion: employee[0].enrichmentVersion + 1,
          changedBy: 'migration',
        });
      }
    }
  }
}
```

### 4.5 Validation

After migration, run verification:
```sql
-- Check all employees have enrichment
SELECT id, display_name, enrichment_version,
       jsonb_object_keys(enrichment) as field_count
FROM employees
WHERE enrichment = '{}';

-- Check vendor aliases migrated
SELECT id, display_name, enrichment->'aliases'->'gs_receipts' as aliases
FROM vendors
WHERE enrichment->'aliases'->'gs_receipts' IS NOT NULL;
```

### 4.6 Rollback

If migration produces bad data:
```sql
-- Reset enrichment to empty (nuclear option)
UPDATE employees SET enrichment = '{}', enrichment_version = 1;
DELETE FROM enrichment_history WHERE changed_by = 'migration';

-- Then re-run migration script after fixing the bug
```

---

## 5. MONITORING & ALERTING STRATEGY

> **Gap B6:** No specification for how Sam knows if sync is broken, Bridge is down, or data quality degrades.

### 5.1 Health Monitoring

| Component | Check | Method | Alert |
|-----------|-------|--------|-------|
| Bridge | Alive + Neon connected | `GET /health` returns `{ status: 'ok', db: 'connected', uptime: 12345 }` | Railway auto-restarts on crash |
| Neon | Reachable | Bridge health check includes `SELECT 1` | Bridge returns `db: 'disconnected'` |
| QBO sync | Last sync < 30 min ago | Bridge tracks `lastSyncAt` in memory | Data Manager shows yellow/red indicator |
| QBT sync | Last sync < 30 min ago | Same | Same |

### 5.2 Data Manager Sync Status (Primary Alert Surface)

Sam opens Data Manager daily. The Sync Status screen (Section 6 of BB_DATA_MANAGER_SPEC.md v1.1) shows:
- Last sync time per entity with color coding (green <6h, yellow 6-24h, red >24h)
- Error count from last sync
- Manual "Sync Now" button

### 5.3 Bridge Startup Banner

Bridge logs on startup:
```
╔══════════════════════════════════════╗
║  BB Micro-Bridge                    ║
║  Port: 3100                         ║
║  Neon: connected (8 tables)         ║
║  Sync: enabled (15-min cycle)       ║
║  Auth: Clerk + API keys             ║
╚══════════════════════════════════════╝
```

### 5.4 Future: Email Alerts (Post-Launch)

After the system is running and proven stable, add optional email alerts for:
- Sync failure 3 consecutive cycles
- Bridge restart
- Neon connection lost > 5 minutes

Implementation: Simple `nodemailer` call to Sam's email. No monitoring service needed at BB's scale.

---

## 6. PROPERTIES TABLE — SOURCE SYSTEM SPEC

> **Gap B7:** How properties are derived from QBO sub-customers, geocoded, and enriched.

### 6.1 Property Creation Logic (During Sync)

```
FOR EACH qbo_customer:
  IF customer has ParentRef (is a sub-customer):
    parent = lookup parent customer by ParentRef.value

    IF parent.Level = 0 AND customer.Level = 1:
      // This sub-customer represents a property
      property_address = customer.ShipAddr || customer.BillAddr

      UPSERT INTO properties:
        id: generate from customer name
        qbo_customer_id: customer.Id
        customer_id: FK to parent customer in C1
        address_line1: property_address.Line1
        city: property_address.City
        state: property_address.CountrySubDivisionCode
        zip: property_address.PostalCode
        display_name: customer.DisplayName (e.g., "Smith - Main St")
```

### 6.2 Geocoding

| Setting | Value |
|---------|-------|
| API | Google Maps Geocoding API (or free alternative: Nominatim/OSM) |
| Trigger | On property creation or address change |
| Rate limit | 1 request/second (Nominatim TOS) |
| Fields populated | latitude, longitude, formatted_address |

```
AFTER property INSERT/UPDATE with new address:
  geocode_result = await geocodeAddress(address_line1, city, state, zip)

  UPDATE properties SET
    latitude = geocode_result.lat,
    longitude = geocode_result.lng,
    geocode_status = 'success' | 'failed' | 'approximate'
```

### 6.3 Real Estate Data (Enrichment)

Populated via Data Manager (manual) or future API integration:
- `beds`, `baths`, `sqft` — from Zillow/Redfin (manual entry for now)
- `zillowUrl`, `redfinUrl` — manually pasted URLs
- `salesHistory` — JSONB array of past sales
- `photos` — JSONB array of photo URLs (Google Drive links)
- `tags` — user-defined tags (e.g., "remodel", "new construction")
- `streetView` — Google Street View URL (auto-generated from lat/lng)
- `notes` — free text

---

## 7. BACKUP & DISASTER RECOVERY

> **Gap B8:** No backup schedule, recovery procedure, or RTO/RPO targets.

### 7.1 Backup Strategy

| Layer | Method | Frequency | Retention |
|-------|--------|-----------|-----------|
| Neon PITR | Built-in (Neon managed) | Continuous | 6 hours (Free), 7 days (Launch $19/mo) |
| pg_dump | Cron job on Bridge | Nightly at 2:00 AM Pacific | 30 days |
| pg_dump storage | Google Drive (via Bridge script) | With each dump | 30 days |

### 7.2 pg_dump Script

```bash
#!/bin/bash
# Run nightly via node-cron in Bridge or external cron
TIMESTAMP=$(date +%Y-%m-%d)
DUMP_FILE="bb_backup_${TIMESTAMP}.sql.gz"

pg_dump "$DATABASE_URL_DIRECT" | gzip > "/tmp/${DUMP_FILE}"

# Upload to Google Drive (using existing GDrive integration)
# OR save to a persistent volume
```

### 7.3 Recovery Procedures

**Scenario 1: Neon database corruption (within PITR window)**
```
1. Open Neon console → Branches → main
2. Click "Restore" → select point in time (before corruption)
3. Neon restores to a new branch
4. Verify data on restored branch
5. Swap connection strings to restored branch
6. Update DATABASE_URL on Railway
```

**Scenario 2: Neon corruption (beyond PITR window)**
```
1. Find latest pg_dump from Google Drive
2. Create new Neon branch
3. psql $NEW_BRANCH_URL < bb_backup_YYYY-MM-DD.sql
4. Verify data
5. Swap connection strings
6. Re-run sync to fill gap between backup and now
```

**Scenario 3: Bridge crash/corruption**
```
1. Railway auto-restarts Bridge (typical recovery: <10 seconds)
2. Bridge reconnects to Neon on startup
3. All data is in Neon — Bridge is stateless
4. If code corruption: Railway redeploys from last known good commit
```

### 7.4 RTO/RPO Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| **RPO** (max data loss) | 15 minutes | Sync cycle interval. Worst case: lose 1 sync cycle of QBO/QBT changes. Enrichment changes are immediate (in Neon). |
| **RTO** (max downtime) | 30 minutes | Railway auto-restart + manual Neon restore if needed. |
| **Neon PITR RPO** | Continuous (Free: 6h window, Launch: 7d window) | Neon captures every transaction. |

### 7.5 Responsibilities

| Action | Owner |
|--------|-------|
| Monitor sync status in Data Manager | Sam (daily) |
| Trigger manual sync if needed | Sam |
| Neon PITR restore | Claude (guided by Sam) |
| pg_dump restore | Claude |
| Railway redeploy | Automatic / Claude |
| Upgrade to Neon Launch plan | Sam (decision) / Claude (implementation) |

---

## 8. DOCUMENT HIERARCHY (Updated)

For reference, the authoritative document for each domain:

```
BB_DB_STRATEGY.md v1.4           → WHY (Neon, Drizzle, compartments, architecture decisions)
BB_PLATFORM_SCHEMA-v2.md v2.23  → WHAT (every table, column, index, seed data, phase rollout)
BB_MDM_BEST_PRACTICES.md v1.1   → HOW (enrichment versioning, audit, quality, Bridge sync delegation)
BB_ARCHITECTURE_ANALYSIS.md v1.1 → FITS? (sizing, costs, risk, technology evaluation)
BB_DATA_MANAGER_SPEC.md v1.1    → UI (screens, interactions, navigation)
BB_CALEXP5_SCHEMA.md v1.2       → CalExp5 (working data tables, API endpoints, migration map)
BB_FIELD_STATS.md v1.1           → FIELDS (utilization counts, quick-win opportunities)
BB_BRIDGE_SUPERSET_AUDIT.md v1.1 → AUDIT (Bridge vs superset discrepancies, data duplication risks)
BB_CROSS_DOC_AUDIT.md v1.5      → INTEGRITY (cross-document contradictions, fixes applied)
BB_IMPLEMENTATION_SPECS.md v1.0  → BUILD (Bridge plan, Clerk, sync, migration, monitoring, DR)
BB_PLATFORM_READINESS_REPORT.md v1.3 → READINESS (gaps, action items, phase dependencies)
```

When documents conflict: Schema v2.23 wins for table definitions. MDM doc wins for enrichment patterns. DB_STRATEGY wins for architecture rationale. This document wins for implementation procedures.

---

*Cross-references: BB_CROSS_DOC_AUDIT.md v1.5, BB_DB_STRATEGY.md v1.4, BB_PLATFORM_SCHEMA-v2.md v2.23, BB_PLATFORM_READINESS_REPORT.md v1.3*
