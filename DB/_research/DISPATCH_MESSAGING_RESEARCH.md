# Intelligent Dispatch & Messaging Research | Bainbridge Builders | v1.0 | 2026-04-01

## Executive Summary

This report covers dispatch algorithms, messaging platforms, notification orchestration, live ETAs, two-way message routing, crew route sheets, sub-contractor job offers, and message template design for a ~10 crew home services company in the Pacific Northwest serving ~500 customers.

**Bottom-line recommendation:** Build a custom dispatch engine (scored heuristic, not Hungarian algorithm) on top of BB's existing GPS fleet data + PostGIS. Use **Twilio** for SMS/voice + **Novu** (self-hosted) for notification orchestration + BB's existing **VAPID web push** + **Gmail API** for email. Skip the $400+/mo SaaS platforms (Podium, Intercom, Front) — they solve problems BB can solve with code.

---

## 1. DISPATCH ALGORITHMS FOR SMALL-TO-MEDIUM FIELD SERVICE

### The Problem
Given 10 crew members with known GPS positions, skills, and availability, plus 20-50 incoming jobs per day, assign jobs to minimize total drive time while respecting skills and workload balance.

### Algorithm Comparison

| Algorithm | Complexity | Best For | Verdict for BB |
|-----------|-----------|----------|----------------|
| **Hungarian Algorithm** | O(n^3) | Balanced assignment (n workers = n jobs) | OVERKILL. Designed for 1:1 matching. BB has 10 crew, 50 jobs — 5:1 ratio. Would need repeated runs. |
| **Google OR-Tools VRP** | Varies (heuristic) | Vehicle routing with time windows, capacity | POSSIBLE but heavyweight. Good if BB grows to 20+ crew or needs daily route optimization. Free and open-source. |
| **Greedy Nearest-Available** | O(n*m) | Real-time single-job assignment | GOOD for reactive dispatch. "Who's closest and qualified?" Works great for < 20 crew. |
| **Scored Heuristic** | O(n*m) | Multi-factor ranking | RECOMMENDED. Score each crew member per job on multiple weighted factors. Simple, tunable, transparent. |
| **LLM-Based Dispatch** | API call | Complex reasoning with context | SUPPLEMENT ONLY. Good for edge cases and complex jobs. Too slow/expensive for routine dispatch. |

### Recommended: Scored Heuristic Algorithm

For each pending job, score every available crew member:

```
score = (w1 * proximity_score)      // PostGIS distance, normalized 0-100
      + (w2 * skills_match_score)   // binary or graded skill match
      + (w3 * availability_score)   // calendar availability, current workload
      + (w4 * route_efficiency)     // does this job fit their current route?
      + (w5 * workload_balance)     // penalize overloaded crew
      + (w6 * customer_preference)  // "I want the same guy as last time"
```

Starting weights: proximity 35%, skills 25%, availability 15%, route efficiency 10%, workload balance 10%, customer preference 5%.

**Why this beats Hungarian/VRP for BB:**
- Transparent: Sam can see WHY a crew member was assigned ("closest + qualified")
- Tunable: adjust weights without rewriting algorithm
- Incremental: works for real-time assignment (job comes in, assign immediately) or batch (morning route planning)
- Simple: ~200 lines of code, no external solver needed
- Fast: 10 crew * 50 jobs = 500 score calculations, sub-millisecond

### How This Differs from Uber/DoorDash

| Factor | Uber/Lyft | DoorDash | BB Field Service |
|--------|-----------|----------|------------------|
| Time horizon | Seconds (real-time) | Minutes (batch) | Hours (scheduled) + real-time |
| Worker availability | Always on/off | Shift-based | Calendar + skills |
| Job duration | 15-60 min | 30-60 min | 1-8 hours |
| Skills matter | No (any driver) | Somewhat (vehicle type) | YES (ISA arborist, HVAC cert) |
| Route optimization | Single pickup → dropoff | Multi-stop route | Full-day route planning |
| Batch size | 1 rider at a time | 2-3 orders batched | 5-8 jobs per crew per day |

**Key insight:** Uber uses batched bipartite matching (collect requests for 2 seconds, then optimally match the batch). DoorDash uses more complex multi-stop route optimization. BB needs neither — the job volume is low enough that a scored heuristic handles it perfectly. If BB grows to 30+ crew, then consider Google OR-Tools for morning route optimization.

### LLM for Dispatch: When It Makes Sense

Use Claude/GPT for dispatch ONLY in these scenarios:
- **Complex job triage**: "This request mentions a leaning tree near power lines — flag for Sam and suggest ISA-certified arborist sub"
- **Customer intent parsing**: "I need someone to look at my gutters" → classify as gutter cleaning vs gutter repair vs gutter installation
- **Exception handling**: "Crew A finished 2 hours early, Crew B is behind schedule — suggest rebalancing"
- **Natural language scheduling**: "Can you come next Tuesday afternoon?" → parse into availability query

Do NOT use LLM for routine dispatch (too slow, too expensive, non-deterministic).

