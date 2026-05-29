# Communications And Action Model

This document defines how CalExp5 should ingest, store, interpret, and operationalize inbound and outbound communications across all stakeholders.

It is a companion to:

- `DB_ARCHITECTURE.md`
- `MASTER_DATA_MANAGEMENT.md`
- `ENTITY_LIFECYCLE_MODEL.md`
- `ACCESS_AND_ENTITLEMENT_MODEL.md`
- `OBSERVATIONS_AND_TELEMETRY_MODEL.md`

## Purpose

The business exchanges high-value communications with:

- customers
- prospects
- crew members
- suppliers
- subcontractors
- internal staff

Those communications include:

- email
- SMS and text messages
- phone call records and transcripts
- app messages
- portal notifications
- reminder campaigns
- payment notifications
- bid reminders
- service reminders
- agent-generated follow-ups

These are not just message logs.
They are operational inputs that should drive:

- reminders
- punch lists
- follow-up tasks
- stakeholder summaries
- agent actions
- compliance and audit history

## Core Principle

Communications should be modeled as a first-class operational domain.

The platform should separate:

1. communication artifacts
2. communication threads
3. communication participants
4. extracted intents and commitments
5. tasks, reminders, and action items derived from communication

This allows agents to reason over business communications without reducing everything to raw message blobs.

## Communication Layers

### 1. Raw Communication Artifacts

These are the original records received or sent by the business.

Examples:

- inbound email
- outbound estimate email
- inbound customer text
- outbound payment reminder
- voicemail transcript
- call recording metadata

Recommended fields:

- channel
- direction
- source_system
- source_message_id
- sent_at
- received_at
- subject or title
- body or transcript reference
- attachment references
- raw payload

These should preserve source truth and provenance.

### 2. Communication Threads

Communications should be grouped into logical threads when possible.

Examples:

- customer support conversation about a property
- subcontractor bidding conversation
- supplier invoice clarification thread
- estimate follow-up chain

Threads allow the system and agents to understand context over time rather than only isolated messages.

### 3. Participants

Each communication should link all participants and their roles.

Examples:

- sender
- recipient
- CC participant
- agent acting on behalf of Bainbridge
- customer contact
- subcontractor estimator

Participants should link back to stakeholder entities wherever identity resolution is possible.

### 4. Extracted Intents, Commitments, And Signals

Communications often imply work that is not explicitly structured yet.

Examples:

- customer asks for a report
- subcontractor promises to send a bid
- supplier confirms delivery date
- customer disputes an invoice
- internal user requests escalation

The system should support extraction of:

- intent
- commitment
- deadline
- sentiment or urgency
- related property, jobsite, estimate, invoice, or stakeholder

These should be stored as structured, reviewable outputs rather than hidden only inside agent prompts.

### 5. Tasks, Reminders, And Punch Lists

Communications should be able to generate downstream operational records such as:

- reminder to send estimate follow-up
- prompt to customer for missing information
- reminder to subcontractor to submit bid
- payment notification to customer
- punch list item after field inspection
- internal task for claims follow-up

These are durable operational outcomes and should not be treated as ephemeral agent notes.

## Recommended Model

The architecture should support at least these conceptual tables:

- `communications`
- `communication_threads`
- `communication_participants`
- `communication_attachments`
- `communication_entity_links`
- `communication_extractions`
- `action_items`
- `reminders`
- `notification_campaigns`
- `outbound_deliveries`

## Inbound Versus Outbound

The system should explicitly model both inbound and outbound communication.

### Inbound

Examples:

- customer sends photos
- subcontractor asks for scope clarification
- supplier sends invoice
- homeowner asks about warranty

Inbound communication should support:

- identity resolution
- thread assignment
- entity linkage
- intent extraction
- task generation

### Outbound

Examples:

- payment reminder to customer
- bid reminder to subcontractor
- appointment reminder for service
- agent-generated daily to-do summary
- offer to extend warranty

Outbound communication should support:

- target stakeholder resolution
- template or agent-authored content
- approval policy if needed
- delivery tracking
- open/click/reply state where available

## Entity And Graph Attachment

Communications should attach to the graph through related entities.

Examples:

- property
- jobsite
- customer
- prospect
- subcontractor
- supplier
- estimate
- invoice
- claim
- service engagement

This is critical for 360 views.

Examples:

