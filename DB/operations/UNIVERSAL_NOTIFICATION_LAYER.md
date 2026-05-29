# Universal Notification Layer — CalExp5 Ecosystem

**Document:** UNIVERSAL_NOTIFICATION_LAYER.md | v1.0 | 2026-05-10 | BB
**Status:** Architecture spec — all-inclusive, multi-tier, implementation-ready
**Evidence base:** 100% reads of DISPATCH_MESSAGING_RESEARCH.md (918 lines, Twilio + template research), COMMUNICATIONS_AND_ACTION_MODEL.md (445 lines, 5-layer domain model), ACTION_AND_NOTIFICATION_MODEL.md (89 lines, signal pipeline), UNIVERSAL_CONTROL_PLANE_MODEL.md (notification policies), push-v1.js (full push infrastructure), push-scheduler.js (v1.1.0), sw.js (v2.1.0), notify.js (Resend email dispatcher, bridge_notification_deliveries schema), Toast.jsx, NotificationSetupStep.jsx, GpsAdminPanel.jsx, MenuDrawer-v2.jsx (all notification sections), App.jsx (push registration + deep links), push-registration.js, permissions.js, config-v2.js (VAPID + API key model). No guessing.

---

## 1. Why a universal notification layer

The CalExp5 ecosystem currently has notification capability scattered across isolated pipelines:
- Push notifications: `push-v1.js` + `push-scheduler.js` (GPS-centric)
- Email: `notify.js` + Resend (admin alerts only)
- In-app toasts: `Toast.jsx` (ephemeral, 3-second)
- No SMS — `ALLOW_SMS=false` in ControlTower config (deferred)
- No external audience notifications (customers, subs, suppliers)
- No in-app notification inbox or history
- No unified preference system

As the platform grows, BB Inc needs to notify multiple audiences across multiple channels with consistent routing, tracking, templating, and preference management. The infrastructure already exists for push and email. The framework to unify it all is what's missing.

**This document defines the universal multi-tier notification layer** — the routing engine, the channel matrix, the audience model, the preference system, the template catalog, and the delivery tracking.

---

## 2. What already exists (zero guessing)

### Currently active infrastructure

| Component | Status | File | Purpose |
|---|---|---|---|
| **Web Push (VAPID)** | ✅ Active | `push-v1.js`, `sw.js` | GPS/timesheet reminders to crew, 3 stages |
| **Email (Resend)** | ✅ Active | `notify.js` (sendEmailNotification) | Admin alerts: QBT failures, compliance, tickets, invoices |
| **`sendNotification()` dispatcher** | ✅ Active | `notify.js` | Multi-channel abstraction: `channel: 'all|push|email|in_app'` |
| **`bridge_notification_deliveries`** | ✅ Active | Neon table | Delivery audit trail: channel, dedupeKey, recipientId, status, error |
| **Quiet hours** | ✅ Active | `notify.js` | 6 AM – 9 PM PT; bypass with `urgent: true` |
| **Idempotency/dedup** | ✅ Active | `notify.js` + Resend + web-push topic | 24h email dedup; push topic dedup per dedupeKey |
| **In-app events** | ✅ Active | `cal_asset_events` | `event_type='notification'` stored but no crew UI yet |
| **Admin push control** | ✅ Active | `push-v1.js` admin routes | Per-employee toggle, test push, manual send |
| **In-app toasts** | ✅ Active | `Toast.jsx` | 3s ephemeral, no history |
| **SMS** | ❌ Not implemented | — | `ALLOW_SMS=false` in ControlTower; Twilio not configured |
| **Customer-facing notifications** | ❌ Not implemented | — | No booking/ETA/completion notifications yet |
| **Sub-contractor dispatch** | ❌ Not implemented | — | SMS-based job offers planned |
| **In-app notification center** | ❌ Not built | — | No inbox, no badge count on app shell, no history view |

### The `sendNotification()` API (existing interface, extended below)

```javascript
// src/utils/notify.js — existing dispatcher signature
sendNotification({
  type: string,             // notification type slug
  recipientId: string,      // employee_id or 'admin'
  title: string,
  body: string,
  url: string,              // deep link: '/?screen=...'
  channel: 'all' | 'push' | 'email' | 'in_app',
  urgent: boolean,          // bypass quiet hours
  dedupeKey: string,        // optional; auto-generated from type+recipientId if omitted
})
```

This is the **right abstraction point**. The universal layer extends it with: SMS channel, audience resolution, template rendering, and preference resolution.

---

## 3. Multi-tier model overview

The notification system serves four tiers of urgency and five audience segments.

### Urgency tiers

| Tier | Name | Examples | Channels | Bypass quiet hours? |
|---|---|---|---|---|
| **T0 — Critical** | System emergency | Bridge down, data loss, security breach | Email + SMS (admin only) | Yes — always |
| **T1 — Urgent** | Needs attention today | GPS reconstruction failed, QBT upload error, timesheet conflict | Push + Email | Yes |
| **T2 — Actionable** | End-of-day workflow | Timesheet ready to confirm, receipt upload pending | Push + In-app banner | No — respect quiet hours |
| **T3 — Informational** | Confirmation / FYI | Mileage uploaded to QBT, tool returned, payroll reminder | Toast + Email digest | No |
| **T4 — External** | Customer/sub-facing | Booking confirmed, crew en route, job complete, payment received | SMS + Email (customer) | Yes for time-sensitive |

