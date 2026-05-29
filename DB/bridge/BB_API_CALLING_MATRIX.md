# BB API Calling Matrix | v1.2 | 2026-03-01 | BB

> How we call QBO and QBT, ranked fastest to slowest, mapped to every route and consumer app.
> **v1.1:** Expanded consumer scan from 3 → 9 projects. See: BB_API_BRIDGE_CONSUMER_CATALOGUE v1.0 for full per-project inventories.

---

## 1. QBO CALLING PATTERNS — Fastest to Slowest

```
RANK  PATTERN                    1 HTTP CALL GETS YOU...           LATENCY
════  ═════════════════════════  ══════════════════════════════    ═══════════
 1    Webhooks (push)            Change notification (ID only)     0ms (push)
 2    CDC (Change Data Capture)  ALL changes across N entity types ~300-800ms
 3    Batch API                  Up to 30 mixed operations         ~500ms-2s
 4    Query + IN clause          Up to 1,000 specific records      ~200-800ms
 5    Query + pagination         Up to 1,000 filtered records      ~200-800ms
 6    Single GET by ID           1 record                          ~200-500ms
 7    Single POST (create/update) 1 record mutated                 ~300-1,000ms
 8    Reports API                1 computed report (server-side)   ~1-10s
```

### Pattern Details

| # | Pattern | Max per Call | Rate Limit | Key Constraint | We Use It? |
|---|---------|-------------|------------|----------------|------------|
| 1 | **Webhooks** | N/A (push) | None (Intuit sends) | Only sends ID + operation, not full record. Must follow up with a read. Configurable aggregation interval (was 5min default). CloudEvents migration deadline: May 2026. | **NO** |
| 2 | **CDC** | 1,000 objects across ALL entity types | 500/min | 30-day lookback max. No pagination — if >1,000 changes, shorten window. | **NO** |
| 3 | **Batch API** | 30 operations (mixed CRUD + queries) | **40/min** (lower!) | Execution order NOT guaranteed. 1,000 objects max in response. | **YES** — 5 routes |
| 4 | **Query + IN** | 1,000 records | 500/min | IN clause has undocumented string-length limit. Single quotes required. No OR/JOIN/GROUP BY. | **YES** — 4 routes |
| 5 | **Query + pagination** | 1,000 per page (STARTPOSITION) | 500/min | Always returns full objects (no column projection). Default MAXRESULTS=100 if unset. | **YES** — most routes |
| 6 | **Single GET** | 1 record | 500/min, 10 concurrent | Fastest for one known ID. | **YES** — many routes |
| 7 | **Single POST** | 1 mutation | 500/min, 10 concurrent | SyncToken required for updates (optimistic concurrency). | **YES** — many routes |
| 8 | **Reports API** | 1 report (up to 400K cells) | **200/min** (lower!) | Server-side computation. Slowest endpoint. | **YES** — 3 routes |

### What We're NOT Using (Optimization Opportunities)

| Pattern | Current Approach | Potential Improvement |
|---------|-----------------|----------------------|
| **Webhooks** | All apps poll the bridge, which polls QBO | Subscribe to webhooks → get instant change notification → follow up with single read. Eliminates polling lag. |
| **CDC** | Each entity type queried separately (N calls) | 1 CDC call replaces N queries. For TS_Latest's periodic sync of employees + customers + invoices, CDC would be 1 call instead of 3-5. |

---

## 2. QBT CALLING PATTERNS — Fastest to Slowest

```
RANK  PATTERN                      1 HTTP CALL GETS YOU...        LATENCY
════  ═══════════════════════════  ═════════════════════════════  ═══════════
 1    last_modified_timestamps     Changed-since timestamps only   ~100-200ms
 2    Batch POST/PUT (200 objs)   200 creates or updates          ~300-800ms
 3    modified_since filter        Up to 200 changed records       ~200-500ms
 4    Standard GET + filters       Up to 200 filtered records      ~200-500ms
 5    Supplemental data            Free joined reference data      0ms (auto)
```

### Pattern Details

| # | Pattern | Max per Call | Rate Limit | Key Feature | We Use It? |
|---|---------|-------------|------------|-------------|------------|
| 1 | **last_modified_timestamps** | N/A (timestamps only) | 300/5min | One call tells you if ANYTHING changed. Skip all other calls if nothing changed. | **NO** |
| 2 | **Batch POST/PUT** | 200 objects | 300/5min | Standard endpoints accept arrays. Not a separate batch endpoint. | **NO** |
| 3 | **modified_since filter** | 200 per page | 300/5min | Incremental sync: only fetch what changed since last run. Page with `page` param until `"more": false`. | **YES** (partially) |
| 4 | **Standard GET + filters** | 200 per page | 300/5min | Comma-separated IDs (`user_ids=1001,1002`). Date range filters. | **YES** — most routes |
| 5 | **Supplemental data** | Auto-included | 0 extra calls | Related objects (users, jobcodes) come free in every response. Disable with `supplemental_data=no` once cached. | **YES** (implicitly) |

### What We're NOT Using (Optimization Opportunities)

| Pattern | Current Approach | Potential Improvement |
|---------|-----------------|----------------------|
| **last_modified_timestamps** | Every sync fetches full data regardless | 1 lightweight call first → skip everything if nothing changed. For TS_Latest's frequent timesheet polling, this could eliminate 90%+ of unnecessary API calls. |
| **Batch POST/PUT** | Create/update timesheets one at a time (1 API call per record) | 1 call = 200 timesheets. For crew time entry workflows, massive reduction. |

---

## 3. RATE LIMIT QUICK REFERENCE

```
                    QBO                          QBT
                    ═══                          ═══
Standard:           500 req/min per realmId      300 req / 5-min window
Batch:              40 req/min per realmId       (uses standard endpoints)
Reports:            200 req/min per realmId      N/A
Concurrent:         10 max simultaneous          Not documented
Exceeded:           HTTP 429                     HTTP 429

Token Refresh:      ~1/hour proactive            Same OAuth (shared with QBO)
Access Token TTL:   3,600 seconds (1 hour)       Same
Refresh Token TTL:  100-day rolling (5yr max)    Same
```

---

## 4. THE MASTER MATRIX — Every Route x Calling Pattern x Consumer

### QBO Routes by Calling Pattern

#### Pattern: Query + Pagination (STARTPOSITION loop)

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `GET /qbo/timeactivity/all` | Auto-paginate ALL TimeActivity (100/page) | — | BATCH |
| `POST /qbo/timeactivity/query` | Paginated TimeActivity by filters | TS_Latest | BATCH |
| `POST /qbo/reconcile-unbilled` | Full-range unassigned TimeActivity scan | — | BATCH |

#### Pattern: Query + IN Clause (multiple IDs in one call)

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `POST /qbo/invoices/batch-in` | Fetch N invoices via IN clause | RevExp5 | BATCH |
| `POST /qbo/invoices/batch-hybrid` | Batch API + IN clause combo | — | BATCH |
| `POST /qbo/bill-reconciliation` | Bills by DocNumber IN + Attachables | Chase_Exp | BATCH |
| `POST /qbo/validate-labor-exact` | Employee + TimeActivity IN clause | RevExp5, Invoice_V2 | BATCH |

