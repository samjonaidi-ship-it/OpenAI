# GPS & Crew Tracking Strategy
## 2026-03-27 | Hardware Research + Architecture Decision | BB

---

## The Problem

GPS alone is unreliable for automated timesheets:
- Signal loss in parking garages, urban canyons, Santa Cruz mountains
- Phone battery dies, app closed, phone forgotten
- OBD devices can lose power or cellular connection
- No single source provides military-grade reliability

**The solution: layered redundancy with multiple anchor points.**

---

## Anchor Point Hierarchy

### Primary Anchors (100% certain, no phone needed)

| Anchor | How | Status |
|--------|-----|--------|
| **OBD in trucks** | Vehicle GPS via Traccar, always on when engine runs | ✅ Traccar on Railway, H02 protocol ready |
| **CC transactions** | Chase recon feeds store visits with timestamps | ✅ Built in Bridge |
| **QBT clock-in/out** | Crew declares jobsite via TSheets mobile app | ✅ Running today |
| **BLE gateways at jobsites** | Detect crew/tool BLE tags, no phone needed | 🔲 Hardware needed (~$900) |

### Secondary Anchors (95%+ certain)

| Anchor | How | Status |
|--------|-----|--------|
| **Receipt scans** | Claude AI extracts merchant + timestamp + jobsite | ✅ Built in Bridge |
| **GPS geofence match** | Overland pings near known property | ✅ Built, 61 properties geocoded |
| **Store geocoding** | 384 stores in cal_stores with lat/lng | ✅ Loaded in Neon |

### Tertiary (gap-filling, phone-dependent)

| Anchor | How | Status |
|--------|-----|--------|
| **Overland GPS pings** | Phone app, 2-min intervals during work hours | ✅ Built |
| **Cell/WiFi triangulation** | 100-300m accuracy, always available | 🔲 Not built |
| **Dead reckoning** | Phone IMU bridges 15-45 min GPS gaps | 🔲 Not built |

---

## UX/UI Design: Event-Driven Timesheet

### Core Principle
**Don't reconstruct the day after the fact — confirm it as it happens.**

### Event Flow

```
7:45 AM — Geofence/BLE detects Chad at Labe
  📍 Push: "Arrived at Labe - Tait Ave. Confirm? [✓ Yes] [Change ▾]"
  Chad taps ✓ → timesheet clock-in recorded

9:30 AM — Geofence/BLE exit detected
  🚗 Push: "Left Labe. Where to? [Home Depot ▾] [Other ▾]"
  Chad taps Home Depot → travel segment assigned to Labe

10:18 AM — CC transaction at Home Depot ($87.52)
  🏪 Auto-confirmed: "Parts for Labe" (receipt says Labe)
  Travel ownership: round-trip to store = owned by origin jobsite

10:45 AM — Back at Labe (geofence/BLE re-entry)
  📍 Push: "Back at Labe. [✓ Continue] [New job ▾]"

6:00 PM — End-of-day review (lightweight)
  Everything pre-confirmed from day's prompts
  Crew scans + taps "All Good" or adjusts one entry
```

### Travel Ownership Rule

```
If crew is at Site A, drives to store, returns to Site A:
  → Entire round-trip belongs to Site A
  → Store visit also belongs to Site A
  → Receipt confirms jobsite assignment

If crew leaves Site A and drives to Site B:
  → Travel belongs to Site B (going TO the next site)
```

### Without Phone (fallback)

```
OBD says truck arrived at Labe GPS coords at 7:45 AM → auto clock-in
CC says Home Depot at 10:18 AM → store visit confirmed
OBD says truck at Eklund GPS coords at 11:35 AM → auto transition
No prompts (no phone) → end-of-day review has more items to confirm
```

---

## BLE Tracking Device Research (March 2026)

### Market Landscape

**The gap:** No off-the-shelf product combines industrial ruggedness + crowd-sourced Find My network + enterprise API.

```
CONSUMER (crowd network):      No API, not rugged
INDUSTRIAL (enterprise API):   No crowd network
FLEET GPS (full platform):     Expensive, overkill
```

### Platforms Evaluated

#### Consumer Trackers (Crowd Network, No Enterprise API)