### Audience segments

| Segment | Who | Primary channels | Opt-in required? |
|---|---|---|---|
| **Crew** | Field crew members (role: employee) | Push + In-app | Yes (onboarding) |
| **Manager/Foreman** | On-site leads (role: manager) | Push + In-app + Email | Yes (onboarding) |
| **Admin** | Sam + office staff (role: admin) | Email + Push + In-app | Auto (admin setup) |
| **Customer** | Homeowners receiving service | SMS + Email | Yes (booking flow) |
| **Subcontractor** | Trade partners receiving job offers | SMS + Email | Yes (sub registration) |

---

## 4. Five notification channels

### Channel 1 — In-app toast (existing, T3 only)

**Technology:** `Toast.jsx` + `showToast()` Zustand action
**Duration:** 3 seconds auto-dismiss + 300ms fade
**Position:** `fixed bottom-20 left-4 right-4` (above keyboard on mobile)
**Types:** `info` (blue) | `success` (green) | `warning` (amber) | `error` (red)
**Audience:** Crew + Manager + Admin (whoever is in the app at that moment)
**Best for:** Immediate feedback: "Synced", "Scan uploaded", "Location updated"
**Not suitable for:** Anything needing persistence or confirmation

---

### Channel 2 — In-app notification center (NEW — does not exist yet)

**Technology:** New `NotificationCenter.jsx` component + `cal_in_app_notifications` table
**Persistence:** Survives page reload; stored in Neon, not ephemeral
**Visibility:** Badge count on main app shell (red dot on menu icon when unread > 0)
**Drawer:** Slide-in panel from the right, triggered by tapping the badge
**Audience:** Crew + Manager + Admin

**What it shows:**
- Unread/read state per notification
- Timestamp (relative: "2 min ago", "Yesterday")
- Icon by type (GPS, receipt, tool, system)
- Deep link action button
- Mark as read / dismiss

**Why it's needed:** Push notifications are lost if device is silenced, phone is off, or notification is swiped away. The in-app center is the persistent fallback that crew can check at any time. Currently the only "history" is the GPS pending-drafts count in the MenuDrawer — nothing else persists.

**`cal_in_app_notifications` table:**

```sql
CREATE TABLE cal_in_app_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     TEXT NOT NULL REFERENCES employees(id),
  type            TEXT NOT NULL,            -- notification type slug
  tier            TEXT NOT NULL,            -- 'T0'|'T1'|'T2'|'T3'
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  url             TEXT,                     -- deep link
  icon_type       TEXT DEFAULT 'info',      -- 'gps'|'receipt'|'tool'|'system'|'mileage'|'customer'
  is_read         BOOLEAN DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,              -- auto-expire old notifications (30 days default)
  source_type     TEXT,                     -- what generated this: 'gps_cron'|'bouncie'|'admin'|etc.
  source_id       TEXT,                     -- ID of generating entity (draft_id, upload_id, etc.)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cal_in_app_notifications_employee_unread_idx
  ON cal_in_app_notifications (employee_id, is_read, created_at DESC)
  WHERE dismissed_at IS NULL AND expires_at > NOW();
```

**Badge count query** (fetched on app load and after any notification action):
```sql
SELECT COUNT(*) FROM cal_in_app_notifications
WHERE employee_id = $1 AND is_read = FALSE
  AND dismissed_at IS NULL AND expires_at > NOW();
```

---

### Channel 3 — Web Push / PWA (existing, T1–T2)

**Technology:** Web Push API + VAPID + sw.js + `push-v1.js`
**Storage:** `cal_push_subscriptions` table (Neon)
**Scheduler:** `push-scheduler.js` (hourly) + new post-reconstruction direct push
**Audience:** Crew + Manager + Admin (requires opt-in during onboarding)
**iOS requirement:** Must be installed as home-screen PWA (iOS 16.4+)
**Best for:** End-of-day reminders, time-sensitive workflow prompts

**All notification types and their push payload:** See Section 7.

---

### Channel 4 — Email (existing via Resend, extend for all tiers)

**Technology:** Resend API via `notify.js::sendEmailNotification()`
**No SMTP:** Railway blocks ports 465/587 — Resend HTTPS API is the only path
**Cost:** Resend free tier covers 3,000 emails/month; paid $19.95/mo for 50,000
**Audience:** All segments (crew, manager, admin, customer, sub-contractor)
**Best for:** Formal confirmations, digests, admin alerts, external audiences
**Current uses:** QBT sync failures, compliance alerts, ticket escalations, invoices, asset subscriptions
**Needs adding:** GPS workflow emails, customer booking confirmations, sub-contractor job offers, Bouncie mileage confirmations

**Email template engine:** Resend supports React email templates or simple HTML. Recommended: React Email (from DISPATCH_MESSAGING_RESEARCH.md) for consistent BB brand styling.

---

### Channel 5 — SMS via Twilio (NEW — not implemented)

