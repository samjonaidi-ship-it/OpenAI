# Notification OSS Options & Light CRM Integration
> ## ⚠️ NAME MAP — read before trusting a table name below
>
> This document predates the implementation. Several tables it names were
> designed and then built under different names, or not built at all. Verified
> against production on 2026-08-16:
>
> | Named here | Actually |
> |---|---|
> | `cal_message_templates` | **`ct_bff.notification_templates`** — 90 rows, 52 keys, all `locale='en'` |
> | `cal_external_notification_prefs` | **Does not exist in any database.** External recipients use the same `ct_bff.cal_notification_preferences` as everyone else, keyed on identity — plus `ct_bff.party_notification_defaults` (mig 185) for org-level defaults |
>
> The design intent in this document is still the reference. The table names are
> not. Where the two disagree, the database wins.


**Document:** NOTIFICATION_OSS_AND_CRM.md | v1.0 | 2026-05-10 | BB
**Canonical location:** C:\Users\samjo\Desktop\OpenAI\DB\operations\
**Evidence base:** Live research on Novu (v3.16.0, 39k stars), Twenty (45.7k stars), Chatwoot (v4.13.0, 29.1k stars), all actively maintained as of 2026-05. Railway deploy templates confirmed for all three.

---

## 1. The honest answer on open-source notification tools

**For the BB Inc notification layer as designed — build, don't buy.**

Here's why, evidence-based:

| What Novu gives you | What we already have |
|---|---|
| In-app notification React component | We're building `NotificationCenter.jsx` against `cal_in_app_notifications` (our own Postgres table — Neon-native, no extra service) |
| Multi-channel routing (push, email, SMS) | `sendNotification()` dispatcher in `notify.js` — already handles push (VAPID) + email (Resend) |
| Template management UI | `cal_message_templates` table (editable in any SQL client; we can add a simple admin UI) |
| Preference management | `cal_notification_preferences` table (our design) |
| Event-driven workflow | `event-bus.js` + `notifications/subscriptions.js` (~50 lines, our design) |
| Delivery tracking | `bridge_notification_deliveries` (already exists in Neon) |

**Novu would replace all of that** with a 6-container Railway deployment (API, Worker, WebSocket, Dashboard, MongoDB, Redis). It uses MongoDB by default — not Neon-compatible without FerretDB shim. It adds operational overhead (6 services vs 0 additional services in our design) and a MongoDB container to maintain.

**Verdict on Novu:** Skip it. Our custom implementation is lighter, Neon-native, and already 60% built. The only thing Novu adds that we don't have is a no-code visual workflow editor — and at BB Inc's scale and notification complexity, that's not worth 6 extra services.

---

## 2. The CRM angle — this IS worth an open-source tool

The notification layer connects naturally to a customer relationship need:

- Customers need booking confirmations, crew-en-route SMS, work-complete messages
- Prospects (foreman estimate walkthroughs) need follow-up tracking
- Sub-contractors need job offers and schedule communications
- All of these are customer/contact records, not just employee records

**BB Inc has designed `cal_prospects` and the communications domain model** (see `COMMUNICATIONS_AND_ACTION_MODEL.md`). But building a full CRM from scratch on top of these tables would be months of work. This is where an open-source tool earns its keep.

### Option A — **Twenty CRM** (recommended)

| Property | Value |
|---|---|
| GitHub | github.com/twentyhq/twenty |
| Stars | 45,700+ (most active open-source CRM as of 2026) |
| License | AGPL-3 (community) |
| Database | PostgreSQL — **Neon-native, no shim needed** |
| Railway | One-click deploy template available |
| Stack | TypeScript, NestJS backend, React frontend |

**What Twenty gives BB Inc:**
- **Contact management**: homeowners, prospects, sub-contractors, suppliers — all as contacts with notes, activity timeline, custom fields
- **Sales pipeline**: Lead → Estimate → Proposal → Won/Lost. Maps directly to `cal_prospects.stage`.
- **REST + GraphQL API**: BB_Micro_Bridge can push/pull contact data programmatically — when a prospect signs a contract, the bridge promotes `cal_prospects.stage = 'won'` AND syncs to Twenty as a closed deal
- **Email sync**: Twenty can sync Gmail (existing BB account) to thread customer conversations alongside CRM records
- **Workflow automation**: trigger actions on stage changes (e.g., when stage = 'won' → notify crew, create jobsite record)
- **MCP server**: Twenty has an AI/MCP server — BB Buddy could query customer records directly

**Integration model:**

