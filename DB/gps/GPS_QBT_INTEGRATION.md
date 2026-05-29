# GPS → QBT Integration Guide
## 2026-03-27 | Proven End-to-End | BB

---

## Architecture Overview

```
Overland (crew phones) ──→ Bridge ingest ──→ Neon (cal_gps_points)
OBD (truck devices) ────→ Traccar ────────→ Neon (cal_gps_points)
                                                    │
                                          DBSCAN reconstruction
                                                    │
                                          Draft timesheets (cal_draft_timesheets)
                                                    │
                                          OSRM road-snap (mileage)
                                                    │
                              ┌──────────────────────┼──────────────────────┐
                              │                      │                      │
                    Upload geolocations     Upload timesheets      Set mileage
                    POST /geolocations      POST /timesheets       PUT /distance_tracking
                              │                      │                      │
                              └──────────────────────┼──────────────────────┘
                                                     │
                                                    QBT
                                              (map + payroll)
```

---

## QBT API Endpoints Used

### 1. Timesheets: `POST /api/v1/timesheets`

Creates timesheet entries. Required for geolocations to attach to.

```javascript
{
  data: [{
    user_id: 2866540,           // QBT numeric user ID (NOT internal EMP-xxx)
    jobcode_id: 176321744,       // QBT jobcode ID
    type: 'regular',
    start: '2026-03-25T07:00:00-07:00',
    end: '2026-03-25T16:00:00-07:00',
    notes: 'Auto-generated from GPS',
    customfields: {
      '1136266': 'Labor',        // Service Item (required)
      '1992560': 'Yes'           // Billable (required)
    }
  }]
}
```

**Key constraints:**
- `end` is required (cannot create on-the-clock via API with `end: ""` unless `start` is current/past time)
- Cannot create future timesheets
- Cannot overlap existing timesheets for same user
- Approved/locked pay periods reject new entries
- Custom fields `1136266` (Service Item) and `1992560` (Billable) are REQUIRED for BB

**Clock-in via API:** Send `end: ""` with a current-time `start`. Sets `on_the_clock: true`, `location: "Tracking"`.

### 2. Geolocations: `POST /api/v1/geolocations`

Uploads GPS points that appear on QBT's timesheet map.

```javascript
{
  data: [
    {
      user_id: 5761332,
      created: '2026-03-25T14:21:28+00:00',   // MUST use +00:00, NOT Z
      latitude: 37.22551424,
      longitude: -121.98492284,
      accuracy: 10,
      altitude: 30,
      speed: 0,
      heading: 0,
      source: 'gps',
      device_identifier: 'bb-bridge'
    }
  ]
}
```

**Critical: Timestamp format**
- ✅ `2026-03-25T14:21:28+00:00` — accepted
- ✗ `2026-03-25T14:21:28.000Z` — REJECTED ("not valid ISO-8601")
- ✗ `2026-03-25T14:21:28Z` — REJECTED

**Key constraints:**
- Max 50 points per POST call
- QBT auto-links to timesheets by `user_id` + timestamp overlap
- No `timesheet_id` field needed
- `device_identifier` is optional but useful for audit
- Points show on QBT map regardless of `location` field on timesheet
- QBT calculates `distance_tracking.calculated_meters` from uploaded geolocations (takes a few seconds to process)

### 3. Distance Tracking: `GET/PUT /api/v1/distance_tracking`

Read and set mileage on timesheets.

**GET** — paginated, no user/date filter (must paginate all):
```
GET /api/v1/distance_tracking?page=1&per_page=200
```

Returns:
```json
{
  "id": 68165540,
  "type_id": 293419218,         // timesheet ID
  "type": "time",
  "calculated_meters": 116120,  // QBT's auto-calculation (read-only)
  "manual_meters": null,        // OUR value (writable!)
  "snap_to_roads": false,
  "active": true
}
```

**PUT** — set `manual_meters` (our OSRM mileage):
```javascript
{
  data: [{
    id: 68165540,               // distance_tracking record ID (NOT timesheet ID)
    manual_meters: '42808'       // our OSRM-calculated meters
  }]
}
```

**Key findings:**
- `calculated_meters` = QBT's own calculation (read-only, straight-line between pings)
- `manual_meters` = writable via API — this is where we inject our OSRM mileage
- Must find the record by paginating GET and matching `type_id` = timesheet ID
- Record is auto-created when timesheet is created (no POST needed)
- `manual_meters` appears in QBT UI alongside calculated mileage