**Technology:** Twilio SMS API
**Cost (from DISPATCH_MESSAGING_RESEARCH.md):** $0.0079/message outbound + $1/month/number + $4–44 one-time A2P 10DLC registration
**Estimated monthly at BB Inc scale:** ~$45/month (500 customer messages + crew alerts)
**Audience:** Customers (primary), Sub-contractors, Admin urgent alerts
**Not for:** Regular crew notifications (push is cheaper and richer)
**A2P 10DLC:** Required by US carriers for business SMS. One-time registration with Twilio, ~2-week approval process.

**Why Twilio over alternatives (from research):**
| Option | Cost/month | Verdict |
|---|---|---|
| **Twilio** (recommended) | ~$45 | Pay-per-use, Conversations API, webhook inbound, strong docs |
| Bird | $45 | Similar but less mature |
| Vonage | $35 | Viable alternative |
| Podium | $399 | Wrong product (review generation + webchat) |
| Intercom | $300+ | Wrong product (customer support) |

**Twilio Conversations API:** Allows a single conversation to span SMS + WhatsApp + web chat — future-proofing for customer communication channels.

**Two-way SMS intelligence (from research):**
Inbound SMS from customers (replies to notifications) need intent classification:
- Layer 1: Keyword rules (70% of messages, instant) — "YES", "NO", "CANCEL", "CONFIRM", "HELP"
- Layer 2: Claude Haiku (30% ambiguous) — ~$0.001/message, <$5/month at BB volume

Intent categories: `JOB_UPDATE`, `SCHEDULE_CHANGE`, `URGENT`, `QUESTION`, `GENERAL`, `ACKNOWLEDGMENT`

---

## 5. Routing and preference engine

### The preference resolution model

For each notification event, the router resolves: **which audience members** receive it, via **which channels**, respecting **their preferences** and **quiet hours**.

```
NOTIFICATION EVENT FIRED
         │
         ▼
┌──────────────────────────────────────┐
│  1. Audience Resolution              │
│  Who should receive this notification?
│  → Resolve by: role, relationship,   │
│    jobsite assignment, device status │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│  2. Preference Resolution            │
│  What channels does each recipient   │
│  prefer? What are their quiet hours? │
│  Are their devices active?          │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│  3. Channel Selection                │
│  Based on tier + preferences:        │
│  T0: SMS + Email (bypass quiet)     │
│  T1: Push + Email (bypass quiet)    │
│  T2: Push + In-app (respect quiet)  │
│  T3: In-app only (or email digest)  │
│  T4: SMS + Email (external)         │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│  4. Template Rendering               │
│  Render title + body per channel     │
│  (SMS: 160 chars; push: 60 chars;   │
│   email: full HTML; in-app: rich)   │
└────────────────┬─────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────┐
│  5. Dispatch + Track                 │
│  Send via each channel's API        │
│  → INSERT cal_in_app_notifications   │
│  → webPush.sendNotification()       │
│  → resend.emails.send()             │
│  → twilio.messages.create()         │
│  → Log to bridge_notification_       │
│    deliveries (existing)             │
└──────────────────────────────────────┘
```

### `cal_notification_preferences` table (NEW)

Per-user, per-channel preferences. Extends the existing `cal_push_subscriptions.notify_hour_pt`.

```sql
CREATE TABLE cal_notification_preferences (
  id                  SERIAL PRIMARY KEY,
  employee_id         TEXT NOT NULL REFERENCES employees(id),

  -- Channel preferences (what crew has enabled/disabled per category)
  push_enabled        BOOLEAN DEFAULT TRUE,
  email_enabled       BOOLEAN DEFAULT TRUE,
  sms_enabled         BOOLEAN DEFAULT FALSE,  -- opt-in required; default off

  -- Quiet hours (PT) — send outside these hours even for T2/T3
  quiet_start_hour_pt INT DEFAULT 20,   -- 8 PM PT (was 9 PM — updated for crew)
  quiet_end_hour_pt   INT DEFAULT 6,    -- 6 AM PT

  -- Per-category overrides (JSON for extensibility)
  -- {"gps_timesheet": "push", "tool_crib": "none", "payroll": "push+email"}
  category_overrides  JSONB DEFAULT '{}',

  -- Digest preferences
  email_digest_enabled    BOOLEAN DEFAULT FALSE,  -- batch T3 into daily digest
  email_digest_hour_pt    INT DEFAULT 8,           -- 8 AM PT digest delivery

  -- External contact info (for SMS/email to crew)
  phone_e164          TEXT,    -- e.g., '+14085551234' — for SMS to crew
  email_address       TEXT,    -- for email to crew

  -- Admin override
  admin_push_override     BOOLEAN,  -- null = crew controls; TRUE/FALSE = admin forces
  admin_override_reason   TEXT,
  admin_override_at       TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id)
);
```

### External audience preferences (customers, subs)

Stored separately since they don't have employee records:

