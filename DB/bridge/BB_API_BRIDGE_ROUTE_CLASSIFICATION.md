# Mini_API_Bridge Route Classification | v1.0 | 2026-03-01 | BB

---

## OVERVIEW

```
                    ROUTE CLASSIFICATION
                    ════════════════════

  SUPER FAST ⚡     ████████████████████████████████████   68  (37%)
  SINGLE 🎯         ██████████████████████████████████████  76  (41%)
  BATCH 📦          ████████████████████████                40  (22%)
                    ────────────────────────────────────
  TOTAL                                                    184 (100%)
```

| Category | Count | What it means | Latency |
|----------|-------|---------------|---------|
| **SUPER FAST** ⚡ | 68 | In-memory, filesystem, cache, zero network I/O | <50ms |
| **SINGLE** 🎯 | 76 | One external API call per request | 50ms–2s+ |
| **BATCH** 📦 | 40 | Multiple API calls, loops, aggregation | 500ms–8s+ |

**Key insight:** 37% of routes need zero network I/O — they respond instantly from memory or local disk.

---

## SUPER FAST ⚡ (68 routes) — <50ms, zero external calls

### Health & Status (8)
| Method | Path | What it does |
|--------|------|-------------|
| GET | `/health` | Uptime + timestamp from in-memory startTime |
| GET | `/status` | In-memory connection statuses + rate-limit settings |
| GET | `/metrics` | Performance metrics from in-memory logger |
| GET | `/logs` | In-memory request log buffer |
| DELETE | `/logs` | Clears in-memory log buffer |
| GET | `/docs` | All API doc summaries (in-memory) |
| GET | `/docs/search` | Searches in-memory docs |
| GET | `/docs/:api` | Specific API docs (in-memory) |

### Connection Status (12) — all in-memory object reads
| Method | Path | Service |
|--------|------|---------|
| GET | `/qbo/status` | QBO client status |
| POST | `/qbo/status` | (POST alias) |
| GET | `/qbt/status` | QBT client status |
| POST | `/qbt/status` | (POST alias) |
| GET | `/ai/claude/status` | Claude client status |
| GET | `/ai/claude/models` | Available Claude models |
| GET | `/ai/openai/status` | OpenAI client status |
| GET | `/ai/openai/models` | Available OpenAI models |
| GET | `/geo/maps/status` | Google Maps status |
| GET | `/geo/vision/status` | Google Vision status |
| GET | `/geo/vision/features` | Vision feature list |
| GET | `/geo/osrm/status` | OSRM status |
| GET | `/geo/osrm/profiles` | OSRM routing profiles |

### Settings & Config (11) — filesystem reads/writes
| Method | Path | What it does |
|--------|------|-------------|
| GET | `/settings` | Returns in-memory appSettings |
| POST | `/settings` | Merges body into in-memory appSettings |
| POST | `/settings/validate-path` | `fs.existsSync` check |
| POST | `/settings/load-file` | Read file from disk |
| POST | `/settings/save-file` | Write file to disk |
| GET | `/load-settings` | Read JSON from data/ dir |
| POST | `/load-settings` | (POST alias) |
| POST | `/save-settings` | Write JSON to data/ with daily backup |
| GET | `/list-settings` | List JSON files in data/ |
| POST | `/list-settings` | (POST alias) |
| GET | `/lunch-audit` | Read lunch-publish-audit.json |

### File Operations (7) — local filesystem
| Method | Path | What it does |
|--------|------|-------------|
| POST | `/file/read` | Read file from disk |
| POST | `/file/write` | Write file to disk |
| GET | `/read-file` | Read file via GET query param |
| GET | `/load-aliases` | Read config/aliases.json |
| POST | `/validate-path` | `fs.existsSync` (legacy alias) |
| POST | `/save-file` | Write file (legacy alias) |
| POST | `/load-file` | Read file (legacy alias) |

### Receipts & Matching (4) — filesystem + in-memory
| Method | Path | What it does |
|--------|------|-------------|
| POST | `/receipts/scan` | List image/PDF files in folder |
| POST | `/receipts/rename` | Rename a file on disk |
| POST | `/receipts/match` | In-memory amount/date matching |
| GET | `/receipts/preview` | Stream file content to response |