#### Pattern: Batch API (30 ops per HTTP call)

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `POST /qbo/invoices/batch-api` | QBO Batch API (30 invoices/request) | — | BATCH |
| `POST /qbo/invoices/batch-hybrid` | Batch API + IN clause combo | — | BATCH |

#### Pattern: Parallel Single Queries (Promise.all of N queries)

| Bridge Route | What It Does | # Parallel Calls | Consumer Apps | Category |
|---|---|---|---|---|
| `POST /qbo/reference-data` | Account+Vendor+Item+Customer+Class | 5 | Project_Exp, BB-DocEngine | BATCH |
| `POST /qbo/invoices-enriched` | Invoices+Payments+Attachables | 3 | RevExp5 | BATCH |
| `POST /qbo/reconciliation-status` | 3 TransactionList reports | 3 | Invoice_V2 (legacy) | BATCH |
| `POST /qbo/check-cleared-status` | 3 reports + matching | 3 | — | BATCH |
| `POST /qbo/recon-enhanced` | 9+ transaction type queries | 9-15 | RevExp5, Invoice_V2 | BATCH |
| `POST /qbo/transactions-with-links` | N transaction type queries | 2-5 | — | BATCH |
| `POST /qbo/chase-reconciliation` | Purchases/Bills + Attachables | 3-5 | Chase_Exp | BATCH |

#### Pattern: Sequential Multi-Call (one after another)

| Bridge Route | What It Does | # Sequential Calls | Consumer Apps | Category |
|---|---|---|---|---|
| `POST /qbo/purchases/process-batch` | Update N purchases one by one | N | — | BATCH |
| `POST /qbo/invoices/batch` | N parallel with retry/backoff | N | — | BATCH |
| `POST /qbo/invoices/batch-sequential` | N sequential (benchmark) | N | — | BATCH |
| `POST /qbo/purchase/convert-to-item-based` | Fetch→Update→Verify | 3 | — | BATCH |
| `POST /qbo/export-labor-csv` | Query + file write | 1+fs | — | BATCH |
| `POST /qbo/employee/details` | Employee + custom fields | 2 | — | BATCH |

#### Pattern: Single Query (one SELECT per call)

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `POST /qbo/customers` | List active customers | Project_Exp, TS_Latest, Binder_Exp, BB-DocEngine | SINGLE |
| `GET /qbo/customers/search` | Search by name fragment | Project_Exp, Binder_Exp, BB-DocEngine | SINGLE |
| `POST /qbo/employees` | List active employees | TS_Latest | SINGLE |
| `POST /qbo/invoices` | List invoices (last 100) | TS_Latest | SINGLE |
| `POST /qbo/vendors` | List active vendors | — | SINGLE |
| `POST /qbo/items` | List active items | — | SINGLE |
| `POST /qbo/accounts` | List active accounts | — | SINGLE |
| `POST /qbo/purchases/unprocessed` | Query Purchases in date range | — | SINGLE |
| `POST /qbo/billable-items` | Billable TimeActivity for customer | — | SINGLE |
| `POST /qbo/timeactivity-payroll` | TimeActivity for payroll | — | SINGLE |
| `POST /qbo/attachables` | Query Attachable entities | — | SINGLE |
| `GET /qbo/query` | Generic QBO SQL query | Project_Exp, TS_Latest, BB-DocEngine, RevExp5 | SINGLE |
| `GET /qbo/list/:entityType` | Generic entity list | Project_Exp, TS_Latest, BB-DocEngine | SINGLE |

#### Pattern: Single GET by ID

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `GET /qbo/:entity/:id` | Get any entity by ID | Project_Exp (Customer), BB-DocEngine (Customer) | SINGLE |
| `POST /qbo/invoice` | Get invoice by ID | — | SINGLE |
| `POST /qbo/invoice/by-docnumber` | Get invoice by doc# | RevExp5 | SINGLE |
| `GET /qbo/invoice/:id/attachments` | Lazy-load attachments | — | SINGLE |
| `POST /qbo/bill` | Get Bill by ID/query | — | SINGLE |
| `POST /qbo/vendor` | Get/search Vendor | — | SINGLE |
| `POST /qbo/account` | Get/search Account | — | SINGLE |
| `POST /qbo/terms` | Get payment terms | — | SINGLE |
| `POST /qbo/preferences` | Get company prefs | — | SINGLE |
| `POST /qbo/transaction-detail` | Single transaction | — | SINGLE |
| `POST /qbo/transaction-lines` | Line items for one txn | — | SINGLE |
| `POST /qbo/query-transactions` | Single typed query | — | SINGLE |
| `POST /qbo/attachment-download` | Attachment metadata | — | SINGLE |

#### Pattern: Single POST (Create/Update/Delete)

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `POST /qbo/:entity` | Create any entity | Project_Exp (Customer), BB-DocEngine (Customer) | SINGLE |
| `POST /qbo/:entity/update` | Update any entity | Project_Exp (Customer), BB-DocEngine (Customer) | SINGLE |
| `DELETE /qbo/:entity/:id` | Delete/void entity | — | SINGLE |
| `POST /qbo/invoice/create` | Create invoice | — | SINGLE |
| `POST /qbo/timeactivity` | Create TimeActivity | TS_Latest | SINGLE |
| `PUT /qbo/timeactivity` | Update TimeActivity | TS_Latest | SINGLE |
| `DELETE /qbo/timeactivity` | Delete TimeActivity | TS_Latest | SINGLE |
| `POST /qbo/attachment-upload` | Upload attachment | — | SINGLE |
| `POST /qbo/attachment-upload-smart` | Smart upload | Project_Exp, BB-DocEngine | SINGLE |
| `POST /qbo/attachment-fetch` | Download attachment blob | RevExp5, Chase_Exp | SINGLE |
| `POST /qbo/attachment-delete` | Delete attachment | — | SINGLE |
| `POST /qbo/purchase/process` | Update single Purchase | — | SINGLE |
| `POST /qbo/mileage-reimbursement` | Create mileage Bill | — | SINGLE |

#### Pattern: Reports API (server-side computation)

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `POST /qbo/reconciliation-status` | 3x TransactionList reports | — | BATCH |
| `POST /qbo/check-cleared-status` | 3x reports + matching | — | BATCH |
| `POST /qbo/recon-enhanced` | 9+ report-like queries | — | BATCH |

#### Pattern: Token Management

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `GET /qbo/refresh` | Refresh OAuth token | TS_Latest | SINGLE |
| `POST /qbo/refresh-token` | Refresh OAuth token | TS_Latest | SINGLE |

---

### QBT Routes by Calling Pattern

#### Pattern: Parallel Multi-Call (Promise.all)

