# Notification Architecture — Modern Principles & GPS Implications

**Document:** NOTIFICATION_ARCHITECTURE_PRINCIPLES.md | v1.0 | 2026-05-10 | BB
**Status:** Advisory — principles, simplification, and GPS integration decisions
**Evidence base:** Synthesizes UNIVERSAL_NOTIFICATION_LAYER.md, NOTIFICATION_LAYER.md, UNIFIED_PLAN_v2.md, EXTENSIBLE_PIPELINE_AND_CREW_UX.md, and industry patterns. All recommendations traceable to documented infrastructure.

---

## The core problem with our current design

Reading the UNIVERSAL_NOTIFICATION_LAYER.md honestly: we've designed **six overlapping mechanisms** for the single most important crew notification — "review your timesheet":

1. Stage 1 push at `notify_hour_pt` (hourly scheduler)
2. Stage 2 escalation push at `notify_hour_pt + 1`
3. Post-reconstruction personalized push (~6:05 PM, new)
4. EOD pill banner in `CrewEntryLanding.jsx`
5. GPS pending count badge in the MenuDrawer GPS section
6. In-app notification center (new)

**Six surfaces for one use case is noise, not signal.** Crew will feel nagged. It's also six things to build, test, and maintain.

The right answer isn't "which six to keep" — it's "which three are truly necessary, and which three can be eliminated by designing better."

---

## The modern principle: three surfaces, one source of truth

Modern notification architecture (Slack, Linear, Notion, Superhuman) converges on this model:

```
┌──────────────────────────────────────────────────────────────┐
│  SURFACE 1 — In-app center (persistent, authoritative)       │
│                                                              │
│  The single source of truth. Every notification lands here   │
│  first. Survives reload, logout, app close.                  │
│  Badge count on app shell = unread in this center.          │
│  If crew is in the app, they see it here immediately.       │
└────────────────────────────────┬─────────────────────────────┘
                                 │ if crew is NOT in the app
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│  SURFACE 2 — Out-of-app push/email/SMS (ephemeral, bridge)   │
│                                                              │
│  Only fires when crew is outside the app. Routes back to    │
│  Surface 1 when tapped. Does NOT duplicate Surface 1.       │
│  If push fails or isn't received: Surface 1 is still there. │
└────────────────────────────────┬─────────────────────────────┘
                                 │ for immediate in-app feedback only
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│  SURFACE 3 — Toast (ephemeral, instant, no record)           │
│                                                              │
│  Confirmation only: "Synced", "Approved", "Scan uploaded".   │
│  Never for anything that requires action or persistence.     │
│  Not a notification — it's feedback.                        │
└──────────────────────────────────────────────────────────────┘
```

### Why this collapses six mechanisms to three

| Current mechanism | What it becomes |
|---|---|
| Stage 1 hourly push | **Eliminated** — post-reconstruction push (Surface 2) is the primary; Stage 1 becomes redundant |
| Stage 2 escalation push | **Kept as fallback only** — fires at 7 PM if push wasn't opened (still Surface 2) |
| Post-reconstruction personalized push | **The primary** Surface 2 notification — fires once, at ~6:05 PM, personalized |
| EOD pill banner in CrewEntryLanding | **Eliminated** — Surface 1 (notification center) badge already shows unread count on the app shell; the pill is a second redundant indicator |
| GPS pending count badge in MenuDrawer | **Eliminated** — replaced by the app shell badge count from Surface 1 (notification center). One source of truth. |
| In-app notification center | **Surface 1** — the single authoritative record |

**Result: 3 mechanisms instead of 6. Every mechanism has a distinct job.**

---

## Five modern principles

### Principle 1 — Event-driven, not procedure-driven

**Wrong (procedure-driven):**
```javascript
// GPS cron fires → calls sendNotification() directly
await sendNotification({ type: 'gps.eod_review', ... });
// Receipt filed → calls sendNotification() directly
await sendNotification({ type: 'receipt.filed', ... });
// Tool returned → calls sendNotification() directly
await sendNotification({ type: 'tool.returned', ... });
```