### Cache & Mapping (6) — pure in-memory
| Method | Path | What it does |
|--------|------|-------------|
| POST | `/geo/cache/clear` | Clear geocode cache |
| GET | `/geocode/cache-stats` | Cache size |
| POST | `/geocode/cache-clear` | Clear cache (legacy) |
| GET | `/mileage/status` | Static config (rate per mile) |
| GET | `/mapping/account-item` | Return in-memory Map |
| POST | `/mapping/account-item` | Store mapping in-memory Map |

### Other (2)
| Method | Path | What it does |
|--------|------|-------------|
| GET | `/estimator/status` | Check if exporter script exists on disk |
| POST | `/qbt/validate-labor-segments` | Stub — returns redirect message |

---

## SINGLE 🎯 (76 routes) — one external API call per request

### QBO Core CRUD (14) — single QBO API call each
| Method | Path | External | Latency |
|--------|------|----------|---------|
| GET | `/qbo/test` | QBO API | 200-500ms |
| POST | `/qbo/test` | QBO API | 200-500ms |
| GET | `/qbo/company` | QBO API | 200-500ms |
| POST | `/qbo/company` | QBO API | 200-500ms |
| GET | `/qbo/query` | QBO API | 200-500ms |
| POST | `/qbo/query` | QBO API | 200-500ms |
| GET | `/qbo/list/:entityType` | QBO API | 200-500ms |
| POST | `/qbo/list/:entityType` | QBO API | 200-500ms |
| GET | `/qbo/refresh` | QBO Token | 200-500ms |
| POST | `/qbo/refresh` | QBO Token | 200-500ms |
| POST | `/qbo/refresh-token` | QBO Token | 200-500ms |
| GET | `/qbo/:entity/:id` | QBO API | 200-500ms |
| POST | `/qbo/:entity` | QBO API | 200-500ms |
| POST | `/qbo/:entity/update` | QBO API | 200-500ms |
| DELETE | `/qbo/:entity/:id` | QBO API | 200-500ms |

### QBO Extended — single operations (16)
| Method | Path | What | Latency |
|--------|------|------|---------|
| POST | `/qbo/invoice` | Get invoice by ID | 200-500ms |
| POST | `/qbo/invoice/by-docnumber` | Get invoice by doc# | 200-500ms |
| POST | `/qbo/invoice/pdf` | Download invoice PDF | 500ms-2s |
| GET | `/qbo/invoice/:id/attachments` | Get invoice attachments | 200-500ms |
| POST | `/qbo/invoice/create` | Create invoice | 200-500ms |
| POST | `/qbo/timeactivity` | Create TimeActivity | 200-500ms |
| PUT | `/qbo/timeactivity` | Update TimeActivity | 200-500ms |
| DELETE | `/qbo/timeactivity` | Delete TimeActivity | 200-500ms |
| POST | `/qbo/bill` | Get Bill by ID/query | 200-500ms |
| POST | `/qbo/vendor` | Get/search Vendor | 200-500ms |
| POST | `/qbo/account` | Get/search Account | 200-500ms |
| POST | `/qbo/terms` | Get payment terms | 200-500ms |
| POST | `/qbo/preferences` | Get company prefs | 200-500ms |
| POST | `/qbo/employees` | List active employees | 200-500ms |
| POST | `/qbo/customers` | List active customers | 200-500ms |
| GET | `/qbo/customers/search` | Search customers by name | 200-500ms |
| POST | `/qbo/invoices` | List invoices (last 100) | 200-500ms |
| POST | `/qbo/vendors` | List all vendors | 200-500ms |
| POST | `/qbo/items` | List all items | 200-500ms |
| POST | `/qbo/accounts` | List all accounts | 200-500ms |

