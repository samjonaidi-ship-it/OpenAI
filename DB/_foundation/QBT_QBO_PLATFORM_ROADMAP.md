# QBT and QBO Platform Roadmap

**Date:** 2026-04-04  
**Scope:** Intuit QuickBooks Time (QBT) and QuickBooks Online (QBO) integration strategy  
**Alignment:** BB Micro Bridge + CalExp5 platform evolution  

---

## Executive Summary

The Bridge currently uses:

- **QBT:** Legacy QuickBooks Time API (`rest.tsheets.com/api/v1`)
- **QBO:** Current REST API (v4, minorversion=75) with OAuth 2.0

**Strategic alignment status:**

- ✅ **QBO:** Good—current with official patterns, but missing modern webhook + CDC strategy
- ⚠️ **QBT:** Legacy—aligned with Intuit's legacy path, not their new strategic direction (Payroll and Time GraphQL)

This document defines:

1. **Current bridge state** (legacy-appropriate)
2. **QBO modern sync strategy** (webhooks + CDC)
3. **QBT decision point** (stay legacy vs. migrate to new)
4. **Timeline and phasing** (Track A to Track C)

---

## Part 1: QBT Platform Status

### Intuit's Two Paths

Intuit now maintains two separate approaches to time tracking:

| Aspect | Legacy Path | New Strategic Path |
|--------|-----------|-------------------|
| API | QuickBooks Time API | Payroll and Time API (GraphQL) |
| Endpoint | `rest.tsheets.com/api/v1` | `developer.intuit.com/payroll-time` |
| Protocol | REST + OAuth 1.0 | GraphQL + OAuth 2.0 + restricted partner tier |
| Availability | Widely available | Extended partner access (not public) |
| Maintenance | Legacy status | Strategic direction |
| Docs | https://developer.intuit.com/app/developer/payroll-time/docs/workflows/track-time-legacy | https://developer.intuit.com/app/developer/payroll-time/docs/get-started |

### Current Bridge Position

Bridge currently uses:

```
https://rest.tsheets.com/api/v1/{endpoint}
OAuth 1.0 (legacy)
Endpoints: /users, /jobcodes, /timesheets, /geolocations, /locations, /customfields, /effective_settings
```

**Assessment:**

- ✅ This is correct for the **legacy** path
- ✅ All routes are stable and well-documented
- ❌ This is not aligned with Intuit's new strategic direction
- ⚠️ Intuit has made no deprecation announcement, but time tracking is slowly shifting

### Why QBT Matters for Bainbridge

QBT data is currently used for:

1. **Employee time tracking** (crew hours)
2. **Jobcode mapping** (labor categorization)
3. **Geolocation data** (GPS traces)
4. **Schedule origination** (shift/assignment source)

CalExp5 and the new platform will need to **own** this data, not just consume it from QBT.

---

## Part 2: QBO Modern Sync Strategy

### Current Bridge State

Bridge connects to QBO using:

- ✅ OAuth 2.0 (current)
- ✅ Current host: `https://quickbooks.intuit.com/app/` + sandbox
- ✅ Minorversion=75 (latest as of January 2026)
- ✅ Batch endpoint with 30 operations (matches Intuit guidance)
- ❌ **No webhook ingestion**
- ❌ **No CDC listener**

### Intuit's Official Recommendation

From [Webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks) and [Change Data Capture](https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/change-data-capture):

> The recommended pattern for data synchronization is:
> 1. **Webhooks** for real-time notification of change events
> 2. **CDC** to retrieve the actual changed records (last 30 days only)
> 3. **Full query fallback** for records older than 30 days

### Why Modern Webhooks + CDC Matter

**Current gap:**

- Bridge polls QBO on-demand
- CalExp5 must wait for next sync to see changes
- No automatic alert when QBO changes

**With webhooks + CDC:**

- QBO notifies Bridge instantly
- Bridge fetches changed records via CDC
- CalExp5 sees updated data within seconds
- Audit trail is cleaner

**Constraint:**

- CDC only covers last 30 days
- Must still query full history for older records

---

## Part 3: QBO Webhook + CDC Implementation Roadmap

### Phase 1: Webhook Setup (Track A → Track B1, ~3 weeks)

**Goal:** Receive QBO change events

**Tasks:**

1. **Register webhook endpoint**
   - Bridge publishes public `/api/qbo/webhooks/ingest` endpoint
   - Register at Intuit developer portal
   - Store webhook signature secret in Bridge secrets

2. **Implement webhook signature verification**
   - Intuit sends SHA-256 signature header
   - Bridge validates request authenticity

3. **Ingest and queue events**
   - Store raw webhook payloads in `qbo_webhook_events` table
   - Enqueue processing job for each event
   - Track receipt timestamp and processing status

4. **Test in sandbox**
   - Simulate QBO event emission
   - Verify Bridge receives and processes events

**Deliverable:** Webhook receiver functioning in staging

**Estimated effort:** 3-4 days

### Phase 2: CDC Integration (Track A → Track B1, ~2 weeks)