- property 360 should show relevant customer communication history
- subcontractor 360 should show bid and invoice communication history
- customer 360 should show estimate, service, payment, and warranty communications

## Agent Role

Agents should not operate only on raw inboxes.

They should work over:

- communication threads
- extracted structured signals
- linked entities
- action items
- reminders
- delivery history

This allows agents to:

- generate daily stakeholder summaries
- propose or send reminders
- surface unresolved commitments
- detect stalled bids or unpaid invoices
- create punch lists from accumulated communication context

## Daily Review Use Cases

Examples of desired agent behavior:

- review all inbound and outbound communications for the day
- identify open commitments
- identify unanswered messages
- create stakeholder-specific reminder queues
- generate customer to-do summaries
- remind subcontractors to submit bids
- remind customers about overdue invoices
- identify supplier communications requiring escalation

To support this, the DB needs durable records for:

- communication history
- extracted obligations
- due dates
- reminder status
- notification outcomes

## Action And Reminder Model

Tasks and reminders derived from communication should be separate from the communication record itself.

Examples:

- communication says “I will send revised bid tomorrow”
- extraction captures promise and due date
- system creates reminder if tomorrow passes without a bid

Recommended downstream records:

- `action_item`
- `action_owner`
- `due_at`
- `status`
- `source_communication_id`
- `related_entity_id`

This is how the system becomes proactive rather than merely archival.

## Channel Coverage

The model should be channel-agnostic.

Supported channels may include:

- email
- SMS
- voice transcript
- in-app message
- push notification
- portal notification
- chat thread

The same logical thread may span multiple channels.

## Outbound Governance

Because agents may propose or generate outbound communication, the system should support policy control such as:

- auto-send allowed
- draft-only
- approval required
- stakeholder-specific restrictions
- quiet hours
- communication frequency limits

This is especially important for:

- payment notifications
- legal-sensitive reminders
- claim communications
- vendor and subcontractor obligations

## Visibility And Privacy

Communications are often sensitive.

Visibility must be filtered by:

- stakeholder scope
- communication classification
- related entity scope
- channel sensitivity

Examples:

- customer should not see internal notes about negotiation strategy
- subcontractor should not see communication with competing subcontractors
- employee may see assignment communication but not private HR exchanges

This must align with `ACCESS_AND_ENTITLEMENT_MODEL.md`.

## MDM Alignment

Communications are often a major source of master-data enrichment.

Examples:

- new contact phone number found in email signature
- corrected customer name
- new subcontractor estimator contact
- new property context inferred from message content

The MDM layer should be able to:

- resolve participants
- preserve source identifiers
- capture communication-derived enrichment
- separate confirmed master updates from unverified suggestions

This must align with `MASTER_DATA_MANAGEMENT.md`.

## Lifecycle Alignment

Communications and actions have lifecycle too.

Examples:

- message queued
- sent
- delivered
- read
- replied
- bounced
- archived

Action items also have lifecycle:

- created
- assigned
- due
- snoozed
- completed
- canceled
- escalated

This must align with `ENTITY_LIFECYCLE_MODEL.md`.

## Recommended Initial Table Families

The exact schema may vary, but the platform should support at least:

- `communications`
- `communication_threads`
- `communication_participants`
- `communication_entity_links`
- `communication_extractions`
- `action_items`
- `action_item_links`
- `reminders`
- `outbound_deliveries`
- `delivery_attempts`

Likely supporting fields:

- `channel`
- `direction`
- `source_system`
- `source_message_id`
- `thread_id`
- `classification`
- `sent_at`
- `received_at`
- `delivery_state`
- `related_entity_id`
- `derived_confidence`

## Architectural Rules

1. Treat communications as a first-class domain, not miscellaneous attachments.
2. Preserve raw inbound and outbound artifacts with provenance.
3. Resolve communications into threads and participants where possible.
4. Extract commitments, deadlines, and intents into structured records.
5. Derive tasks and reminders as separate operational records.
6. Keep outbound agent communication policy-controlled and auditable.
7. Attach communication history to the graph so it participates in 360 views.
8. Enforce visibility and privacy rules per stakeholder slice.
9. Let agents reason over structured communication history, not only raw text.

## Next Design Step

The next practical step is to define:

- communication channels in scope
- message classification rules
- extraction schema for commitments and reminders
- outbound approval policies
- stakeholder-specific daily summary and reminder flows