### PostGIS for Proximity

BB already has GPS data flowing into Neon (PostGIS-enabled). Use `ST_DWithin` for fast proximity queries:

```sql
-- Find all available crew within 15km of a job site
SELECT crew_id, crew_name,
       ST_Distance(crew_location::geography, job_location::geography) as meters
FROM crew_positions
WHERE ST_DWithin(crew_location::geography, job_location::geography, 15000)
  AND crew_id IN (SELECT crew_id FROM availability WHERE date = CURRENT_DATE AND status = 'available')
ORDER BY meters ASC;
```

This leverages spatial indexes for sub-millisecond queries even with thousands of points.

### Real-Time Re-Routing

When crew finishes early:
1. GPS system detects crew at job site for > X minutes + marks job complete
2. Dispatch engine queries: "Any unassigned jobs within 20 minutes of this crew's current location?"
3. If yes: push notification to crew with job offer
4. Crew accepts/declines from their phone
5. If accepted: customer gets "crew en route" notification with ETA

This is a simple event-driven pattern, not a complex optimization problem.

---

## 2. UNIFIED MESSAGING PLATFORMS

### Platform Comparison (at ~500 customers, ~10 crew)

| Platform | Monthly Cost | Channels | API Quality | Two-Way | Automation | Verdict |
|----------|-------------|----------|-------------|---------|------------|---------|
| **Twilio** | ~$40-80/mo | SMS, MMS, WhatsApp, Voice, Email (SendGrid) | Excellent (best in class) | Yes (webhooks) | Programmable (you build it) | **RECOMMENDED** |
| **Bird** (ex-MessageBird) | ~$50-100/mo | SMS, WhatsApp, Email, Voice | Good | Yes | Flow builder | Good alternative |
| **Vonage** (Nexmo) | ~$40-80/mo | SMS, Voice, Video, Messaging | Good | Yes | Limited | Second choice to Twilio |
| **Podium** | $399+/mo | Text, Webchat, Reviews | N/A (SaaS) | Yes | Built-in | TOO EXPENSIVE for BB's needs |
| **Intercom** | $29-85/seat/mo | Chat, Email, SMS, WhatsApp | Good | Yes | Fin AI ($0.99/resolution) | WRONG FIT — designed for SaaS support, not field service |
| **Front** | $25-65/seat/mo | Email, SMS, Social | Good | Yes (shared inbox) | Rules-based | POSSIBLE for office team, but BB can build this |

### Twilio: The Clear Winner

**Why Twilio for BB:**
- Pay-per-use: SMS at $0.0079/msg, no monthly platform fee
- Best-in-class API documentation and SDKs
- Twilio Conversations API: single conversation spanning SMS + WhatsApp + web chat
- Webhooks for inbound messages (customer texts back → hits your server)
- A2P 10DLC compliant (required for business SMS in US)
- SendGrid for email ($19.95/mo for 50K emails)
- Sticky sender: customer always sees same number

**Monthly cost estimate for BB (500 customers):**

| Channel | Volume | Unit Cost | Monthly |
|---------|--------|-----------|---------|
| SMS outbound | 2,000 msgs | $0.0079 | $15.80 |
| SMS inbound | 500 msgs | $0.0079 | $3.95 |
| Phone number | 1 local | $1.15/mo | $1.15 |
| SendGrid email | 1,000 emails | $19.95 flat | $19.95 |
| MMS (photos) | 200 msgs | $0.0200 | $4.00 |
| **Total** | | | **~$45/mo** |

**Important: A2P 10DLC Registration Required**
Before sending any business SMS in the US, BB must register:
- Brand registration: $4-44 one-time
- Campaign registration: $15 one-time + $1.50/mo
- Timeline: ~1 week for approval
- Without registration: messages get filtered/blocked by carriers

### Why NOT Podium/Intercom/Front

- **Podium ($399/mo)**: Great for auto dealers and dentists who need review generation. BB doesn't need webchat-to-text or review management as a core dispatch tool. The price is 10x what Twilio costs.
- **Intercom ($29-85/seat)**: Designed for SaaS customer support (help articles, ticket queues). BB needs field dispatch messaging, not helpdesk.
- **Front ($25-65/seat)**: Shared inbox is nice for office teams, but BB's 1-2 office staff don't need a dedicated inbox platform. Custom notification system serves better.

---

## 3. NOTIFICATION ORCHESTRATION

### The Problem
A single event ("booking confirmed") needs to trigger different messages on different channels to different audiences:
- Customer: SMS + email + push notification
- Crew: push notification with job details
- Office: dashboard update + optional email

### Platform Comparison

| Platform | Free Tier | Paid | Self-Hosted | Channels | Verdict |
|----------|-----------|------|-------------|----------|---------|
| **Novu** | 10K workflows/mo | $30/mo (30K) | YES (open source) | Email, SMS, Push, In-app, Chat | **RECOMMENDED** |
| **Knock** | 10K messages/mo | $250/mo (50K) | No | Email, SMS, Push, In-app, Slack, Teams | Too expensive |
| **Courier** | 10K sends/mo | $0.005/send | No | Email, SMS, Push, In-app, Chat | Good but cloud-only |
| **Custom (DIY)** | Free | Twilio + SendGrid costs | N/A | Whatever you build | Most control, most work |