---

## Timestamp Format Rules

QBT rejects standard JavaScript `toISOString()` output. Use this conversion:

```javascript
// ✅ Correct format for QBT
const ts = new Date(timestampMs);
const created = ts.toISOString().replace(/\.\d{3}Z$/, '+00:00');
// Result: "2026-03-25T14:21:28+00:00"

// ✗ Wrong (rejected by QBT)
const wrong = ts.toISOString();
// Result: "2026-03-25T14:21:28.000Z"
```

This applies to ALL QBT API calls: geolocations `created`, timesheets `start`/`end`, and `modified_since`/`modified_before` filters.

---

## Employee ID Mapping

QBT uses numeric user IDs. Our system uses internal IDs (EMP-xxx).

| System | ID Format | Example (Chad) |
|--------|-----------|----------------|
| QBT | Numeric | 2866540 |
| Neon employees.id | EMP-xxx | EMP-1 |
| Neon employees.qbt_id | Numeric string | "2866540" |

**Always use `employees.qbt_id` when calling QBT APIs.**

Mapping: `resolveEmployeeId()` in `gps-v1.js` converts between formats.

---

## Upload Pipeline (Pre-Flight · In-Flight · Post-Flight)

### Pre-Flight (nothing leaves our system)
1. Date range check (past, ≤90 days)
2. Dedup check (cal_gps_uploads)
3. Employee validation (exists, active, has QBT ID)
4. Ping quality assessment (median accuracy ≤ 50m)
5. Time coverage check (≥ 1 hour span)
6. QBT timesheet exists for employee+date
7. OSRM health probe
8. Timeline reconstruction (DBSCAN + geofence)
9. Per-trip OSRM routing + Google cross-check
10. Payload validation (lat/lon range, timestamps, user_id)
11. Geographic bounds check (±50km of source pings)
12. Duplicate point dedup (<1m)
13. Per-trip point cap (500 max)
14. Mileage cap (500 mi/day)
15. Point count cap (10,000)
16. Monotonic timestamp check
17. Payload fingerprint (SHA-256)
18. Dry run mode (preview)

### In-Flight (data flowing to QBT)
1. Chunk into 50-point batches
2. Register chunks in cal_gps_upload_chunks
3. Per-chunk SHA-256 hash idempotency
4. Upload with exponential backoff (5 retries, 1s→2s→4s→8s→16s + jitter)
5. Per-chunk status tracking (pending → sent → verified → failed)
6. Abort on >20% batch failure rate

### Post-Flight (verify delivery)
1. 2-second settle wait
2. Read-back from QBT (GET /geolocations)
3. Exact count match
4. Timestamp range match (±2s)
5. User ID confirmation
6. Coordinate spot-check (5 samples, 6 decimal places)
7. Duplicate detection
8. Write mileage to distance_tracking (PUT /distance_tracking)
9. Audit record update (cal_gps_uploads)

---

## Mileage Calculation

| Source | Method | Accuracy | Used For |
|--------|--------|----------|----------|
| Our OSRM | Road-snapped route following | ±0.7% of QBT | `manual_meters` → payroll |
| QBT calculated | Straight-line between pings | ~baseline | `calculated_meters` (auto) |
| Haversine | Straight-line, no roads | ±16% error | Never use for mileage |

**Our OSRM mileage is more accurate than QBT's.** QBT draws straight lines between pings (cuts through buildings). Our OSRM follows actual road geometry.

Benchmark (Chad 3/12):
- QBT calculated: 26.79 miles
- Our OSRM: 26.60 miles (0.7% difference)
- Haversine: 31.09 miles (16% inflated)

---

## Per-Employee Work Schedule

GPS ingest respects per-employee work schedules stored in `employees.work_schedule` JSONB:

```json
{
  "Mon": { "start": 6, "end": 18 },
  "Tue": { "start": 6, "end": 18 },
  "Wed": { "start": 6, "end": 18 },
  "Thu": { "start": 6, "end": 18 },
  "Fri": { "start": 6, "end": 18 },
  "Sat": { "start": 7, "end": 16 }
}
```