| Bridge Route | What It Does | # Parallel Calls | Consumer Apps | Category |
|---|---|---|---|---|
| `POST /qbt/validate-labor-exact` | Users+Jobcodes+paginated Timesheets | 3+ | RevExp5, Invoice_V2 | BATCH |
| `POST /qbt/employee-dashboard` | Users+TimeOff+Schedule | 3 | — | BATCH |
| `POST /qbt/crew-calendar` | Users+TimeOff+Schedule | 2-3 | — | BATCH |

#### Pattern: Paginated Loop

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `POST /qbt/geolocations` | Auto-paginate ALL geolocations (200/page) | TS_Latest | BATCH |

#### Pattern: Sequential Multi-Call

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `POST /qbt/validate-labor` | Users + Timesheets + matching | Invoice_V2 (legacy) | BATCH |
| `POST /qbt/validate-labor-segments` | 30-min segment duplicate detection | Invoice_V2 | BATCH |
| `POST /qbt/time-off-request` | Create request + add entries | CalExp5 | BATCH |
| `POST /qbt/export-timesheets-csv` | QBT fetch + CSV write | RevExp5 | BATCH |

#### Pattern: Standard GET with Filters

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `GET /qbt/timesheets` | Fetch timesheets (1 page) | TS_Latest, CalExp5 | SINGLE |
| `GET /qbt/users` | Fetch users | TS_Latest, CalExp5 | SINGLE |
| `GET /qbt/jobcodes` | Fetch jobcodes | TS_Latest, CalExp5 | SINGLE |
| `GET /qbt/payroll` | Payroll report | TS_Latest | SINGLE |
| `GET /qbt/current-totals` | Who's on the clock | TS_Latest | SINGLE |
| `POST /qbt/locations` | Fetch locations | — | SINGLE |

#### Pattern: Single CRUD

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `PUT /qbt/jobcode` | Update jobcode | — | SINGLE |
| `POST /qbt/timesheet` | Create timesheet | TS_Latest | SINGLE |
| `PUT /qbt/timesheet` | Update timesheet | TS_Latest | SINGLE |
| `DELETE /qbt/timesheet` | Delete timesheet | TS_Latest | SINGLE |

#### Pattern: Token Management

| Bridge Route | What It Does | Consumer Apps | Category |
|---|---|---|---|
| `POST /qbt/refresh-token` | Refresh QBT OAuth | — | SINGLE |

---

## 5. CONSUMER APP DEPENDENCY MAP

### Project_Exp — 14 unique bridge routes

```
QBO ████████████████████████  12 routes
GEO                            0 routes
QBT                            0 routes
AI                             0 routes
OTHER ██                       2 routes (health, reference-data)
```

| Route | Method | Calling Pattern | Category | Files |
|---|---|---|---|---|
| `/health` | GET | Status check | SUPER FAST | qbo-service-v3.js |
| `/qbo/status` | GET | Status check | SUPER FAST | qbo-service-v3.js |
| `/qbo/customers` | POST | Single query | SINGLE | qbo-service-v3.js, TM_agreement |
| `/qbo/customers/search` | GET | Single query | SINGLE | qbo-service-v3.js |
| `/qbo/Customer/{id}` | GET | Single GET by ID | SINGLE | property.js, client.js |
| `/qbo/Customer` | POST | Single POST create | SINGLE | qbo-service-v3.js, property.js |
| `/qbo/Customer/update` | POST | Single POST update | SINGLE | qbo-service-v3.js, property.js |
| `/qbo/query` | POST | Single query | SINGLE | qbo-service-v3.js |
| `/qbo/list/{entityType}` | GET | Single query | SINGLE | qbo-service-v3.js |
| `/qbo/list/vendors` | GET | Single query | SINGLE | qbo-service-v3.js |
| `/qbo/reference-data` | POST | 5 parallel queries | BATCH | qbo-service-v3.js |
| `/qbo/attachment-upload-smart` | POST | Single POST | SINGLE | qbo-service-v3.js |

**Project_Exp is QBO Customer-centric.** No QBT, no Geo, no AI.

---

### TS_Latest — 28+ unique bridge routes (heaviest consumer)

```
QBO ████████████████████████  16 routes
QBT ████████████████          10 routes
BATCH ████████                 8 routes (batch session system)
OTHER ██                       2 routes (test endpoints)
```

| Route | Method | Calling Pattern | Category | Files |
|---|---|---|---|---|
| `/qbo/test` | POST | Single API test | SINGLE | qbo-client.js, settings-module.js |
| `/qbo/refresh` | POST | Token refresh | SINGLE | qbo-client.js, settings-module.js |
| `/qbo/refresh-token` | POST | Token refresh | SINGLE | http-client.js |
| `/qbo/query` | POST | Single query | SINGLE | qbo-client.js |
| `/qbo/employees` | POST | Single query | SINGLE | qbo-client.js, settings-module.js, index.html |
| `/qbo/customers` | POST | Single query | SINGLE | qbo-client.js, index.html |
| `/qbo/invoices` | POST | Single query | SINGLE | qbo-client.js |
| `/qbo/timeactivity` | POST | Single POST create | SINGLE | qbo-client.js |
| `/qbo/timeactivity` | PUT | Single POST update | SINGLE | qbo-client.js, index.html |
| `/qbo/timeactivity` | DELETE | Single POST delete | SINGLE | qbo-client.js |
| `/qbo/timeactivity/query` | POST | Paginated query | BATCH | index.html |
| `/qbo/list/Employee` | POST | Single query | SINGLE | http-client.js |
| `/qbo/list/Customer` | POST | Single query | SINGLE | http-client.js |
| `/qbo/list/Invoice` | POST | Single query | SINGLE | http-client.js |
| `/qbo/list/Vendor` | POST | Single query | SINGLE | http-client.js |
| `/qbt/test` | POST | Single API test | SINGLE | qbt-client.js, settings-module.js |
| `/qbt/users` | POST | Standard GET+filters | SINGLE | qbt-client.js, api.js, settings-module.js |
| `/qbt/jobcodes` | POST | Standard GET+filters | SINGLE | qbt-client.js, api.js, settings-module.js |
| `/qbt/timesheets` | POST | Standard GET+filters | SINGLE | qbt-client.js, api.js |
| `/qbt/timesheet` | POST | Single CRUD | SINGLE | qbt-client.js |
| `/qbt/timesheet` | PUT | Single CRUD | SINGLE | qbt-client.js |
| `/qbt/timesheet` | DELETE | Single CRUD | SINGLE | qbt-client.js |
| `/qbt/geolocations` | POST | Paginated loop | BATCH | qbt-client.js |
| `/batch/health` | GET | Status check | SUPER FAST | bridge-client.js |
| `/batch/sessions` | POST/GET | Batch session mgmt | BATCH | bridge-client.js |
| `/batch/sessions/{id}` | GET/DELETE | Session status/close | BATCH | bridge-client.js |
| `/batch/sessions/{id}/command` | POST | Send batch command | BATCH | bridge-client.js |
| `/batch/sessions/{id}/results` | GET | Get results | BATCH | bridge-client.js |
| `ws://3100/ws/batch/{id}` | WebSocket | Real-time batch updates | BATCH | bridge-client.js |

**TS_Latest is the heaviest consumer.** Full QBO + QBT + batch system + WebSocket.

