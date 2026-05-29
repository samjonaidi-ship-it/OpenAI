# BB Buddy Roadmap | v1.0 | 2026-04-01 | BB

## Current State: v3.17.0 — DEPLOYED & WORKING

**Commit:** `a2d4b91` | **Railway:** auto-deployed | **URL:** `/scan-openai`

### What's Live
| Feature | Tool/Mechanism | Status |
|---|---|---|
| Voice + vision AI | gpt-realtime-mini WebRTC | Working |
| Expert knowledge + vision ID | ask_expert → Claude Sonnet 4.6 (direct browser, web_search enabled) | Working |
| Item logging | log_item → cal_audit_log | Working |
| Report delivery | deliver_report → inline transcript display | Working |
| CalExp5 actions | calexp_action → stubbed (future routing) | Stub |
| Asset search | find_asset → SerpAPI + Claude web_search fallback → tappable cards | Working |
| Standby (pause/resume) | Mute mic+video, amber overlay | Working |
| Video freeze + watermark | Captured frame on canvas during expert calls | Working |
| Transcript modal | Tap ticker → full-screen scrollable | Working |
| Echo suppression | buddySpeaking flag + 800ms grace + browser AEC | Working |
| Whisper hallucination filter | CJK, Cyrillic, accented Latin, known phrases | Working |
| Telemetry | sendBeacon → cal_scan_transcripts (role=telemetry) | Working |
| Lazy storage | sendBeacon 5s batched transcripts | Working |
| Compaction | requestIdleCallback + Claude summarization every 20 turns | Working |
| Session persistence | cal_scan_sessions, cal_scan_transcripts | Working |
| Crew memory | cal_crew_memory (load at start, upsert) | Working |
| Settings | Voice, verbosity, personality, VAD, eagerness, skip word | Working |

---

## Phase 1 — Quick Wins

### 1.1 "Next" Button on Screen
**Priority:** High | **Effort:** Small | **Depends on:** Nothing

Physical tap button in the action bar to stop Buddy mid-sentence. More reliable than voice skip word in noisy jobsite environments. Sends same signal as saying "Next" — cancels current response, waits for next input.

### 1.2 Idle Timeout
**Priority:** Medium | **Effort:** Small | **Depends on:** Nothing

Auto-end session after configurable idle period (default 5 min no speech). Shows warning at 4 min ("Still there?"), auto-closes at 5 min. Sends session/end via sendBeacon. Saves tokens when crew walks away.

---

## Phase 2 — Web Search & Price Comparison (DONE)

### 2.1 Claude web_search in ask_expert ✅
Claude Sonnet 4.6 with `web_search_20250305` tool enabled. Live pricing, specs, availability, safety bulletins.

### 2.2 find_asset tool ✅
SerpAPI via Bridge `/v2/search` endpoint. Falls back to Claude web_search. Results displayed as tappable asset cards (video/doc/image/link) in ticker + transcript modal.

---

## Phase 3 — QBO/QBT Financial Data Access

**Priority:** High | **Effort:** Large | **Depends on:** QBO Reports API endpoints (not yet built)

### 3.1 New Bridge Endpoints Needed
| Endpoint | QBO API | What It Returns |
|---|---|---|
| `GET /api/qbo/reports/pnl` | `/reports/ProfitAndLoss` | P&L by date range, class, department |
| `GET /api/qbo/reports/ar-aging` | `/reports/AgedReceivables` | AR aging by customer |
| `GET /api/qbo/reports/balance-sheet` | `/reports/BalanceSheet` | Balance sheet snapshot |
| `GET /api/qbo/estimates` | `/query?query=SELECT * FROM Estimate` | Estimates with line items |

Existing endpoints already cover: invoices, customers, employees, timesheets, purchases, bills, time activities.

### 3.2 New Function Tool: `query_financials`
```
crew: "Run me a P&L for Q1"
  → Buddy calls query_financials(type:'pnl', period:'Q1 2026')
  → Bridge calls QBO Reports API
  → Returns structured data
  → Buddy speaks summary, deliver_report shows full breakdown

crew: "What's my AR this invoice cycle"
  → query_financials(type:'ar_aging')
  → Bridge calls AgedReceivables report

crew: "Find the last invoice for Fabian"
  → query_financials(type:'invoice_search', customer:'Fabian')
  → Bridge calls /qbo/invoices with customer filter

crew: "How much profit on Eklund jobsite to date"
  → query_financials(type:'pnl', class:'Eklund')
  → Bridge calls P&L filtered by class/jobsite
```

### 3.3 QBT Integration
```
crew: "Show me my hours this week"
  → query_financials(type:'timesheet', employee:'me', period:'this_week')
  → Bridge calls /qbt/timesheets

crew: "Check Sam's PTO balance"
  → query_financials(type:'pto', employee:'Sam')
  → Bridge calls QBT time-off API
```

---

## Phase 4 — BB Asset Discovery (partially done)