**Goal:** Fetch changed records from QBO CDC

**Requires:** Phase 1 complete

**Tasks:**

1. **Implement CDC cursors**
   - Create `qbo_cdc_state` table
   - Track last CDC sync timestamp per entity type
   - Store CDC token where applicable

2. **Build CDC fetcher**
   - Query `/api/v2/company/{realmId}/cdc` endpoint
   - Map CDC `entities` list to entity types (Invoice, Bill, Customer, etc.)
   - Handle CDC 30-day window limit

3. **Merge webhook intent with CDC reality**
   - Webhook says "Invoice 12345 changed"
   - CDC fetcher retrieves the actual Invoice 12345 entity
   - Normalize into Bridge's normalized format

4. **Handle CDC gaps**
   - Entities not in CDC (Journal entries, custom fields, accounts, etc.)
   - Fall back to direct query for those entities
   - Log the gap for audit

5. **Test in sandbox**
   - Generate QBO event (e.g., edit Invoice)
   - Verify webhook triggers
   - Verify CDC fetch retrieves the change
   - Verify Bridge updates internal store

**Deliverable:** CDC integration working, test data flowing

**Estimated effort:** 2-3 days

### Phase 3: Outbox + Event Processing (Track B1 → Track B2, ~1 week)

**Goal:** Convert QBO changes into internal events

**Requires:** Phase 2 complete

**Tasks:**

1. **Define outbox contract**
   - Create `qbo_change_outbox` table
   - Event structure: `{ qbo_event_id, entity_type, entity_id, action, payload_hash, emitted_at }`
   - Status tracking: pending, processing, committed, failed

2. **Emit to outbox**
   - CDC processor writes to outbox instead of direct updates
   - Preserves original QBO entity shape

3. **Subscribe workers to outbox**
   - Worker scans outbox for pending events
   - Transforms QBO entity into Bridge canonical form
   - Updates master data and entity graph
   - Marks event committed

4. **Handle failures**
   - Retry logic for failed outbox events
   - Dead-letter queue for poison pills
   - Alert on stalled outbox

**Deliverable:** QBO changes flowing through entire pipeline

**Estimated effort:** 1-2 days

### Phase 4: Production Launch (Track B2 → Production, ~2 weeks)

**Requirements before launch:**

- [ ] Staging is receiving real QBO webhook traffic
- [ ] CDC fetch is working for all tracked entity types
- [ ] Outbox is processing at least 100 events/hour without error
- [ ] No message loss or duplication in last 72-hour test period
- [ ] Monitoring alerts defined for webhook lag, CDC gap, outbox backlog
- [ ] Fallback documented if webhook receiver fails (manual polling resumes)

**Deployment:**

1. Webhook receiver deployed to production
2. Register webhook in production Intuit account
3. Enable CDC fetch in production Bridge
4. Monitor for 24 hours
5. Escalate if lag exceeds 5 minutes

---

## Part 4: QBT Decision Point

### Option A: Stay on Legacy QBT API (Recommended for Track A)

**Approach:**

- Keep Bridge `/api/qbt/*` routes as-is
- Continue polling `rest.tsheets.com/api/v1`
- Treat as legacy intentionally; document as such

**Pros:**

- No change to existing Bridge code
- QBT API is stable and well-documented
- Intuit maintains legacy API (no announced sunset)
- CalExp5 can adopt QBT data without blocking

**Cons:**

- Not aligned with Intuit's new Payroll and Time strategic direction
- If Intuit eventually sunsets QBT, migration effort will be urgent
- Misses opportunity to deepen Intuit integration

**Recommendation:** **Choose Option A for Track A.**

Why? CalExp5 needs to own time data, not just consume it. The source doesn't matter as much as the destination (CalExp5 graph, not QBT). Focus on migration **later**, not now.

### Option B: Migrate to Payroll and Time GraphQL (Deferred)

**Approach:**

- Evaluate GraphQL API readiness
- Apply for extended partner tier access
- Build parallel Bridge connector
- Transition CalExp5 feed

**Pros:**

- Aligned with Intuit's future
- GraphQL is more flexible than REST
- Better for complex nested queries

**Cons:**

- Requires partner tier upgrade (commercial relationship change)
- GraphQL API scope is not yet public documentation
- Effort: 4-6 weeks (significant refactor)
- Risk: Intuit's API surface not yet stable

**Recommendation:** **Defer to Track C or later.**

Timeline: Evaluate in Q3 2026 based on Intuit announcements.

---

## Part 5: Implementation Timeline

### Track A (Now → June 2026)

- [ ] Confirm QBT legacy is acceptable
- [ ] Keep Bridge QBT routes as-is
- [ ] Mark all QBT routes with `[LEGACY]` comments
- [ ] Document in BRIDGE_CONTRACT_GOVERNANCE.md
- [x] Add to QBT_QBO_PLATFORM_ROADMAP.md (this doc)

**No changes to QBT code for Track A.**

### Track A → Track B1 (June → July 2026)