### Recommended: Novu (Self-Hosted) OR Custom Lightweight

**Option A: Novu Self-Hosted (Recommended if BB wants a visual workflow editor)**
- Open source, runs on Docker
- Visual workflow editor: drag-and-drop notification flows
- Built-in channel preference management per user
- Digest/batching: "3 new jobs added" instead of 3 separate notifications
- Delay steps: "Send reminder 24hr before appointment"
- Integrates with Twilio (SMS), SendGrid (email), web-push, in-app
- BB controls all data — nothing leaves BB's infrastructure

**Option B: Custom Lightweight Orchestrator (Recommended if BB wants simplicity)**

Build a simple notification service (~500 lines) that:
1. Receives events from the dispatch system
2. Looks up recipient preferences (SMS? email? push? all?)
3. Renders templates per channel
4. Dispatches via Twilio (SMS), Gmail API (email), VAPID (push)
5. Logs everything

```
Event: "booking_confirmed"
  → Audience: [customer, crew, office]
  → Customer prefs: {sms: true, email: true, push: false}
  → Render: customer_booking_confirmed_sms.template
  → Render: customer_booking_confirmed_email.template
  → Send via Twilio SMS
  → Send via Gmail API
  → Log: notification_log table
```

**Why custom might be better than Novu for BB:**
- BB already has VAPID push + Gmail API working
- Adding Twilio SMS is ~50 lines of code
- A notification orchestrator is just a switch statement + template renderer
- Novu adds Docker complexity for a feature that's fundamentally simple
- BB's notification volume is low (~100-200/day)

### Recommended Architecture

```
[Dispatch Engine] → emits events
       ↓
[Notification Service]
  → looks up audience + preferences
  → renders templates
  → dispatches to channels:
       ├── Twilio SMS API
       ├── Gmail API (existing)
       ├── VAPID Web Push (existing)
       └── In-app notification (WebSocket/SSE)
  → logs to notification_log table
```

---

## 4. "CREW EN ROUTE" WITH LIVE ETA

### How Uber Does It (Simplified)

1. Driver accepts ride → Uber has driver's GPS position
2. Uber calls internal routing/ETA service with driver position + rider position
3. Returns estimated time of arrival based on road network + live traffic
4. Updates every few seconds as driver moves
5. Customer sees: moving dot on map + countdown ETA

### How BB Can Do It

**Step 1: Crew marks "en route" on their phone**
- Or: dispatch system auto-detects crew left previous job site (GPS geofence exit)

**Step 2: Calculate initial ETA**
- Google Routes API: crew's current GPS → customer's address
- Returns: duration with real-time traffic (e.g., "14 minutes")
- Cost: FREE for first 10,000 requests/month, then $5/1000
- BB volume: ~50 jobs/day * ~5 ETA refreshes = ~250 requests/day = FREE TIER

**Step 3: Send customer notification**
- SMS: "Your Bainbridge Builders crew is on the way! Estimated arrival: 2:15 PM (about 14 minutes)"
- Push notification with same info
- Optional: link to live tracking page

**Step 4: Live tracking page (optional, high-value)**
- Customer clicks link → opens web page showing:
  - Map with crew's approximate location (NOT exact — privacy)
  - ETA countdown that updates every 30 seconds
  - Crew name and service details
- Implementation: simple web page that polls an API endpoint
- Crew GPS updates flow through BB's existing fleet tracking
- Privacy: show crew dot with ~500m accuracy (fuzzy), hide when not en route

**Step 5: Auto-detect arrival**
- GPS geofence around customer address
- When crew enters geofence: auto-send "Your crew has arrived!" notification
- Crew confirms arrival in app → job status changes to "in-progress"

### Google Routes API Pricing for ETA

| SKU | Price | Free Tier | BB Daily Usage | Monthly Cost |
|-----|-------|-----------|----------------|-------------|
| Compute Routes (basic) | $5/1000 | 10,000/mo | ~100-250 | **$0 (free tier)** |
| Compute Route Matrix | $5/1000 | 10,000/mo | ~50 (dispatch) | **$0 (free tier)** |

BB's volume is well within Google's free tier. Even at 2x growth, it's $0/month.

### Privacy Implementation

```
// What customer sees:
{
  crew_name: "Mike's Team",
  eta_minutes: 14,
  eta_arrival: "2:15 PM",
  crew_location: { lat: 47.63, lng: -122.52 }, // Rounded to ~500m
  status: "en_route"
}

// What customer does NOT see:
// - Crew's home address
// - Previous job locations
// - Other customers on the route
// - Exact GPS coordinates
```

### Alternative: OSRM (Self-Hosted, Free)