- Default (no schedule set): Mon–Fri 6 AM – 6 PM PT
- Pings outside schedule are filtered (privacy)
- `isDuringWorkHours(timestamp, schedule)` in `pacific-time.js`

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `cal_gps_points` | Raw GPS pings from all sources |
| `cal_draft_timesheets` | Reconstructed time entries for crew review |
| `cal_gps_uploads` | Audit trail for every upload attempt (immutable, INSERT-only) |
| `cal_gps_upload_chunks` | Per-chunk tracking for crash recovery + idempotency |
| `cal_reconstruction_runs` | Reconstruction audit history |
| `cal_device_registry` | Device → employee mapping + work schedule |

---

## QBT Limitations (Confirmed via Testing)

1. **`location` field is read-only** — API-created timesheets get `"Tracking"`, cannot be changed to `"iPhone App"`
2. **Cannot create future timesheets** — `start` must be current or past
3. **Cannot overlap timesheets** — same user, overlapping time windows = rejected
4. **Approved pay periods are locked** — cannot add/modify timesheets
5. **Timestamp format strict** — must use `+00:00` offset, no `Z`, no milliseconds
6. **Max 50 geolocations per POST** — must chunk larger batches
7. **`distance_tracking.calculated_meters` is read-only** — auto-calculated by QBT
8. **`distance_tracking.manual_meters` IS writable** — this is how we inject our mileage
9. **Distance tracking GET has no user/date filter** — must paginate all records and match by `type_id`
10. **Payroll API requires separate Intuit approval** — we don't have `com.intuit.quickbooks.payroll` scope

---

## Key Files

| File | Purpose |
|------|---------|
| `src/routes/gps-v1.js` | `/road-snap-for-qbt` — full upload pipeline |
| `src/utils/gps-road-snap.js` | Pre-flight utilities (validation, OSRM, densification, formatting) |
| `src/clients/qbt.js` | QBT API client (`createGeolocations`, `getGeolocations`, `createTimesheet`) |
| `src/clients/osrm.js` | OSRM client (matchTrace, routeBetween, nearestRoad) |
| `src/clients/resilience.js` | Circuit breaker for OSRM + QBT |
| `src/utils/pacific-time.js` | `isDuringWorkHours()` with per-employee schedule |
| `sql/phase-f-upload-hardening.sql` | Schema for upload audit + chunk tracking |
| `scripts/gps-sim.js` | E2E test harness (build, replay, validate, cleanup) |
| `scripts/harvest-qbt-patterns.js` | Download QBT data for test scenario generation |

---

## OSRM Server

Self-hosted on Railway: `https://bbosrm-production.up.railway.app`

- California road network (Geofabrik extract)
- MLD algorithm, ~2-3 GB RAM
- Bridge env: `OSRM_URL=https://bbosrm-production.up.railway.app`
- Endpoints: `/nearest/v1/driving/`, `/match/v1/driving/`, `/route/v1/driving/`

---

---

## Lessons Learned (Hard-Won from Testing)

### L1. QBT Geolocations Are PERMANENT
**QBT has NO delete geolocations API.** Once uploaded, points stay forever. The only way to remove them is manual deletion via QBT admin UI. This means:
- NEVER upload test data to a production employee's real work dates
- ALWAYS do a thorough pre-flight read-back before uploading
- Use isolated test dates/employees that can be manually cleaned
- A bad upload is permanent — it WILL pollute future mileage calculations

### L2. QBT Geolocations Accumulate Across Uploads
Multiple uploads to the same user+date window **add** points, they don't replace. If you upload 128 points, then upload 128 more, QBT now has 256. This inflates `calculated_meters` and creates visual noise on the map. There is no upsert — only append.

### L3. Timesheets Must Be Segmented Per Leg
One big all-day timesheet (7 AM - 4 PM) does NOT give QBT proper mileage segmentation. Each driving leg needs its own timesheet entry with matching start/end times. QBT links geolocations to timesheets by `user_id + timestamp overlap`. Per-segment timesheets:
```
TS1: 7:00-7:30  Home→Tait       (driving + 16 pts)
TS2: 7:30-9:30  At Tait          (stationary, no geolocations needed)
TS3: 9:30-10:00 Tait→HomeDepot  (driving + 14 pts)
...
```