```
Twenty CRM (contact/pipeline)
  ↔ BB_Micro_Bridge (bidirectional sync via REST API)
    ↔ cal_prospects (promoted to jobsite on win)
    ↔ cal_properties (jobsite created on contract sign)
    ↔ cal_external_notification_prefs (customer SMS/email prefs)

Customer journey:
  Foreman visits → cal_prospect created (GPS discovery)
  Foreman classifies as Prospect → Twenty contact created
  Proposal sent → Twenty stage = 'proposal'
  Contract signed → Twenty stage = 'won'
             → Bridge: promote cal_prospect → cal_property
             → Bridge: create jobsite record
             → Bridge: emit 'customer.booking_confirmed' event
             → Notification layer: send SMS/email to customer
```

**What stays in our system vs what lives in Twenty:**

| Data | Where | Why |
|---|---|---|
| GPS pings, draft timesheets, mileage | Neon (our stack) | GPS/ops data belongs with the operations platform |
| Customer contact info, notes, pipeline stage | Twenty | CRM purpose-built for this |
| Communication history (SMS/email) | Twenty + Chatwoot | Conversation threads |
| Employee records | Neon / QBT | Source of truth is QBT for labor |
| Jobsite (property) records | Neon | Core operational data |

**Key Twenty limitation:** AGPL license means if you ever expose Twenty as a service to others, you must open-source your modifications. For internal use only (BB Inc), AGPL is fine.

---

### Option B — **Chatwoot** (for customer-facing conversations)

| Property | Value |
|---|---|
| GitHub | github.com/chatwoot/chatwoot |
| Stars | 29,100+ |
| License | MIT |
| Database | PostgreSQL — **Neon-native** |
| Railway | Docker Compose deployment |
| Stack | Ruby on Rails backend, Vue.js frontend |

**What Chatwoot gives BB Inc:**
- **Omnichannel inbox**: SMS (Twilio), Email, WhatsApp, live chat — all conversations in one place
- **Embeddable web widget**: Add a "Message us" chat bubble to the BB website or customer portal
- **Contact notes**: Link conversations to customer contact records
- **Canned responses**: Pre-written replies for common questions (booking changes, ETA requests)
- **CSAT surveys**: Post-job satisfaction ratings sent automatically
- **REST API**: Trigger messages programmatically from BB_Micro_Bridge (crew-en-route SMS, etc.)

**Chatwoot vs building SMS from scratch:**
Our current design (Phase 4) builds SMS via raw Twilio API + message templates in `cal_message_templates`. That gives us outbound SMS for notifications (booking confirmed, crew en route). It does NOT give us:
- A place for customers to reply and be heard
- An inbox where Sam/manager reads and responds to customer messages
- Conversation threading across multiple messages

Chatwoot fills exactly that gap. The bridge triggers outbound via Chatwoot's API; customers reply to the Twilio number and their messages route into Chatwoot's inbox.

**Chatwoot limitation:** Ruby on Rails (not Node.js). More operational overhead than Twenty. But it's MIT licensed, battle-tested at scale, and the only open-source tool with the Twilio SMS two-way conversation integration we need.

---

## 3. Recommended stack for BB Inc

Three tiers, zero new databases needed beyond what we have:

```
┌──────────────────────────────────────────────────────────────┐
│  TIER 1: INTERNAL OPERATIONS (our custom stack)              │
│                                                              │
│  CalExp5 PWA + BB_Micro_Bridge + Neon Postgres              │
│  • Crew notifications (push, in-app center)                  │
│  • GPS Auto-TS pipeline                                       │
│  • Tool crib, receipts, timesheets                           │
│  • All existing features                                     │
└──────────────────────────────────────────────────────────────┘
                          ↕ REST API
┌──────────────────────────────────────────────────────────────┐
│  TIER 2: CRM (Twenty, Railway, uses Neon Postgres)           │
│                                                              │
│  • Customer contacts + pipeline (Lead → Won)                 │
│  • Prospect tracking (synced from cal_prospects)             │
│  • Sub-contractor registry                                   │
│  • Workflow automation (stage → action)                      │
│  • Email sync (Gmail for customer emails)                    │
└──────────────────────────────────────────────────────────────┘
                          ↕ REST API
┌──────────────────────────────────────────────────────────────┐
│  TIER 3: CUSTOMER COMMUNICATIONS (Chatwoot, Railway)         │
│                                                              │
│  • Two-way SMS conversations with customers                  │
│  • Outbound: booking confirmed, crew en route, complete       │
│  • Inbound: customer replies → Chatwoot inbox                │
│  • Embeddable chat widget (website)                          │
│  • CSAT surveys post-job                                     │
└──────────────────────────────────────────────────────────────┘
```

**Monthly operational cost:**
| Service | Cost |
|---|---|
| Twenty (Railway) | ~$10/mo |
| Chatwoot (Railway) | ~$10-15/mo |
| Twilio SMS (via Chatwoot) | ~$45/mo |
| Novu | $0 (not used) |
| **Total addition to current stack** | **~$65-70/mo** |