| Platform | Network Size | Rugged | API | Find My | Price |
|----------|-------------|--------|-----|---------|-------|
| **Apple AirTag** | 2B+ (Apple Find My) | No (consumer) | No public API | Native | $29 |
| **Chipolo ONE Spot** | 2B+ (Apple Find My) | IP55 | No enterprise API | Apple only | $28 |
| **Chipolo ONE Point** | 1B+ (Google Find My) | IP55 | No enterprise API | Google only | $28 |
| **Pebblebee Clip 5** | Apple OR Google | IP66 | No public API | Choose one | $35 |
| **Tile Pro** | 70M (Tile/Life360) | IP55-IP68 | No official API | Neither | $35 |
| **Samsung SmartTag** | 700M (SmartThings) | Consumer | No public API | Neither | $30 |

**Verdict:** All consumer-grade, no enterprise API, data locked in proprietary apps.

#### Industrial BLE (Enterprise API, No Crowd Network)

| Platform | Rugged | Battery | API | Crowd | Price |
|----------|--------|---------|-----|-------|-------|
| **Kontakt.io Tough Beacon** | IP68, UV-proof | 4+ years | REST + WebSocket | No | $$$ (enterprise) |
| **Minew C6/B8** | IP67 | 2 years | TagCloud REST/MQTT | No | $6-12/tag |
| **Minew G1 Gateway** | Weatherproof | Powered | Reports via cellular | No | $90/gateway |
| **Link Labs AirFinder** | Enterprise | Varies | REST + MQTT | No | $$$ (enterprise) |
| **MOKO H4** | IP67 | 3 years | MQTT/REST | No | $8-15 |
| **Estimote** | IP54 | 1-2 years | Proximity SDK | No | $$$ |

**Verdict:** Good API, ruggedized, but only work within your own gateway infrastructure.

#### Enterprise Fleet Platforms

| Platform | What It Does | API | Price |
|----------|-------------|-----|-------|
| **Samsara** | Full fleet + workforce GPS | Full REST API | $25-40/vehicle/month |
| **Geotab** | Fleet tracking + geofencing | Full API | $25-35/vehicle/month |
| **Verizon Connect** | Fleet + worker tracking | API available | $$$/month |

**Verdict:** Comprehensive but expensive. Worth evaluating if DIY stack becomes too complex.

### Detailed Platform Notes

#### Pebblebee — NOT RECOMMENDED
- Founded by ex-Boeing military tracking engineers (interesting pedigree)
- Pivoted to consumer products
- No enterprise API, no B2B program
- 23-person company, cannot support enterprise customers
- IP66 on latest models — acceptable but not industrial
- Cannot use Apple Find My AND Google Find My simultaneously
- Data locked behind Apple/Google apps — no programmatic access

#### Tile / Life360 — NOT RECOMMENDED
- Tile acquired by Life360 for $205M (2021)
- 70M node network — 28x smaller than Apple Find My
- **Does NOT work with Apple Find My or Google Find My** — completely separate proprietary network
- No official API — reverse-engineered `pytile` library exists but can break anytime
- No enterprise offering, no SLA
- Designed for family tracking, not workforce

#### Kontakt.io — BEST INDUSTRIAL OPTION
- Tough Beacon: IP68, UV-proof, antistatic, anti-scattering
- 4+ year battery (75-85 months)
- Full REST API + WebSocket streaming (Location & Occupancy API)
- Cloud-to-cloud streaming: AWS Kinesis, Azure Event Hub
- Scans 200 BLE devices/second per gateway
- No crowd network (proprietary cloud only)
- Enterprise pricing (contact sales)

#### Minew — BEST VALUE INDUSTRIAL
- B8 hard hat clip tag: IP67, impact resistant, $8-12
- C6 keychain tag: IP67, 2-year battery, $6-10
- G1 gateway: cellular (4G), $90, weatherproof
- TagCloud 3.0 API: REST + MQTT, free demo tier
- Can deploy bidirectional commands (LED/sound alerts on tags)
- No crowd network

#### OpenHaystack (Open Source) — INTERESTING BUT IMPRACTICAL
- Custom ESP32 firmware that broadcasts on Apple Find My network
- Leverages 2B+ Apple devices without MFi certification
- $5-8 per unit (raw hardware)
- Requires: custom firmware dev, custom enclosure, battery management
- Legal gray area (undocumented Apple protocol)
- No commercial product exists — pure DIY
- Not viable for production deployment without significant engineering

---

## BLE Gateway Architecture (If Deployed)

### Flipped Model: Crew Wears Tag, Jobsite Has Gateway

```
👷 BLE Tag (hard hat clip)     📡 BLE Gateway (jobsite)
  broadcasts unique ID    →      scans every 30 sec
  every 2 seconds               reports via cellular
  no interaction needed          to Bridge API
  2-year coin cell battery       solar/12V powered
```