- [ ] Implement QBO webhook receiver
- [ ] Implement QBO CDC fetcher
- [ ] Deploy to staging
- [ ] Validate real data flow for 1 week

### Track B1 → Track B2 (July → August 2026)

- [ ] Implement outbox + worker pattern
- [ ] Deploy to production
- [ ] Monitor for stability
- [ ] Begin using webhook-driven data in CalExp5

### Track B2 (August → September 2026)

- [ ] QBT evaluation checkpoint
- [ ] Decide: continue legacy or plan GraphQL migration
- [ ] If legacy: document expected lifetime
- [ ] If migrate: kick off partnership conversation with Intuit

### Track C (October 2026+)

- [ ] If pursuing GraphQL: Design and implement new QBT connector
- [ ] If staying legacy: Maintain current state; monitor for Intuit announcements

---

## Part 6: Code Markers and Cleanup

### Bridge: Mark All QBT Routes

```javascript
/**
 * [LEGACY] Uses rest.tsheets.com/api/v1 (legacy QuickBooks Time API)
 * 
 * Intuit's strategic direction is Payroll and Time GraphQL.
 * This endpoint is stable but not future-proof.
 * 
 * See: QBT_QBO_PLATFORM_ROADMAP.md § Part 4 (Decision Point)
 * Timeline: Evaluate for migration in Q3 2026
 */
router.get('/api/qbt/users', async (req, res) => {
  // ...
});
```

### Bridge: Mark QBO Routes Awaiting Webhooks

```javascript
/**
 * [FUTURE] This endpoint currently polls QBO on-demand.
 * 
 * Planned migration: Webhook + CDC ingestion (Track B1)
 * Target date: July 2026
 * 
 * See: QBT_QBO_PLATFORM_ROADMAP.md § Part 3 (QBO Webhook + CDC)
 */
router.get('/api/qbo/invoices-enriched', async (req, res) => {
  // Currently polling; will become webhook-driven later
  // ...
});
```

---

## Part 7: Monitoring and Metrics

### QBT (Legacy)

Track monthly:

- API availability (`rest.tsheets.com` uptime)
- Authentication errors (token refresh failures)
- Sync lag (time between QBT write and Bridge receipt)
- Deprecated endpoint warnings from Intuit

### QBO (Modern)

Track monthly:

- OAuth 2.0 token refresh success rate
- Batch query latency and error counts
- Webhook receiver uptime (after Phase 1)
- CDC fetch success rate (after Phase 2)
- Outbox processing lag (after Phase 3)

### Dashboard

Create a Bridge operations dashboard with:

- QBT sync health
- QBO webhook latency
- QBO CDC catch-up lag
- Failed outbox events in last 24h
- Production alert thresholds

---

## Part 8: Risk Mitigation

### Risk: Intuit Sunsets QBT Legacy API Without Notice

**Likelihood:** Low (Intuit has not announced timeline)  
**Impact:** High (CalExp5 timesheets break)

**Mitigation:**

1. Monitor Intuit release notes monthly
2. Set calendar reminder for Q3 2026 evaluation
3. Keep migration proposal drafted (not implemented yet)
4. Track which CalExp5 workflows depend on QBT data

### Risk: QBO Webhook Receiver Goes Down

**Likelihood:** Medium (network/deployment issues)  
**Impact:** High (QBO changes missed)

**Mitigation:**

1. Implement polling fallback (query QBO every 5 minutes)
2. Alert on webhook lag > 5 minutes
3. Maintain CDC fetch as safety net
4. Test failover monthly

### Risk: Payroll and Time GraphQL Not Available for Public Use

**Likelihood:** Medium (Intuit has restricted partner access)  
**Impact:** Medium (option B blocked)

**Mitigation:**

1. Apply for partner tier in Q2 2026 (before Q3 evaluation)
2. Have Option A (stay legacy) ready as fallback
3. Document decision and reasoning in this roadmap

---

## Summary Table

| Platform | Current Status | Track A | Track B | Track C | Notes |
|----------|---|---|---|---|---|
| **QBT** | Legacy REST | Keep as-is | Evaluate GraphQL | Migrate if available | Low urgency; legacy is stable |
| **QBO** | On-demand polls | Keep current | Add webhooks + CDC | Monitor for new features | High value; improves sync freshness |

---

## See Also

- `BRIDGE_TARGET_CONSUMER_ALIGNMENT_AUDIT.md` (discovered misalignments)
- `BRIDGE_CONTRACT_GOVERNANCE.md` (contract versioning)
- `DB_ARCHITECTURE.md` (canonical data model)
- `MASTER_DATA_MANAGEMENT.md` (calExp5 ownership of time data)
- Official docs:
  - Intuit Payroll and Time: https://developer.intuit.com/app/developer/payroll-time/docs/get-started
  - QBO webhooks: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
  - QBO CDC: https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/change-data-capture
  - Legacy track: https://developer.intuit.com/app/developer/payroll-time/docs/workflows/track-time-legacy