**Right (event-driven):**
```javascript
// GPS cron fires → emits domain event
await emitEvent('gps.drafts_ready', { employeeId, date, draftCount, summary });

// Notification layer subscribes to events and handles routing
// GPS cron knows nothing about push, email, or in-app
// Adding a new channel = new subscriber, zero cron changes
```

The **event emitter pattern** decouples producers (GPS cron, receipt pipeline, tool crib) from consumers (push sender, email sender, in-app writer). Each domain emits the event it knows about. The notification layer decides what to do with it.

**Implementation for BB_Micro_Bridge:**

```javascript
// src/utils/event-bus.js (new, ~50 lines)
const handlers = new Map(); // eventType → [handler functions]

export function on(eventType, handler) {
  if (!handlers.has(eventType)) handlers.set(eventType, []);
  handlers.get(eventType).push(handler);
}

export async function emit(eventType, payload) {
  const eventHandlers = handlers.get(eventType) || [];
  // Fire all handlers in parallel, log failures independently
  await Promise.allSettled(eventHandlers.map(h => h(payload)));
}
```

**Notification layer subscribes at startup:**

```javascript
// src/notifications/subscriptions.js
import { on } from '../utils/event-bus.js';
import { routeNotification } from './router.js';

// Each domain event maps to one or more notification types
on('gps.drafts_ready',     payload => routeNotification('gps.eod_review', payload));
on('gps.candidates_found', payload => routeNotification('gps.new_candidates', payload));
on('receipt.filed',        payload => routeNotification('receipt.filed', payload));
on('tool.transferred',     payload => routeNotification('tool.transfer_request', payload));
on('bouncie.mileage_uploaded', payload => routeNotification('gps.mileage_uploaded', payload));
// ... each new feature just adds one line here
```

**Adding a new notification type for a new feature = add one `on()` line. Nothing else changes.**

---

### Principle 2 — Preference at dispatch time, not at event time

Never hardcode "crew gets push, admin gets email." That bakes brittle assumptions into domain logic. Instead, resolve preferences at dispatch time in the notification router.

```javascript
// src/notifications/router.js
export async function routeNotification(type, payload) {
  const sql = await getSql();
  const config = NOTIFICATION_CONFIG[type]; // tier, default channels, audience query

  // 1. Resolve recipients from payload + config
  const recipients = await resolveRecipients(config.audience, payload, sql);

  // 2. For each recipient: resolve their preferred channels
  for (const recipient of recipients) {
    const prefs = await getPreferences(recipient.id, recipient.type, sql);
    const channels = resolveChannels(config.tier, prefs, config.defaultChannels);

    // 3. Dispatch to each channel
    await dispatchAll(type, payload, recipient, channels);
  }
}
```

`resolveChannels()` applies the rules:
- T0: always email + SMS regardless of preferences (emergency)
- T1: push + email, bypass quiet hours
- T2: push + in-app, respect quiet hours
- T3: in-app only, or email digest if opted in
- External (T4): SMS + email, no quiet hours check (time-sensitive for customers)

---

### Principle 3 — In-app center is the primary record

Every notification — regardless of which external channels were sent — creates a record in `cal_in_app_notifications`. This is the authoritative history.

```
GPS draft → emit event
  → ALWAYS write to cal_in_app_notifications (instant, synchronous)
  → IF user not active in app: send push (async, best-effort)
  → IF push fails: in-app record still exists
  → IF push succeeds: crew taps → opens app → sees the same record marked as "from notification"
```

**The in-app center is not a backup for failed push. It IS the primary.**

Push is the real-time delivery mechanism for when the user is away. The in-app center is the permanent record that works whether push was received or not.

---

### Principle 4 — Rate limiting and fatigue prevention

No user should receive more than N notifications of the same type in a rolling window. This is especially important as we add more automated sources (Bouncie trips, BLE beacons, location candidates, tool movements).

```javascript
// Rate limiting rules (enforced in router.js before dispatch)
const RATE_LIMITS = {
  'gps.eod_review':         { max: 1, windowHours: 24 },  // once per day
  'gps.new_candidates':     { max: 1, windowHours: 24 },  // once per day (batch)
  'tool.transfer_request':  { max: 5, windowHours: 1 },   // burst OK for tools
  'customer.reminder_2h':   { max: 1, windowHours: 4 },   // no double-reminders
  'customer.crew_en_route': { max: 1, windowHours: 8 },   // once per job
};
```

