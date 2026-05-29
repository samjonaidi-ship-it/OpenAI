# Bridge Contract Governance

**Date:** 2026-04-04  
**Purpose:** Establish and enforce clear contracts between BB Micro Bridge and all consumer applications  
**Status:** Active  

---

## Executive Summary

The Bridge is currently the canonical stateful backend for CalExp5 and other consumer applications. However, consumer codebases still carry "local provider endpoint semantics" instead of treating the Bridge as their primary API contract.

This document establishes:

1. **Bridge as the canonical contract** for all consumer apps
2. **Explicit route families** and their versioning
3. **Consumer-to-Bridge mapping rules**
4. **Legacy cleanup requirements** before production escalation
5. **Contract versioning and breaking change policy**

---

## Core Rule

**CalExp5, TS_Exp5, and all other consumers must treat the Bridge as their primary target—not Intuit/Google/external systems directly.**

This means:

- ❌ DO NOT hardcode Intuit OAuth endpoints, QBO query syntax, or QBT payload shapes in consumer code
- ❌ DO NOT maintain "provider endpoint semantics" alongside Bridge routes
- ✅ DO treat Bridge routes as the canonical contract
- ✅ DO remap provider-specific logic into Bridge controllers/services only
- ✅ DO version Bridge routes explicitly
- ✅ DO document provider-to-Bridge mappings in Bridge code, not consumer code

---

## Bridge Route Families

### 1. QBO Routes (`/api/qbo/*`)

**Current contract:** QBO accounting data, enriched views, reconciliation

**Canonical endpoints (Track A minimum):**

| Route | Method | Purpose | Versioned? | Status |
|-------|--------|---------|-----------|--------|
| `/api/qbo/invoices-enriched` | GET | Accounting invoices with custom fields | qbo/invoices-enriched/v1 | Active |
| `/api/qbo/invoice/{id}/pdf` | GET | Invoice PDF render | qbo/invoice-pdf/v1 | Active |
| `/api/qbo/attachment-fetch` | POST | Attachment retrieval by entity+type | qbo/attachment/v1 | Active |
| `/api/qbo/validate-labor-exact` | POST | Labor transaction validation | qbo/validate-labor/v1 | Active |
| `/api/qbo/recon-enhanced` | POST | Reconciliation with enrichment | qbo/recon/v1 | Active |
| `/api/qbo/batch` | POST | Multi-query batch endpoint | qbo/batch/v1 | Active |

**Consumer responsibilities:**

- All consumers call Bridge `/api/qbo/*` routes, not `quickbooks.intuit.com` directly
- CalExp5 should route app requests through its proxy, not bypass
- TS_Exp5 should not contain local QBO query builders; those live in Bridge

**Bridge responsibilities:**

- Handle QBO OAuth refresh and token management
- Normalize QBO response shapes
- Implement caching and rate-limit management
- Version all QBO routes with explicit `/v1`, `/v2` naming

### 2. QBT Routes (`/api/qbt/*`)

**Current contract:** Legacy QuickBooks Time timesheets, jobcodes, employees

**Canonical endpoints:**

| Route | Method | Purpose | Versioned? | Status |
|-------|--------|---------|-----------|--------|
| `/api/qbt/users` | GET | Employee roster | qbt/users/v1 | Active (Legacy) |
| `/api/qbt/jobcodes` | GET | Job/task codes | qbt/jobcodes/v1 | Active (Legacy) |
| `/api/qbt/timesheets` | GET \| POST | Timesheet operations | qbt/timesheets/v1 | Active (Legacy) |
| `/api/qbt/geolocations` | GET \| POST | GPS location tracking | qbt/geo/v1 | Active (Legacy) |
| `/api/qbt/locations` | GET | Location reference data | qbt/locations/v1 | Active (Legacy) |

**⚠️ IMPORTANT: All QBT routes are explicitly Legacy-bound.**

See `QBT_QBO_PLATFORM_ROADMAP.md` for migration path to newer Payroll and Time APIs.

**Consumer responsibilities:**

- Do not call `rest.tsheets.com` directly from consumer apps
- Use Bridge `/api/qbt/*` routes only
- Prepare migration plan toward Payroll and Time APIs per the roadmap

**Bridge responsibilities:**

- Maintain legacy QBT OAuth and API shape
- Mark all QBT routes with explicit `[LEGACY]` comments
- Provide clear deprecation path per roadmap timeline

### 3. Communications Routes (`/api/communications/*`)

**Current contract:** Inbound/outbound message routing, extraction, action item tracking

**Canonical endpoints:**