---

### Binder_Exp — 4 unique bridge routes (lightest consumer)

```
QBO ████                       2 routes
GEO ████                       2 routes
QBT                            0 routes
AI                             0 routes
```

| Route | Method | Calling Pattern | Category | Files |
|---|---|---|---|---|
| `/qbo/customers/search` | GET | Single query | SINGLE | api.ts |
| `/qbo/customers` | GET | Single query | SINGLE | api.ts |
| `/geo/places/autocomplete` | GET | Single Google Maps call | SINGLE | api.ts |
| `/geo/places/details` | GET | Single Google Maps call | SINGLE | api.ts |

**Binder_Exp is minimal.** Just customer lookup and address autocomplete.

---

### BB-DocEngine — 12 unique bridge routes

```
QBO ████████████████████████  12 routes
QBT                            0 routes
GEO                            0 routes
```

| Route | Method | Calling Pattern | Category | Files |
|---|---|---|---|---|
| `/health` | GET | Status check | SUPER FAST | qbo-service-v3.js, health-v2.js |
| `/qbo/status` | GET | Status check | SUPER FAST | qbo-service-v3.js, health-v2.js |
| `/qbo/customers` | POST | Single query | SINGLE | qbo-service-v3.js |
| `/qbo/customers/search` | GET | Single query | SINGLE | qbo-service-v3.js |
| `/qbo/Customer/{id}` | GET | Single GET by ID | SINGLE | qbo-service-v3.js, index.html (6x) |
| `/qbo/Customer` | POST | Single POST create | SINGLE | qbo-service-v3.js, index.html |
| `/qbo/Customer/update` | POST | Single POST update | SINGLE | qbo-service-v3.js, index.html (2x) |
| `/qbo/query` | POST | Single query | SINGLE | qbo-service-v3.js, debug scripts |
| `/qbo/list/{entityType}` | GET | Single query | SINGLE | qbo-service-v3.js |
| `/qbo/list/vendors` | GET | Single query | SINGLE | qbo-service-v3.js |
| `/qbo/reference-data` | POST | 5 parallel queries | BATCH | qbo-service-v3.js |
| `/qbo/attachment-upload-smart` | POST | Single POST | SINGLE | qbo-service-v3.js |

**BB-DocEngine shares qbo-service-v3.js with Project_Exp.** Same QBO Customer-centric pattern.
**Issue:** `estimate-templates/index.html` has 10 hardcoded `localhost:3100` calls bypassing server proxy.

---

### RevExp5 — 12 unique bridge routes

```
QBO ████████████████████████  9 routes
QBT ████████                  2 routes
AI  ██                        1 route
```

| Route | Method | Calling Pattern | Category | Files |
|---|---|---|---|---|
| `/api/qbo/invoices-enriched` | POST | 3 parallel queries | BATCH | index.html |
| `/api/qbo/invoices/batch-in` | POST | Query+IN clause | BATCH | reconcile-integration-v2.js |
| `/api/qbo/invoice/by-docnumber` | POST | Single query | SINGLE | test files |
| `/api/qbo/invoice/pdf` | POST | Single request | SINGLE | benchmark files |
| `/api/qbo/attachment-fetch` | POST | Single request | SINGLE | benchmark files |
| `/api/qbo/timeactivity/all` | GET | Query+Pagination | BATCH | reconcile-integration-v2.js |
| `/api/qbo/query` | GET | Single query | SINGLE | debug files |
| `/api/qbo/validate-labor-exact` | POST | Query+IN clause | BATCH | invoice-checks-v1.js |
| `/api/qbo/recon-enhanced` | POST | 9+ parallel queries | BATCH | invoice-checks-v1.js |
| `/api/qbt/validate-labor-exact` | POST | Multi-call parallel | BATCH | invoice-checks-v1.js |
| `/api/qbt/export-timesheets-csv` | POST | Fetch + CSV write | BATCH | reconcile-integration-v2.js |
| `/api/ai/claude/extract-json` | POST | Single AI call | SINGLE | bb-fuzzy-search-v1.js |

**RevExp5 is invoice-centric.** Primary flow: load invoices enriched → reconcile → validate labor.
**Uses AI** for fuzzy customer/address search disambiguation.

---

### Invoice_Validate2 — 7 unique bridge routes (Chrome Extension)

```
QBO ████████                  3 routes (recon + labor)
QBT ████████                  3 routes (labor validation)
HEALTH ██                     1 route
```

| Route | Method | Calling Pattern | Category | Files |
|---|---|---|---|---|
| `/api/health` | GET | Status check | SUPER FAST | popup.js |
| `/api/qbo/recon-enhanced` | POST | 9+ parallel queries | BATCH | content-v58.js |
| `/api/qbo/validate-labor-exact` | POST | Query+IN clause | BATCH | content-v58.js |
| `/api/qbt/validate-labor-exact` | POST | Multi-call parallel | BATCH | content-v58.js |
| `/api/qbt/validate-labor-segments` | POST | 30-min segment check | BATCH | content-v58.js |
| `/api/qbo/reconciliation-status` | POST | Legacy (superseded) | BATCH | Archive only |
| `/api/qbt/validate-labor` | POST | Legacy (superseded) | BATCH | Archive only |

**Invoice_Validate2 runs as a Chrome extension.** Auto-fires Items Cleared @ 300ms and Labor Segments @ 600ms after modal open. QBO + QBT labor validation run in parallel via `Promise.all()`.

---

### CalExp5 — 5 unique bridge routes (QBT only)

```
QBT ████████████████████████  5 routes (ALL traffic)
QBO                            0 routes
```

| Route | Method | Calling Pattern | Category | Files |
|---|---|---|---|---|
| `/qbt/users` | POST | Standard GET+filters | SINGLE | api.js (2x) |
| `/qbt/timesheets` | POST | Standard GET+filters | SINGLE | api.js (6x) |
| `/qbt/timesheet` | POST/PUT | Single CRUD | SINGLE | api.js (2x) |
| `/qbt/jobcodes` | POST | Standard GET+filters | SINGLE | api.js |
| `/qbt/time-off-request` | POST | Create + add entries | BATCH | api.js |

**CalExp5 is QBT-exclusive.** Cleanest architecture: all calls proxied through Express server (port 3200 → bridge 3100). Run.bat auto-starts bridge if not running.

---

### Chase_Expense_Validator — 4 unique bridge routes (Chrome Extension)

```
QBO ██████████████████        3 routes (reconciliation)
HEALTH ██                     1 route
```

| Route | Method | Calling Pattern | Category | Files |
|---|---|---|---|---|
| `/api/health` | GET | Status check | SUPER FAST | popup.js, Run.bat |
| `/api/qbo/chase-reconciliation` | POST | Purchases/Bills+Attachables | BATCH | content-v26.js (+ 25 older versions) |
| `/api/qbo/bill-reconciliation` | POST | Bills by DocNumber IN | BATCH | content-v24-26.js |
| `/api/qbo/attachment-fetch` | POST | Single attachment download | SINGLE | content-v24-26.js |