**Why this matters for GPS:** Without rate limiting, a crew member who works at 3 different jobsites and has 5 draft entries would get 5 separate pushes as each draft is approved. With rate limiting, they get 1 batched summary.

**Batching rule:** The `gps.eod_review` notification already implements this correctly — the post-reconstruction push sends one notification summarizing the entire day. This is the pattern to follow for all high-volume notification types.

---

### Principle 5 — Templates are data, not code

Every notification's title, body, and channel-specific format should be stored in `cal_message_templates` — not hardcoded in JavaScript strings.

**Why:** Sam will want to change the wording of push notifications. "Your timesheet is ready" might become "Time to confirm your day!" or be translated. With templates as code strings, that requires a PR, CI, and a deploy. With templates in the DB, it's a SQL UPDATE.

**Simple template renderer (50 lines, Handlebars):**

```javascript
import Handlebars from 'handlebars';

export async function renderTemplate(typeSlug, channel, data, sql) {
  const [tmpl] = await sql`
    SELECT title_template, body_template, email_subject
    FROM cal_message_templates
    WHERE type_slug = ${typeSlug} AND channel = ${channel} AND is_active = TRUE
  `;
  if (!tmpl) return null;
  return {
    title: tmpl.title_template ? Handlebars.compile(tmpl.title_template)(data) : null,
    body: Handlebars.compile(tmpl.body_template)(data),
    subject: tmpl.email_subject ? Handlebars.compile(tmpl.email_subject)(data) : null,
  };
}
```

---

## The simplified notification architecture

Applying all five principles, the architecture collapses to:

```
DOMAIN EVENT EMITTED
  (gps_cron, receipt_pipeline, tool_crib, bouncie_webhook)
         │
         ▼
NOTIFICATION ROUTER (notifications/router.js)
  1. Resolve recipients
  2. Check rate limits (skip if already sent today)
  3. Resolve channel preferences per recipient
  4. Render template per channel
  5. Write to cal_in_app_notifications (ALWAYS)
  6. Dispatch push/email/SMS if user not in app (BEST-EFFORT)
  7. Log to bridge_notification_deliveries (AUDIT)
         │
         ▼
SURFACES
  • In-app center badge (immediate, from cal_in_app_notifications count)
  • Push notification (if away from app, best-effort)
  • Email (if tier >= T2 or user prefers email)
  • SMS (T4 external audience only, Phase 4)
```

**Total new code:** ~500 lines across `event-bus.js`, `notifications/router.js`, `notifications/subscriptions.js`, `notifications/dispatch.js`, `notifications-v1.js` (HTTP routes). Everything else reuses existing `sendNotification()`, `webPush.sendNotification()`, Resend, and `bridge_notification_deliveries`.

---

## What to build now vs later

### Build now (Phases 0–2, alongside GPS Auto-TS work)

| What | Why now |
|---|---|
| `cal_in_app_notifications` table | Foundation — everything else depends on it |
| `event-bus.js` + `notifications/subscriptions.js` | Decouples future features from notification code |
| In-app notification center UI (`NotificationCenter.jsx`) | Crew needs persistent history; push alone is insufficient |
| Badge count on `Header.jsx` | One unread indicator, replaces scattered `gpsPendingCount` |
| Post-reconstruction personalized push | The primary GPS notification |
| Rate limiting (max 1/day for GPS type) | Prevents fatigue from day 1 |

### Build later (Phase 3+, when needed by the feature)

| What | When |
|---|---|
| Email templates (React Email) | When customer-facing features ship |
| SMS via Twilio | When customer booking flow ships |
| Inbound SMS intent classifier | When customer two-way messaging is needed |
| Sub-contractor dispatch | When sub onboarding ships |
| Per-category notification preferences UI | When notification volume grows enough to matter |
| Email digest mode | When T3 volume grows |

---