### QBO Advanced — single operations (10)
| Method | Path | What | Latency |
|--------|------|------|---------|
| POST | `/qbo/transaction-detail` | Single transaction by type+ID | 200-500ms |
| POST | `/qbo/transaction-lines` | Line items for one transaction | 200-500ms |
| POST | `/qbo/query-transactions` | Single typed query with dates | 200-500ms |
| POST | `/qbo/attachables` | Query Attachable entities | 200-500ms |
| POST | `/qbo/attachment-download` | Attachment metadata by ID | 200-500ms |
| POST | `/qbo/attachment-fetch` | Download actual file content | 500ms-2s |
| POST | `/qbo/attachment-delete` | Delete attachment | 200-500ms |
| POST | `/qbo/attachment-upload` | Upload file attachment | 500ms-2s |
| POST | `/qbo/attachment-upload-smart` | Upload with content-type detect | 500ms-2s |
| POST | `/qbo/purchases/unprocessed` | Query Purchases in date range | 200-500ms |
| POST | `/qbo/purchase/process` | Update single Purchase | 200-500ms |
| POST | `/qbo/billable-items` | Billable TimeActivity for customer | 200-500ms |
| POST | `/qbo/mileage-reimbursement` | Create mileage Bill | 200-500ms |
| POST | `/qbo/timeactivity-payroll` | TimeActivity payroll query | 200-500ms |

### QBT Core (11) — single QBT API call each
| Method | Path | What | Latency |
|--------|------|------|---------|
| GET | `/qbt/test` | Test QBT connection | 200-500ms |
| POST | `/qbt/test` | (POST alias) | 200-500ms |
| GET | `/qbt/timesheets` | Fetch timesheets (1 page) | 200-500ms |
| POST | `/qbt/timesheets` | (POST alias) | 200-500ms |
| GET | `/qbt/users` | Fetch users | 200-500ms |
| POST | `/qbt/users` | (POST alias) | 200-500ms |
| GET | `/qbt/jobcodes` | Fetch jobcodes | 200-500ms |
| POST | `/qbt/jobcodes` | (POST alias) | 200-500ms |
| GET | `/qbt/payroll` | Payroll report | 500ms-2s |
| POST | `/qbt/payroll` | (POST alias) | 500ms-2s |
| GET | `/qbt/current-totals` | Who's on the clock | 200-500ms |
| POST | `/qbt/current-totals` | (POST alias) | 200-500ms |
| POST | `/qbt/refresh-token` | Refresh QBT OAuth | 200-500ms |

### QBT Extended — single operations (5)
| Method | Path | What | Latency |
|--------|------|------|---------|
| PUT | `/qbt/jobcode` | Update jobcode | 200-500ms |
| POST | `/qbt/locations` | Fetch locations | 200-500ms |
| POST | `/qbt/timesheet` | Create timesheet | 200-500ms |
| PUT | `/qbt/timesheet` | Update timesheet | 200-500ms |
| DELETE | `/qbt/timesheet` | Delete timesheet | 200-500ms |

### AI Routes (8) — one LLM call each
| Method | Path | Service | Latency |
|--------|------|---------|---------|
| GET | `/ai/claude/test` | Claude API | 2s+ |
| POST | `/ai/claude/chat` | Claude API | 2s+ |
| POST | `/ai/claude/analyze-image` | Claude Vision | 2s+ |
| POST | `/ai/claude/extract-json` | Claude API | 2s+ |
| GET | `/ai/openai/test` | OpenAI API | 2s+ |
| POST | `/ai/openai/chat` | OpenAI API | 2s+ |
| POST | `/ai/openai/analyze-image` | OpenAI Vision | 2s+ |
| POST | `/ai/openai/embedding` | OpenAI API | 500ms-2s |
| POST | `/ai/openai/extract-json` | OpenAI API | 2s+ |

### Geo — Google Maps (6)
| Method | Path | What | Latency |
|--------|------|------|---------|
| GET | `/geo/maps/test` | Test geocode | 200-500ms |
| GET | `/geo/geocode` | Geocode address (cached) | 50-200ms |
| GET | `/geo/reverse` | Reverse geocode | 200-500ms |
| POST | `/geo/directions` | Driving directions | 200-500ms |
| POST | `/geo/distance-matrix` | Distance matrix | 200-500ms |
| GET | `/geo/places/autocomplete` | Address autocomplete | 200-500ms |
| GET | `/geo/places/details` | Place details | 200-500ms |

### Geo — Vision (4)
| Method | Path | What | Latency |
|--------|------|------|---------|
| GET | `/geo/vision/test` | Test Vision API | 200-500ms |
| POST | `/geo/vision/ocr` | OCR image | 500ms-2s |
| POST | `/geo/vision/document` | Analyze document | 500ms-2s |
| POST | `/geo/vision/labels` | Detect labels | 200-500ms |
| POST | `/geo/vision/logos` | Detect logos | 200-500ms |