**Chase_Exp is reconciliation-centric.** Matches Chase/Home Depot expenses and SanLorenzo invoices against QBO.

---

### Adobe eSigner — ZERO bridge routes

**Standalone application.** Port 3090. All APIs relative to local server. Adobe Sign direct integration. No Mini_API_Bridge dependency whatsoever.

---

## 6. UNUSED ROUTES (No Consumer Calls Them)

**Updated after scanning all 9 projects:**

Of 184 registered routes, **~59 are actively called** by at least one consumer app. That leaves **~125 routes (68%) with no active consumer.**

These fall into categories:

| Category | # Unused Routes | Notes |
|---|---|---|
| QBO Advanced/Recon | ~22 | Reconciliation, chase, bill matching — built but not wired to any UI |
| QBO Batch Invoice (5 variants) | 5 | Benchmarking variants — only 1 would be used in production |
| AI (Claude + OpenAI) | 13 | All 13 AI routes have no consumer |
| Geo (Vision + OSRM) | 13 | Vision OCR, OSRM routing — built but unused |
| Settings/File ops | ~20 | Many are legacy aliases of each other |
| Receipts/Agents | 6 | Receipt scanning — built but unused |
| Estimator | 2 | Excel export — triggered manually? |
| Mileage legacy | 4 | Legacy routes from Mig_API_1 |
| Geocode legacy | 5 | Replaced by `/geo/*` routes |
| Mapping | 2 | In-memory only, no persistence |

---

## 7. OPTIMIZATION ROADMAP

### Quick Win: Use `last_modified_timestamps` for QBT

**Current:** TS_Latest fetches timesheets/users/jobcodes every sync regardless.
**Better:** Call `last_modified_timestamps` first. If nothing changed, skip everything.
**Impact:** Could eliminate 90%+ of QBT API calls during idle periods.
**Effort:** ~2 hours. Add one endpoint to bridge, one check in TS_Latest's sync loop.

### Medium: Use CDC for QBO Multi-Entity Sync

**Current:** TS_Latest queries employees, customers, invoices separately (3-5 calls).
**Better:** One CDC call returns all changes across all entity types.
**Impact:** 3-5 calls → 1 call. Especially valuable for TS_Latest's periodic refresh.
**Effort:** ~4 hours. New bridge route + consumer integration.

### Medium: Use QBT Batch for Timesheet Writes

**Current:** Create/update timesheets one at a time (1 API call per record).
**Better:** Batch up to 200 timesheets per call.
**Impact:** For crew time entry (e.g., 10 workers x 5 days = 50 timesheets), 50 calls → 1 call.
**Effort:** ~3 hours. Modify bridge's timesheet create/update to accept arrays.

### Medium: Add QBO Webhooks

**Current:** All sync is poll-based (bridge polls QBO).
**Better:** QBO pushes change notifications to bridge → bridge notifies consumers via WebSocket.
**Impact:** Near-real-time sync instead of periodic polling. Eliminates unnecessary API calls.
**Effort:** ~8 hours. Webhook endpoint, HMAC verification, WebSocket fan-out, CDC follow-up reads.
**Note:** CloudEvents migration required by May 2026.

### Long-Term: Prune Unused Routes

**75% of routes have no consumer.** Many were built speculatively. During cloud migration, consider:
- Removing the 5 batch-invoice benchmarking variants (keep 1)
- Removing the geocode/mileage legacy routes (replaced by `/geo/*`)
- Gating AI routes behind a feature flag (no consumer currently uses them)

---

## 8. CROSS-REFERENCE: ROUTE CLASSIFICATION x CALLING PATTERN x CONSUMER (All 9 Projects)