### Bridge Integration

```
POST /api/ble/presence
{
  gateway_id: "GW-LABE-001",
  jobsite: "PROP-00031",
  tags_detected: [
    { tag_id: "TAG-CHAD", rssi: -45, first_seen: "7:45 AM" },
    { tag_id: "TAG-MATT", rssi: -52, first_seen: "7:50 AM" }
  ]
}
```

### Cost Estimate

```
Crew tags:        20 × $10  = $200  (Minew B8 hard hat clips)
Tool tags:        50 × $8   = $400  (Minew C6 keychain)
Jobsite gateways: 10 × $90  = $900  (Minew G1, cellular)
Truck gateways:    5 × $90  = $450  (tool check-in/out)
Total: ~$1,950 one-time, $0/month ongoing
```

---

## Recommended Architecture (Current)

**Don't wait for perfect hardware. Build with what we have:**

```
LAYER 1 — OBD in trucks (Traccar)           ← vehicle tracking, no phone
LAYER 2 — CC transactions (Chase recon)     ← store visits, no device
LAYER 3 — QBT mobile app (crew clock-in)    ← jobsite declaration
LAYER 4 — Overland GPS (phone)              ← route tracking when available
LAYER 5 — OSRM road-snap (our server)       ← accurate mileage
LAYER 6 — BLE gateways at jobsites          ← add when ready (~$1,950)
```

**Layers 1-5 are built and operational today.**
**Layer 6 is a hardware purchase + Bridge endpoint.**

### Future (12-18 months)

- Google Find My Device network maturing → enterprise API likely
- Chipolo or Pebblebee may offer enterprise tier
- Apple Find My third-party accessory program expanding
- When a rugged tag + crowd network + enterprise API product exists → plug into our architecture

---

## Correlation Engine (Future Build)

Fuses all signals into confident timesheet entries:

```
INPUT SIGNALS:
  OBD:  truck at 37.225, -121.985 at 7:45 AM
  BLE:  Chad's tag detected at Labe gateway at 7:45 AM
  QBT:  Chad clocked into Labe at 7:48 AM
  CC:   Home Depot $87.52 at 10:18 AM, card ending 4523
  GPS:  Overland pings along Highway 17 at 10:30 AM
  Receipt: "Labe - deck screws" scanned at 10:18 AM

CORRELATION OUTPUT:
  7:45 AM - 9:30 AM  → At Labe (BLE + OBD + QBT agree) → HIGH confidence
  9:30 AM - 10:45 AM → Home Depot run for Labe (OBD + CC + receipt) → HIGH
  10:45 AM - 4:00 PM → At Eklund (BLE + OBD + GPS) → HIGH
  Mileage: 71.2 mi (OSRM road-snapped) → set via manual_meters
```

Any ONE signal confirms an event. Multiple signals = ironclad.

---

## Key Files

| File | Purpose |
|------|---------|
| `docs/GPS_QBT_INTEGRATION.md` | QBT upload pipeline (18 lessons learned) |
| `docs/GPS_TRACKING_STRATEGY.md` | This file — hardware + architecture strategy |
| `src/routes/gps-v1.js` | GPS ingest + reconstruction + QBT upload |
| `src/utils/gps-road-snap.js` | OSRM routing + payload validation |
| `src/clients/osrm.js` | OSRM client (our private CA server) |
| `src/utils/gps-cron.js` | Daily 6 PM reconstruction cron |
| `src/utils/gps-retention.js` | Monthly data retention cron |
| `scripts/gps-sim.js` | E2E test harness |
| `scripts/harvest-qbt-patterns.js` | QBT data extraction for testing |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-26 | Self-host OSRM on Railway | Public OSRM unreliable, $5/mo for California road network |
| 2026-03-26 | Use `manual_meters` for payroll mileage | QBT `calculated_meters` is read-only, `manual_meters` overrides in display |
| 2026-03-27 | Geolocations are permanent in QBT | No DELETE/PUT API, no admin purge, Intuit support only path |
| 2026-03-27 | No consumer BLE tracker has enterprise API | AirTag, Chipolo, Tile, Pebblebee all lack programmatic access |
| 2026-03-27 | Minew best value for BLE gateways | $90/gateway, cellular, weatherproof, REST/MQTT API, $8-12/tag |
| 2026-03-27 | Build architecture now, plug in better hardware later | Google Find My enterprise API likely within 12-18 months |

---

*Document created 2026-03-27 | Comprehensive hardware evaluation + architecture decision*