### 4.1 BB's Own Google Drive Assets
**Priority:** Medium | **Effort:** Medium | **Depends on:** Google Drive search API

Search BB's Google Drive for internal documents: tool manuals, SOPs, safety plans, project docs, filed receipts.

Bridge endpoint: `GET /api/cal/scan/live/v2/search-drive?q=...`
Uses `google-drive.js` `findDriveFile()` pattern + Google Drive Files.list API with `q` parameter.

### 4.2 YouTube via Existing API
Leverage existing `tool-enrich.js` YouTube Data API v3 integration for how-to videos, product reviews. Currently only used for tool enrichment — extend to general search via find_asset.

---

## Phase 5 — Actions (Autonomous Operations)

**Priority:** Future | **Effort:** Very Large | **Depends on:** Phases 3+4, crew auth

### 5.1 Create Estimates
```
crew: "Create an estimate for the Johnson kitchen remodel"
  → calexp_action(action:'CREATE_ESTIMATE', params:{customer:'Johnson', description:'Kitchen remodel'})
  → Bridge creates Estimate in QBO via POST /estimate
  → Returns estimate number + PDF link
```

### 5.2 Create Change Orders
```
crew: "Add a change order for $2,500 for the electrical upgrade"
  → Modifies existing estimate/invoice in QBO
```

### 5.3 Email/Text Replies
```
crew: "Reply to that email from the inspector — tell him we'll be ready Thursday"
  → Compose email via Gmail API (existing receipt-email.js pattern)
  → Show draft for crew approval before sending
```

### 5.4 Route calexp_action to Real APIs
Map the 10 action types to actual Bridge/CalExp5 endpoints:
| Action | Routes To |
|---|---|
| LOG_HOURS | POST /qbt/timesheet |
| CHECK_PTO | GET /qbt/users + time-off balance |
| GET_RECEIPTS | GET /api/cal/receipts |
| FIND_TOOL | GET /api/assets/tools/search |
| GET_JOBSITE | GET /api/cal/stores |
| FILE_RECEIPT | POST /api/cal/receipts (triggers receipt-ai pipeline) |
| CATALOG_TOOL | POST /api/assets/tools |
| APPROVE_GPS | POST /api/cal/gps/approve |
| UPDATE_PROFILE | PATCH /api/cal/employees |
| GET_SCHEDULE | GET /qbt/schedule |

---

## Infrastructure Backlog

| Item | Priority | Effort | Notes |
|---|---|---|---|
| Crew authentication (CalExp5 login flow) | High | Medium | Currently no employee ID — soft-auth only |
| Background session digest (Claude Sonnet) | Medium | Small | Extract durable crew memory at session end |
| Email delivery for deliver_report | Medium | Small | Gmail API pattern exists in receipt-email.js |
| PDF generation for deliver_report | Medium | Small | pdf-lib pattern exists in receipt-pdf.js |
| VAPID push for cal_notifications | Medium | Medium | Push to CalExp5 when report ready |
| conversation.item.delete compaction | Low | Medium | Actual OpenAI context window management |
| Perplexity Sonar API | Low | Small | Add if Claude web_search insufficient |
| "Next" button on screen | High | Small | Physical tap to stop Buddy |
| Idle timeout | Medium | Small | Auto-close after 5 min idle |

---

## Cost Estimate (Current)

| Component | Per 5-min Session | Monthly (10 crew x 4/day) |
|---|---|---|
| OpenAI mini audio | $0.50 | $440 |
| OpenAI mini text | $0.02 | $18 |
| Claude ask_expert (Sonnet 4.6, ~3/session) | $0.05 | $44 |
| Claude compaction (Sonnet 4.6, ~2/session) | $0.03 | $26 |
| SerpAPI find_asset | Free tier (100/mo) | $0 |
| Neon DB | ~$0 | $19 (Pro plan) |
| **Total** | **~$0.60** | **~$547** |
| **With idle timeout (50%)** | **~$0.30** | **~$274** |

**$27/crew/month** for a fully integrated AI assistant with vision, voice, web search, and financial data access.

---

## Technical Debt

| Item | Risk | Notes |
|---|---|---|
| "Missing session.type" error on onDCOpen | Low | Non-critical — session.updated fires anyway |
| MediaPipe code still in HTML (unused) | None | Disabled but not removed — can re-enable |
| AudioContext chime code (unused) | None | Superseded by system prompt approach |
| Whisper hallucination filter may block real short phrases | Low | "Bye-bye", "Peace" filtered — could be real crew words |

---

*Plan file: `C:\Users\samjo\.claude\plans\encapsulated-watching-stearns.md` (original v3.0 plan)*
*Session state: `C:\Users\samjo\Desktop\BB_Micro_Bridge\.session\SESSION_STATE.md`*
*Learnings: `C:\Users\samjo\.claude\projects\C--Users-samjo\memory\feedback_bb_buddy_learnings.md`*