| Route | Method | Purpose | Versioned? | Status |
|-------|--------|---------|-----------|--------|
| `/api/communications/ingest` | POST | Inbound message capture | comms/ingest/v1 | Planned (Track B) |
| `/api/communications/extract` | POST | Structured extraction from message | comms/extract/v1 | Planned (Track B) |
| `/api/communications/thread` | GET | Grouped conversation view | comms/thread/v1 | Planned (Track B) |
| `/api/communications/notify` | POST | Outbound notification dispatch | comms/notify/v1 | Planned (Track B) |

**Consumer responsibilities:**

- For now, CalExp5 does not depend on communications routes (deferred to Track B)
- When implemented, all inbound/outbound flows route through Bridge

### 4. Data/Persistence Routes (`/api/data/*`)

**Current contract:** Neon-backed entity graph, events, relationships, lifecycle

**Canonical endpoints (Track A minimum):**

| Route | Method | Purpose | Versioned? | Status |
|-------|--------|---------|-----------|--------|
| `/api/data/entities` | GET \| POST | Entity CRUD | data/entities/v1 | Active |
| `/api/data/entities/{id}` | GET \| PATCH | Entity detail + update | data/entities/v1 | Active |
| `/api/data/relationships` | GET \| POST | Relationship CRUD | data/relationships/v1 | Active |
| `/api/data/events` | GET \| POST | Event ledger append | data/events/v1 | Active |
| `/api/data/workflows` | GET \| POST | Workflow requests | data/workflows/v1 | Planned (Track A3) |
| `/api/data/projections` | GET | Read-optimized 360 views | data/projections/v1 | Planned (Track A2) |

**Consumer responsibilities:**

- CalExp5 does not call Neon directly; all data access routes through Bridge
- Bridge owns all Drizzle schema and migrations
- Consumers treat Bridge `/api/data/*` as the canonical contract

### 5. Auth Routes (`/api/auth/*`)

**Current contract:** Principal authentication, token lifecycle, permission scoping

**Canonical endpoints:**

| Route | Method | Purpose | Versioned? | Status |
|-------|--------|---------|-----------|--------|
| `/api/auth/login` | POST | Principal login | auth/login/v1 | Active |
| `/api/auth/logout` | POST | Principal logout | auth/logout/v1 | Active |
| `/api/auth/refresh` | POST | Token refresh | auth/refresh/v1 | Active |
| `/api/auth/capabilities` | GET | Scoped capability list | auth/capabilities/v1 | Active |
| `/api/auth/scope` | GET | Current scope context | auth/scope/v1 | Active |

**Consumer responsibilities:**

- CalExp5 auth layer routes through Bridge
- TS_Exp5, RevExp5, etc. authenticate via Bridge, not local

---

## Consumer-to-Bridge Mapping Rules

### Rule 1: Remove "Provider Endpoint Semantics" From Consumer Code

**Before (❌ Wrong):**

```javascript
// Inside TS_Exp5/src/server/services/qbt.service.js
const response = await http.get(
  `https://rest.tsheets.com/api/v1/users`,
  { headers: { Authorization: `Bearer ${tsheetToken}` } }
);
// Then remap through local bridge shim...
```

**After (✅ Right):**

```javascript
// Inside TS_Exp5/src/server/services/qbt.service.js
// Import from Bridge contract
const response = await bridgeClient.get('/api/qbt/users');
// No local remapping; Bridge owns QBT semantics
```

### Rule 2: Version Consumer Expectations

Each consumer should declare its Bridge API version dependencies in a manifest or README:

```markdown
## Bridge Contract Dependencies