BB already has a self-hosted OSRM instance (`bbosrm-production.up.railway.app`). This can calculate ETAs without Google:
- No per-request cost
- No rate limits
- No traffic data (uses average road speeds)
- Good enough for 90% of cases in PNW (less traffic variation than urban core)

**Recommendation:** Use OSRM for dispatch proximity calculations (free, fast), Google Routes API for customer-facing ETAs (traffic-aware, within free tier).

---

## 5. TWO-WAY MESSAGING THAT ROUTES CORRECTLY

### The Problem
Customer texts "can you also check the downspouts?" — system needs to:
1. Identify this is about their active/upcoming job
2. Route to the assigned crew member
3. Log in job notes

Customer texts "I need to reschedule" — system needs to:
1. Identify this is a scheduling request
2. Route to scheduling system (not crew)

### Architecture: Twilio Webhook + AI Classifier

```
Customer sends SMS → Twilio
  → Twilio webhook → BB Server
  → Identify customer (phone number lookup)
  → Find active job for this customer
  → Classify intent:
     ├── JOB_UPDATE ("also check downspouts", "gate code changed to 5678")
     │   → Append to job notes
     │   → Forward to assigned crew
     │   → Auto-reply: "Got it! We'll let your crew know."
     ├── SCHEDULE_CHANGE ("reschedule", "cancel", "different day")
     │   → Route to scheduling system
     │   → Auto-reply: "We'll get back to you about rescheduling."
     ├── URGENT ("emergency", "water leak", "tree fell")
     │   → Alert Sam + nearest crew
     │   → Auto-reply: "We're dispatching help right away."
     ├── QUESTION ("how much", "when", "who")
     │   → Route to office / BB Buddy AI
     │   → Auto-reply: "We're looking into that for you."
     └── GENERAL (anything else)
         → Route to office inbox
         → Auto-reply: "Got your message. We'll respond shortly."
```

### Intent Classification: Hybrid Approach

**Layer 1: Keyword rules (fast, free, handles 70% of messages)**
```javascript
const INTENT_RULES = [
  { pattern: /reschedule|cancel|different (day|time)|change.*appointment/i, intent: 'SCHEDULE_CHANGE' },
  { pattern: /emergency|urgent|leak|flood|tree.*fell|power.*out/i, intent: 'URGENT' },
  { pattern: /gate.*code|door.*code|park|dog|key|access/i, intent: 'JOB_UPDATE' },
  { pattern: /also|additionally|while.*there|check.*too/i, intent: 'JOB_UPDATE' },
  { pattern: /how much|price|cost|estimate|quote/i, intent: 'QUESTION' },
  { pattern: /thank|thanks|great|perfect|awesome/i, intent: 'ACKNOWLEDGMENT' },
];
```

**Layer 2: LLM classification (for ambiguous messages, ~30%)**
Only invoke Claude when keyword rules don't match. Fast, cheap with Haiku:
```
"Classify this customer message about a home service appointment.
Active job: gutter cleaning at 123 Oak St on April 3.
Message: '{customer_message}'
Classify as: JOB_UPDATE, SCHEDULE_CHANGE, URGENT, QUESTION, or GENERAL"
```

**Why hybrid beats pure-AI or pure-rules:**
- Rules handle the obvious cases instantly (no API call, no cost)
- AI handles the nuanced cases ("My neighbor said there might be a wasp nest in the gutters" → JOB_UPDATE + flag for crew safety)
- Cost: ~$0.001 per AI classification * ~15 ambiguous messages/day = negligible

### Conversation Threading

Twilio Conversations API maintains conversation state:
- Customer texts from same number → same conversation thread
- System can look up: which job is this customer's current/upcoming appointment?
- If no active job: route to general inquiry flow
- If multiple active jobs: ask customer to clarify ("Which service are you messaging about: gutter cleaning on April 3 or window washing on April 5?")

---

## 6. DAILY ROUTE SHEET FOR CREW

### Morning Push Notification