### Geo — OSRM (4)
| Method | Path | What | Latency |
|--------|------|------|---------|
| GET | `/geo/osrm/test` | Test OSRM | 50-200ms |
| POST | `/geo/osrm/route` | Get route | 50-200ms |
| POST | `/geo/osrm/table` | Distance/duration matrix | 50-200ms |
| GET | `/geo/osrm/nearest` | Nearest road point | 50-200ms |

### Legacy (4)
| Method | Path | What | Latency |
|--------|------|------|---------|
| POST | `/geocode/test` | Test geocode | 200-500ms |
| POST | `/geocode/single` | Geocode address (cached) | 50-200ms |
| POST | `/mileage/calculate` | Distance Matrix | 200-500ms |
| POST | `/mileage/compare` | Distance Matrix (stub) | 200-500ms |

### Agent Routes (2)
| Method | Path | What | Latency |
|--------|------|------|---------|
| POST | `/doc-agent/extract` | Claude structured extraction | 2s+ |
| POST | `/receipt-agent/analyze` | Claude receipt extraction | 2s+ |

---

## BATCH 📦 (40 routes) — multiple API calls, loops, aggregation

### Heaviest (2s+ typical) — 12 routes
| Method | Path | What it does | # API Calls |
|--------|------|-------------|-------------|
| GET | `/test` | Tests ALL configured APIs simultaneously | 5+ parallel |
| POST | `/test/rate-limit` | Fires N self-requests for stress test | N |
| GET | `/health-check` | Full multi-service health sweep | 3-5 parallel |
| GET | `/qbo/timeactivity/all` | Auto-paginate ALL TimeActivity (100/page loop) | N pages |
| POST | `/qbo/recon-enhanced` | 9+ parallel QBO transaction queries + lookups | 9-15 |
| POST | `/qbo/chase-reconciliation` | Paginated Purchases/Bills + all Attachables + matching | 3-5 |
| POST | `/qbo/invoices/batch` | N parallel invoice fetches with retry/backoff | N |
| POST | `/qbo/invoices/batch-sequential` | N sequential invoice fetches | N |
| POST | `/qbt/validate-labor-exact` | Users + Jobcodes + paginated Timesheets → hierarchy matching | 3+ paged |
| POST | `/geocode/batch` | N sequential geocodes (100ms rate-limited) | N |
| POST | `/mileage/batch` | N sequential Distance Matrix calls (100ms rate-limited) | N |
| POST | `/estimator/export-excel` | JSON → child_process → .xlsx file generation | 0 (CPU) |

### Medium (500ms–2s typical) — 28 routes
| Method | Path | What it does | # API Calls |
|--------|------|-------------|-------------|
| POST | `/qbo/timeactivity/query` | Paginated TimeActivity loop | 1-5 pages |
| POST | `/qbo/invoices-enriched` | Invoices + Payments + Attachables | 3 parallel |
| POST | `/qbo/reconcile-unbilled` | Full-range TimeActivity scan | 1-3 |
| POST | `/qbo/export-labor-csv` | QBO query + CSV write | 1 + filesystem |
| POST | `/qbo/reconciliation-status` | 3 parallel report queries | 3 parallel |
| POST | `/qbo/check-cleared-status` | 3 parallel reports + matching | 3 parallel |
| POST | `/qbo/transactions-with-links` | N transaction type queries in parallel | 2-5 parallel |
| POST | `/qbo/reference-data` | Account + Vendor + Item + Customer + Class | 5 parallel |
| POST | `/qbo/purchases/process-batch` | N sequential Purchase updates | N |
| POST | `/qbo/purchase/convert-to-item-based` | Fetch → Update → Verify | 3 sequential |
| POST | `/qbo/bill-reconciliation` | Bills IN clause + Attachables + matching | 2 parallel |
| POST | `/qbo/invoices/batch-in` | All invoices via IN clause | 1 (large) |
| POST | `/qbo/invoices/batch-api` | QBO Batch API (30/request chunks) | 1-3 |
| POST | `/qbo/invoices/batch-hybrid` | Batch API + IN clauses | 1 |
| POST | `/qbo/validate-labor-exact` | Employee + TimeActivity IN clause | 2 |
| POST | `/qbo/employee/details` | Employee + custom fields | 2 |
| POST | `/qbt/geolocations` | Auto-paginate ALL geolocations (200/page) | N pages |
| POST | `/qbt/validate-labor` | Users + Timesheets + matching | 2 sequential |
| POST | `/qbt/export-timesheets-csv` | QBT fetch + CSV write | 1 + filesystem |
| POST | `/qbt/employee-dashboard` | Users + TimeOff + Schedule | 3 parallel |
| POST | `/qbt/crew-calendar` | Users + TimeOff + Schedule | 2-3 parallel |
| POST | `/qbt/time-off-request` | Create request + add entries | 2 sequential |