```sql
CREATE TABLE cal_external_notification_prefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     TEXT NOT NULL,   -- customer_id or sub_id
  external_type   TEXT NOT NULL,   -- 'customer' | 'subcontractor' | 'supplier'
  phone_e164      TEXT,
  email_address   TEXT,
  sms_opted_in    BOOLEAN DEFAULT FALSE,
  email_opted_in  BOOLEAN DEFAULT TRUE,
  opted_in_at     TIMESTAMPTZ,
  opted_out_at    TIMESTAMPTZ,
  quiet_start_hour_pt INT DEFAULT 20,
  quiet_end_hour_pt   INT DEFAULT 7,
  timezone        TEXT DEFAULT 'America/Los_Angeles',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. Extended `sendNotification()` API

The existing dispatcher in `notify.js` becomes the universal router. Extended signature:

```javascript
// notify.js — extended universal dispatcher
await sendNotification({
  // Required
  type: 'gps.eod_review',          // Notification type slug (see Section 7)
  audience: {
    employeeIds: ['EMP-1'],          // Internal recipients
    externalIds: [{id: 'CUST-1', type: 'customer'}],  // External recipients
    roles: ['admin'],                // All employees with this role
  },

  // Tier controls routing
  tier: 'T2',                        // T0–T4

  // Content (per-channel templates auto-selected if template key provided)
  templateKey: 'gps.eod_review',     // OR provide title+body directly
  templateData: {                    // Variables for template interpolation
    crew_name: 'Mike',
    location_summary: 'Oak Ave 8h · Ace HW 33min',
    miles: '14.3',
  },

  // Channel override (defaults from tier + preferences if omitted)
  channels: ['push', 'in_app'],      // Force specific channels

  // Behavior
  url: '/?screen=gps-review',        // Deep link for push + in-app
  urgent: false,                     // Bypass quiet hours
  dedupeKey: `gps.eod.EMP-1.2026-05-10`,  // Idempotency key

  // Metadata for tracking
  sourceType: 'gps_cron',
  sourceId: 'recon-run-uuid',
});
```

**Internal routing logic:**

```javascript
async function sendNotification(opts) {
  const { tier, audience, urgent } = opts;

  // 1. Resolve recipients
  const recipients = await resolveAudience(audience); // returns [{id, type, prefs}]

  // 2. For each recipient, determine channels
  for (const recipient of recipients) {
    const channels = await resolveChannels(recipient, tier, urgent);
    // channels = ['push', 'in_app'] or ['email'] or ['sms'] etc.

    // 3. Render template for each channel
    for (const channel of channels) {
      const content = await renderTemplate(opts.templateKey, opts.templateData, channel);

      // 4. Dedup check
      const alreadySent = await checkDedup(opts.dedupeKey, channel, recipient.id);
      if (alreadySent) continue;

      // 5. Reserve delivery slot (for concurrent safety on multi-replica bridge)
      await reserveNotificationDelivery(channel, opts.dedupeKey, recipient.id);

      // 6. Dispatch
      try {
        await dispatch(channel, recipient, content, opts.url);
        await markNotificationDeliverySent(channel, opts.dedupeKey, recipient.id);
      } catch (err) {
        await markNotificationDeliveryFailed(channel, opts.dedupeKey, recipient.id, err.message);
      }
    }
  }
}
```

---

## 7. Notification type catalog (complete)

### GPS & Auto-TS notifications

| Type slug | Tier | Who | Channels | Title | Body | Deep link | Trigger |
|---|---|---|---|---|---|---|---|
| `gps.eod_review` | T2 | Crew | Push + In-app | "Your timesheet is ready" | "Oak Ave 8h · Ace HW 33min · 14.3 mi — confirm your day" | `/?screen=gps-review` | After 6 PM reconstruction (personalized) |
| `gps.eod_fallback` | T2 | Crew | Push | "Time to close your timesheet" | "Review and approve your GPS entries for today" | `/?screen=gps-review` | Stage 1 hourly scheduler |
| `gps.eod_escalation` | T2 | Crew | Push | "Timesheet still open" | "Don't forget to approve before end of day" | `/?screen=gps-review` | Stage 2 hourly scheduler |
| `gps.mileage_uploaded` | T3 | Crew | In-app | "Mileage logged" | "14.3 mi for Tue 5/9 added to your timesheet" | `/?screen=gps-mileage` | After successful QBT upload-mileage |
| `gps.new_candidates` | T2 | Admin | Push + In-app | "New locations need classification" | "3 new locations from today's routes" | `/?screen=gps-admin` | After reconstruction creates candidates |
| `gps.device_low_battery` | T1 | Admin | Email + In-app | "Low battery: [crew name]" | "Mike's BB Tracker at 14% — may lose tracking" | `/?screen=gps-admin` | When battery_level < 0.15 in ping |
| `gps.reconstruction_failed` | T1 | Admin | Email + Push | "GPS reconstruction failed" | "3 consecutive failures — draft timesheets not created" | `/?screen=gps-admin` | gps-cron 3-failure alert |
| `gps.tracker_paired` | T3 | Crew | In-app | "BB Tracker connected" | "GPS tracking is now active for your shifts" | `/` | QR pairing complete |
| `gps.tracker_offline` | T1 | Admin | Email | "BB Tracker offline: [name]" | "No pings for 6h from Mike's device" | `/?screen=gps-admin` | If no pings for >6 work hours |

### Payroll & timesheet notifications

| Type slug | Tier | Who | Channels | Title | Body | Deep link | Trigger |
|---|---|---|---|---|---|---|---|
| `payroll.upload_reminder` | T2 | Crew | Push | "Upload your hours tonight" | "Pay period closes at midnight. Upload any pending hours now." | `/` | Wednesday 6 PM PT (existing Stage 3) |
| `payroll.qbt_sync_failed` | T0 | Admin | Email + Push | "QBT sync failed" | "The QBT timesheet sync failed at [time]. [N] employees missing." | `/?screen=gps-admin` | QBT sync error (existing) |
| `payroll.period_locked` | T3 | Admin | Email | "Pay period locked" | "PP [dates] has been approved and locked in QBT." | `/` | QBT pay period approval event |

### Receipt & BB Scan notifications

| Type slug | Tier | Who | Channels | Title | Body | Deep link | Trigger |
|---|---|---|---|---|---|---|---|
| `receipt.filed` | T3 | Crew | Toast + In-app | "Receipt filed" | "Attached to [property name]" | `/?screen=receipt` | After successful receipt filing |
| `receipt.queue_uploaded` | T3 | Crew | Toast | "Queued receipts uploaded" | "[N] receipts sent after reconnecting" | — | After offline queue flush |
| `receipt.scan_failed` | T2 | Crew | Toast + In-app | "Scan failed" | "Try again or add manually" | — | BB Scan AI failure |
| `receipt.vault_new` | T3 | Admin | Email digest | "Receipts awaiting review" | "[N] new receipts in vault" | `/` | Daily digest (admin) |

### Tool crib notifications

| Type slug | Tier | Who | Channels | Title | Body | Deep link | Trigger |
|---|---|---|---|---|---|---|---|
| `tool.transfer_request` | T2 | Crew (recipient) | Push + In-app | "Tool transfer request" | "[Name] wants to transfer [tool] to you" | `/?screen=tool-crib` | Tool transfer initiated |
| `tool.transfer_accepted` | T3 | Crew (sender) | In-app | "Transfer accepted" | "[Name] accepted [tool]" | `/?screen=tool-crib` | Transfer confirmed |
| `tool.overdue` | T2 | Crew + Admin | Push + In-app | "Tool overdue: [name]" | "[Tool] was due back [date ago]" | `/?screen=tool-crib` | Daily check for overdue tools |
| `tool.audit_needed` | T2 | Admin | Push + Email | "Tool audit needed" | "Monthly audit due for [jobsite]" | `/?screen=tool-crib` | Monthly cron |

### Customer-facing notifications (external, NEW — Twilio + Resend)

All templates from DISPATCH_MESSAGING_RESEARCH.md, adapted for BB Inc:

| Type slug | Tier | Who | Channels | Template name | When |
|---|---|---|---|---|---|
| `customer.booking_confirmed` | T4 | Customer | SMS + Email | Booking Confirmed | After contract signed |
| `customer.booking_updated` | T4 | Customer | SMS + Email | Booking Updated | Schedule change by admin |
| `customer.booking_cancelled` | T4 | Customer | SMS + Email | Booking Cancelled | Cancellation |
| `customer.reminder_24h` | T4 | Customer | SMS + Email | 24-Hour Reminder | Day before service |
| `customer.reminder_2h` | T4 | Customer | SMS | 2-Hour Reminder | 2 hours before crew arrival |
| `customer.crew_en_route` | T4 | Customer | SMS | Crew En Route | Crew departs to jobsite (Bouncie trip start) |
| `customer.crew_arrived` | T4 | Customer | SMS | Crew Arrived | Bouncie geofence entry at jobsite |
| `customer.work_complete` | T4 | Customer | SMS + Email | Work Complete | Crew marks job complete |
| `customer.invoice_sent` | T4 | Customer | Email | Invoice Ready | After invoice generated |
| `customer.payment_received` | T4 | Customer | SMS + Email | Payment Received | After payment confirmed |
| `customer.review_request` | T4 | Customer | SMS + Email | Review Request | 24h after work complete |

### Sub-contractor dispatch notifications (external, NEW — Twilio)

From DISPATCH_MESSAGING_RESEARCH.md tiered dispatch model:

| Type slug | Tier | Who | Channels | Template | When |
|---|---|---|---|---|---|
| `sub.job_offer_direct` | T4 | Preferred sub | SMS | Direct Job Offer | 2-hour response window |
| `sub.job_offer_broadcast` | T4 | Qualified pool | SMS | Broadcast Job Offer | 30-min response window |
| `sub.job_offer_expired` | T4 | Sub who was offered | SMS | Job Offer Expired | No response in window |
| `sub.job_accepted` | T4 | Admin | Email + In-app | Job Accepted | Sub confirms |
| `sub.job_reminder` | T4 | Winning sub | SMS | Job Reminder | Day before |

### System and admin notifications

| Type slug | Tier | Who | Channels | Title | When |
|---|---|---|---|---|---|
| `system.bridge_error` | T0 | Admin | Email + SMS | "Bridge error: [service]" | Unhandled exception in prod |
| `system.neon_latency` | T0 | Admin | Email | "DB latency spike" | p95 query time > 5s |
| `system.compliance_expiry` | T1 | Admin | Email | "Compliance expiring: [name]" | 30 days before expiry (existing) |
| `system.ticket_escalated` | T1 | Admin + Assigned | Email + Push | "Ticket escalated: #[id]" | Ticket passes SLA (existing) |
| `system.invoice_overdue` | T1 | Admin | Email | "Invoice overdue: #[id]" | N days past due (existing) |

---

## 8. Message templates (SMS, push, email)

### SMS templates (160-char limit per segment)

From DISPATCH_MESSAGING_RESEARCH.md (confirmed, adapted for BB Inc):

**Booking Confirmed:**
```
Hi {first_name}! Your {service_type} at {address} is confirmed for {date} {time}. 
Bainbridge Builders will be there. Questions? Reply here. – BB Inc
```

**24-Hour Reminder:**
```
Reminder: Bainbridge Builders arrives tomorrow {time} at {address}. 
Someone 18+ must be home. Reply CANCEL to reschedule. Questions? Reply here.
```

**2-Hour Reminder:**
```
Your Bainbridge Builders crew is on their way — arriving around {time}. 
Reply READY if you're home or DELAY if you need more time.
```

**Crew En Route:**
```
Your Bainbridge Builders crew is headed your way! 
ETA: approximately {eta_time}. Track: {eta_url}
```

**Crew Arrived:**
```
Your Bainbridge Builders crew has arrived at {address}. 
Project starting now. We'll keep you updated!
```

**Work Complete:**
```
Great news! Work at {address} is complete for today. 
Total: {hours}h. You'll receive your invoice shortly. Thank you! – BB Inc
```

**Review Request (sent 24h after):**
```
Hi {first_name}! How did we do? Share your experience with Bainbridge Builders: {review_url} 
Thank you for your business!
```

**Sub-contractor Direct Offer:**
```
BB Inc Job Offer — {job_type} at {city} on {date}.
Rate: {rate}. Duration: {duration}h.
Reply YES to accept (2hr window) or NO to pass.
Details: {job_url}
```

**GPS: End-of-Day (push — 60-char body limit):**
```
{location_summary} · {miles} mi — confirm your day
```
Example: "Oak Ave 8h · Ace HW 33min · 14.3 mi — confirm your day"

### Email templates

Full HTML emails via React Email. Three template families:

**1. Crew workflow emails** (simple, mobile-first, dark background):
- GPS timesheet summary (daily digest alternative to push)
- Mileage confirmation

**2. Customer-facing emails** (branded, warm, includes property photo):
- Booking confirmed, invoice, work complete, review request

**3. Admin operational emails** (dense, data-rich):
- System alerts, QBT sync failures, compliance expiry notices

---

## 9. Deep link scheme (complete — current + new)

All notifications that open the app use `?screen=` URL parameter. App.jsx handles them on mount.

**Complete scheme:**

| `?screen=` | Opens | Notification types that use it |
|---|---|---|
| `gps-review` | GpsReviewScreen | gps.eod_review, gps.eod_fallback, gps.eod_escalation |
| `gps-admin` | GpsAdminPanel | gps.new_candidates, gps.device_low_battery, gps.reconstruction_failed |
| `gps-mileage` | GpsMileageScreen (new) | gps.mileage_uploaded |
| `gps-vehicle` | GpsMyVehicle (new) | gps.tracker_paired, gps.tracker_offline |
| `receipt-scan` | ReceiptScanModal | receipt.queue_uploaded, receipt.scan_failed |
| `receipt-history` | ReceiptHistoryModal | receipt.filed |
| `tool-crib` | ToolCrib | tool.transfer_request, tool.transfer_accepted, tool.overdue |
| `timesheet-grid` | TimesheetGrid | payroll.upload_reminder |
| `notification-center` | NotificationCenter (new) | Any — opens the inbox |

**App.jsx extension (add to existing deep-link useEffect):**

```javascript
const screen = params.get('screen');
const screenMap = {
  'gps-review':          openGpsReview,
  'gps-admin':           openGpsAdmin,
  'gps-mileage':         openGpsMileage,
  'gps-vehicle':         openGpsMyVehicle,
  'receipt-scan':        openReceiptScan,
  'receipt-history':     openReceiptHistory,
  'tool-crib':           openToolCrib,
  'timesheet-grid':      openTimesheetGrid,
  'notification-center': openNotificationCenter,
};
if (screen && screenMap[screen]) {
  window.history.replaceState({}, '', window.location.pathname);
  screenMap[screen]();
}
```

---

## 10. Notification center UI — `NotificationCenter.jsx` (new component)

**Opened by:** Tapping badge count on main app shell (header) OR `?screen=notification-center`

**Badge placement:** In the `Header.jsx` right section, between the Crew Toggle and User Badge. A red dot with count appears when `unreadCount > 0`.

**Structure:**

```
┌────────────────────────────────────────────┐
│ ← Notifications               [Mark all read]
├────────────────────────────────────────────┤
│                                            │
│  📋 Today                                  │
│  ┌─────────────────────────────────────┐   │
│  │ 🗺 Your timesheet is ready  2 min ago │  │ ← UNREAD (bold)
│  │ Oak Ave 8h · Ace HW 33min · 14.3 mi │  │
│  │                     [Confirm →]      │  │
│  └─────────────────────────────────────┘   │
│                                            │
│  ┌─────────────────────────────────────┐   │
│  │ ✅ Mileage logged         1 hr ago  │  │
│  │ 14.3 mi added to Thu 5/9 timesheet  │  │
│  └─────────────────────────────────────┘   │
│                                            │
│  📋 Yesterday                              │
│  ┌─────────────────────────────────────┐   │
│  │ 🔧 Tool transfer accepted  Yesterday │  │
│  │ Tom accepted the DeWalt drill       │  │
│  └─────────────────────────────────────┘   │
│                                            │
│  [Load older]                              │
└────────────────────────────────────────────┘
```

**API calls:**

```
GET  /api/notifications?limit=20&offset=0  — paginated inbox
POST /api/notifications/mark-read         — { ids: ['uuid1', 'uuid2'] }
POST /api/notifications/mark-all-read     — all for employee
DELETE /api/notifications/:id             — dismiss single
GET  /api/notifications/count             — unread badge count
```

**Routes (new, in notifications-v1.js):**

```javascript
// GET /api/notifications — paginated inbox
const notifications = await sql`
  SELECT * FROM cal_in_app_notifications
  WHERE employee_id = ${request.employeeId}
    AND dismissed_at IS NULL
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT ${limit} OFFSET ${offset}
`;