| Route Family | Version | Status |
|---|---|---|
| `/api/qbo/*` | v1 | Active, tested |
| `/api/qbt/*` | v1 (Legacy) | Active, prepared for v2 migration |
| `/api/data/*` | v1 | Active, Track A |
| `/api/auth/*` | v1 | Active |
```

### Rule 3: Update Consumer Code Before Bridge Breaking Changes

When a Bridge route must change (`/api/qbo/*` → `/api/qbo-v2/*`):

1. Bridge team publishes deprecation notice **30 days** in advance
2. All consumers are notified via issue tracking
3. Consumers publish their compatibility plan
4. Only after all active consumers confirm v2 support does Bridge retire v1

---

## Cleanup Requirements by Consumer

### CalExp5

**Status:** Mostly aligned; deferred cleanup items

| Item | Priority | Action | Owner | Timeline |
|------|----------|--------|-------|----------|
| Remove settings file fallback for production | Medium | Isolate to dev/fallback-only code path | CalExp5 | Post-Track-A |
| Document proxy behavior in README | Low | Add section on `/api/*` routing | CalExp5 | Now |
| Version Bridge contract dependencies | Medium | Add BRIDGE_CONTRACT.md or README section | CalExp5 | Now |

**Relevant files:**
- `C:\Users\samjo\Desktop\CalExp5\server.js`
- `C:\Users\samjo\Desktop\CalExp5\src\utils\calData.js`

### TS_Exp5

**Status:** Fragile; requires urgent cleanup before escalation

| Item | Priority | Action | Owner | Timeline |
|------|----------|--------|-------|----------|
| Remove direct Intuit endpoint calls | High | Remap all QBO/QBT logic to Bridge | TS_Exp5 | Before Track B |
| Update qbo.service.js to use Bridge contract | High | Replace `/api/v1/timesheets` with `/api/qbt/timesheets` | TS_Exp5 | Before Track B |
| Update qbt.service.js to use Bridge contract | High | Remove local provider remapping | TS_Exp5 | Before Track B |
| Remove localhost Bridge defaults | Medium | Use Railway Bridge URL from env | TS_Exp5 | Now |
| Add BRIDGE_CONTRACT.md to repo | Low | Document target contract version | TS_Exp5 | Now |

**Relevant files:**
- `C:\Users\samjo\Desktop\TS_Exp5\src\server\services\qbt.service.js`
- `C:\Users\samjo\Desktop\TS_Exp5\src\server\services\qbo.service.js`
- `C:\Users\samjo\Desktop\TS_Exp5\src\server\services\http-client.js`

### RevExp5

**Status:** Operationally aligned; repository cleanup only

| Item | Priority | Action | Owner | Timeline |
|------|----------|--------|-------|----------|
| Review all docs and test files for localhost references | Low | Update or remove localhost-only test fixtures | RevExp5 | Post-Track-A |
| Update benchmark pages to target Railway Bridge | Low | Migrate from localhost to production/staging domains | RevExp5 | Now |

### Chase_Expense_Validator

**Status:** Aligned; extension manifest cleanup

| Item | Priority | Action | Owner | Timeline |
|------|----------|--------|-------|----------|
| Consolidate Bridge URL references | Low | Use Railway Bridge URL from service worker config | Chase_Expense | Now |
| Audit extension permissions for production | Low | Document localhost host_permissions justification | Chase_Expense | Now |

---

## Contract Versioning and Breaking Changes

### Versioning Scheme

All Bridge routes use explicit versioning:

```
/api/{family}/{endpoint}/{version}
/api/qbo/invoices-enriched/v1
/api/qbt/timesheets/v1
/api/data/entities/v1
```

### Minor Updates (Non-Breaking)

- New optional query parameters
- New fields in response payload
- Consumer code receives upgrade without changes

### Major Updates (Breaking)

Examples:

- Remove a required field
- Change endpoint path
- Change response structure
- Change authentication model

**Process:**

1. **Announce:** Create issue with title `[BREAKING] /api/{family}/{endpoint} will change on {date+30days}`
2. **Document:** Provide migration guide
3. **Stagger:** Publish new route as `/v2` (parallel with `/v1` for minimum 30 days)
4. **Sunset:** Retire `/v1` with explicit notice

### Sunset Policy

A Bridge route cannot be retired without:

1. Minimum 30-day notice period
2. All known consumers confirming upgrade
3. Production traffic to `/v1` at zero (monitored)
4. Explicit sign-off from CalExp5 lead

---

## Enforcement

### Code Review Checklist for Bridge PRs

- [ ] All new Bridge routes use explicit versioning (`/v1`, `/v2`, etc.)
- [ ] All provider-specific logic is encapsulated in Bridge controllers/services
- [ ] Consumer-facing routes documented in this governance document
- [ ] No route references `localhost`; all external refs are production URLs or clearly marked test fixtures

### Code Review Checklist for Consumer PRs

- [ ] No direct calls to Intuit, Google, or external systems in consumer code
- [ ] All data access routes through Bridge
- [ ] All credentials/tokens are Bridge-managed (not locally stored)
- [ ] Bridge route version is explicitly declared in BRIDGE_CONTRACT.md or README

### Monitoring

Track these metrics monthly:

- Count of direct external system calls from consumer code (should be zero)
- Age of each deprecated Bridge route (should have retirement date)
- Consumer upgrade readiness for pending breaking changes

---

## Next Steps

1. **Immediate:** Update this document as TOC in README_DB_ARCHITECTURE.md
2. **Week 1:** Conduct TS_Exp5 cleanup (high-priority fragility)
3. **Week 2:** Add BRIDGE_CONTRACT.md to CalExp5 and TS_Exp5 repos
4. **Week 3:** Add code review checklist to Bridge CI workflow and consumer repos
5. **Month 1:** Complete all Priority 1 and High items above

---

## See Also

- `BRIDGE_TARGET_CONSUMER_ALIGNMENT_AUDIT.md` (discovered misalignments)
- `QBT_QBO_PLATFORM_ROADMAP.md` (strategic direction for QBT/QBO routes)
- `DB_ARCHITECTURE.md` (canonical data model)
- `PRODUCTION_SAFE_PLAN_AND_ENV_MODEL.md` (deployment contract)