---

## CLOUD MIGRATION IMPACT BY CATEGORY

This is the key insight for the cloud migration plan:

```
CATEGORY        LOCAL (localhost)    CLOUD (+100ms hop)    IMPACT
────────        ─────────────────    ──────────────────    ──────
SUPER FAST ⚡    <50ms               100-150ms             +100ms (NOTICEABLE)
SINGLE 🎯        200-500ms           300-600ms             +100ms (minor)
BATCH 📦          500ms-8s+           600ms-8s+             +100ms (negligible)
```

**SUPER FAST routes feel the cloud hop the most** — going from <50ms to ~150ms is a 3x slowdown in relative terms. But 150ms is still imperceptible to a human user.

**BATCH routes are dominated by external API latency** — the +100ms from the cloud hop is noise in a 2-8 second operation.

### What should change for cloud:

| Category | Recommendation |
|----------|---------------|
| **SUPER FAST** (68) | Consider caching status/config client-side for 30s. File ops (`/file/read`, `/file/write`) need redesign — they read SAM'S LOCAL DISK, which won't exist in the cloud. |
| **SINGLE** (76) | No change needed. External API latency dominates. |
| **BATCH** (40) | No change needed. Could add progress WebSocket for the heaviest operations. |

### File/Filesystem Routes — CLOUD BLOCKERS

These 20 routes assume local filesystem access and **WILL BREAK** in cloud:

| # | Path | What it reads/writes |
|---|------|---------------------|
| 1 | `/settings/load-file` | Arbitrary file path |
| 2 | `/settings/save-file` | Arbitrary file path |
| 3 | `/settings/validate-path` | `fs.existsSync` on local path |
| 4 | `/file/read` | Arbitrary file path |
| 5 | `/file/write` | Arbitrary file path |
| 6 | `/read-file` | Arbitrary file path via GET |
| 7 | `/load-aliases` | `config/aliases.json` |
| 8 | `/validate-path` | `fs.existsSync` (legacy) |
| 9 | `/save-file` | Arbitrary file (legacy) |
| 10 | `/load-file` | Arbitrary file (legacy) |
| 11 | `/load-settings` | JSON from `data/` dir |
| 12 | `/save-settings` | JSON to `data/` dir |
| 13 | `/list-settings` | List `data/` dir |
| 14 | `/lunch-audit` | Specific JSON from `Publish/` |
| 15 | `/receipts/scan` | List image/PDFs in folder |
| 16 | `/receipts/rename` | Rename file on disk |
| 17 | `/receipts/preview` | Stream file content |
| 18 | `/estimator/status` | Check if script exists |
| 19 | `/estimator/export-excel` | Write .xlsx via child_process |
| 20 | `/mapping/account-item` (POST) | Persists to in-memory Map only (lost on restart) |

**These 20 routes (11% of total) are the cloud migration's hardest problem.** All other routes work identically in cloud because they only call external APIs.

---

## EXTERNAL SERVICE DEPENDENCY MAP

```
                    ROUTES BY EXTERNAL SERVICE
                    ══════════════════════════

  None (local)      ████████████████████████████████████   68  (37%)
  QBO API           ██████████████████████████████████████  72  (39%)
  QBT API           ███████████████████                    28  (15%)
  Google Maps       ████████████                           18  (10%)
  Google Vision     ███████                                 7   (4%)
  Claude API        ████████                                8   (4%)
  OpenAI API        ███████                                 7   (4%)
  OSRM              ██████                                  6   (3%)
  Filesystem only   █████████████                          20  (11%)
```

(Some routes touch multiple services — totals exceed 184)

---

*Classification based on handler code analysis of all 84 active files in `C:\Users\samjo\Desktop\Mini_API_Bridge\server\`.*
*Post-cleanup codebase: 27,057 lines across 84 files.*