### L4. OSRM `overview=simplified` for Uploads
Full OSRM geometry gives ~1,600 points per 22-mile trip. `overview=simplified` gives ~35 points — same mileage, 98% reduction. Use simplified for QBT uploads, full for mileage calculations.

### L5. Verify Per-Point Status in QBT Response
QBT returns per-point status in the response: `_status_code: 200` = created, `_status_code: 417` = rejected. Our code must check EVERY point's status, not just the HTTP response code. A 200 HTTP response can contain 50 individually-rejected points.

### L6. QBT Calculates Mileage from API Geolocations
Despite earlier concern, QBT DOES calculate `distance_tracking.calculated_meters` from API-uploaded geolocations. The `location: "Tracking"` field doesn't prevent mileage calculation — it just takes a few seconds for QBT to process after the timesheet is created.

### L7. `manual_meters` via PUT /distance_tracking
We CAN inject our OSRM mileage into QBT via `PUT /api/v1/distance_tracking`. The `manual_meters` field is writable. Must first GET + paginate to find the record ID matching the timesheet's `type_id`, then PUT with that ID.

### L8. Timestamp Format Is Critical
QBT rejects `Z` suffix and milliseconds. Must use `+00:00`. This applies to:
- Geolocation `created` field
- Timesheet `start`/`end` fields
- GET filter `modified_since`/`modified_before` parameters
```javascript
// ✅ new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+00:00')
// ✗ new Date(ms).toISOString()
```

### L9. Pre-Flight Must Check QBT State, Not Just Neon
Before any upload, read back from QBT API to verify the target date/employee has:
- Zero existing timesheets (or only the ones we intend to update)
- Zero existing geolocations (or acceptable known baseline)
Pre-flight that only checks our Neon tables is insufficient.

### L10. Custom Fields Are Required
BB's QBT account requires `1136266` (Service Item) and `1992560` (Billable) on every timesheet. Missing these = 417 rejection. Check these are included in every `POST /timesheets` call.

### L11. Jobcode IDs Must Be Verified
Using a wrong jobcode ID (e.g., from an old mapping) causes 417 "Jobcode does not exist". Always verify jobcode IDs against the live QBT data before upload.

### L12. 72-Hour Buffer Age on Ingest
GPS pings older than `GPS_MAX_BUFFER_AGE_HOURS` (default 72h) are silently dropped by the Overland ingest handler. Test data from >3 days ago will never reach `cal_gps_points`. Either use recent dates or temporarily increase the limit.

### L13. Weekend Pings Require Employee Schedule
Default `isDuringWorkHours()` filters out Saturday/Sunday. Employees who work weekends need `work_schedule` JSONB set in the employees table with the Saturday/Sunday hours.

### L14. Reconstruction Defers If Device Just Pinged
The `/reconstruct-day` endpoint skips employees whose device `last_seen < 30 seconds ago`. After replaying pings, wait 30+ seconds before triggering reconstruction.

### L15. GET /geolocations REQUIRES `user_ids` Filter (CRITICAL)
**Without `user_ids`, the QBT geolocations endpoint returns OTHER users' data, NOT the target user.**
The endpoint returns a max 200 per page from a global pool. If the target user's geolocations aren't in the first page, a client-side filter will find zero — giving a FALSE "clean" result.

**WRONG (gave false clean):**
```
GET /geolocations?modified_since=X&modified_before=Y  → filter client-side by user_id
```

**CORRECT (always use):**
```
GET /geolocations?user_ids=5761332&modified_since=X  → returns ONLY that user's data
```

This caused our worst bug: pre-flight reported "0 geolocations — clean" when there were actually 1,323 leftover points. Every subsequent upload piled more data on top, inflating mileage to 270 miles.

**Rule: ALWAYS pass `user_ids` in every QBT geolocations API call. Never rely on client-side filtering.**

### L16. Geolocations Are Truly Permanent — Manual Delete Is Unreliable
Even after Sam manually deleted data in the QBT admin UI, 1,323 geolocations persisted. QBT's "delete" in the admin UI may only hide data from the UI, not purge from the API/database. Treat any date+employee that has been uploaded to as permanently contaminated for testing purposes. Use a fresh date+employee for clean tests.

---

## QBT Pre-Flight Checklist (MANDATORY Before Every Upload)