---

## 4. What changes in our notification design

### With Chatwoot handling customer SMS:

The Phase 4 customer notifications (booking confirmed, crew en route, etc.) that we planned to build as raw Twilio API calls from BB_Micro_Bridge instead become:

```javascript
// Instead of: twilio.messages.create({ to, body }) directly
// We call: Chatwoot API to create a new conversation message

await fetch(`${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts/${contactId}/conversations`, {
  method: 'POST',
  headers: { api_access_token: CHATWOOT_API_TOKEN },
  body: JSON.stringify({
    inbox_id: TWILIO_INBOX_ID,
    message: { content: templateBody },
  }),
});
```

Chatwoot handles the Twilio routing, conversation threading, and inbox delivery. BB_Micro_Bridge just calls one API.

**The notification event flow with Chatwoot:**

```
Bridge emits 'customer.booking_confirmed' event
  → Notification router receives event
  → Resolves recipient: customer with phone + email
  → Dispatches:
      • Chatwoot API → SMS to customer phone (via Twilio)
      • Resend → Email to customer email
  → Logs to bridge_notification_deliveries
```

When customer replies to the SMS → goes to Twilio → routes to Chatwoot → Sam or manager sees it in Chatwoot inbox.

### With Twenty handling the CRM:

Our `cal_prospects` table becomes a lightweight bridge table that syncs with Twenty. The canonical prospect/customer data lives in Twenty; our table holds just the GPS-linked fields and the bridge-specific state.

```sql
-- cal_prospects gets a new column:
ALTER TABLE cal_prospects
  ADD COLUMN twenty_person_id TEXT,    -- Twenty CRM contact ID
  ADD COLUMN twenty_opportunity_id TEXT; -- Twenty CRM opportunity ID
```

When the GPS pipeline discovers a new prospect (from `cal_location_candidates`), the bridge creates the record in both `cal_prospects` (local) AND Twenty (CRM) via API. Sam manages the pipeline in Twenty's visual interface; GPS-driven data enriches the records automatically.

---

## 5. Build order — revised with OSS tools

| Phase | What | Tool |
|---|---|---|
| 0 (now) | In-app notification center | Custom (NotificationCenter.jsx + cal_in_app_notifications) |
| 0 (now) | Event-driven dispatcher | Custom (event-bus.js, 50 lines) |
| 1 | Twenty CRM (deploy + connect) | Twenty on Railway |
| 1 | Sync cal_prospects → Twenty contacts | BB_Micro_Bridge REST calls |
| 2 | Chatwoot (deploy + connect Twilio) | Chatwoot on Railway |
| 2 | Customer outbound SMS/email via Chatwoot | BB_Micro_Bridge → Chatwoot API |
| 3 | Customer inbound (Sam reads replies in Chatwoot) | No code — Chatwoot inbox |
| 4 | CSAT surveys post-job completion | Chatwoot built-in |
| 5 | Sub-contractor SMS dispatch | Chatwoot (create conversations programmatically) |

**What we DON'T build anymore (OSS tools handle it):**
- Customer SMS templates and raw Twilio API calls → Chatwoot handles
- Inbound SMS intent classification → Chatwoot auto-routes to inbox; Claude Haiku classifies only when Sam needs a suggested reply
- CRM contact management UI → Twenty
- Conversation threading → Chatwoot

---

## 6. One-paragraph summary

**Skip Novu** — our custom notification infrastructure (sendNotification, cal_in_app_notifications, event-bus) is lighter, Neon-native, and 60% built. Novu adds 6 containers for features we're already implementing in ~300 lines of custom code.

**Deploy Twenty CRM** on Railway using their one-click template (PostgreSQL, Neon-compatible). Sync `cal_prospects` bidirectionally. Sam gets a visual sales pipeline, customer contact management, and email threading — without building any CRM UI.

**Deploy Chatwoot** on Railway for two-way customer SMS and the customer-facing conversation layer. Bridge triggers outbound notifications via Chatwoot API; customer replies land in Chatwoot's inbox. This replaces the raw Twilio API calls we had planned and adds an inbox + conversation history that we'd never build ourselves.

**Total additional cost:** ~$65-70/month. **Total new infrastructure build time:** ~1 week to deploy and connect both tools. The custom notification layer (Phases 0–2) still builds as designed and drives all internal crew notifications.

---

*Research: Novu v3.16.0 (Apr 2026), Twenty latest (45.7k stars), Chatwoot v4.13.0 (Apr 2026). All Railway deployment templates confirmed active. No pricing assumed — based on Railway's current compute pricing and Twilio per-message rates.*