## GPS unified plan implications

### Implication 1 — Remove three components from the GPS plan

The following items in `EXTENSIBLE_PIPELINE_AND_CREW_UX.md` are **replaced** by the notification center:

1. **EOD pill banner in `CrewEntryLanding.jsx`** → Remove. The notification center badge on `Header.jsx` replaces this. Crew can see unread count from anywhere in the app, not just on the map screen.

2. **`gpsPendingCount` in `uiSlice.js`** → Remove. Badge count comes from `GET /api/notifications/count` (notification center), not a GPS-specific endpoint. The in-app center is the single source of truth.

3. **Stage 1 hourly push (the current primary)** → Demote to documentation as fallback only. The post-reconstruction push at ~6:05 PM is the primary. Stage 1 fires only if the post-reconstruction push failed to send or wasn't received.

**What remains:**
- Post-reconstruction personalized push (Surface 2 primary)
- Stage 2 escalation at 7 PM (Surface 2 fallback)
- In-app notification center with GPS-type filter (Surface 1)

### Implication 2 — GPS cron emits events, doesn't call sendNotification()

Current design (from EXTENSIBLE_PIPELINE_AND_CREW_UX.md section 7 and gps-cron.js):
```javascript
// GPS cron directly calls the push route after reconstruction
await fetch(`/api/push/send-eod-review`, { method: 'POST', body: JSON.stringify(results) });
```

Better design (event-driven):
```javascript
// GPS cron emits domain events — knows nothing about notification channels
for (const result of results.filter(r => r.draftsCreated > 0)) {
  await emit('gps.drafts_ready', {
    employeeId: result.employeeId,
    date: targetDate,
    draftCount: result.draftsCreated,
    summary: result.locationSummary, // "Oak Ave 8h · Ace HW 33min"
    vehicleMiles: result.vehicleMiles,
  });
}
```

The notification router handles the rest. The GPS cron is now agnostic to whether the notification goes to push, email, in-app, or all three.

### Implication 3 — Location candidate notification simplification

From `LOCATION_DISCOVERY_AND_PROSPECTS.md`: when admin needs to classify new locations, a push notification fires. In the event-driven model:

```javascript
// After reconstruction creates location candidates:
if (newCandidatesCount > 0) {
  await emit('gps.candidates_found', {
    date: targetDate,
    count: newCandidatesCount,
    topCandidate: { address: '123 Oak Ave', score: 0.88 },
  });
}
```

The notification router routes this to admin's push + in-app center. The admin sees a badge on the notification center showing "3 new locations need classification." Tapping it routes to `/?screen=gps-admin`.

**The MenuDrawer badge for location candidates (current design) is eliminated** — it was a third separate badge count endpoint. The notification center consolidates all badges into one.

### Implication 4 — Revised GPS notification state in CalExp5

Current design has these GPS-specific state keys:
```javascript
gpsPendingCount: 0,           // separate GPS-specific fetch
locationCandidateCount: 0,    // separate admin badge fetch
```

These both go away. Replaced by:
```javascript
unreadNotificationCount: 0,   // one fetch from notification center API
```

The notification center filters by type when rendering (`icon_type === 'gps'` for GPS items). The MenuDrawer GPS section shows a badge when there are unread GPS-type notifications. The admin GPS section shows a badge for unread `gps.new_candidates` notifications. **One endpoint drives all badges.**

### Implication 5 — The GPS notification timeline

With the event-driven architecture and simplified surfaces, the complete GPS notification flow becomes:

```
6:00 PM PT  — gps-cron.js fires
6:01 PM PT  — Phone GPS reconstruction (reconstructTimeline per employee)
6:03 PM PT  — Bouncie process-day (derive stops, merge evidence)
6:04 PM PT  — mergePresences() runs per employee
6:05 PM PT  — For each employee with new drafts:
              emit('gps.drafts_ready', { summary, miles, ... })
              ↓
              notification router receives event
              ↓
              • INSERT cal_in_app_notifications (instant)
              • Send personalized push (if not in app)
                "Your timesheet is ready"
                "Oak Ave 8h · Ace HW 33min · 14.3 mi"
              • No email at this tier (T2, respect quiet hours, push suffices)

6:06 PM PT  — Crew opens push → app → notification center shows unread dot
              → taps notification → GpsReviewScreen opens
              → Quick Approve banner (if all high confidence)
              → Approve All in 1 tap
              → Mileage auto-uploads to QBT in background
              → notification marked as read

7:00 PM PT  — Stage 2 (fallback): if crew has unread GPS notification
              AND it hasn't been opened yet → escalation push
              "Timesheet still open — don't forget before end of day"

9:00 PM PT  — Quiet hours begin. No more pushes until 6 AM PT.
```