| Route | Speed | Pattern | PExp | TS | Bind | DocE | Rev5 | InvV2 | Cal5 | Chase | eSign |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/health` | S.FAST | — | X | | | X | | | | | |
| `/api/health` | S.FAST | — | | | | | | X | | X | |
| `/qbo/status` | S.FAST | — | X | X | | X | | | | | |
| `/qbo/test` | SINGLE | Single GET | | X | | | | | | | |
| `/qbt/test` | SINGLE | Single GET | | X | | | | | | | |
| `/batch/health` | S.FAST | — | | X | | | | | | | |
| `/qbo/customers` | SINGLE | Single Query | X | X | X | X | | | | | |
| `/qbo/customers/search` | SINGLE | Single Query | X | | X | X | | | | | |
| `/qbo/Customer/{id}` | SINGLE | Single GET by ID | X | | | X | | | | | |
| `/qbo/Customer` (create) | SINGLE | Single POST | X | | | X | | | | | |
| `/qbo/Customer/update` | SINGLE | Single POST | X | | | X | | | | | |
| `/qbo/employees` | SINGLE | Single Query | | X | | | | | | | |
| `/qbo/invoices` | SINGLE | Single Query | | X | | | | | | | |
| `/qbo/timeactivity` (CRUD) | SINGLE | POST/PUT/DEL | | X | | | | | | | |
| `/qbo/timeactivity/query` | BATCH | Query+Pagination | | X | | | | | | | |
| `/qbo/timeactivity/all` | BATCH | Query+Pagination | | | | | X | | | | |
| `/qbo/query` | SINGLE | Single Query | X | X | | X | X | | | | |
| `/qbo/list/:type` | SINGLE | Single Query | X | X | | X | | | | | |
| `/qbo/reference-data` | BATCH | 5 Parallel Queries | X | | | X | | | | | |
| `/qbo/refresh` | SINGLE | Token Refresh | | X | | | | | | | |
| `/qbo/attachment-upload-smart` | SINGLE | Single POST | X | | | X | | | | | |
| `/qbo/attachment-fetch` | SINGLE | Single request | | | | | X | | | X | |
| `/qbo/invoices-enriched` | BATCH | 3 Parallel Queries | | | | | X | | | | |
| `/qbo/invoices/batch-in` | BATCH | Query+IN | | | | | X | | | | |
| `/qbo/invoice/by-docnumber` | SINGLE | Single query | | | | | X | | | | |
| `/qbo/invoice/pdf` | SINGLE | Single request | | | | | X | | | | |
| `/qbo/validate-labor-exact` | BATCH | Query+IN | | | | | X | X | | | |
| `/qbo/recon-enhanced` | BATCH | 9+ Parallel Queries | | | | | X | X | | | |
| `/qbo/chase-reconciliation` | BATCH | Multi-query+match | | | | | | | | X | |
| `/qbo/bill-reconciliation` | BATCH | DocNumber IN | | | | | | | | X | |
| `/qbt/users` | SINGLE | Standard GET | | X | | | | | X | | |
| `/qbt/jobcodes` | SINGLE | Standard GET | | X | | | | | X | | |
| `/qbt/timesheets` | SINGLE | Standard GET | | X | | | | | X | | |
| `/qbt/timesheet` (CRUD) | SINGLE | Single CRUD | | X | | | | | X | | |
| `/qbt/geolocations` | BATCH | Paginated Loop | | X | | | | | | | |
| `/qbt/time-off-request` | BATCH | Create+add entries | | | | | | | X | | |
| `/qbt/validate-labor-exact` | BATCH | Multi-call parallel | | | | | X | X | | | |
| `/qbt/validate-labor-segments` | BATCH | 30-min segment check | | | | | | X | | | |
| `/qbt/export-timesheets-csv` | BATCH | Fetch+CSV write | | | | | X | | | | |
| `/geo/places/autocomplete` | SINGLE | Single Google Maps | | | X | | | | | | |
| `/geo/places/details` | SINGLE | Single Google Maps | | | X | | | | | | |
| `/ai/claude/extract-json` | SINGLE | Single AI call | | | | | X | | | | |
| `/batch/*` (8 routes) | BATCH | Session System | | X | | | | | | | |
| All others (~125) | various | various | | | | | | | | | |

**Legend:** PExp=Project_Exp, TS=TS_Latest, Bind=Binder_Exp, DocE=BB-DocEngine, Rev5=RevExp5, InvV2=Invoice_Validate2, Cal5=CalExp5, Chase=Chase_Expense_Validator, eSign=Adobe eSigner

---

*Research sources: [Intuit Developer Docs](https://developer.intuit.com), [QBO Batch API](https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/batch), [QBO CDC](https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/change-data-capture), [QBO Webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks), [QBT API Reference](https://tsheetsteam.github.io/api_docs/), [API Rate Limits](https://help.developer.intuit.com/s/article/API-call-limits-and-throttling), [CloudEvents Migration (Nov 2025)](https://blogs.intuit.com/2025/11/12/upcoming-change-to-webhooks-payload-structure/), [Refresh Token Policy (Nov 2025)](https://blogs.intuit.com/2025/11/12/important-changes-to-refresh-token-policy/)*

---

## 9. CONSUMED ROUTES × SPEED CLASSIFICATION (Detailed)

> **v1.2:** Every consumed route mapped against the speed classification from BB_API_BRIDGE_ROUTE_CLASSIFICATION.

### 9.1 Speed Breakdown of Consumed Routes

```
CONSUMED ROUTES BY SPEED CLASS        COUNT    % OF CONSUMED
════════════════════════════════      ═════    ═════════════
SUPER FAST ⚡  (health, status, stubs)   7       12%
SINGLE 🎯     (one external API call)  31       53%
BATCH 📦      (multi-call, loops)      21       36%
                                       ──       ───
TOTAL CONSUMED                         59      100%
```

**Compare to overall bridge:**
```
CLASS          ALL 184 ROUTES    59 CONSUMED    CONSUMPTION RATE
═══════════    ══════════════    ═══════════    ════════════════
SUPER FAST       68 (37%)         7 (12%)       10% consumed
SINGLE           76 (41%)        31 (53%)       41% consumed
BATCH            40 (22%)        21 (36%)       53% consumed
```

**Key insight:** BATCH routes are consumed at 2× the rate of SINGLE routes (53% vs 41%), and 5× the rate of SUPER FAST routes (53% vs 10%). The complex multi-call routes that took the most effort to build are the ones most actively used. The 68 SUPER FAST routes (settings, files, caching) are almost entirely internal infrastructure — only health/status are consumed.

### 9.2 SUPER FAST ⚡ — 7 Consumed Routes

| Route | Latency | Consumer(s) | Purpose | Cloud Impact |
|-------|---------|-------------|---------|-------------|
| `/health` | <5ms | PExp, DocE | Uptime + timestamp | +100ms hop (3× slower but still <150ms) |
| `/api/health` | <5ms | InvV2, Chase | Same handler, `/api/` prefix | Same |
| `/qbo/status` | <10ms | TS, PExp, DocE | In-memory QBO client status | Same |
| `/qbo/test` | <10ms* | TS | Check QBO API key validity | *Actually hits QBO API = SINGLE |
| `/qbt/test` | <10ms* | TS | Check QBT API key validity | *Actually hits QBT API = SINGLE |
| `/batch/health` | <5ms | TS | Batch system + Redis status | Same |
| `/qbt/validate-labor-segments` | <5ms | InvV2 | **Stub** — returns redirect msg | N/A (stub) |

> **Note:** `/qbo/test` and `/qbt/test` are classified SUPER FAST in the route doc because they're connection checks, but they actually make 1 external API call each. Functionally they're SINGLE speed.

**61 SUPER FAST routes with ZERO consumers:** Settings (11), File ops (7), Status for AI/Geo/OSRM (8), Docs (3), Receipts (4), Cache (6), Mapping (2), Logs (2), other health variants.

### 9.3 SINGLE 🎯 — 31 Consumed Routes

#### QBO SINGLE routes (22 consumed)

| Route | Latency | Consumer(s) | What It Does |
|-------|---------|-------------|-------------|
| `/qbo/customers` | 200-500ms | TS, PExp, DocE, Binder | List active customers |
| `/api/qbo/customers` | 200-500ms | PExp*, DocE* (TM_agreement) | Same, with `/api/` prefix |
| `/qbo/customers/search` | 200-500ms | PExp, DocE | Search by name fragment |
| `/api/qbo/customers/search` | 200-500ms | Binder | Same, with `/api/` prefix |
| `/qbo/Customer/{id}` | 200-500ms | PExp (5×), DocE (6×) | Get single customer by QBO ID |
| `/qbo/Customer` (create) | 300-1000ms | PExp, DocE | Create new customer |
| `/qbo/Customer/update` | 300-1000ms | PExp (3×), DocE (3×) | Update existing customer |
| `/qbo/list/Customer` | 200-500ms | TS | Generic entity list (Customer) |
| `/qbo/list/Employee` | 200-500ms | TS | Generic entity list (Employee) |
| `/qbo/list/Invoice` | 200-500ms | TS | Generic entity list (Invoice) |
| `/qbo/list/Vendor` | 200-500ms | TS | Generic entity list (Vendor) |
| `/qbo/list/{entityType}` | 200-500ms | PExp, TS, DocE | Generic entity list (any type) |
| `/qbo/list/vendors` | 200-500ms | PExp, DocE | Dedicated vendor list |
| `/qbo/employees` | 200-500ms | TS | Dedicated employee list |
| `/qbo/invoices` | 200-500ms | TS | Dedicated invoice list |
| `/qbo/query` | 200-500ms | TS, PExp, DocE | Generic QBO SQL query |
| `/api/qbo/query` | 200-500ms | RevExp5 | Same, with `/api/` prefix |
| `/qbo/refresh` | 200-500ms | TS | Refresh OAuth token |
| `/qbo/refresh-token` | 200-500ms | TS | Refresh OAuth (alternate) |
| `/qbo/timeactivity` | 200-1000ms | TS (POST/PUT/DEL) | TimeActivity CRUD |
| `/qbo/attachment-upload-smart` | 500ms-2s | PExp, DocE | Upload with content-type detect |
| `/qbo/attachment-fetch` | 500ms-2s | RevExp5, Chase | Download attachment blob |
| `/qbo/invoice/by-docnumber` | 200-500ms | RevExp5 | Get invoice by doc# |
| `/qbo/invoice/pdf` | 500ms-2s | RevExp5 | Download invoice PDF |

#### QBT SINGLE routes (5 consumed)

| Route | Latency | Consumer(s) | What It Does |
|-------|---------|-------------|-------------|
| `/qbt/users` | 200-500ms | TS, CalExp5 | Fetch all users |
| `/qbt/jobcodes` | 200-500ms | TS, CalExp5 | Fetch all jobcodes |
| `/qbt/timesheets` | 200-500ms | TS, CalExp5 | Fetch timesheets (1 page) |
| `/qbt/timesheet` | 200-500ms | TS (POST/PUT/DEL), CalExp5 (POST/PUT) | Single timesheet CRUD |

#### Geo + AI SINGLE routes (3 consumed)

| Route | Latency | Consumer(s) | What It Does |
|-------|---------|-------------|-------------|
| `/geo/places/autocomplete` | 200-500ms | Binder | Address autocomplete |
| `/geo/places/details` | 200-500ms | Binder | Place details |
| `/ai/claude/extract-json` | 2s+ | RevExp5 | AI JSON extraction |

**45 SINGLE routes with ZERO consumers:** QBO (vendors, items, accounts, purchases, billable, payroll, terms, prefs, transaction-detail, transaction-lines, etc.), QBT (payroll, current-totals, locations, jobcode update, refresh-token), AI (7 routes), Geo (geocode, reverse, directions, distance-matrix, Vision 4, OSRM 4), Legacy (4).

### 9.4 BATCH 📦 — 21 Consumed Routes

| Route | Latency | # API Calls | Consumer(s) | What It Does |
|-------|---------|-------------|-------------|-------------|
| `/qbo/timeactivity/query` | 500ms-2s | 1-5 pages | TS | Paginated TimeActivity query |
| `/qbo/timeactivity/all` | 2s+ | N pages | RevExp5 | ALL TimeActivity (auto-paginate) |
| `/qbo/invoices-enriched` | 500ms-2s | 3 parallel | RevExp5 | Invoices + Payments + Attachables |
| `/qbo/invoices/batch-in` | 500ms-2s | 1 (large IN) | RevExp5 | N invoices via IN clause |
| `/qbo/reference-data` | 500ms-2s | 5 parallel | PExp, DocE | Account+Vendor+Item+Customer+Class |
| `/qbo/recon-enhanced` | 2s+ | 9-15 | RevExp5, InvV2 | Enhanced reconciliation queries |
| `/qbo/reconciliation-status` | 500ms-2s | 3 parallel | InvV2 (legacy) | 3 TransactionList reports |
| `/qbo/chase-reconciliation` | 2s+ | 3-5 | Chase | Purchases/Bills + Attachables |
| `/qbo/bill-reconciliation` | 500ms-2s | 2 parallel | Chase | Bills IN + Attachables + matching |
| `/qbo/validate-labor-exact` | 500ms-2s | 2 | RevExp5, InvV2 | Employee+TimeActivity IN query |
| `/qbt/validate-labor-exact` | 2s+ | 3+ paged | RevExp5, InvV2 | Users+Jobcodes+paginated Timesheets |
| `/qbt/validate-labor` | 500ms-2s | 2 sequential | InvV2 (legacy) | Users + Timesheets + matching |
| `/qbt/time-off-request` | 500ms-2s | 2 sequential | CalExp5 | Create request + add entries |
| `/qbt/export-timesheets-csv` | 500ms-2s | 1 + filesystem | RevExp5 | QBT fetch + CSV write |
| `/qbt/geolocations` | 2s+ | N pages | TS | ALL geolocations (auto-paginate) |
| `/batch/sessions` | 500ms-2s | 1 | TS | Create/list batch sessions |
| `/batch/sessions/{id}` | <500ms | 1 | TS | Get session status |
| `/batch/sessions/{id}/command` | 500ms-2s | 1 | TS | Send command (start/proceed/skip) |
| `/batch/sessions/{id}/results` | <500ms | 1 | TS | Get session results |
| `/batch/sessions/{id}/audit` | <500ms | 1 | TS | Get session audit log |
| `/ws/batch/{id}` | persistent | WebSocket | TS | Real-time batch updates |

**19 BATCH routes with ZERO consumers:** reconcile-unbilled, export-labor-csv, invoices/batch (3 variants), purchases/process-batch, purchase/convert-to-item-based, invoices/batch-api, invoices/batch-hybrid, employee/details, check-cleared-status, transactions-with-links, geocode/batch, mileage/batch, estimator/export-excel, qbt/employee-dashboard, qbt/crew-calendar, test, test/rate-limit, health-check.

---

## 10. DUPLICATE & NEAR-DUPLICATE ROUTES (Standardization Opportunities)

### 10.1 Summary

```
DUPLICATION TYPE                   ROUTE PAIRS    WASTED ROUTES    EFFORT TO FIX
═══════════════                    ═══════════    ═════════════    ═════════════
/api/ prefix inconsistency         6 pairs        6 extra routes   LOW (alias)
GET/POST alias inflation           12+ pairs      12+ routes       NONE (leave)
Same data, different routes        4 groups       8-10 wasted      MEDIUM
Legacy → current superseded        3 pairs        3 dead routes    LOW (remove)
                                                  ──────────
                                                  ~29 routes could consolidate to ~15
```

### 10.2 CRITICAL: `/api/` Prefix Split

The bridge mounts routes BOTH with and without `/api/` prefix. Different consumers use different prefixes for the **exact same handler**:

| Without `/api/` | With `/api/` | Same Handler? | Who Uses Which |
|-----------------|-------------|---------------|----------------|
| `/health` | `/api/health` | YES | PExp,DocE vs InvV2,Chase |
| `/qbo/customers` | `/api/qbo/customers` | YES | TS,PExp,DocE vs PExp*,DocE*,Binder |
| `/qbo/customers/search` | `/api/qbo/customers/search` | YES | PExp,DocE vs Binder |
| `/qbo/query` | `/api/qbo/query` | YES | TS,PExp,DocE vs RevExp5 |
| `/qbo/attachment-fetch` | `/api/qbo/attachment-fetch` | YES | — vs RevExp5,Chase |
| `/qbt/validate-labor-exact` | `/api/qbt/validate-labor-exact` | YES | — vs RevExp5,InvV2 |

**Pattern:** Server-side apps (TS, PExp, DocE) use NO prefix. Chrome extensions + newer apps (InvV2, Chase, RevExp5, Binder) use `/api/` prefix.

**Recommendation:** Standardize on `/api/` prefix (it's the conventional REST pattern). Keep non-prefixed as aliases for backward compatibility but deprecate for new code.

### 10.3 CRITICAL: 7 Ways to Get Customer Data

This is the biggest duplication problem. There are **7 distinct routes** that return QBO customer data:

| Route | Method | What It Returns | Consumers |
|-------|--------|----------------|-----------|
| `/qbo/customers` | POST | All active customers | TS, PExp, DocE |
| `/api/qbo/customers` | POST | Same (alias) | PExp*, DocE* |
| `/api/qbo/customers` | GET | Same (alias) | Binder |
| `/qbo/customers/search` | GET | Filtered by name | PExp, DocE |
| `/api/qbo/customers/search` | GET | Same (alias) | Binder |
| `/qbo/list/Customer` | GET/POST | Same (generic route) | TS |
| `/qbo/list/{entityType}` | GET | Same when type=Customer | PExp, TS, DocE |

**TS_Latest calls BOTH `/qbo/customers` AND `/qbo/list/Customer`** — identical result, two calls.

**Recommendation:** Consolidate to 2 routes: `/api/qbo/customers` (list all) and `/api/qbo/customers/search?q=` (search). Deprecate `/qbo/list/Customer` and direct-name variants.

### 10.4 CRITICAL: Entity List Duplication (TS_Latest)

TS_Latest uses **BOTH** dedicated and generic routes for the same entity types:

| Dedicated Route | Generic Route | Same Result? | Both Used by TS? |
|----------------|--------------|-------------|-------------------|
| `/qbo/employees` | `/qbo/list/Employee` | YES | **YES** — both in codebase |
| `/qbo/invoices` | `/qbo/list/Invoice` | YES | **YES** — both in codebase |
| `/qbo/customers` | `/qbo/list/Customer` | YES | **YES** — both in codebase |
| `/qbo/vendors` (unused) | `/qbo/list/Vendor` | YES | TS uses generic only |
| — | `/qbo/list/vendors` (lowercase) | YES | PExp, DocE use this |

**TS_Latest has 6 routes to get 4 entity types.** Could be 4 (one per type) or even 1 (`/qbo/list/:entityType`).

**Recommendation:** Pick one pattern. The generic `/qbo/list/:entityType` is already the most flexible — retire the dedicated per-entity routes.

### 10.5 Token Refresh Duplication

| Route | Method | Consumer | Handler |
|-------|--------|----------|---------|
| `/qbo/refresh` | GET | TS (settings-module.js) | Same refresh logic |
| `/qbo/refresh` | POST | TS (qbo-client.js) | Same |
| `/qbo/refresh-token` | POST | TS (http-client.js) | Same |

**3 routes, all called by TS_Latest, all doing the same thing.** Different files in TS_Latest call different refresh endpoints.

**Recommendation:** Consolidate to 1: `POST /api/qbo/refresh`. Update all TS_Latest callers.

### 10.6 Legacy Routes Still in Use

| Legacy Route | Current Route | Who Still Uses Legacy |
|-------------|--------------|----------------------|
| `/qbo/reconciliation-status` | `/qbo/recon-enhanced` | InvV2 (archive only) |
| `/qbt/validate-labor` | `/qbt/validate-labor-exact` | InvV2 (archive only) |
| `/qbt/validate-labor-segments` (stub) | N/A (redirects) | InvV2 (active!) |

**InvV2's `content-v58.js` calls `/qbt/validate-labor-segments`** which is a STUB that returns a redirect message. This means InvV2 is hitting a dead endpoint on every modal open (600ms auto-fire).

**Recommendation:** Either implement the segments handler properly or remove the call from InvV2.

### 10.7 GET/POST Alias Inflation

The bridge mounts both GET and POST for nearly every route. This inflates the route count from 184 → ~100 unique handlers:

```
ALIAS PATTERN                ROUTES    UNIQUE HANDLERS
══════════════               ══════    ═══════════════
GET + POST (same handler)    ~84       ~42
POST only                    ~60       ~60
GET only                     ~30       ~30
PUT / DELETE                 ~10       ~10
                             ───       ───
TOTAL                        184       ~142
```

**This isn't a problem to fix** — it's just HTTP flexibility. But it means the "184 routes" number overstates complexity. There are really ~142 unique handlers.

---

## 11. STANDARDIZATION ROADMAP

### Phase 1: Zero-Risk Cleanup (1-2 hours)

| Action | Routes Affected | Consumer Impact |
|--------|----------------|-----------------|
| Remove 3 legacy routes from bridge | `/qbo/reconciliation-status`, `/qbt/validate-labor`, `/qbt/validate-labor-segments` (stub) | InvV2 archive only (confirm v58 doesn't call legacy) |
| Fix InvV2 segments stub | 1 route | InvV2 stops hitting dead endpoint |

### Phase 2: Prefix Standardization — Consumer Side (3-4 hours)

| Action | Files Changed | Risk |
|--------|--------------|------|
| Standardize all new code to use `/api/` prefix | Style guide only | ZERO (aliases still work) |
| Add deprecation log to non-prefixed routes in bridge | 1 middleware file | LOW (warning only) |

### Phase 3: TS_Latest Route Consolidation (4-6 hours)

| Action | Current | After | Files Changed |
|--------|---------|-------|---------------|
| Use `/qbo/list/:entityType` everywhere | 6 routes (dedicated + generic) | 1 generic route | qbo-client.js, http-client.js, settings-module.js |
| Use `POST /api/qbo/refresh` everywhere | 3 refresh routes | 1 route | qbo-client.js, http-client.js, settings-module.js |

### Phase 4: Customer Route Consolidation — All Projects (6-8 hours)

| Action | Current | After | Projects Affected |
|--------|---------|-------|-------------------|
| Standardize on `/api/qbo/customers` + `/api/qbo/customers/search` | 7 customer routes | 2 routes | PExp, DocE, TS, Binder |
| Route `property.js` and `client.js` through server proxy | 11 hardcoded calls | 0 hardcoded | PExp, DocE |

### Phase 5: Cross-Project Service Layer (8-12 hours, optional)

Create a shared `bb-bridge-client` npm package:
```
bb-bridge-client/
  index.js          → BridgeClient class
  qbo.js            → QBO methods (customers, invoices, timeactivity, etc.)
  qbt.js            → QBT methods (users, jobcodes, timesheets, etc.)
  health.js         → Health/status methods
```

**Benefits:**
- One URL config, one error handling pattern, one retry policy
- Type-safe methods instead of raw fetch URLs
- Automatic `/api/` prefix
- Projects consume: `const bridge = new BridgeClient(process.env.BRIDGE_URL)`

**Who benefits most:** PExp and DocE (already share `qbo-service-v3.js` — this is the natural evolution).

### Impact Summary

```
                    BEFORE          AFTER PHASE 4     SAVINGS
                    ═══════         ═══════════════   ═══════
Unique consumed      59 routes       ~44 routes        -25%
Customer routes       7               2                -71%
Entity list routes    7               1 (generic)      -86%
Refresh routes        3               1                -67%
Legacy dead routes    3               0                -100%
Hardcoded localhost  19 calls         0                -100%
```

---

*Companion docs: BB_API_BRIDGE_CONSUMER_CATALOGUE v1.0 (full per-project inventories) | BB_API_BRIDGE_CLOUD_MIGRATION v1.4 | BB_MICRO_BRIDGE_ARCHITECTURE v1.0 | BB_API_BRIDGE_ROUTE_CLASSIFICATION v1.0 | BB_API_BRIDGE_AUDIT v1.1*