// GET /api/notifications/count — badge count
const [{ count }] = await sql`
  SELECT COUNT(*) FROM cal_in_app_notifications
  WHERE employee_id = ${request.employeeId}
    AND is_read = FALSE
    AND dismissed_at IS NULL
    AND expires_at > NOW()
`;
```

---

## 11. Notification preference UI

### Crew notification settings (in MenuDrawer or User Settings popup)

Add a "Notifications" section to the User Settings popup (opened by tapping the red user badge in Header.jsx):

```
NOTIFICATIONS
├── GPS Timesheet Reminders    [toggle ON/OFF]
│   Remind me at: [3 PM | 4 PM | 5 PM | 6 PM | 7 PM]
├── Tool Crib Alerts           [toggle ON/OFF]
├── Payroll Reminders          [toggle ON/OFF]
├── Email digest (daily 8 AM)  [toggle ON/OFF]
├── Phone number for SMS:      [+1 (408) 555-1234]  (future: when SMS added)
└── [Re-enable push notifications]  ← only shown if push is denied/blocked
```

**Save:** `PATCH /api/push/preferences` + `PATCH /api/notifications/preferences`

### Admin notification management

In `GpsAdminPanel.jsx` Developer section (existing pattern, extended):

```
NOTIFICATIONS (admin controls)
├── [Per-employee: Notifications ON/OFF]   ← existing
├── [Per-employee: Send test push]         ← existing
├── [Broadcast message]: [type here] [Send to all crew]  ← NEW
└── Notification log: last 50 deliveries   ← NEW (from bridge_notification_deliveries)
```

---

## 12. The `cal_message_templates` table (NEW)

Centralized template storage so templates can be updated without code deploys:

```sql
CREATE TABLE cal_message_templates (
  id              SERIAL PRIMARY KEY,
  type_slug       TEXT NOT NULL,        -- e.g., 'gps.eod_review'
  channel         TEXT NOT NULL,        -- 'push'|'email'|'sms'|'in_app'
  audience        TEXT NOT NULL DEFAULT 'crew',  -- 'crew'|'admin'|'customer'|'sub'
  title_template  TEXT,                 -- for push/in_app
  body_template   TEXT NOT NULL,        -- Handlebars: {{crew_name}}, {{location_summary}}
  email_subject   TEXT,                 -- email only
  email_html_key  TEXT,                 -- React Email template key (email only)
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type_slug, channel, audience)
);
```

Template rendering: **Handlebars.js** (already a common dep in Node.js ecosystem, no new dependencies needed). `{{{variable}}}` for unescaped HTML (email only).

---

## 13. Implementation roadmap

### Phase 0 — Foundation (no new features, just organization)

| # | Task | Effort |
|---|---|---|
| 0.1 | Create `cal_in_app_notifications` table + migration | 30 min |
| 0.2 | Create `cal_notification_preferences` table + migration | 30 min |
| 0.3 | Create `cal_external_notification_prefs` table + migration | 30 min |
| 0.4 | Create `cal_message_templates` table + seed GPS notification templates | 1 hr |
| 0.5 | Extend `sendNotification()` dispatcher: add in-app channel (write to cal_in_app_notifications) | 1 hr |
| 0.6 | `notifications-v1.js`: GET/POST inbox routes + badge count route | 2 hrs |

### Phase 1 — In-app notification center (crew-facing) + badge count

| # | Task | Effort |
|---|---|---|
| 1.1 | `Header.jsx`: add badge count red dot (fetches `/api/notifications/count` on load) | 1 hr |
| 1.2 | `NotificationCenter.jsx`: new slide-in panel (paginated inbox, mark-read, dismiss) | 2 days |
| 1.3 | `uiSlice.js`: add `notificationCenterOpen` + `unreadCount` state | 0.5 hr |
| 1.4 | Extend App.jsx deep-link handler: all 9 screens + `?screen=notification-center` | 1 hr |
| 1.5 | Wire existing GPS notifications to also write to `cal_in_app_notifications` | 1 hr |

### Phase 2 — Personalized EOD push + notification preferences

| # | Task | Effort |
|---|---|---|
| 2.1 | `push-v1.js`: `POST /api/push/send-eod-review` route (personalized post-reconstruction) | 1 day |
| 2.2 | `gps-cron.js`: call send-eod-review after reconstruction + Bouncie processing completes | 0.5 hr |
| 2.3 | Crew notification preferences UI (User Settings popup extension) | 1 day |
| 2.4 | `PATCH /api/notifications/preferences` route (extends existing push preferences) | 2 hr |

### Phase 3 — Email expanded + templates

| # | Task | Effort |
|---|---|---|
| 3.1 | Set up React Email templates for crew + admin emails | 2 days |
| 3.2 | GPS email notifications (eod summary as alternative to push for non-PWA crew) | 1 day |
| 3.3 | Email digest mode (batch T3 into daily 8 AM digest) | 1 day |
| 3.4 | Seed `cal_message_templates` with all notification types | 1 day |

### Phase 4 — SMS via Twilio + customer notifications

| # | Task | Effort |
|---|---|---|
| 4.1 | Twilio account setup + A2P 10DLC registration (2-week approval from Twilio/carriers) | Sam handles |
| 4.2 | `sendSmsNotification()` in notify.js (follow Resend pattern) | 1 day |
| 4.3 | Inbound SMS intent classifier (keyword rules layer 1 + Claude Haiku layer 2) | 2 days |
| 4.4 | Customer booking flow: send confirmation SMS/email on contract signed | 2 days |
| 4.5 | Customer crew-en-route notification (triggered by Bouncie trip start toward jobsite) | 1 day |
| 4.6 | Customer work-complete notification | 0.5 day |
| 4.7 | Review request (24h post-complete) | 0.5 day |

### Phase 5 — Sub-contractor dispatch + seasonal automations

| # | Task | Effort |
|---|---|---|
| 5.1 | Sub-contractor registry (`cal_sub_contractors` table) + SMS opt-in | 2 days |
| 5.2 | Job offer dispatch (tiered: direct → broadcast → bid) | 3 days |
| 5.3 | Seasonal reminder automation (annual service due, weather alerts) | 2 days |

---

## 14. Cost model (complete)

| Service | Current cost | After Phase 4 | Notes |
|---|---|---|---|
| Resend (email) | $0 (free tier: 3K/mo) | $19.95/mo | 50K emails/month tier |
| Web Push (VAPID) | $0 | $0 | Self-hosted VAPID, no per-send cost |
| Twilio SMS | $0 | ~$45/month | $0.0079/msg × ~5,000 msgs/mo + $1/number + A2P fee |
| Twilio A2P 10DLC | $0 | $4–44 one-time | US carrier registration (one-time) |
| Claude Haiku (inbound SMS classifier) | $0 | <$5/month | 30% of inbound messages × $0.001/msg |
| In-app notifications | $0 | $0 | Neon Postgres (existing) |
| **Total** | **$0** | **~$70/month** | |

**At BB Inc scale this is trivially cheap** versus the operational value: automated customer communication eliminates ~5+ hours/week of manual outreach, automated timesheet reminders reduce admin reconciliation, and SMS dispatch for sub-contractors eliminates phone tag.

---

## 15. What does NOT change

Existing notification behavior is unchanged:
- `push-v1.js` Stage 1/2/3 hourly scheduling remains as fallback
- `notify.js` Resend email for admin alerts remains unchanged
- `Toast.jsx` 3-second ephemeral toasts remain unchanged
- `cal_push_subscriptions` schema unchanged (preferences extend it via `cal_notification_preferences`)
- `bridge_notification_deliveries` unchanged (continues as delivery audit log)
- VAPID keys stay in Railway env (not rotated)

The universal layer ADDS on top of what exists. Nothing is ripped out.

---

## 16. Migration list for this document

| Migration | Table | Phase |
|---|---|---|
| `046_cal_in_app_notifications.sql` | `cal_in_app_notifications` | Phase 0 |
| `047_cal_notification_preferences.sql` | `cal_notification_preferences`, `cal_external_notification_prefs` | Phase 0 |
| `048_cal_message_templates.sql` | `cal_message_templates` + seed data | Phase 0 |

*(Note: numbered after existing migration 046 from UNIFIED_PLAN_v2.md)*

---

*All channel capabilities, costs, deep links, API routes, template content, and DB schemas documented from 100% code reads + DISPATCH_MESSAGING_RESEARCH.md (918 lines), COMMUNICATIONS_AND_ACTION_MODEL.md (445 lines), ACTION_AND_NOTIFICATION_MODEL.md (89 lines). No assumed behavior. Last updated: 2026-05-10.*