**The crew experience:** One push at ~6:05 PM with a personalized summary. Tap → approve → done in 30 seconds. If missed, one reminder at 7 PM. If still missed, the notification center shows an unread badge the next time they open the app.

---

## The scalability question

At BB Inc's current scale (25 crew, 5 vehicles), simplicity wins over sophistication. The architecture above is simple. But it must scale when the ecosystem grows.

**What scales without architecture changes:**
- Adding new notification types → add `on()` line in subscriptions.js
- Adding new channels (SMS) → add channel handler in dispatch.js
- Adding external audiences (customers) → add audience resolver in router.js
- Adding new templates → SQL INSERT into cal_message_templates
- 100 crew instead of 25 → same code, database scales fine (Neon handles it)

**What needs architecture re-evaluation at scale:**
- **500+ crew**: Consider moving from in-process event bus to a real message queue (Redis Streams or SQS). At 25 crew the in-process event bus is fine; at 500 crew with high notification volume, you want notifications processing in background workers with retry guarantees.
- **Real-time customer tracking**: Google Routes API or OSRM live ETA pages require a WebSocket/SSE layer — that's a separate infra concern from the notification layer.
- **Notification analytics**: At scale you need delivery rates, open rates, click-through per type. Plausible.io or a custom analytics table per notification type. Not needed at 25 crew.

**The event-driven foundation makes these migrations non-breaking.** Changing the event bus from in-process to Redis Streams only changes one file (`event-bus.js`). All domain code (`emit()` calls) and all notification code (`on()` handlers) stay the same.

---

## Summary — the elegant architecture

| Design choice | Old (complex) | New (simple) |
|---|---|---|
| **Coupling** | GPS cron calls push route directly | GPS cron emits event; router reacts |
| **Surfaces** | 6 overlapping mechanisms | 3 distinct surfaces with clear jobs |
| **Badge count** | `gpsPendingCount` + `locationCandidateCount` (2 separate fetches) | `unreadNotificationCount` (1 fetch, filters by type in UI) |
| **Persistence** | Push-only (lost if missed) | In-app center (permanent record) + push (real-time delivery) |
| **Templates** | Hardcoded strings in JS | DB table, edititable without deploys |
| **Rate limiting** | None (notification fatigue risk) | 1/day per type per user |
| **Adding a new notification** | Update 3 files (domain code + push route + cron) | 1 line in subscriptions.js |
| **EOD mechanism** | 4 mechanisms | 1 (post-reconstruction push) + 1 fallback (Stage 2) + 1 center |

The architecture is: **emit once, route by preference, write always, push when away, surface in center.**

Everything else — SMS, customer notifications, sub-contractor dispatch, seasonal automation — plugs into the same event bus with zero changes to the foundation. That's the extensibility. The foundation itself stays simple enough to hold in one developer's head.

---

## What to update in `UNIFIED_PLAN_v2.md`

Three additions to Section 7 (CalExp5 surface):

1. **Remove** `gpsPendingCount` from uiSlice new state — replaced by `unreadNotificationCount`
2. **Remove** EOD pill banner from `CrewEntryLanding.jsx` deliverables
3. **Add** `event-bus.js` + `notifications/subscriptions.js` to Phase 1 bridge deliverables

And add a note in Section 8 (Crew EOD UX):

> The EOD pill banner (Layer 2 in the original design) is eliminated. The notification center badge on the app shell header serves the same function across the entire app, not just the map view. Crew sees the unread indicator from wherever they are in CalExp5.