At 6:00 AM (or crew's configured start time), push to crew's phone:

```
Good morning, Mike! Here's your route for Tuesday, April 1:

5 jobs today | ~6.5 hours work | 42 miles driving

1. 8:00 AM — Gutter Cleaning
   📍 123 Oak St, Bainbridge Island
   👤 Sarah Johnson | (206) 555-0123
   ⏱ ~1.5 hours
   📝 Gate code: 4521. Dog (friendly) in backyard.
   🧭 Navigate →

2. 10:00 AM — Window Washing (exterior)
   📍 456 Cedar Lane, Poulsbo
   👤 Tom & Linda Park | (360) 555-0456
   ⏱ ~2 hours
   📝 They'll be at work. Do not ring doorbell (night shift worker).
   🧭 Navigate →

... (3 more jobs)
```

### Delivery Channels for Route Sheet

| Channel | When | Why |
|---------|------|-----|
| Push notification | 6:00 AM | Quick alert with summary |
| In-app (CalExp5 PWA) | Always available | Full details, navigation links, status updates |
| SMS fallback | If push not delivered in 5 min | Ensures crew sees it even if push fails |

### Real-Time Updates During the Day

| Event | Crew Notification |
|-------|-------------------|
| New job added | Push: "New job added to your route: Window Washing at 3 PM at 789 Elm St" |
| Job cancelled | Push: "Job cancelled: Gutter Cleaning at 456 Cedar Lane. Your next job is now at 10:00 AM." |
| Customer running late | Push: "Customer at 123 Oak St says they're running 10 min late" |
| Schedule change | Push: "Your 2 PM job moved to 3 PM. Updated route available." |

### Crew Status Flow

```
ASSIGNED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETE
                                    ↓
                              ISSUE_FOUND (flag for office)
```

Each status change:
- Crew taps button in PWA
- GPS auto-detects some transitions (left previous site → en_route, entered geofence → arrived)
- System timestamps everything
- Customer notified at EN_ROUTE and COMPLETE
- COMPLETE triggers: photo upload prompt, invoice generation, review request scheduling

### Mobile UX Best Practices for Field Crew

Based on field service UX research:

1. **Big tap targets**: Crew has gloves, wet hands. Minimum 48px touch targets.
2. **One-thumb operation**: Status buttons at bottom of screen, reachable with thumb.
3. **Offline-first**: Cache route sheet on device. Status updates queue and sync when connected.
4. **Minimal typing**: Pre-built note options ("gate locked", "nobody home", "additional work needed") + voice-to-text for custom notes.
5. **Navigation integration**: Deep link to Google Maps / Apple Maps / Waze with job address pre-filled.
6. **Photo capture**: In-app camera for before/after photos. Auto-attach to job record.
7. **Dark mode**: Crew working in bright sun needs high contrast, not a white screen.

---

## 7. SUB-CONTRACTOR JOB OFFERS

### How Platforms Handle Sub Dispatch

| Platform | Model | Key Insight |
|----------|-------|-------------|
| **Thumbtack** | Customer-initiated: customer browses pros, sends request. Pros set preferences + budget. Platform limits competition per job. | NOT dispatch — it's a marketplace. Customer picks the pro. |
| **Handy** (now Angi) | Platform-assigned: algorithm matches based on availability, ratings, proximity. Pros see jobs on their dashboard. | Closer to BB's model. Platform decides, pro accepts/declines. |
| **Bark** | Lead-based: customer submits request, Bark sends leads to qualified pros. Pros pay per lead. | Lead gen, not dispatch. |
| **TaskRabbit** | Browseable + assigned: customer can pick specific Tasker or let algorithm suggest. | Hybrid model. Good for specialized skills. |
| **Uber (rides)** | Broadcast to nearest qualified driver. First to accept wins. 15-second timeout. | Pure speed-based. Works for commodity services. |

### Recommended: Tiered Sub-Contractor Dispatch for BB

**Tier 1: Preferred Subs (immediate offer)**
- BB has vetted subs for each specialty (ISA arborist, pest control, HVAC)
- Job goes to preferred sub first with 2-hour acceptance window
- Sub gets: push + SMS with job details, location, date, pay rate

**Tier 2: Qualified Pool (broadcast)**
- If preferred sub doesn't accept in 2 hours
- Broadcast to all qualified subs in the area
- First to accept gets it (with 30-minute minimum consideration window to prevent mistakes)
- Include: job details, pay, location, deadline

**Tier 3: Competitive Bid (complex/large jobs)**
- For jobs > $2,000 or requiring specialized equipment
- 24-48 hour bidding window
- Subs submit: price, availability, approach
- Sam reviews and selects

### Sub-Contractor Portal

Subs need a simple interface (could be a PWA or just SMS-based):

```
SMS to Sub: "New job from Bainbridge Builders:
🌳 Tree Removal — 30ft Douglas Fir
📍 789 Pine Rd, Bainbridge Island
📅 April 5, 8:00 AM
💰 $850 (your rate)
⏱ ~4 hours estimated

Reply YES to accept, NO to decline, or BID $amount"
```

**Why SMS-based is ideal for subs:**
- Subs are NOT downloading another app
- They're already on job sites with spotty internet
- SMS works everywhere
- Response is just a text reply
- Twilio handles inbound routing

### Sub-Contractor Payment Flow

```
Job Created → Sub Accepts → Sub Completes (with photos)
  → BB Reviews → BB Invoices Customer → Customer Pays
  → BB Pays Sub (minus margin) via QuickBooks
```

BB already has QuickBooks integration. Sub payment can be:
- Manual: Sam approves in QB after job verification
- Semi-auto: system creates draft bill in QB, Sam approves
- The margin/markup is configured per service type

---

## 8. MESSAGE TEMPLATES + AUTOMATION

### Complete Template Library for Home Services

BB needs approximately **15-20 message templates** covering the full service lifecycle:

#### Booking & Scheduling

| # | Template | Channel | Timing |
|---|----------|---------|--------|
| 1 | **Booking Confirmed** | SMS + Email | Immediately on booking |
| 2 | **Booking Updated** | SMS + Email | When schedule changes |
| 3 | **Booking Cancelled** | SMS + Email | On cancellation |

**Template 1 — Booking Confirmed (SMS):**
```
Hi {customer_first_name}! Your {service_type} with Bainbridge Builders is confirmed for {date} at {time}.

We'll send a reminder the day before. Questions? Reply to this text.

— Bainbridge Builders
```

**Template 1 — Booking Confirmed (Email):**
```
Subject: Your {service_type} is confirmed — {date}

Hi {customer_first_name},

Great news! Your appointment is all set:

Service: {service_type}
Date: {date} at {time}
Address: {property_address}
Estimated Duration: {duration}
Crew: {crew_name}

What to expect:
- We'll send a reminder the day before
- On the day of service, you'll get a "crew en route" notification with ETA
- After service, we'll send photos and your invoice

Special instructions from you: {customer_notes}

Need to reschedule? Reply to this email or text us at {bb_phone}.

— Bainbridge Builders
  Bainbridge Island, WA
```

#### Reminders

| # | Template | Channel | Timing |
|---|----------|---------|--------|
| 4 | **24-Hour Reminder** | SMS + Push | Day before, 5:00 PM |
| 5 | **2-Hour Reminder** | SMS | 2 hours before crew arrival |

**Template 4 — 24-Hour Reminder (SMS):**
```
Reminder: Your {service_type} is tomorrow, {date} at {time}.

Please ensure access to {access_area}. {special_instructions}

Need to reschedule? Reply RESCHEDULE. See you tomorrow!
```

#### Day-of Service

| # | Template | Channel | Timing |
|---|----------|---------|--------|
| 6 | **Crew En Route** | SMS + Push | When crew departs for job |
| 7 | **Crew Arrived** | Push | GPS geofence trigger |
| 8 | **Service In Progress** | Push (optional) | Crew marks started |
| 9 | **Service Complete** | SMS + Email | Crew marks complete |
| 10 | **Issue Found** | SMS + Email | Crew flags issue |

**Template 6 — Crew En Route (SMS):**
```
{crew_name} is on the way to your {service_type}! Estimated arrival: {eta_time} ({eta_minutes} min).

{tracking_link}
```

**Template 9 — Service Complete (SMS):**
```
Your {service_type} is complete! {crew_name} finished at {completion_time}.

{photo_link}

Your invoice ({invoice_amount}) has been sent to {customer_email}.

How'd we do? We'd love your feedback: {review_link}
```

**Template 10 — Issue Found (SMS + Email):**
```
During your {service_type} today, our crew noticed: {issue_description}

This is outside the scope of today's service, but we wanted to let you know.
Would you like us to provide an estimate? Reply YES for a free quote.

Photos: {issue_photo_link}
```

#### Post-Service

| # | Template | Channel | Timing |
|---|----------|---------|--------|
| 11 | **Invoice** | Email | On completion |
| 12 | **Payment Received** | SMS + Email | On payment |
| 13 | **Review Request** | SMS | 2 days after service |
| 14 | **Review Thank You** | SMS | After review posted |

**Template 13 — Review Request (SMS):**
```
Hi {customer_first_name}, thanks for choosing Bainbridge Builders!

If you were happy with your {service_type}, a quick review helps us a lot: {review_link}

Thank you! — Sam
```

#### Seasonal & Retention

| # | Template | Channel | Timing |
|---|----------|---------|--------|
| 15 | **Seasonal Reminder** | Email + SMS | Based on last service date |
| 16 | **Annual Service Due** | Email | 11 months after last service |
| 17 | **Weather Alert Service** | SMS | After storm events |

**Template 15 — Seasonal Reminder (SMS):**
```
Hi {customer_first_name}! Fall is here in the PNW, and it's gutter season. 🍂

Your last gutter cleaning was {months_since} months ago. Ready to schedule? Reply YES and we'll find a time.
```

**Template 17 — Weather Alert (SMS):**
```
Hi {customer_first_name}, after the recent {weather_event}, many homeowners are finding {common_issue}.

Need us to take a look? Reply YES for a free assessment.
```

#### Crew Templates

| # | Template | Channel | Timing |
|---|----------|---------|--------|
| 18 | **Daily Route Sheet** | Push + In-App | 6:00 AM |
| 19 | **New Job Added** | Push + SMS | Real-time |
| 20 | **Job Cancelled** | Push + SMS | Real-time |

### Optimal Notification Timing (Research-Based)

| Notification | Best Timing | Why |
|-------------|-------------|-----|
| Booking confirmation | Within 30 seconds | Sets professional tone, reduces "did it go through?" anxiety |
| Day-before reminder | 5:00 PM previous day | Customer is home, can prep (move cars, clear access) |
| 2-hour reminder | 2 hours before | Final heads-up, reduces no-shows by 30-40% |
| En route | When crew departs | Gives customer time to prepare, reduces "where are they?" calls |
| Review request | 48 hours after | Service is fresh but customer has had time to assess quality |
| Seasonal reminder | Based on season | Gutter cleaning: Sept-Oct. Window washing: March-April. |

### A/B Testing Priorities

1. **Reminder timing**: 24hr vs 48hr vs both → measure no-show rate
2. **Review request timing**: 24hr vs 48hr vs 7 days → measure review completion rate
3. **En route message**: with tracking link vs without → measure customer satisfaction
4. **Seasonal reminder**: SMS vs email vs both → measure booking conversion rate

---

## 9. INTEGRATION ARCHITECTURE — PUTTING IT ALL TOGETHER

### What BB Already Has

| Component | Status | Technology |
|-----------|--------|-----------|
| GPS Fleet Tracking | WORKING | Traccar → Neon PostGIS |
| Web Push Notifications | WORKING | VAPID + Service Workers |
| Email | WORKING | Gmail API |
| Customer Database | WORKING | Neon PostgreSQL |
| Employee Database | WORKING | Neon PostgreSQL |
| QuickBooks Integration | WORKING | QBO + QBT APIs |
| OSRM Routing | WORKING | Self-hosted on Railway |
| PWA (CalExp5) | WORKING | React 19 + Zustand |

### What BB Needs to Add

| Component | Recommendation | Effort | Monthly Cost |
|-----------|---------------|--------|-------------|
| SMS/MMS | Twilio Programmable Messaging | 2-3 days | ~$45/mo |
| Notification Orchestrator | Custom service (500 lines) | 3-4 days | $0 (self-hosted) |
| Dispatch Engine | Custom scored heuristic | 5-7 days | $0 (self-hosted) |
| Customer ETA Page | Lightweight web page | 2-3 days | $0 (Google free tier) |
| Crew Route Sheet | CalExp5 PWA view | 3-4 days | $0 (existing infra) |
| Message Templates | Database-stored templates | 1-2 days | $0 |
| Inbound Message Router | Twilio webhook + AI classifier | 2-3 days | ~$5/mo (AI calls) |
| Sub-Contractor Portal | SMS-based (Twilio) | 2-3 days | Included in Twilio |

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    CUSTOMER TOUCHPOINTS                   │
│  SMS (Twilio)  |  Email (Gmail)  |  Push (VAPID)  | PWA │
└──────────┬──────────────┬──────────────┬──────────┬──────┘
           │              │              │          │
           ▼              ▼              ▼          ▼
┌─────────────────────────────────────────────────────────┐
│              NOTIFICATION ORCHESTRATOR                    │
│  Event → Audience → Preferences → Template → Channel     │
│  Templates DB | Preference DB | Delivery Log             │
└──────────────────────────┬──────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   DISPATCH   │  │   INBOUND    │  │  SCHEDULING  │
│   ENGINE     │  │   ROUTER     │  │   ENGINE     │
│              │  │              │  │              │
│ Score crew   │  │ Twilio hook  │  │ Availability │
│ Assign jobs  │  │ AI classify  │  │ Calendar     │
│ Re-route     │  │ Route msg    │  │ Conflicts    │
└──────┬───────┘  └──────────────┘  └──────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│                     DATA LAYER                           │
│  Neon PostgreSQL (PostGIS)                               │
│  ├── customers, jobs, crew, schedules                    │
│  ├── cal_gps_points (fleet tracking)                     │
│  ├── notification_log, message_templates                 │
│  ├── sub_contractors, job_offers                         │
│  └── channel_preferences                                 │
└─────────────────────────────────────────────────────────┘
```

### Implementation Priority (Build Order)

| Phase | Components | Timeline | Value |
|-------|-----------|----------|-------|
| **Phase 1** | Twilio SMS setup + A2P registration + basic templates (booking confirmed, reminder, en route, complete) | Week 1-2 | Immediate customer communication |
| **Phase 2** | Notification orchestrator + channel preferences + crew route sheet in CalExp5 | Week 3-4 | Unified messaging, crew efficiency |
| **Phase 3** | Dispatch engine (scored heuristic) + real-time re-routing | Week 5-7 | Automated job assignment |
| **Phase 4** | Customer ETA page + inbound message routing (AI classifier) | Week 8-9 | Premium customer experience |
| **Phase 5** | Sub-contractor SMS dispatch + bidding system | Week 10-11 | Scale with subs |
| **Phase 6** | Seasonal automation + review requests + A/B testing | Week 12+ | Growth & retention |

### New Database Tables Needed

```sql
-- Channel preferences per customer
CREATE TABLE channel_preferences (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  sms_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT false,
  preferred_channel TEXT DEFAULT 'sms', -- primary channel
  phone TEXT,
  email TEXT,
  quiet_hours_start TIME DEFAULT '21:00',
  quiet_hours_end TIME DEFAULT '07:00',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message templates
CREATE TABLE message_templates (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,        -- 'booking_confirmed', 'crew_en_route', etc.
  channel TEXT NOT NULL,           -- 'sms', 'email', 'push'
  audience TEXT NOT NULL,          -- 'customer', 'crew', 'office', 'sub'
  subject TEXT,                    -- email subject line
  body TEXT NOT NULL,              -- template with {variable} placeholders
  active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification log (audit trail)
CREATE TABLE notification_log (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  recipient_id INTEGER,
  recipient_type TEXT,             -- 'customer', 'crew', 'sub'
  channel TEXT NOT NULL,
  template_id INTEGER REFERENCES message_templates(id),
  rendered_body TEXT,
  status TEXT DEFAULT 'pending',   -- 'pending', 'sent', 'delivered', 'failed'
  external_id TEXT,                -- Twilio SID, Gmail message ID
  error TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sub-contractor registry
CREATE TABLE sub_contractors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  specialties TEXT[],              -- ['tree_removal', 'pest_control', 'hvac']
  certifications TEXT[],           -- ['isa_arborist', 'epa_608']
  service_area_miles INTEGER DEFAULT 30,
  home_location GEOGRAPHY(POINT, 4326),
  tier TEXT DEFAULT 'pool',        -- 'preferred', 'pool'
  rating NUMERIC(3,2),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job offers to sub-contractors
CREATE TABLE job_offers (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  sub_id INTEGER REFERENCES sub_contractors(id),
  offer_type TEXT DEFAULT 'direct', -- 'direct', 'broadcast', 'bid'
  status TEXT DEFAULT 'pending',    -- 'pending', 'accepted', 'declined', 'expired'
  offered_rate NUMERIC(10,2),
  bid_amount NUMERIC(10,2),        -- for competitive bids
  offered_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Dispatch scoring weights (tunable by Sam)
CREATE TABLE dispatch_config (
  id SERIAL PRIMARY KEY,
  weight_proximity NUMERIC(3,2) DEFAULT 0.35,
  weight_skills NUMERIC(3,2) DEFAULT 0.25,
  weight_availability NUMERIC(3,2) DEFAULT 0.15,
  weight_route_efficiency NUMERIC(3,2) DEFAULT 0.10,
  weight_workload_balance NUMERIC(3,2) DEFAULT 0.10,
  weight_customer_preference NUMERIC(3,2) DEFAULT 0.05,
  auto_dispatch_services TEXT[],   -- services that auto-dispatch
  review_required_services TEXT[], -- services that need Sam's review
  max_daily_jobs_per_crew INTEGER DEFAULT 8,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 10. COST SUMMARY

### Monthly Operating Costs (At Scale)

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Twilio SMS/MMS | ~$45 | 2,500 messages at $0.008-0.02 |
| Twilio phone number | $1.15 | Local 10DLC number |
| A2P 10DLC campaign | $1.50 | Monthly registration fee |
| Google Routes API | $0 | Within free tier (10K/mo) |
| Gmail API | $0 | Existing, within quota |
| VAPID Web Push | $0 | Self-hosted, existing |
| OSRM | $0 | Self-hosted on Railway (existing) |
| Neon PostgreSQL | (existing) | Already paying for this |
| Railway hosting | (existing) | Additional service on existing plan |
| **Total NEW cost** | **~$48/mo** | |

### Comparison: Build vs Buy

| Approach | Monthly Cost | Capabilities |
|----------|-------------|-------------|
| **BB Custom (recommended)** | ~$48/mo | Full control, custom dispatch, all channels |
| Podium | $399/mo | Text + webchat + reviews (no dispatch) |
| ServiceTitan | $200-400/mo | Full FSM but generic, locked in |
| Jobber | $69-349/mo | Scheduling + invoicing (basic dispatch) |
| Housecall Pro | $49-199/mo | Scheduling + dispatch (template-based) |

BB saves $150-350/month by building custom AND gets a system tailored exactly to its workflow, integrated with existing GPS fleet tracking, QuickBooks, and CalExp5.

---

## 11. KEY DECISIONS FOR SAM

1. **SMS Provider**: Twilio (recommended) or Vonage? Both work, Twilio has better docs and ecosystem.

2. **Notification Orchestration**: Custom lightweight (~500 lines) or Novu self-hosted (more features, more complexity)?

3. **Customer ETA Page**: Yes/no? High customer value but adds a web page to maintain.

4. **Sub-Contractor Communication**: SMS-only (simplest) or SMS + web portal (more features)?

5. **Dispatch Automation Level**:
   - Level 1: System suggests, Sam confirms all
   - Level 2: Auto-dispatch routine services, Sam confirms complex
   - Level 3: Full auto with Sam override capability (recommended)

6. **Build Order**: Phase 1-2 (messaging) first? Or Phase 3 (dispatch) first? Messaging has more immediate customer impact.

---

*Research compiled from: Twilio, Knock, Novu, Courier, Podium, Intercom, Front, Google Routes API, Google OR-Tools VRP documentation, PostGIS documentation, Twilio Conversations API, Uber/DoorDash engineering blogs, Thumbtack/Handy/Bark platform analysis, field service UX research, A2P 10DLC compliance requirements.*