### On QBT Side (API reads):
- [ ] **Timesheets:** `GET /timesheets?start_date=X&end_date=X&user_ids=Y` → verify count matches expectation
- [ ] **Geolocations:** `GET /geolocations?user_ids=Y&modified_since=X` → **MUST include `user_ids`** (see L15) → paginate ALL pages → verify ZERO for clean upload, or known baseline count
- [ ] **Jobcode IDs:** Verify all jobcode IDs exist in QBT (`GET /jobcodes?ids=X,Y,Z`)
- [ ] **User ID:** Verify employee's QBT user_id is active (`GET /users?ids=X`)
- [ ] **Pay period status:** Verify target date is NOT in an approved/locked pay period

### On Our Side (Neon reads):
- [ ] **Pings exist:** `cal_gps_points` has ≥5 pings for employee+date
- [ ] **Ping quality:** Median accuracy ≤ 50m
- [ ] **Time coverage:** Pings span ≥ 1 hour
- [ ] **Employee valid:** `employees` table has active record with `qbt_id`
- [ ] **No prior upload:** `cal_gps_uploads` has no `status='success'` for employee+date (or `force=true`)
- [ ] **OSRM reachable:** Health probe succeeds

### Payload Validation:
- [ ] **Timestamps:** All use `+00:00` format (not Z, no milliseconds)
- [ ] **Coordinates:** All lat in [-90,90], lon in [-180,180], no NaN
- [ ] **User ID:** All points use QBT numeric user_id (not EMP-xxx)
- [ ] **Chunk size:** All chunks ≤ 50 points
- [ ] **Monotonic:** Timestamps strictly increasing within each chunk
- [ ] **Bounds:** All points within ±50km of source ping bounding box

---

### L17. `manual_meters` Overrides `calculated_meters` in QBT Display
When both values exist, QBT displays `manual_meters` as the mileage number in the Approvals Report and Mileage column. This is our correction mechanism:
- Bad geolocations inflate `calculated_meters` → but `manual_meters` overrides it
- `manual_meters` is always correctable via `PUT /distance_tracking`
- Payroll/reimbursement uses the displayed mileage → which is `manual_meters` when set
- **This makes geolocations a cosmetic map feature, not a financial control**

### L18. `distance_tracking` Fields Are Writable
Confirmed writable via `PUT /distance_tracking`:
- `manual_meters` — our OSRM mileage ✓
- `snap_to_roads` — can set true/false ✓
- `calculated_meters` — accepts writes (QBT may recalculate) ✓
- `active` — can set false to suppress record ✓

Geolocations themselves remain immutable (405 on PUT/DELETE/PATCH).

---

## Production Mileage Strategy

**Geolocations = map visual (permanent, one-shot, be precise)**
**`manual_meters` = mileage for payroll (correctable anytime)**

```
Upload geolocations → map trace appears in QBT
    ↓ (permanent — cannot delete or modify)
Set manual_meters → mileage number in payroll
    ↓ (correctable — PUT /distance_tracking anytime)
If mileage wrong → just PUT new manual_meters value
If map wrong → cosmetic only, doesn't affect payroll
```

Error correction:
- Wrong mileage → `PUT /distance_tracking { manual_meters: correct_value }` ✓
- Wrong map trace → cannot fix (cosmetic only, document as known limitation)
- Duplicate geolocations → cannot delete, but `manual_meters` overrides inflated `calculated_meters`

---

## Clean Upload Checklist (Prevent Bad Writes)

Because geolocations are permanent, prevention is the ONLY strategy:

1. **Pre-flight QBT read-back** with `user_ids` filter (L15) — verify ZERO existing geolocations
2. **Validate every point** — lat/lng range, timestamp format, user_id, monotonic
3. **Dry-run first** — always run with `dryRun: true` before real upload
4. **Verify OSRM route** — visually confirm the route makes sense before uploading
5. **Use `overview=simplified`** — minimal points, same mileage (L4)
6. **Set `manual_meters` immediately** after upload — don't rely on `calculated_meters`
7. **Post-flight read-back** with `user_ids` filter — verify exact count match

**If in doubt, DO NOT upload geolocations.** Upload timesheets + set `manual_meters` only. The map trace is nice-to-have; the mileage number is must-have.

*Updated 2026-03-27 | 18 lessons learned | manual_meters confirmed as override | Ross 3/25 test series*
