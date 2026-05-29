# BB Universal Asset System | v1.9 | 2026-03-30 | BB

## Summary

The Universal Asset System (UAS) introduces a single, extensible framework for managing all
asset types associated with Bainbridge Builders jobsites. JobSites are the anchor — every asset
(tools, daily reports, progress photos, design files, future classes) is deposited onto a jobsite
by crew, designers, or customers over the life of a contract.

The system is **deposit-heavy, retrieval-light**: field users deposit assets frequently (daily);
back-office retrieves them occasionally for reports, audits, or client deliverables. This
asymmetry drives every architectural decision.

Tools are the first asset class implemented. Receipts remain in their existing `cal_receipts`
pipeline (too mature to migrate) but appear in the JobSite Assets view alongside universal assets.

**Companion doc:** `TOOL_TRACKER_SPEC.md` covers tool-specific UX (scanner, audits, dashboard).
This document covers the universal foundation that tools and all future asset classes share.

---

## Decisions (from Sam)

| # | Question | Answer |
|---|----------|--------|
| 1 | Architecture approach | Universal asset system — tools are first class, others plug in |
| 2 | Receipts | Stay in `cal_receipts` — too mature to migrate. Appear in Assets view via adapter. **Use posted receipts** (validated assets), not pending |
| 3 | Storage pattern | Deposit-heavy, retrieval-light. Optimize for fast ingestion on-site |
| 4 | Retrieval context | Usually back-office, not on-site. Lazy loading acceptable |
| 5 | Media storage | Google Drive (reuse existing infra). One-way deposit most of the time |
| 6 | Storybook/timeline | In scope for architecture, deferred for UI implementation |
| 7 | Extensibility | New asset classes must plug in without schema changes |
| 8 | Offline | Cache only what's needed for active work (tool audits). Other assets are fire-and-forget deposits |
| 9 | Asset lifecycle | Every asset has a lifecycle state machine. Assets may go through validation before becoming "active." Built-in lifecycle tags per class |
| 10 | Nested assets | Assets can have child assets (tool → manual PDF, warranty, repair receipts). `parent_asset_id` in schema |
| 11 | Universal audits | Any asset class can be audited, not just tools. Audit sessions are class-agnostic |
| 12 | Manual entry | Scanner is one input method. Also: manual text entry, URL references, file upload. URL is a media type |
| 13 | Supporting resources | Tools (and other assets) can link to manufacturer URLs, operating manuals, maintenance schedules, spec sheets |
| 14 | Auto-enrichment | When user confirms make/model, Claude uses world knowledge + web search to find manuals, images, specs. All fetched resources cached to Drive for offline access |
| 15 | Receipt → Tool bridge | When receipt line items contain tool purchases, system offers to auto-initiate tool lifecycle (purchase date, price, vendor from receipt) |
| 16 | Offline manuals | Operating manuals for tools at crew's assigned sites are cached on-device (~50-100MB budget). Available without signal |
| 17 | Vault rename | Rename "Vault" → "All Receipts" in MenuDrawer. Receipts now also visible per-site in Assets tab |
| 18 | External users | Customers and subcontractors can view + deposit assets on their assigned properties via same CalExp5 app |
| 19 | Trust boundaries | External users see curated subset only — no tools, receipts, hours, internal reports. Property-scoped access |
| 20 | External auth | Magic link (email invite) + PIN for future access. Same app, different role, different view |
| 21 | Publish model | BB explicitly publishes/shares assets to make them visible to external users. Internal by default |
| 22 | Design for now, build later | Schema supports external access from day one. External UI is Phase 6+ after core internal system is solid |
| 23 | Humans are assets | Employees, subs, and customers are human assets with the same schema as tools — profile, child docs, lifecycle, assignments, audits |
| 24 | Profile self-management | All human assets can manage their own profile — add certs, update contact info, upload docs. Scoped to their own record |
| 25 | QBT remains employee SOR | Employee human assets mirror QBT data + add BB-specific docs (certs, training). QBT is still the system of record for hours/payroll |
| 26 | Unified auth | Single `cal_auth_users` table for all logins (employees + subs + customers), linked to their human asset record |
| 27 | Vanity subdomains | Each stakeholder gets `Name.BainbridgeBuilders.com` — wildcard DNS + SSL, app reads subdomain to scope view |
| 28 | Portal config per stakeholder | Human asset metadata stores `portal_slug`, `portal_enabled`, `portal_config` (what to show, branding) |

---

## Asset Classes

### Registered Classes (v1 architecture, phased delivery)

| Class ID | Name | Media Types | AI Processing | Delivery Phase |
|----------|------|-------------|---------------|----------------|
| `tool` | Tools & Equipment | Photos (multi-angle) | Claude vision: identify, fingerprint, audit match | Phase 1 |
| `receipt` | Receipts & Invoices | Photos → PDF | Claude vision: extract fields (existing pipeline) | Existing (adapter) |
| `daily_report` | Daily Reports | Text, audio, video, photos | Claude: summarize audio/video transcripts | Phase 2 |
| `progress` | Progress Photos | Photos, video | Claude: compare before/after, describe changes | Phase 3 |
| `site_doc` | Site Documentation | Photos, video, text notes | Claude: categorize, extract key observations | Phase 2 |
| `design` | Design Assets | CAD (DWG), LIDAR (LAS/LAZ), blueprints (PDF), 3D models | None (binary storage only) | Phase 3 |
| `permit` | Permits & Inspections | PDF, photos of posted permits | Claude: extract permit #, dates, status | Future |
| `material` | Material Deliveries | Photos of pallets/deliveries, BOL docs | Claude: inventory count, verify against PO | Future |
| `safety` | Safety & Incidents | Photos, video, written reports | Claude: categorize severity, extract details | Future |
| **Human Assets** | | | | |
| `employee` | Employee | Photos, PDFs | None (QBT is SOR for hours/payroll) | Phase 12 |
| `sub` | Subcontractor | Photos, PDFs | Claude: extract cert/insurance details | Phase 12 |
| `customer` | Customer | Photos, PDFs | None | Phase 12 |
| **Child Document Classes** | | | | |
| `compliance` | Compliance Docs | PDFs, photos | Claude: extract expiry dates, cert numbers | Phase 12 |
| `financial` | Financial Docs | PDFs, photos | None (could add AI extraction later) | Phase 12 |

### Class Registry (extensible)

```javascript
// BB_Micro_Bridge: src/config/asset-classes.js
const ASSET_CLASS_REGISTRY = {
  tool: {
    label: 'Tool',
    pluralLabel: 'Tools',
    icon: '🔧',
    mediaTypes: ['image/jpeg', 'image/png', 'url/reference', 'application/pdf'],
    maxMediaPerAsset: 20,           // photos + manuals + URLs
    aiProcessor: 'tool-ai',        // Claude vision identifier
    auditable: true,                // can be audited at jobsites
    cacheable: true,                // cache on device (Tool Crib)
    allowsChildren: true,           // can have child assets (manuals, warranties, repair receipts)
    inputMethods: ['camera', 'manual', 'url', 'file_upload'],
    lifecycle: {
      initialStatus: 'cataloged',
      transitions: {
        cataloged:  ['assigned', 'retired'],
        assigned:   ['deployed', 'returned', 'transferred', 'repair', 'lost', 'stolen'],
        deployed:   ['assigned', 'repair', 'lost', 'stolen', 'retired'],
        repair:     ['deployed', 'assigned', 'retired'],
        returned:   ['assigned', 'retired'],
        transferred:['deployed', 'assigned'],
        lost:       ['found'],       // found → back to assigned/deployed
        found:      ['assigned', 'deployed'],
        stolen:     ['recovered'],   // recovered → back to assigned
        recovered:  ['assigned'],
        retired:    [],              // terminal state
      },
    },
    metadata: {
      required: ['name', 'category'],
      optional: ['brand', 'model', 'size', 'serial_number', 'fingerprint',
                 'pool_size', 'purchase_date', 'purchase_price', 'estimated_value',
                 'manufacturer_url', 'manual_url', 'warranty_expiry'],
    },
  },

  daily_report: {
    label: 'Daily Report',
    pluralLabel: 'Daily Reports',
    icon: '📋',
    mediaTypes: ['image/jpeg', 'image/png', 'audio/mp4', 'audio/webm',
                 'video/mp4', 'video/webm', 'text/plain'],
    maxMediaPerAsset: 20,
    aiProcessor: 'report-ai',
    auditable: false,
    cacheable: false,
    allowsChildren: false,
    inputMethods: ['camera', 'audio', 'video', 'manual'],
    lifecycle: {
      initialStatus: 'draft',
      transitions: {
        draft:     ['submitted'],
        submitted: ['reviewed', 'flagged'],
        reviewed:  ['archived'],
        flagged:   ['submitted', 'reviewed'],  // returned for revision
        archived:  [],
      },
    },
    metadata: {
      required: ['report_date', 'weather'],
      optional: ['crew_present', 'work_performed', 'issues', 'tomorrow_plan',
                 'safety_notes', 'visitor_log', 'hours_summary'],
    },
  },

  progress: {
    label: 'Progress Photo',
    pluralLabel: 'Progress Photos',
    icon: '📸',
    mediaTypes: ['image/jpeg', 'image/png', 'video/mp4'],
    maxMediaPerAsset: 10,
    aiProcessor: 'progress-ai',
    auditable: true,                 // can audit: "do we have milestone photos for each phase?"
    cacheable: false,
    allowsChildren: false,
    inputMethods: ['camera', 'file_upload'],
    lifecycle: {
      initialStatus: 'captured',
      transitions: {
        captured:   ['tagged'],
        tagged:     ['published', 'archived'],
        published:  ['archived'],    // published to client storybook
        archived:   [],
      },
    },
    metadata: {
      required: ['milestone'],
      optional: ['phase', 'description', 'comparison_asset_id', 'location_in_site'],
    },
  },

  site_doc: {
    label: 'Site Document',
    pluralLabel: 'Site Documents',
    icon: '📄',
    mediaTypes: ['image/jpeg', 'image/png', 'video/mp4', 'video/webm',
                 'text/plain', 'application/pdf', 'url/reference'],
    maxMediaPerAsset: 10,
    aiProcessor: 'doc-ai',
    auditable: true,                 // can audit: "are all required docs on file?"
    cacheable: false,
    allowsChildren: true,            // doc can have attachments
    inputMethods: ['camera', 'manual', 'url', 'file_upload'],
    lifecycle: {
      initialStatus: 'captured',
      transitions: {
        captured:   ['reviewed'],
        reviewed:   ['resolved', 'archived', 'flagged'],
        flagged:    ['reviewed'],
        resolved:   ['archived'],
        archived:   [],
      },
    },
    metadata: {
      required: ['doc_type'],
      optional: ['description', 'severity', 'requires_action', 'assigned_to'],
    },
  },

  design: {
    label: 'Design Asset',
    pluralLabel: 'Design Assets',
    icon: '📐',
    mediaTypes: ['application/pdf', 'application/octet-stream',
                 'image/jpeg', 'image/png', 'url/reference'],
    maxMediaPerAsset: 50,
    aiProcessor: null,
    auditable: true,                 // can audit: "is current rev on file before phase starts?"
    cacheable: false,
    allowsChildren: true,            // plan set → individual sheets
    inputMethods: ['file_upload', 'url'],
    lifecycle: {
      initialStatus: 'uploaded',
      transitions: {
        uploaded:    ['current'],
        current:     ['superseded', 'archived'],
        superseded:  ['archived'],   // replaced by newer revision
        archived:    [],
      },
    },
    metadata: {
      required: ['file_type', 'version'],
      optional: ['discipline', 'sheet_number', 'revision', 'author',
                 'software', 'scale', 'description'],
    },
  },

  // ─── HUMAN ASSET CLASSES ───────────────────────────────────

  employee: {
    label: 'Employee',
    pluralLabel: 'Employees',
    icon: '👷',
    isHuman: true,                      // human asset — has auth + profile management
    mediaTypes: ['image/jpeg', 'image/png', 'application/pdf', 'url/reference'],
    maxMediaPerAsset: 5,                // profile photo + ID docs
    aiProcessor: null,
    auditable: true,                    // are all certs/training current?
    cacheable: false,
    allowsChildren: true,               // certs, training records, I-9, W-4, etc.
    inputMethods: ['camera', 'manual', 'file_upload'],
    selfManageable: true,               // can edit own profile + add own children
    lifecycle: {
      initialStatus: 'onboarded',
      transitions: {
        onboarded:  ['active'],
        active:     ['on_leave', 'suspended', 'terminated', 'retired'],
        on_leave:   ['active', 'terminated'],
        suspended:  ['active', 'terminated'],
        terminated: [],                 // terminal
        retired:    [],                 // terminal
      },
    },
    metadata: {
      required: ['name'],
      optional: ['qbt_id', 'role', 'trade', 'skills', 'hire_date', 'rate',
                 'phone', 'email', 'emergency_contact', 'address',
                 'certifications', 'drivers_license_expiry'],
    },
  },

  sub: {
    label: 'Subcontractor',
    pluralLabel: 'Subcontractors',
    icon: '🏗️',
    isHuman: true,
    mediaTypes: ['image/jpeg', 'image/png', 'application/pdf', 'url/reference'],
    maxMediaPerAsset: 5,
    aiProcessor: 'compliance-ai',       // Claude: extract expiry dates, cert numbers from uploaded docs
    auditable: true,                    // are all compliance docs current?
    cacheable: false,
    allowsChildren: true,               // bids, insurance, W-9, 1099, license, bond, contracts
    inputMethods: ['camera', 'manual', 'file_upload', 'url'],
    selfManageable: true,               // can edit own profile + upload own docs
    lifecycle: {
      initialStatus: 'onboarded',
      transitions: {
        onboarded:  ['active'],
        active:     ['suspended', 'terminated', 'completed'],
        suspended:  ['active', 'terminated'],
        completed:  ['active'],         // rehired for new project
        terminated: [],
      },
    },
    metadata: {
      required: ['name', 'trade'],
      optional: ['company_name', 'license_number', 'license_expiry',
                 'insurance_policy', 'insurance_expiry', 'bond_number',
                 'phone', 'email', 'address', 'rate', 'ein',
                 'w9_on_file', 'notes'],
    },
  },

  customer: {
    label: 'Customer',
    pluralLabel: 'Customers',
    icon: '🏠',
    isHuman: true,
    mediaTypes: ['image/jpeg', 'image/png', 'application/pdf', 'url/reference'],
    maxMediaPerAsset: 5,
    aiProcessor: null,
    auditable: false,
    cacheable: false,
    allowsChildren: true,               // contracts, design files from their architect, correspondence
    inputMethods: ['camera', 'manual', 'file_upload', 'url'],
    selfManageable: true,               // can edit own contact info + upload files
    lifecycle: {
      initialStatus: 'prospect',
      transitions: {
        prospect:   ['active', 'declined'],
        active:     ['completed', 'paused', 'terminated'],
        paused:     ['active', 'terminated'],
        completed:  ['archived'],       // project done
        declined:   ['archived'],       // never started
        terminated: ['archived'],
        archived:   [],
      },
    },
    metadata: {
      required: ['name'],
      optional: ['company_name', 'phone', 'email', 'address',
                 'contract_value', 'referral_source', 'notes',
                 'property_ids'],       // which properties they own
    },
  },

  // ─── DOCUMENT ASSET CLASSES (children of human + physical assets) ──

  compliance: {
    label: 'Compliance Document',
    pluralLabel: 'Compliance Documents',
    icon: '📋',
    mediaTypes: ['application/pdf', 'image/jpeg', 'image/png', 'url/reference'],
    maxMediaPerAsset: 5,
    aiProcessor: 'compliance-ai',       // Claude: extract expiry dates, cert numbers, coverage amounts
    auditable: true,                    // "are all subs' insurance certs current?"
    cacheable: false,
    allowsChildren: false,
    inputMethods: ['file_upload', 'camera', 'url'],
    selfManageable: true,               // sub/employee can upload their own compliance docs
    lifecycle: {
      initialStatus: 'submitted',
      transitions: {
        submitted:  ['verified', 'rejected'],
        verified:   ['expired', 'superseded', 'archived'],
        rejected:   ['submitted'],      // resubmit
        expired:    ['submitted'],      // submit renewal
        superseded: ['archived'],
        archived:   [],
      },
    },
    metadata: {
      required: ['doc_type'],           // 'insurance_coi', 'w9', '1099', 'license', 'bond',
                                        // 'osha_cert', 'forklift_cert', 'drivers_license',
                                        // 'first_aid_cert', 'training_record', etc.
      optional: ['expiry_date', 'cert_number', 'coverage_amount', 'issuer',
                 'policy_number', 'effective_date', 'description', 'year'],
    },
  },

  financial: {
    label: 'Financial Document',
    pluralLabel: 'Financial Documents',
    icon: '💰',
    mediaTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxMediaPerAsset: 10,
    aiProcessor: null,                  // could add AI extraction later
    auditable: false,
    cacheable: false,
    allowsChildren: true,               // bid → change orders
    inputMethods: ['file_upload', 'camera', 'manual'],
    selfManageable: true,               // subs can upload bids/estimates
    lifecycle: {
      initialStatus: 'submitted',
      transitions: {
        submitted:  ['under_review', 'accepted', 'rejected'],
        under_review: ['accepted', 'rejected', 'revised'],
        revised:    ['under_review', 'accepted', 'rejected'],
        accepted:   ['signed', 'voided'],
        signed:     ['completed', 'voided'],
        rejected:   ['archived'],
        completed:  ['archived'],
        voided:     ['archived'],
        archived:   [],
      },
    },
    metadata: {
      required: ['doc_type'],           // 'bid', 'estimate', 'contract', 'change_order',
                                        // 'invoice', '1099', 'lien_waiver', 'payment_receipt'
      optional: ['amount', 'description', 'scope_of_work', 'trade',
                 'effective_date', 'expiry_date', 'property_id', 'year'],
    },
  },

  // Future classes follow the same shape — no schema changes needed
};
```

**Adding a new asset class** requires:
1. Add entry to `ASSET_CLASS_REGISTRY` (with lifecycle, media types, metadata)
2. (Optional) Add AI processor if the class needs Claude analysis
3. (Optional) Add class-specific UI component in CalExp5
4. No database migration — `cal_assets.metadata` JSONB handles all class-specific fields
5. Lifecycle transitions are enforced in code — no schema change needed

---

## Asset Lifecycle

Every asset has a lifecycle — a state machine with defined transitions, timestamps, and audit
trail. Assets may go through validation or review before becoming fully "active." The lifecycle
definition lives in the class registry (`lifecycle.transitions`) and is enforced by the API.

### Lifecycle State Machines

```
TOOL:
  cataloged ──→ assigned ──→ deployed ──→ [repair ──→ deployed]
                    │            │                      │
                    │            ├──→ lost ──→ found ──→┘
                    │            ├──→ stolen ──→ recovered ──→ assigned
                    │            └──→ retired (terminal)
                    └──→ returned ──→ assigned
                    └──→ transferred ──→ deployed

RECEIPT (adapter — lifecycle managed by existing cal_receipts pipeline):
  scanned ──→ filed (pending) ──→ posted (QBO) ──→ archived
                                │
                                └──→ disputed ──→ resolved ──→ posted
                                └──→ deleted

DAILY REPORT:
  draft ──→ submitted ──→ reviewed ──→ archived
                │              │
                └──→ flagged ──┘ (returned for revision)

DESIGN ASSET:
  uploaded ──→ current ──→ superseded ──→ archived

SITE DOCUMENT:
  captured ──→ reviewed ──→ resolved ──→ archived
                  │
                  └──→ flagged ──→ reviewed

PROGRESS PHOTO:
  captured ──→ tagged ──→ published ──→ archived
```

### Lifecycle Enforcement

```javascript
// In assets-v1.js route handler:
function validateTransition(asset, newStatus) {
  const classDef = ASSET_CLASS_REGISTRY[asset.asset_class];
  const allowed = classDef.lifecycle.transitions[asset.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(`Cannot transition ${asset.asset_class} from '${asset.status}' to '${newStatus}'`);
  }
}

// Every status change creates an event in cal_asset_events:
// event_type: 'status_changed'
// details: { from: 'assigned', to: 'deployed', reason: 'Moved to jobsite' }
```

### Receipt Lifecycle Mapping

Receipts have their lifecycle in `cal_receipts.status` + `qbo_sync_status` + `triage`:

| Receipt State | Maps To | Appears in Assets View? |
|---------------|---------|------------------------|
| `filed` + `triage='pending'` | Pending validation | No (not yet a confirmed asset) |
| `filed` + `triage='clean'` | Validated, awaiting posting | Yes (confirmed asset) |
| `posted` | Fully posted to QBO | Yes (primary view) |
| `deleted` | Removed | No |

The receipt adapter view filters to **posted receipts only** by default (these are the validated,
confirmed assets). A toggle can show filed-but-clean receipts for visibility.

---

## Nested Assets (Parent-Child)

Assets can own other assets. This enables rich compositions:

### Examples

```
Milwaukee M18 Circular Saw (tool)
├── Operating Manual (child: site_doc, media: url/reference → manufacturer PDF)
├── Maintenance Schedule (child: site_doc, media: application/pdf)
├── Warranty Card (child: site_doc, media: image/jpeg)
├── Repair Receipt 2025-11 (child: links to cal_receipts via metadata)
├── Blade Replacement Receipt 2026-02 (child: links to cal_receipts)
└── Calibration Cert (child: site_doc, media: application/pdf)

Smith Residence Structural Plans (design)
├── S-101 Foundation Plan (child: design, media: application/pdf)
├── S-102 Framing Plan (child: design, media: application/pdf)
└── S-103 Roof Plan (child: design, media: application/pdf)

Building Permit #2026-1234 (permit)
├── Application (child: site_doc, media: application/pdf)
├── Approval Letter (child: site_doc, media: image/jpeg)
└── Inspection Report 2026-03 (child: site_doc, media: application/pdf)
```

### Schema Support

The `parent_asset_id` column in `cal_assets` enables this. See Neon Schema section below.

### Rules

- Children inherit `property_id` from parent (unless explicitly overridden)
- Deleting a parent does NOT cascade-delete children (soft delete only, children become orphans → back-office cleanup)
- Children can be any asset class (a tool's manual is a `site_doc` child)
- Nesting is max 2 levels deep (parent → child, no grandchildren) to keep queries simple
- Children appear in the parent's detail view, not in the main Assets tab listing

---

## URL References and Supporting Resources

Assets can have URL references as media items. This enables linking to external resources without
downloading them.

### URL as Media Type

```javascript
// cal_asset_media row for a URL reference:
{
  asset_id: 42,                              // parent tool
  media_type: 'url',                         // new media type
  mime_type: 'url/reference',                // synthetic MIME type
  file_name: 'Milwaukee M18 Circular Saw - Product Page',
  size_bytes: null,                          // not applicable
  drive_file_id: null,                       // not stored in Drive
  thumb_drive_file_id: null,
  metadata: {
    url: 'https://www.milwaukeetool.com/Products/Power-Tools/2781-20',
    url_type: 'manufacturer_page',           // manufacturer_page | manual | spec_sheet |
                                             // maintenance_guide | parts_list | video | other
    verified_at: '2026-03-29T...',           // last time URL was checked (optional)
    description: 'Official Milwaukee product page with specifications'
  }
}
```

### URL Types

| url_type | Description | Example |
|----------|-------------|---------|
| `manufacturer_page` | Product page on manufacturer's site | milwaukeetool.com/Products/... |
| `manual` | Operating/user manual (PDF or HTML) | milwaukeetool.com/manuals/2781-20.pdf |
| `spec_sheet` | Technical specifications | cdn.milwaukeetool.com/specs/2781-20.pdf |
| `maintenance_guide` | Maintenance schedule/procedures | manufacturer or internal doc |
| `parts_list` | Replacement parts catalog | manufacturer parts catalog |
| `video` | Training/how-to video | YouTube, Vimeo, manufacturer video |
| `warranty` | Warranty registration or terms | manufacturer warranty page |
| `safety_data` | SDS/MSDS (for chemicals, materials) | manufacturer safety data |
| `other` | Any other external reference | catch-all |

### Input Methods (per class)

| Method | How It Works | Available For |
|--------|-------------|---------------|
| `camera` | ToolScanner / DocumentCamera → Claude vision | tool, daily_report, progress, site_doc |
| `manual` | Text form: type name, brand, model, description | tool, daily_report, site_doc |
| `url` | Paste or type URL → stored as `url/reference` media | tool, site_doc, design |
| `file_upload` | File picker → upload PDF, CAD, image, etc. | tool, progress, site_doc, design |
| `audio` | Microphone → record audio clip | daily_report |
| `video` | Video camera → record clip | daily_report, progress |

---

## Auto-Enrichment Pipeline

When a tool (or any asset with a known make/model) is cataloged, the system automatically
fetches supporting resources from the web. Claude's world knowledge bootstraps the process;
web fetches fill in current-version documents.

### Enrichment Flow

```
User confirms tool identity (via camera scan, manual entry, or receipt detection)
  │
  ┌──────────────────────────────────────────────────────────────┐
  │ STEP 1: Claude World Knowledge (instant, no web call)         │
  │                                                               │
  │ Input: brand + model (e.g., "Milwaukee 2781-20")              │
  │ Claude returns:                                               │
  │   - Full name: "Milwaukee M18 FUEL 7-1/4 in. Circular Saw"   │
  │   - Category, subcategory, size                               │
  │   - Key specs (RPM, voltage, blade size, weight)              │
  │   - Approximate retail price                                  │
  │   - Description/fingerprint for identification                │
  │   - Manufacturer URL pattern (milwaukeetool.com/Products/...) │
  │                                                               │
  │ This works for ~95% of major brands. Claude knows Milwaukee,  │
  │ DeWalt, Makita, Hilti, Bosch, Ridgid, Ryobi, etc.            │
  │ May not know very new models or niche brands.                 │
  └──────────────────────────────────────────────────────────────┘
        │
        │ background (user doesn't wait)
        ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ STEP 2: Web Enrichment (via Bridge, background job)           │
  │                                                               │
  │ a) Search for manufacturer product page                       │
  │    → WebSearch: "{brand} {model} site:{brand_domain}"         │
  │    → Fetch page → Claude extracts official specs              │
  │    → Store URL as media (url_type: 'manufacturer_page')       │
  │                                                               │
  │ b) Search for operating manual PDF                            │
  │    → WebSearch: "{brand} {model} operating manual filetype:pdf"│
  │    → Download PDF → upload to Drive                           │
  │    → Store as child asset (class: 'site_doc', parent: tool)   │
  │                                                               │
  │ c) Fetch professional product images                          │
  │    → From manufacturer page or image search                   │
  │    → Pick best product photo → use as primary thumbnail       │
  │    → Store in Drive, update asset primary media                │
  │                                                               │
  │ d) Search for maintenance guide (if available)                │
  │    → WebSearch: "{brand} {model} maintenance schedule"         │
  │    → Download if found → store as child asset                 │
  │                                                               │
  │ e) Search for spec sheet                                      │
  │    → Download if found → store as child asset                 │
  └──────────────────────────────────────────────────────────────┘
        │
        ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ STEP 3: Cache to Device (for offline access)                  │
  │                                                               │
  │ Professional thumbnail → IndexedDB Tool Crib (immediate)     │
  │ Operating manual PDF → IndexedDB (if tool is at crew's site) │
  │ Other resources → available via Drive when online             │
  └──────────────────────────────────────────────────────────────┘
```

### Enrichment Prompt

```
You are cataloging a construction tool for Bainbridge Builders inventory.

Tool identity: {brand} {model}

Using your knowledge, provide:
{
  "full_name": "official product name",
  "brand": "manufacturer",
  "model": "model number",
  "category": "power_tool | hand_tool | measuring | safety | etc.",
  "subcategory": "saw | drill | grinder | etc.",
  "size": "size descriptor or null",
  "specs": {
    "voltage": "18V",
    "rpm": "5800",
    "blade_size": "7-1/4 in",
    "weight": "7.5 lbs",
    "battery_platform": "M18"
  },
  "approximate_retail": 299,
  "description": "One-paragraph description for identification",
  "manufacturer_url_pattern": "likely product page URL",
  "manual_search_terms": "best search query to find the operating manual",
  "image_search_terms": "best search query to find a product photo"
}

If you don't recognize this specific model, say so — do not fabricate specs.
```

### Enrichment Status on Asset

```javascript
// In cal_assets.metadata for tools:
{
  "name": "M18 FUEL 7-1/4 in. Circular Saw",
  "brand": "Milwaukee",
  "model": "2781-20",
  // ... standard fields ...

  "enrichment": {
    "status": "complete",           // pending | in_progress | complete | partial | failed
    "completed_at": "2026-03-30T...",
    "sources": {
      "world_knowledge": true,      // Claude identified it
      "product_page": true,         // manufacturer URL found + stored
      "manual_pdf": true,           // operating manual fetched + stored
      "pro_thumbnail": true,        // professional product image set as primary
      "spec_sheet": false,          // not found
      "maintenance_guide": false    // not found
    }
  }
}
```

---

## Receipt → Tool Bridge

When a receipt contains tool purchases, the system detects them and offers to commission tools
into inventory. Two modes: **real-time** (at scan time) and **retroactive** (batch utility).

The tool's lifecycle starts at the moment of purchase — the receipt is the birth certificate.

### Real-Time Detection (In BB Scan Flow)

Detection runs inline during the existing receipt scan, after Claude extracts line items.
It does NOT block filing — a subtle 🔧 icon appears on the receipt card if tools are detected.

```
Receipt scan complete (existing pipeline)
  │
  Claude already extracted line items:
  │  "1x Milwaukee M18 7-1/4 Circ Saw  $299.00"
  │  "1x Box of 2.5" screws             $12.50"
  │  "2x 2x4x8 SPF Lumber              $7.98"
  │
  Tool detection runs (fast, same Claude response or lightweight post-check):
  │
  Detection signals (weighted):
  │  ✓ Known brand: "Milwaukee" (high)
  │  ✓ Price ≥ $20: $299 (medium)
  │  ✓ Tool vendor: Home Depot (medium)
  │  ✓ BBInc-assigned receipt (medium)
  │  ✓ Category keyword: "Saw" (medium)
  │  ✗ Consumable keyword: none (low — absence is positive signal)
  │
  Score exceeds threshold → 🔧 icon appears on receipt result card
  │
  Crew taps 🔧:
  │  Shows tool thumbnail (from Claude world knowledge + enrichment)
  │  [Add to Tool Crib] or [Dismiss]
  │
  If accepted:
  │
  Auto-create tool asset:
  ├── asset_class: 'tool', status: 'cataloged'
  ├── metadata: name, brand, model (from line item + Claude enrichment)
  ├── metadata.purchase_date: receipt date
  ├── metadata.purchase_price: line item amount
  ├── metadata.purchased_at: receipt vendor (Home Depot)
  ├── metadata.purchased_by: crew member
  ├── Receipt linked as child asset (birth certificate)
  ├── Auto-enrichment pipeline runs (manual, pro photo, specs)
  └── If crew at a jobsite → prompt: "Assign to [current site]?"
```

### Detection Signals

| Signal | Weight | Example | Notes |
|--------|--------|---------|-------|
| Known tool brand in line item | High | "Milwaukee", "DeWalt", "Makita" | Dictionary of ~50 brands |
| Item price ≥ $20 | Medium | Screws=$12 (no), Drill=$199 (yes) | Filters out consumables |
| Tool vendor | Medium | Home Depot, Lowe's, Grainger | High tool probability stores |
| BBInc-assigned receipt | Medium | Company card purchase | Company inventory more likely |
| Category keywords | Medium | "saw", "drill", "grinder", "level" | ~100 tool keywords |
| NOT consumable keywords | Low | Absence of "box of", "pack", "bag" | Negative signal if present |
| High individual item price | High | ≥ $100 single item at tool vendor | Almost certainly a tool |

### What Counts as a "Tool" (Classifier Rules)

| Category | Examples | Tool? |
|----------|---------|-------|
| Power tools | Drills, saws, grinders, rotary hammers | YES |
| Hand tools (≥$20) | Wrenches, hammers, levels, pliers | YES |
| Measuring | Tape measures, lasers, stud finders | YES |
| Safety equipment | Harnesses, hard hats, fire extinguishers | YES |
| Consumables | Screws, nails, tape, caulk, paint | NO |
| Lumber/materials | 2x4s, plywood, drywall, pipe | NO |
| Fasteners | Bolts, anchors, brackets | NO |
| Blades/bits | Saw blades, drill bits (unless ≥$50) | NO (consumable, usually) |
| Rental equipment | Noted but tracked differently | PROMPT |
| PPE (≥$30) | Safety glasses, ear protection | MAYBE (prompt) |

### Classifier Prompt (Used by Both Real-Time and Retroactive)

```
Examine these receipt line items from {vendor}.
Classify each as TOOL (durable equipment worth tracking in inventory) or NOT.

Line items:
{items_json}

Rules:
- TOOL = durable, reusable equipment: power tools, hand tools, measuring, safety gear
- NOT = consumables: screws, nails, lumber, paint, tape, adhesives, blades, bits
- MAYBE = borderline items: prompt user to decide
- If brand is recognizable (Milwaukee, DeWalt, Makita, etc.), extract brand + model
- Items ≥$100 from tool vendors are almost always tools

Return JSON array:
[
  {
    "line_item": "original text",
    "is_tool": true | false | "maybe",
    "brand": "Milwaukee" or null,
    "model": "2781-20" or null,
    "name": "M18 FUEL 7-1/4 in. Circular Saw",
    "category": "power_tool",
    "price": 299.00,
    "confidence": 0.95,
    "reason": "Known brand power tool at $299"
  }
]
```

### Receipt Scan Enhancement (Code Integration)

```javascript
// In receipt-v1.js, after line items are extracted during /scan:
// This runs BEFORE the response is sent to the phone — adds tool_detections to scan result

async function detectToolPurchases(items, vendor, isReceipt) {
  if (!items || items.length === 0) return [];
  // Skip personal/reimbursable receipts — only BBInc company purchases
  // (can still detect on personal receipts, but lower priority)

  const toolItems = await classifyLineItems(items, vendor);
  return toolItems.filter(t => t.is_tool === true || t.is_tool === 'maybe');
}

// Scan response includes:
// result.tool_detections = [{ brand, model, name, price, confidence }]
// CalExp5 shows 🔧 icon if tool_detections.length > 0
```

### Retroactive Receipt Scan (Batch Utility)

A back-office utility that scans historical BBInc receipts to discover tool purchases
that were never cataloged. Run once to bootstrap the Tool Crib, then periodically.

**Trigger:** Tool Dashboard → "Scan Historical Receipts" button (admin only)

```
GET /api/assets/tools/receipt-scan?since=2025-01-01

Pipeline:
  1. Query all BBInc receipts (is_receipt=false) with line items since {date}
  2. Exclude receipts already scanned (metadata.tool_scan_checked = true)
  3. For each receipt batch (10 at a time):
     - Send line items to Claude classifier
     - Collect tool detections
  4. Return: { receipts_scanned, tools_found, high_confidence, needs_review }

Admin review screen:
  - High confidence tools (≥0.85): pre-checked, one-click commission
  - Needs review (0.50-0.84): admin decides yes/no per item
  - Rejected items: mark receipt as scanned so it's not re-processed

"Commission Selected" → batch-creates tool assets:
  - Each tool gets purchase provenance from receipt
  - Each receipt linked as child asset
  - Auto-enrichment queued for all (sequential, not simultaneous)
  - Progress bar: "Enriching 32 tools... 12/32 complete"
  - Mark scanned receipts: metadata.tool_scan_checked = true
```

**Periodic sweep** (optional, from Tool Dashboard):
- "Scan new receipts since last scan" button
- Only processes receipts filed since last scan timestamp
- Surfaces newly detected tools for admin review
- Can also be a scheduled cron if Sam wants fully automatic detection

---

## Vault → "All Receipts" Rename

The current "Vault" in MenuDrawer shows all receipts in a searchable list. With receipts now also
appearing per-site in the Assets tab, the name "Vault" is confusing.

### Rename Plan

| Current | New | Location | Purpose |
|---------|-----|----------|---------|
| Vault | **All Receipts** | MenuDrawer (same position) | Global cross-site receipt view |
| My Receipts | My Receipts (unchanged) | MenuDrawer | User's own recent receipts |
| (new) | **Tool Crib** | MenuDrawer (gated: `tools.view`) | Global tool catalog view |
| JobsitesView → Assets tab → Receipts | (new) | Property detail | Per-site posted receipts |
| JobsitesView → Assets tab → Tools | (new) | Property detail | Per-site assigned tools |

### MenuDrawer Layout (updated)

```
  My Hours
  My PTO
  My Report
  My Team (manager)
  ─────────────────
  My Receipts
  All Receipts        ← was "Vault"
  ─────────────────
  Tool Crib           ← NEW (tools.view)
  Tool Dashboard      ← NEW (tools.admin)
  ─────────────────
  JobSites
  ─────────────────
  GPS sections...
```

### Code Changes

| File | Change |
|------|--------|
| `MenuDrawer-v2.jsx` | Rename "Vault" label → "All Receipts" |
| `receiptSlice.js` | Rename `vaultOpen` → `allReceiptsOpen` (or alias for backward compat) |
| `ReceiptVaultModal.jsx` | Rename component → `AllReceiptsModal.jsx` (or keep internal name, just change display label) |

Minimal code change — it's a label rename, not a feature change. The existing Vault functionality
stays identical.

---

## External Access (Customers & Subcontractors)

CalExp5 will be released to customers and subcontractors so they can view and deposit assets
onto BB's vault for their assigned properties. This is **multi-party access** to a single
tenant's data (BBInc), not multi-tenancy.

### User Types

```
INTERNAL (existing):
  employee  — BB crew member. Full asset access per feature flags.
  manager   — BB manager. Team reports + asset oversight.
  admin     — Sam. Everything.

EXTERNAL (new):
  customer  — Homeowner, property manager, GC client.
              Sees published assets for THEIR property only.
              Can deposit photos, notes, design files.

  sub       — Subcontractor (electrician, plumber, HVAC, etc.).
              Sees shared assets for assigned properties, scoped to their trade.
              Can deposit progress photos, reports, permits, inspection results.
```

### Trust Boundaries — What Each Party Sees

| Asset Class | BB Crew | Customer | Subcontractor |
|-------------|---------|----------|---------------|
| Tools | Full access | HIDDEN | HIDDEN |
| Receipts | Full access | HIDDEN | HIDDEN |
| Daily Reports | Full access | Only if `published` | Only their scope |
| Progress Photos | Full access | Only if `published` | Only their scope |
| Site Docs | Full access | Only if `shared` | Only their trade |
| Design Assets | Full access | Only if `shared` | Only their discipline |
| Permits | Full access | Visible | Their trade only |
| Hours/Timesheets | Full access | HIDDEN | HIDDEN |
| GPS Tracking | Full access | HIDDEN | HIDDEN |
| Tool Audits | Full access | HIDDEN | HIDDEN |

**Default: internal.** Nothing is visible to external users unless BB explicitly publishes
or shares it. This is a push model — BB decides what external parties see.

### Asset Visibility Model

Every asset has a `visibility` field:

| Visibility | Meaning | Visible To |
|------------|---------|------------|
| `internal` | Default. BB eyes only | BB employees |
| `published` | Explicitly published for clients | BB + customers with property access |
| `shared` | Shared with specific parties | BB + named users in `cal_property_access` |

```
BB crew creates progress photo → visibility: 'internal' (default)
  │
  Manager reviews → taps "Publish to Client" → visibility: 'published'
  │
  Customer opens CalExp5 → sees the photo in their property's Assets tab
```

### Property-Scoped Access

External users can ONLY access properties they're explicitly linked to.
The link is created by a BB admin/manager via an invite flow.

```
Sam invites customer "John Smith" to view "Smith Residence":
  │
  1. Sam enters email: john@example.com
  2. System sends magic link email
  3. John clicks link → sets up PIN → lands in CalExp5
  4. John sees ONLY "Smith Residence" in his JobsitesView
  5. John sees ONLY published/shared assets for that property
  6. John can deposit photos/notes to that property
  │
  Access record created:
  {
    property_id: 'prop_789',
    user_id: 'ext_john_smith',
    user_type: 'customer',
    role: 'depositor',
    scopes: ['progress', 'site_doc', 'design'],
    granted_by: 'emp_sam',
    expires_at: '2026-12-31'    // end of contract
  }
```

### External User Authentication

**Magic link + PIN hybrid:**

```
INVITE FLOW (Sam initiates):
  1. Sam opens Crew Auth Management (or new External Access panel)
  2. Enters: name, email, type (customer/sub), property, scopes
  3. System creates cal_external_users record
  4. Sends email: "You've been invited to view your project at Bainbridge Builders"
  5. Email contains magic link with one-time token

FIRST LOGIN (external user):
  1. Clicks magic link → CalExp5 opens
  2. Prompted to set a 4-digit PIN (same UX as crew)
  3. PIN stored → JWT issued with external role + scopes
  4. Lands on filtered JobsitesView (their property only)

SUBSEQUENT LOGINS:
  1. Opens CalExp5 → enters PIN
  2. JWT contains: user_id, user_type, property_ids, scopes
  3. Every API call filtered by these claims
```

### Customer View

```
┌──────────────────────────────────┐
│ BB · Smith Residence             │
│ Welcome, John                    │
├──────────────────────────────────┤
│ ┌──────┬───────┬───────┐        │
│ │Photos│ Docs  │Design │        │  ← Only scoped asset classes
│ └──────┴───────┴───────┘        │     (no Tools, no Receipts)
│                                  │
│ ─── Progress Photos (8) ──────  │
│ [📷] Kitchen remodel — Mar 28   │  ← Published by BB
│ [📷] Framing complete — Mar 15  │
│ [📷] Demo day — Mar 1           │
│                                  │
│ ─── Documents (3) ────────────  │
│ [📋] Weekly update — Mar 28     │  ← Published daily report summary
│ [📄] Change order #2 — Mar 20  │
│                                  │
│ ─── Design (2) ───────────────  │
│ [📐] Floor plan Rev C           │  ← Shared by BB
│ [📐] Kitchen elevation          │
│                                  │
│ [+ Add Photo/Note]               │  ← Customer can deposit
│                                  │
│ ─── My Uploads (2) ────────────  │
│ [📷] "Crack in garage wall"     │  ← Customer's own deposits
│ [📷] "Paint color preference"   │
└──────────────────────────────────┘
```

### Subcontractor View

```
┌──────────────────────────────────┐
│ BB · Smith Residence             │
│ Welcome, Mike (Pacific Electric) │
│ Scope: Electrical                │
├──────────────────────────────────┤
│ ┌──────┬───────┬───────┬──────┐ │
│ │Photos│ Docs  │Design │Permit│ │
│ └──────┴───────┴───────┴──────┘ │
│                                  │
│ ─── Progress Photos (4) ──────  │
│ [📷] Panel install — Mar 28     │  ← Their uploads
│ [📷] Rough-in complete — Mar 20 │
│                                  │
│ ─── Design (1) ───────────────  │
│ [📐] E-101 Electrical plan      │  ← Shared, their discipline
│                                  │
│ ─── Permits (1) ──────────────  │
│ [📄] Electrical permit #E-2026  │  ← Their trade
│                                  │
│ [+ Add Report/Photo]             │  ← Sub can deposit
│ [📋 Submit Daily Report]         │
└──────────────────────────────────┘
```

### Deposit Provenance

When an external user deposits an asset, it's clearly tagged:

```javascript
// Asset created by external user:
{
  asset_class: 'site_doc',
  created_by: 'ext_john_smith_789',
  created_by_name: 'John Smith',
  created_by_type: 'customer',         // ← new field
  visibility: 'shared',                // external deposits are shared back to BB
  metadata: {
    source: 'customer_deposit',
    note: 'Found this crack in the garage wall'
  }
}
```

BB crew sees external deposits with a badge:

```
│ 👤 John Smith (Customer) · Mar 30  │
│ [📷] "Crack in garage wall"        │
│ ⚠️ Customer flagged — requires review │
```

### Notifications (Cross-Party)

| Event | Who Gets Notified |
|-------|-------------------|
| Customer deposits photo/note | Assigned BB crew + manager |
| Sub submits daily report | BB project manager |
| BB publishes progress photo | Customer (if subscribed) |
| BB shares design file | Sub (if in their scope) |
| Audit completed (missing tools) | BB admin only (never external) |
| Receipt filed | BB only (never external) |

### Storybook Connection

The customer view IS the foundation for the storybook feature:
- Progress photos tagged with milestones, sorted chronologically
- Customer sees their project's story unfold over time
- At project completion: "View Your Project Story" → full timeline
- Exportable as PDF storybook for the customer to keep/share
- **Marketing asset:** Beautiful before/after timeline that customers share → referrals

---

## Neon Schema — Auth & Access

### Humans as Assets (The Collapse)

Employees, subs, and customers are stored in `cal_assets` with `asset_class` of `'employee'`,
`'sub'`, or `'customer'`. Their compliance docs, bids, contracts, and certifications are child
assets (`parent_asset_id` pointing to the human asset). Property assignments are tracked via
`cal_asset_events` (`event_type: 'assigned'`).

This eliminates the need for separate `cal_external_users` and `cal_business_relationships`
tables. The universal asset system handles profiles, documents, lifecycle, and audits for
humans the same way it handles tools.

**The only new table** is a thin auth layer linking login credentials to human asset records:

```sql
-- =====================================================
-- UNIFIED AUTH TABLE
-- Links login identity to human asset record
-- Covers employees (existing PIN auth) + subs + customers
-- =====================================================
CREATE TABLE cal_auth_users (
  id TEXT PRIMARY KEY,                         -- 'usr_{uuid}'
  asset_id INTEGER REFERENCES cal_assets(id),  -- link to human asset (employee/sub/customer)
  email TEXT UNIQUE,
  phone TEXT,
  pin_hash TEXT,                               -- bcrypt hash of PIN
  role TEXT NOT NULL,                          -- 'employee' | 'manager' | 'admin' | 'sub' | 'customer'
  features JSONB DEFAULT '{}',                -- per-user feature flags (existing system)
  scopes TEXT[] DEFAULT '{}',                  -- asset classes user can access
  status TEXT NOT NULL DEFAULT 'invited',      -- invited | active | suspended | revoked
  last_login_at TIMESTAMPTZ,
  magic_token TEXT,                            -- one-time invite/reset token
  magic_token_expires TIMESTAMPTZ,
  qbt_id TEXT,                                 -- for employees: link to QBT employee ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cal_auth_users_email ON cal_auth_users(email);
CREATE INDEX idx_cal_auth_users_asset ON cal_auth_users(asset_id);
CREATE INDEX idx_cal_auth_users_role ON cal_auth_users(role);
CREATE INDEX idx_cal_auth_users_status ON cal_auth_users(status);
CREATE INDEX idx_cal_auth_users_qbt ON cal_auth_users(qbt_id) WHERE qbt_id IS NOT NULL;
```

### What Replaces What

| Old (v1.4) | New (v1.5) | Why |
|------------|------------|-----|
| `cal_external_users` | `cal_auth_users` + human asset in `cal_assets` | Unified auth. Profile data lives on the asset, not the auth table |
| `cal_business_relationships` | Human asset IS the relationship | Sub asset has trade, company, license — no separate relationship table needed |
| `cal_property_access` | `cal_asset_events` (event_type: `'granted_access'`) | Property access is just another lifecycle event on the human asset |

### Property Access via Events (Replaces cal_property_access)

```javascript
// Granting property access = creating an event on the human asset:
{
  asset_id: 500,                     // Pacific Electric (sub)
  event_type: 'granted_access',
  property_id: 'prop_789',           // Smith Residence
  performed_by: 'emp_sam',
  details: {
    role: 'depositor',
    scopes: ['progress', 'site_doc', 'design'],
    trade: 'electrical',
    expires_at: '2026-12-31'
  }
}

// Revoking = another event:
{
  asset_id: 500,
  event_type: 'revoked_access',
  property_id: 'prop_789',
  performed_by: 'emp_sam',
  details: { reason: 'Contract complete' }
}

// Query: which properties does this user have access to?
SELECT DISTINCT ON (property_id)
  property_id, details
FROM cal_asset_events
WHERE asset_id = 500
  AND event_type IN ('granted_access', 'revoked_access')
ORDER BY property_id, performed_at DESC;
-- Then filter: only rows where event_type = 'granted_access' AND not expired
```

### Human Asset Examples

**Employee (mirrors QBT + adds BB-specific docs):**

```
cal_assets: { id: 600, asset_class: 'employee', status: 'active',
  metadata: {
    name: 'Chad Thompson', qbt_id: 'emp_123',
    role: 'crew', trade: 'general',
    hire_date: '2023-04-15',
    skills: ['framing', 'concrete', 'tile'],
    phone: '(206) 555-1234',
    email: 'chad@bbinc.com',
    emergency_contact: { name: 'Jane', phone: '(206) 555-5678' }
  }
}
cal_auth_users: { id: 'usr_chad', asset_id: 600, role: 'employee', qbt_id: 'emp_123' }

Children (parent_asset_id: 600):
  { id: 601, class: 'compliance', metadata: { doc_type: 'osha_cert', expiry: '2027-04-15' } }
  { id: 602, class: 'compliance', metadata: { doc_type: 'forklift_cert', expiry: '2026-08-01' } }
  { id: 603, class: 'compliance', metadata: { doc_type: 'first_aid_cert', expiry: '2027-01-01' } }
  { id: 604, class: 'compliance', metadata: { doc_type: 'drivers_license', expiry: '2028-01-01' } }
```

**Subcontractor:**

```
cal_assets: { id: 500, asset_class: 'sub', status: 'active',
  metadata: {
    name: 'Mike Johnson',
    company_name: 'Pacific Electric',
    trade: 'electrical',
    license_number: 'CA-EL-12345', license_expiry: '2026-12-31',
    insurance_expiry: '2027-01-15',
    phone: '(206) 555-9999',
    email: 'mike@pacificelectric.com',
    rate: 85.00,
    w9_on_file: true
  }
}
cal_auth_users: { id: 'usr_mike', asset_id: 500, role: 'sub', scopes: ['progress','site_doc','design','compliance'] }

Children (parent_asset_id: 500):
  { id: 501, class: 'compliance', metadata: { doc_type: 'insurance_coi', expiry: '2027-01-15', coverage: 2000000 } }
  { id: 502, class: 'compliance', metadata: { doc_type: 'w9' } }
  { id: 503, class: 'compliance', metadata: { doc_type: 'license', number: 'CA-EL-12345', expiry: '2026-12-31' } }
  { id: 504, class: 'compliance', metadata: { doc_type: 'bond', amount: 25000 } }
  { id: 505, class: 'financial',  metadata: { doc_type: 'bid', property_id: 'prop_789', amount: 12500 } }
  { id: 506, class: 'financial',  metadata: { doc_type: 'contract', property_id: 'prop_789', signed: true } }
  { id: 507, class: 'financial',  metadata: { doc_type: '1099', year: 2025, amount: 45000 } }

Events (cal_asset_events for asset 500):
  { event_type: 'created', at: '2025-06-01' }
  { event_type: 'status_changed', details: { from: 'onboarded', to: 'active' } }
  { event_type: 'granted_access', property_id: 'prop_789', details: { scopes: ['progress','site_doc'], trade: 'electrical' } }
  { event_type: 'granted_access', property_id: 'prop_456', details: { scopes: ['progress','site_doc'], trade: 'electrical' } }
```

**Customer:**

```
cal_assets: { id: 700, asset_class: 'customer', status: 'active',
  property_id: 'prop_789',
  metadata: {
    name: 'John Smith',
    phone: '(206) 555-9876',
    email: 'john@example.com',
    contract_value: 185000,
    referral_source: 'website',
    property_ids: ['prop_789']
  }
}
cal_auth_users: { id: 'usr_john', asset_id: 700, role: 'customer', scopes: ['progress','site_doc','design'] }

Children (parent_asset_id: 700):
  { id: 701, class: 'financial', metadata: { doc_type: 'contract', amount: 185000, signed: true } }
  { id: 702, class: 'design', metadata: { file_type: 'pdf', description: 'Kitchen plans from architect' } }
```

---

## Profile Self-Management

All human assets can manage their own profile through CalExp5. This is scoped — each person
can only edit their own record and add their own child documents.

### Permission Matrix

| Action | Employee | Sub | Customer | Manager | Admin |
|--------|----------|-----|----------|---------|-------|
| Edit own contact info | YES | YES | YES | YES | YES |
| Edit own emergency contact | YES | NO | NO | YES | YES |
| Add own cert/doc (child asset) | YES | YES | YES | YES | YES |
| View own profile + children | YES | YES | YES | YES | YES |
| View other profiles | NO | NO | NO | YES (team) | YES (all) |
| Edit other profiles | NO | NO | NO | NO | YES |
| Add docs to other profiles | NO | NO | NO | NO | YES |
| Change anyone's lifecycle status | NO | NO | NO | NO | YES |
| Grant/revoke property access | NO | NO | NO | YES | YES |
| View compliance dashboard | NO | NO | NO | YES | YES |

### Self-Service Profile View

```
┌──────────────────────────────────┐
│ My Profile                       │
│ Chad Thompson · Crew             │
├──────────────────────────────────┤
│ [profile photo]  [📷 Update]    │
│                                  │
│ Phone: (206) 555-1234  [Edit]   │
│ Email: chad@bbinc.com  [Edit]   │
│ Emergency: Jane (206) 555-5678  │
│            [Edit]                │
│                                  │
│ ─── My Certifications ────────  │
│ ✅ OSHA-10 (exp 2027-04-15)     │
│ ✅ Forklift (exp 2026-08-01)    │
│ ⚠️ First Aid (exp 2026-04-01)   │  ← Expiring soon
│ ✅ Driver's License (2028-01-01)│
│                                  │
│ [+ Add Certification]            │
│                                  │
│ ─── My Sites ─────────────────  │
│ Smith Residence (active)         │
│ Johnson Kitchen (active)         │
│                                  │
│ ─── My Skills ────────────────  │
│ Framing · Concrete · Tile       │
│ [Edit Skills]                    │
└──────────────────────────────────┘
```

### Adding a Certification (Self-Service)

```
Chad taps [+ Add Certification]:
  │
  ┌──────────────────────────────────┐
  │ Add Certification                │
  ├──────────────────────────────────┤
  │                                  │
  │ Type * [OSHA-30          ▾]     │  ← Dropdown of cert types
  │ Cert #  [OSHA-30-2026-789]     │
  │ Issued  [03/25/2026]           │
  │ Expires [03/25/2028]           │
  │                                  │
  │ [📷 Take Photo of Certificate] │  ← Camera or file upload
  │ or [📄 Upload PDF]             │
  │                                  │
  │ [Save]                          │
  └──────────────────────────────────┘
  │
  Creates child asset:
    asset_class: 'compliance'
    parent_asset_id: 600 (Chad)
    status: 'submitted'              ← needs admin verification
    created_by: 'usr_chad'
    created_by_type: 'employee'
    metadata: { doc_type: 'osha_cert', cert_number: 'OSHA-30-2026-789',
                effective_date: '2026-03-25', expiry_date: '2028-03-25' }
    media: [photo/PDF of the certificate]
```

**Verification flow:** Self-submitted docs start as `status: 'submitted'`. An admin or
manager reviews → transitions to `'verified'`. This creates an audit trail of who submitted
what and who verified it.

### Sub Self-Service (Upload Insurance, W-9, etc.)

```
Pacific Electric (Mike) taps [+ Add Document]:
  │
  ┌──────────────────────────────────┐
  │ Add Document                     │
  ├──────────────────────────────────┤
  │                                  │
  │ Type * [Insurance COI    ▾]     │
  │ Insurer [State Farm           ] │
  │ Policy# [SF-2026-12345       ] │
  │ Coverage [$2,000,000         ] │
  │ Effective [01/15/2026]         │
  │ Expires   [01/15/2027]         │
  │                                  │
  │ [📷 Photo] or [📄 Upload PDF]  │
  │                                  │
  │ [Submit]                        │
  └──────────────────────────────────┘
  │
  Creates compliance child asset on Mike's sub record
  Status: 'submitted' → admin verifies → 'verified'
  Old insurance COI auto-transitions to 'superseded'
```

### Expiry Monitoring (Automated)

```javascript
// Daily cron job: check all compliance assets for approaching expiry
async function checkExpiringCompliance() {
  const soon = await sql`
    SELECT a.id, a.parent_asset_id, a.metadata, p.metadata->>'name' AS person_name,
           p.asset_class AS person_type
    FROM cal_assets a
    JOIN cal_assets p ON p.id = a.parent_asset_id
    WHERE a.asset_class = 'compliance'
      AND a.status = 'verified'
      AND (a.metadata->>'expiry_date')::date <= NOW() + INTERVAL '30 days'
      AND a.deleted_at IS NULL
  `;

  for (const doc of soon) {
    const daysLeft = daysUntil(doc.metadata.expiry_date);

    if (daysLeft <= 0) {
      // EXPIRED — transition status + alert admin
      await transitionAsset(doc.id, 'expired');
      await notifyAdmin(`${doc.person_name}'s ${doc.metadata.doc_type} has EXPIRED`);
    } else if (daysLeft <= 30) {
      // EXPIRING SOON — alert the person + admin
      await notifyUser(doc.parent_asset_id, `Your ${doc.metadata.doc_type} expires in ${daysLeft} days`);
      await notifyAdmin(`${doc.person_name}'s ${doc.metadata.doc_type} expires in ${daysLeft} days`);
    }
  }
}
```

### Profile Access in CalExp5

| Where | What | Who |
|-------|------|-----|
| MenuDrawer → "My Profile" | Self-service profile view | All logged-in users |
| MenuDrawer → "Team" (existing) | View crew profiles | Managers |
| MenuDrawer → "Subs" (new) | View/manage sub profiles + compliance | Admin |
| MenuDrawer → "Customers" (new) | View/manage customer profiles | Admin |
| Tool Dashboard → "Sub Compliance" | Compliance dashboard across all subs | Admin |

### API Endpoints (Profile)

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | `/api/assets/me` | Get own human asset + children | Any logged-in user |
| PUT | `/api/assets/me` | Update own contact info, skills, etc. | Any logged-in user |
| POST | `/api/assets/me/children` | Add cert/doc to own profile | Any logged-in user |
| GET | `/api/assets/people` | List all human assets (filtered by role) | Manager, Admin |
| GET | `/api/assets/people/:id` | View someone's profile + children | Manager (team), Admin (all) |
| GET | `/api/assets/people/compliance` | Compliance dashboard (expiring, missing) | Manager, Admin |
| POST | `/api/assets/:id/transition` | Verify submitted doc (submitted → verified) | Admin |

---

## Vanity Subdomain Architecture

Every stakeholder (customer, sub) gets a personalized URL for their portal:

```
Eklund.BainbridgeBuilders.com          → Customer portal (Eklund family project)
DAEPlumbing.BainbridgeBuilders.com     → Sub portal (DAE Plumbing)
PacificElectric.BainbridgeBuilders.com → Sub portal (Pacific Electric)
crew.BainbridgeBuilders.com            → Employee app (CalExp5)
app.BainbridgeBuilders.com             → Generic login (no vanity URL)
admin.BainbridgeBuilders.com           → Sam's admin dashboard
```

### Infrastructure (One-Time Setup)

```
DNS (set once, never touch again):
  *.bainbridgebuilders.com    CNAME → your-app.up.railway.app
  bainbridgebuilders.com      A     → Railway IP

SSL:
  Wildcard cert: *.bainbridgebuilders.com
  Railway + Let's Encrypt handles provisioning + renewal automatically

Result: Infinite subdomains, zero per-stakeholder DNS/SSL config
```

### Routing Middleware

```javascript
// Express/Fastify middleware: reads subdomain → scopes the entire request
function portalRouter(req, res, next) {
  const host = req.hostname.toLowerCase();
  const subdomain = host.split('.')[0];

  // Reserved subdomains
  if (subdomain === 'crew')  return next();   // normal CalExp5 employee flow
  if (subdomain === 'admin') return next();   // admin dashboard
  if (subdomain === 'app')   return next();   // generic login

  // Look up stakeholder by portal slug
  const stakeholder = await sql`
    SELECT id, asset_class, metadata, status
    FROM cal_assets
    WHERE asset_class IN ('customer', 'sub')
      AND metadata->>'portal_slug' = ${subdomain}
      AND (metadata->>'portal_enabled')::boolean = true
      AND deleted_at IS NULL
    LIMIT 1
  `;

  if (!stakeholder) {
    return res.status(404).render('portal-not-found');
  }

  // Attach stakeholder context to request
  req.portal = {
    assetId: stakeholder.id,
    type: stakeholder.asset_class,       // 'customer' or 'sub'
    name: stakeholder.metadata.name,
    slug: subdomain,
    config: stakeholder.metadata.portal_config || {},
  };

  next();
}
```

### Portal Slug (Stored on Human Asset)

```json
{
  "asset_class": "customer",
  "metadata": {
    "name": "Erik & Jill Eklund",
    "portal_slug": "eklund",
    "portal_enabled": true,
    "portal_config": {
      "welcome_message": "Welcome to your project portal",
      "show_progress": true,
      "show_design": true,
      "show_financials": false,
      "show_storybook": true,
      "logo_url": null,
      "accent_color": null
    }
  }
}
```

**Slug rules:**
- Lowercase, alphanumeric + hyphens only
- Unique across all human assets (enforced by partial unique index)
- Auto-generated from company/customer name, editable by admin
- Reserved slugs blocked: `crew`, `admin`, `app`, `api`, `www`, `mail`, `ftp`

```sql
-- Enforce unique portal slugs
CREATE UNIQUE INDEX idx_cal_assets_portal_slug
  ON cal_assets ((metadata->>'portal_slug'))
  WHERE metadata->>'portal_slug' IS NOT NULL
    AND deleted_at IS NULL;
```

### Splash Screens (Per Stakeholder Class)

Each stakeholder class gets a distinct splash screen that sets the tone before login.
The splash renders immediately — no API call needed. The subdomain tells us the class,
and the stakeholder name is fetched with a single fast query.

**Customer Splash:**
```
Eklund.BainbridgeBuilders.com loads:

┌──────────────────────────────────┐
│                                  │
│                                  │
│        [BB Logo - white]         │
│                                  │
│     BAINBRIDGE BUILDERS          │
│     ─────────────────            │
│     Building Your Vision         │
│                                  │
│                                  │
│  ┌────────────────────────────┐  │
│  │                            │  │
│  │  [Hero image: property     │  │
│  │   Street View or latest    │  │
│  │   progress photo]          │  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
│     Eklund Residence             │
│     Your Project Portal          │
│                                  │
│     [  _ ] [  _ ] [  _ ] [  _ ]  │
│     Enter your PIN               │
│                                  │
│     First time? Check email      │
│     for your setup link          │
│                                  │
│  ── Powered by Bainbridge ────── │
└──────────────────────────────────┘

Background: warm gradient (cream → white)
Accent: BB Red (#C8102E) on logo + PIN underlines
Tone: premium, residential, welcoming
Hero image: Street View of their property OR latest published progress photo
```

**Subcontractor Splash:**
```
DAEPlumbing.BainbridgeBuilders.com loads:

┌──────────────────────────────────┐
│                                  │
│  [BB Logo]    [Sub logo if set]  │
│                                  │
│  BAINBRIDGE BUILDERS             │
│  Contractor Portal               │
│  ─────────────────               │
│                                  │
│  DAE Plumbing & Mechanical       │
│  Trade: Plumbing                 │
│                                  │
│  ┌────────────────────────────┐  │
│  │ ⚠️ 1 document expiring soon│  │  ← Pre-login compliance nudge
│  └────────────────────────────┘  │     (only if public-safe to show)
│                                  │
│     [  _ ] [  _ ] [  _ ] [  _ ]  │
│     Enter your PIN               │
│                                  │
│     First time? Check email      │
│                                  │
│  2 active projects               │
│  ── Powered by Bainbridge ────── │
└──────────────────────────────────┘

Background: dark (#1A1A1A) with subtle grid pattern
Accent: BB Red (#C8102E) on active elements
Tone: professional, business-to-business, efficient
Sub logo: if sub uploaded their logo in profile, shown alongside BB logo
```

**Employee/Crew Splash (existing CalExp5, enhanced):**
```
crew.BainbridgeBuilders.com loads:

┌──────────────────────────────────┐
│                                  │
│        [BB Logo - red]           │
│                                  │
│     BAINBRIDGE BUILDERS          │
│     Crew Portal                  │
│     ─────────────────            │
│                                  │
│     Good morning                 │  ← Time-of-day greeting
│                                  │
│     [  _ ] [  _ ] [  _ ] [  _ ]  │
│     Enter your PIN               │
│                                  │
│     ┌──────────────────────┐     │
│     │ 🌤️ 58°F Bainbridge  │     │  ← Weather at crew's area
│     │ Island, WA           │     │     (optional, nice touch)
│     └──────────────────────┘     │
│                                  │
│  ── v4.16 ───────────────────── │
└──────────────────────────────────┘

Background: BB dark (#1A1A1A)
Accent: BB Red (#C8102E)
Tone: functional, fast, crew-oriented
No hero image — crew wants speed, not ambiance
```

**Generic Login (no vanity URL):**
```
app.BainbridgeBuilders.com loads:

┌──────────────────────────────────┐
│                                  │
│        [BB Logo]                 │
│                                  │
│     BAINBRIDGE BUILDERS          │
│     ─────────────────            │
│                                  │
│     Email: [________________]    │
│                                  │
│     [Continue →]                 │
│                                  │
│     Enter your email to find     │
│     your portal, or use your     │
│     direct portal URL.           │
│                                  │
└──────────────────────────────────┘

Flow: email → look up cal_auth_users → redirect to their vanity subdomain
This is the fallback for users who lost their portal URL
```

### Splash Screen Config (Per Class + Per Stakeholder)

```javascript
// Class-level defaults (in asset-classes.js)
const PORTAL_THEMES = {
  customer: {
    background: 'linear-gradient(180deg, #FFF8F0 0%, #FFFFFF 100%)',
    accentColor: '#C8102E',
    logoVariant: 'white',           // BB logo on light background
    tagline: 'Building Your Vision',
    showHeroImage: true,            // Street View or latest progress photo
    showWeather: false,
    tone: 'premium',
  },
  sub: {
    background: '#1A1A1A',
    accentColor: '#C8102E',
    logoVariant: 'red',             // BB logo on dark background
    tagline: 'Contractor Portal',
    showHeroImage: false,
    showComplianceNudge: true,      // pre-login expiry warning
    showProjectCount: true,
    tone: 'professional',
  },
  employee: {
    background: '#1A1A1A',
    accentColor: '#C8102E',
    logoVariant: 'red',
    tagline: 'Crew Portal',
    showHeroImage: false,
    showWeather: true,
    showTimeGreeting: true,         // "Good morning" / "Good afternoon"
    tone: 'functional',
  },
};

// Per-stakeholder overrides (in cal_assets.metadata.portal_config):
{
  "portal_config": {
    "welcome_message": "Welcome to your kitchen remodel portal",  // override tagline
    "hero_image_url": "https://...",   // custom hero image instead of Street View
    "accent_color": "#2563EB",         // customer's brand color (optional)
    "logo_url": "https://...",         // sub's logo alongside BB logo
  }
}
```

### After Login Views

**Customer (after PIN):**
```
┌──────────────────────────────────┐
│ [BB Logo]  Eklund Residence      │
│ Your Project Portal              │
├──────────────────────────────────┤
│ ┌───────┬──────┬───────┐        │
│ │Photos │ Docs │Design │        │
│ └───────┴──────┴───────┘        │
│                                  │
│ ─── Latest Updates ────────────  │
│ [📷] Kitchen framing — Mar 28   │
│ [📷] Demo complete — Mar 15     │
│ [📋] Weekly update — Mar 28     │
│                                  │
│ ─── My Uploads ────────────────  │
│ [📷] "Paint color ref" — Mar 25 │
│                                  │
│ [+ Add Photo/Note]               │
│                                  │
│ [📖 View Project Story]          │
└──────────────────────────────────┘
```

**Sub (after PIN):**
```
┌──────────────────────────────────┐
│ [BB Logo]  DAE Plumbing          │
├──────────────────────────────────┤
│                                  │
│ ─── Active Projects (2) ──────  │
│ Smith Residence                  │
│   12 docs · Last: Mar 29        │
│ Johnson Kitchen                  │
│   6 docs · Last: Mar 28         │
│                                  │
│ ─── My Compliance ─────── ⚠️1  │
│ ✅ Insurance COI (exp 2027-01)   │
│ ✅ W-9 (on file)                 │
│ ⚠️ License (exp 2026-04-30)     │
│ ✅ Bond ($25k on file)           │
│ [Update Documents]               │
│                                  │
│ ─── Quick Actions ────────────  │
│ [📋 Submit Daily Report]         │
│ [📷 Add Progress Photo]          │
│ [📄 Upload Document]             │
│                                  │
│ [My Profile]                     │
└──────────────────────────────────┘
```

### Crew Home Screen (Map-Centric Command Center)

The crew home screen replaces the current calendar-first view with a **dark-themed map
command center** — the same Google Maps dark theme already used in JobsitesView.
The map loads immediately (even before PIN entry) and becomes the always-on home base.

**Design principles:**
- Map is the anchor — spatial awareness at a glance
- FAB stays for primary actions (Receipts, Tools, Hours) — safe, intentional, no accidental taps
- Bottom action bar surfaces drawer items that crew uses daily (JobSites, MyReceipts, PayPeriod)
- Cards below map are scrollable, context-aware, minimal
- Crew can configure which cards/features show via Profile → Home Screen Settings

```
┌──────────────────────────────────────┐
│ ● Live   Chad Thompson     7:02 AM  │  ← Status: GPS dot, name, clock
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │                                │  │
│  │   [Dark map — DARK_MAP_STYLES] │  │  ← Same theme as JobsitesView
│  │                                │  │
│  │  🏪 Ace                        │  │  ← Orange pin: favorite store
│  │  0.8mi                         │  │     (from cal_stores, prioritized)
│  │                                │  │
│  │     ○ ○ ○                      │  │  ← Yellow (#FACC15) rings
│  │    ○  🔴 ○  Smith Res.        │  │     around today's jobsite
│  │     ○ ○ ○   0.3mi             │  │     (same proximity rings code)
│  │                                │  │
│  │            📍                   │  │  ← Blue pulsing dot (you)
│  │                                │  │
│  │  🏪 HD                🟡 Johnson│  │  ← Orange: store, Gold: other site
│  │  1.2mi                 2.1mi   │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │  ← Card 1: Today's Assignment
│  │ 📋 Smith Residence         →  │  │
│  │ Foreman (6:15 AM):             │  │
│  │ "Finish kitchen framing.       │  │
│  │  Plumber arrives 10am."        │  │
│  │                                │  │
│  │ ☀️ 58°F · On site: Mike, John  │  │  ← Weather + who else is here
│  │ [Navigate]  [Site Assets]      │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │  ← Card 2: My Tasks
│  │ My Tasks                 2/5   │  │
│  │ ☑ Pick up 2x10 (HD)          │  │
│  │ ☑ Drop laser at Johnson       │  │
│  │ ☐ Install headers — south     │  │
│  │ ☐ Frame closet rough-in       │  │
│  │ ☐ EOD: photos + cleanup       │  │
│  │ [+ Add Task]                   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │  ← Card 3: Alerts (only if any)
│  │ ⚠️ Alerts                      │  │
│  │ 🔧 Tool audit overdue: Smith  │  │
│  │ 📄 OSHA-10 expires in 30d     │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │  ← Card 4: Quick Stats (optional)
│  │ This Week  32.5/40h  Rcpts: 3 │  │
│  └────────────────────────────────┘  │
│                                      │
├──────────────────────────────────────┤
│                                      │
│  ┌─────┬─────┬─────┬─────┬─────┬───┐  │  ← Bottom bar: icons only, no labels
│  │  ◉  │  ✎  │ 📅  │  ◷  │  ▤  │ ≡ │  │     thin-stroke, gray idle, red active
│  └─────┴─────┴─────┴─────┴─────┴───┘  │  Sites Notes Cal Period Rcpts Menu
│                                      │
│                          [  ✕  FAB]  │  ← FAB stays (right side, safe)
└──────────────────────────────────────┘
```

### Map Layers & Markers

| Marker | Visual | Source | Tooltip (tap) |
|--------|--------|--------|---------------|
| **You** | Blue pulsing dot + accuracy circle | `navigator.geolocation` | "Chad · GPS accuracy: 15m" |
| **Today's jobsite** | BB Red (#C8102E) pin + yellow (#FACC15) concentric rings + name | `cal_asset_events` (today's assignment) or most recent GPS-near property | "Smith Residence · 0.3mi · [Navigate]" |
| **Other assigned sites** | Gold (#D4A017) pin + name + distance | Properties from crew's assignment events | "Johnson Kitchen · 2.1mi · [Navigate]" |
| **Favorite stores** | Orange (#F97316) pin with store icon + chain name + distance | `cal_stores` table (384 geocoded, `is_active=true`) | "Home Depot #1234 · 1.2mi · [Navigate] · [Call]" |
| **Other nearby stores** | Smaller orange dot (no label until zoom) | `cal_stores` beyond top favorites | Expands on zoom |
| **Other crew** (future) | Small teal dots with initials | GPS pings from `cal_gps_points` | "Mike T. · at Smith Res. · last seen 6:58 AM" |

**Store prioritization:**
1. **BB favorites first** — `cal_stores` with `is_active = true` (already geocoded, known vendors)
2. Distance-sorted from crew's current location (reuse Haversine from `receipt-v1.js`)
3. Show top 5-8 on map by default, more visible on zoom
4. Store chains BB cares about: Home Depot, Lowe's, Ace Hardware, Grainger, Harbor Freight
5. Google Places NOT needed — we already have 384 stores in `cal_stores`

**Concentric rings:**
- Reuse exact same `PROXIMITY_RING_STYLES` from JobsitesView
- Yellow (#FACC15), 3 rings, graduated opacity (0.12, 0.07, 0.03)
- Centered on today's primary jobsite (not on crew — crew is the blue dot)

### Bottom Action Bar (Icons Only — No Labels)

Minimalistic design. **All buttons are icons only — zero text labels visible at any time.**
Clean, modern, reduces visual clutter. Title appears ONLY on hover (desktop/iPad with cursor)
or long-press (mobile). Short tap executes the action immediately with no title flash.

This applies to:
- **Bottom action bar** — icons only, titles on hover/long-press
- **FAB radial menu** — icons only, titles on hover/long-press
- **Map markers** — icons only, tooltips on tap (with name + distance + action buttons)

```
┌───────┬───────┬───────┬───────┬───────┬─────┐
│   ◉   │   ✎   │  📅   │   ◷   │   ▤   │  ≡  │
└───────┴───────┴───────┴───────┴───────┴─────┘
 Sites   Notes   Cal    Period  Rcpts   Menu    ← tooltips (not visible)
```

| Slot | Icon | Tooltip | Action |
|------|------|---------|--------|
| 1 | ◉ (map pin) | Sites | Opens JobsitesView |
| 2 | ✎ (pencil) | Notes | Opens My Notes |
| 3 | 📅 (calendar) | Calendar | Opens MonthView (hours bars, date tap, entry mode) |
| 4 | ◷ (clock) | Period | Opens WorkReport / My Hours (pay period summary) |
| 5 | ▤ (receipt) | Receipts | Opens ReceiptHistoryModal |
| 6 | ≡ (hamburger) | Menu | Opens MenuDrawer |

**Icon style:** Thin-stroke outline icons (1.5px stroke, no fill). BB Red (#C8102E) when
active/selected, muted gray (#6B7280) when idle. Subtle scale animation on tap (1.0 → 0.92 → 1.0).
No backgrounds, no badges, no borders between buttons. Just icons floating on the dark bar.

```css
/* Bottom bar styling */
.bottom-bar {
  background: #111111;
  border-top: 1px solid rgba(255,255,255,0.06);
  height: 52px;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  justify-content: space-around;
  align-items: center;
}
.bottom-bar-icon {
  width: 22px;
  height: 22px;
  stroke: #6B7280;
  stroke-width: 1.5;
  fill: none;
  transition: stroke 0.15s, transform 0.1s;
}
.bottom-bar-icon.active {
  stroke: #C8102E;
}
```

**Slots 1-5 are configurable** via Profile → Home Screen Settings.
Slot 6 (Menu) is locked — always the hamburger.

**FAB stays separate** (right side, above bottom bar) for primary *creation* actions:
- PTO entry
- Manual hours entry
- Receipt scan
- Tool scan

The distinction: **bottom bar = navigation** (go to a view), **FAB = creation** (start an action).

### My Notes (New Feature)

Crew daily notes — a lightweight journal for personal observations, site conditions, things
to remember. Not the same as foreman notes (which are top-down assignments) or daily reports
(which are formal, submitted to back-office).

**What My Notes is:**
- Personal scratch pad, private to the crew member
- Quick text + optional photo
- Auto-tagged with date, time, GPS location, nearest property
- Searchable by the crew member later ("what did I note about that plumbing issue?")
- Optionally shareable (crew can "publish" a note → becomes a site_doc asset)

**What My Notes is NOT:**
- Not a formal daily report (that's a separate asset class with weather, crew list, etc.)
- Not a task list (that's the Tasks card)
- Not visible to others unless explicitly shared

```
Tap ✎ icon in bottom bar:

┌──────────────────────────────────┐
│ ← My Notes              [+ New] │
├──────────────────────────────────┤
│                                  │
│ ─── Today, Mar 30 ────────────  │
│                                  │
│ 2:15 PM · Smith Residence        │
│ Noticed crack in foundation      │
│ near garage corner. Took photo.  │
│ [📷 1 photo]                     │
│                                  │
│ 8:30 AM · Smith Residence        │
│ Plumber confirmed: PEX not       │
│ copper for kitchen supply lines. │
│ Need to update plans.            │
│                                  │
│ ─── Yesterday, Mar 29 ────────  │
│                                  │
│ 4:45 PM · Johnson Kitchen        │
│ Client wants subway tile, not    │
│ the mosaic we spec'd. Get sample │
│ from Ace tomorrow.               │
│                                  │
│ (scroll for older...)            │
└──────────────────────────────────┘

Tap [+ New]:

┌──────────────────────────────────┐
│ ← New Note                       │
├──────────────────────────────────┤
│                                  │
│ 📍 Smith Residence (auto)        │
│ 🕐 2:15 PM (auto)                │
│                                  │
│ ┌────────────────────────────┐   │
│ │ Type your note...          │   │
│ │                            │   │
│ │                            │   │
│ │                            │   │
│ └────────────────────────────┘   │
│                                  │
│ [📷 Photo] [🎤 Voice]           │  ← Optional attachments
│                                  │
│ [Save]                           │
│                                  │
│ ☐ Share to site (visible to BB) │  ← Optional: publishes as site_doc
└──────────────────────────────────┘
```

**Voice notes:** Tap 🎤 → record audio → auto-transcribed by Whisper (existing integration)
→ transcription becomes the note text. Quick capture while hands are dirty.

**Storage:**

Notes are lightweight personal assets:
```javascript
// Created as a personal asset (not tied to asset system unless shared):
// Stored in cal_crew_notes (lightweight, like cal_crew_tasks):
{
  id: 1,
  user_id: 'usr_chad',
  property_id: 'prop_789',           // auto-detected from GPS proximity
  property_name: 'Smith Residence',  // denormalized
  text: 'Noticed crack in foundation near garage corner.',
  media: [],                          // optional photo/audio blobs (IndexedDB, sync to Drive)
  gps_lat: 47.6205,
  gps_lng: -122.3212,
  shared: false,                      // if true → also created as site_doc asset
  shared_asset_id: null,              // link to cal_assets if shared
  created_at: '2026-03-30T14:15:00Z'
}
```

```sql
CREATE TABLE cal_crew_notes (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  property_id TEXT,
  property_name TEXT,
  text TEXT NOT NULL,
  has_media BOOLEAN NOT NULL DEFAULT false,
  media_drive_ids JSONB DEFAULT '[]',     -- [{driveFileId, type: 'image'|'audio'}]
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  shared BOOLEAN NOT NULL DEFAULT false,
  shared_asset_id INTEGER,                -- if shared → link to cal_assets
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cal_crew_notes_user ON cal_crew_notes(user_id, created_at DESC);
CREATE INDEX idx_cal_crew_notes_property ON cal_crew_notes(property_id) WHERE property_id IS NOT NULL;
```

**Offline:** Notes saved to IndexedDB immediately (same as tasks). Media queued for Drive upload.
Text notes sync instantly when online (tiny payload). Photos/audio sync in background.

**Share-to-site flow:**
When crew checks "Share to site" → creates a `site_doc` asset in `cal_assets`:
```javascript
{
  asset_class: 'site_doc',
  property_id: 'prop_789',
  created_by_type: 'employee',
  visibility: 'internal',              // shared with BB, not external
  metadata: {
    doc_type: 'observation',
    description: 'Noticed crack in foundation near garage corner.',
    source: 'crew_note',
    original_note_id: 42
  }
}
```
This promotes a personal note into a formal site document visible to the whole team.

### Hours Entry (Existing Flows, Clarified)

| Hours Type | Entry Method | Current Flow | No Change Needed |
|---|---|---|---|
| **Regular** | QBT clock-in/out (external device or app) | Data fetched from `/qbt/timesheets`, displayed in calendar. Read-only in CalExp5 | YES — CalExp5 displays, doesn't create |
| **PTO** | FAB → PTO → Calendar → TimesheetGrid | `setEntryMode('pto')` → select date → select type (Vacation/Sick/Unpaid via PTO_TYPES jobcode IDs 28/29/30) → enter hours → `submitTimeOff()` | YES — existing flow works |
| **Manual** | FAB → Manual Hours → Calendar → DateJobcodePopup → TimesheetGrid | `setEntryMode('work')` → select date → select jobcode → enter hours → `createTimesheet()` | YES — existing flow works |

All three hours types continue to work exactly as they do today. The home screen doesn't change hours entry — it just makes the calendar accessible via the bottom bar "Period" button.

### Home Screen Customization (Via Profile)

Crew can toggle which cards appear on their home screen via My Profile → Home Screen Settings:

```
My Profile → Home Screen Settings:

┌────────────────────────────────────┐
│ Home Screen Settings               │
├────────────────────────────────────┤
│                                    │
│ Map                                │
│ ● Show map on home (always on)    │
│ ☑ Show favorite stores            │
│ ☑ Show other jobsites             │
│ ☐ Show other crew (when available)│
│ Store radius: [5 mi ▾]            │
│                                    │
│ Cards                              │
│ ☑ Today's Assignment              │
│ ☑ My Tasks                        │
│ ☑ Alerts                          │
│ ☐ Quick Stats                     │
│ ☐ Weather (standalone card)       │
│                                    │
│ Bottom Bar (icons only)            │
│ Slot 1: [◉ Sites      ▾]         │
│ Slot 2: [✎ Notes      ▾]         │
│ Slot 3: [📅 Calendar   ▾]        │
│ Slot 4: [◷ Period     ▾]         │
│ Slot 5: [▤ Receipts   ▾]         │
│ Slot 6: [≡ Menu (locked)]        │
│                                    │
│ Available for slots 1-5:           │
│ Sites, Notes, Calendar, Period,    │
│ Receipts, All Receipts, Tool Crib, │
│ GPS Preview, My PTO, My Team      │
│                                    │
└────────────────────────────────────┘
```

**Stored in:** `cal_auth_users.features` JSONB (alongside feature flags) or `cal_assets.metadata.home_config` on the employee human asset.

```json
{
  "home_config": {
    "map": {
      "show_stores": true,
      "show_other_sites": true,
      "show_crew": false,
      "store_radius_miles": 5
    },
    "cards": {
      "assignment": true,
      "tasks": true,
      "alerts": true,
      "stats": false,
      "weather": false
    },
    "bottom_bar": ["jobsites", "notes", "calendar", "period", "receipts", "menu"]
  }
}
```

### Today's Assignment Logic

How does the system know which jobsite is "today's" for a given crew member?

```
Priority cascade:
  1. Foreman note exists for today with crew member in assigned_crew → that property
  2. GPS proximity: crew is within 500m of a property they're assigned to → that property
  3. Most recent assignment event for this crew member → that property
  4. No assignment → "No site assigned today" card with [View All Sites] button
```

### Foreman Notes (New Feature, Uses Asset System)

```javascript
// Foreman posts via app (or night before):
POST /api/assets {
  asset_class: 'daily_report',
  property_id: 'prop_789',
  visibility: 'internal',
  metadata: {
    doc_type: 'foreman_note',
    report_date: '2026-03-31',
    note: 'Finish kitchen framing. Plumber arrives 10am...',
    assigned_crew: ['usr_chad', 'usr_john', 'usr_mike'],
    weather_forecast: '58°F, clear'      // auto-populated from weather API
  }
}

// Crew home screen fetches:
GET /api/assets?class=daily_report&property_id={my_sites}
  &metadata.doc_type=foreman_note
  &metadata.report_date={today}
  &sort=created_at:desc&limit=1
```

No new asset class needed — foreman notes are a `daily_report` with `doc_type: 'foreman_note'`.

### Personal Tasks (Lightweight, Not Asset System)

Tasks are too lightweight for the universal asset system — they're disposable daily scratchpads,
not tracked assets. Separate lightweight table:

```sql
CREATE TABLE cal_crew_tasks (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,                -- cal_auth_users.id
  property_id TEXT,                     -- optional: tied to a site
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  assigned_by TEXT,                     -- null = self, or foreman user_id
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_cal_crew_tasks_user ON cal_crew_tasks(user_id, completed, due_date);
```

**Task sources:**
- **Self-created** — crew member adds from home screen
- **Foreman-assigned** — foreman creates with `assigned_by` set (shows in crew's list)
- **System-generated** — "Tool audit overdue", "OSHA cert expiring" (created by cron jobs)

### Map-to-PIN Transition

The map loads immediately on app open — even before authentication. This makes the app feel
instant. PIN entry overlays the map with a frosted glass effect:

```
App opens → map starts rendering with last known location (cached)
  │
  ├── Valid session (not expired)?
  │   YES → home screen loads, cards slide in from bottom
  │
  └── No valid session?
      PIN overlay slides up over map (map visible behind blur):

      ┌──────────────────────────────────┐
      │                                  │
      │   [blurred dark map visible      │
      │    behind frosted overlay]       │
      │                                  │
      │   ┌──────────────────────────┐   │
      │   │  [BB Logo]               │   │
      │   │                          │   │
      │   │  Good morning, Chad      │   │  ← Knows user from last session
      │   │                          │   │
      │   │  [_ ] [_ ] [_ ] [_ ]    │   │
      │   │  Enter PIN               │   │
      │   │                          │   │
      │   │  [Not Chad? Switch user] │   │
      │   └──────────────────────────┘   │
      │                                  │
      └──────────────────────────────────┘

      PIN entered → overlay slides down → map already loaded → cards slide in
```

### New Files

| File | Purpose |
|------|---------|
| `CalExp5/src/components/home/CrewHomeScreen.jsx` | Map + cards + bottom bar home screen |
| `CalExp5/src/components/home/HomeMap.jsx` | Dark map with crew/site/store markers + rings |
| `CalExp5/src/components/home/AssignmentCard.jsx` | Today's jobsite + foreman note |
| `CalExp5/src/components/home/TasksCard.jsx` | Personal task list with check-off |
| `CalExp5/src/components/home/AlertsCard.jsx` | Contextual alerts (audit overdue, cert expiring) |
| `CalExp5/src/components/home/StatsCard.jsx` | Weekly hours/receipts summary |
| `CalExp5/src/components/home/BottomActionBar.jsx` | 5-slot icon-only navigation bar (configurable slots 1-4) |
| `CalExp5/src/components/home/MyNotes.jsx` | Personal daily notes list + new note composer |
| `CalExp5/src/components/home/NoteComposer.jsx` | New note: text + optional photo/voice + auto GPS/property |
| `CalExp5/src/components/home/HomeSettingsPanel.jsx` | Home screen customization UI |

### New Files (Updated Full List)

| File | Purpose |
|------|---------|
| `CalExp5/src/components/splash/CustomerSplash.jsx` | Customer-class branded splash + PIN entry |
| `CalExp5/src/components/splash/SubSplash.jsx` | Sub-class branded splash + PIN entry |
| `CalExp5/src/components/splash/CrewSplash.jsx` | Employee-class splash + PIN entry (enhanced existing) |
| `CalExp5/src/components/splash/GenericSplash.jsx` | Email lookup fallback (app.BainbridgeBuilders.com) |
| `CalExp5/src/components/splash/SplashRouter.jsx` | Reads portal context → renders correct splash |

### Invite Flow

```
Sam invites a new customer:
  │
  Admin panel → "Invite Customer"
  │
  Name: Erik & Jill Eklund
  Email: erik@eklund.com
  Property: Smith Residence
  Portal slug: eklund  (auto-suggested, editable)
  │
  [Send Invite]
  │
  System:
  1. Creates customer human asset in cal_assets
  2. Sets metadata.portal_slug = 'eklund', portal_enabled = true
  3. Creates cal_auth_users record (status: 'invited', magic_token generated)
  4. Grants property access (event on human asset)
  5. Sends email:
  │
  ┌──────────────────────────────────────────────┐
  │ From: Bainbridge Builders                     │
  │ To: erik@eklund.com                           │
  │ Subject: Your Project Portal is Ready         │
  │                                               │
  │ Hi Erik,                                      │
  │                                               │
  │ Your project portal is live at:               │
  │ 🔗 Eklund.BainbridgeBuilders.com              │
  │                                               │
  │ Click below to set up your access:            │
  │ [Set Up My Portal →]                          │
  │                                               │
  │ You'll be able to view progress photos,       │
  │ project documents, and design files.           │
  │                                               │
  │ — Sam, Bainbridge Builders                    │
  └──────────────────────────────────────────────┘
  │
  Erik clicks link → sets PIN → lands on their portal
```

### Deactivation

```
Project completes → Sam marks customer as 'completed':
  │
  Option A: Set portal_enabled = false
    → URL shows: "This project has been completed. Contact BB for archives."
    → Data is preserved, just not accessible via portal
  │
  Option B: Keep portal active indefinitely
    → Customer can still view their storybook + archives
    → Zero cost to BB (no per-portal infrastructure)
    → Good for referrals — customer shows friends their project story
```

### Reserved Subdomains

| Subdomain | Purpose | Type |
|-----------|---------|------|
| `crew` | Employee CalExp5 app | Reserved |
| `admin` | Admin dashboard | Reserved |
| `app` | Generic login (no vanity) | Reserved |
| `api` | API endpoints (if needed) | Reserved |
| `www` | Marketing website (if needed) | Reserved |
| `mail` | Email (if needed) | Reserved |

### Schema Addition

Add to `cal_auth_users`:

```sql
ALTER TABLE cal_auth_users ADD COLUMN portal_slug TEXT;
-- portal_slug stored on cal_assets.metadata, but also on auth for fast middleware lookup
```

### New Files

| File | Purpose |
|------|---------|
| `BB_Micro_Bridge/src/middleware/portal-router.js` | Subdomain → stakeholder lookup + request scoping |
| `CalExp5/src/components/views/PortalLogin.jsx` | Branded login screen (shows stakeholder name + BB logo) |
| `CalExp5/src/components/views/CustomerPortal.jsx` | Customer-scoped Assets view |
| `CalExp5/src/components/views/SubPortal.jsx` | Sub-scoped view (projects + profile + compliance) |

### Modified Files

| File | Change |
|------|--------|
| `BB_Micro_Bridge/src/index-v2.js` | Register portal-router middleware before all routes |
| `CalExp5/src/App.jsx` | Detect portal context → render portal view instead of employee view |

---

## Tiered Offline Cache Strategy

Different resources have different caching priorities. The device has a ~50-100MB budget.

### Cache Tiers

```
┌──────────────────────────────────────────────────────────────────┐
│ TIER A: Always Cached (every device, ~12MB)                       │
│                                                                   │
│ Tool catalog metadata (JSON)          200 tools × 500B  = ~100KB │
│ Tool primary thumbnails (JPEG)        200 tools × 50KB  = ~10MB  │
│ Site assignments (JSON)               ~500 assignments   = ~50KB  │
│ Pending deposits queue                varies              = ~1MB  │
│                                                                   │
│ Synced: delta every 15 minutes when online                        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ TIER B: My Sites Cached (per crew member, ~30-80MB)              │
│                                                                   │
│ Operating manuals for tools at MY assigned sites                 │
│   ~30 tools/site × 3 active sites × 2MB/manual = ~180MB max     │
│   Budget cap: 80MB — cache most recent/important first           │
│                                                                   │
│ Strategy:                                                        │
│   - When tool is assigned to crew's site → download manual       │
│   - When tool leaves crew's site → evict manual from cache       │
│   - LRU eviction when budget exceeded                            │
│   - Manual stays cached while tool is at any of crew's sites     │
│                                                                   │
│ Synced: on assignment change or manual first-access              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ TIER C: On-Demand (fetched when opened, not pre-cached)          │
│                                                                   │
│ Manuals for tools at OTHER sites                                 │
│ Spec sheets, maintenance guides                                  │
│ Design assets (CAD, LIDAR, blueprints)                           │
│ Progress photos, daily report media                              │
│ Wrapper PDFs (tool audit trail — back-office artifact)           │
│ Sidecar JSON manifests (other class audit trails)                │
│                                                                   │
│ Cached in browser HTTP cache after first access                  │
│ Not in IndexedDB — too large, too rarely accessed                │
└──────────────────────────────────────────────────────────────────┘

NOTE: Audit trail artifacts (wrapper PDFs, sidecar manifests) are NOT cached on crew
devices. They serve compliance/insurance/disaster-recovery purposes — back-office only.
Crew on-site needs thumbnails (Tier A) and operating manuals (Tier B), not audit history.
Wrapper PDFs and manifests are fetched on-demand from Drive when viewed in detail screens.
```

### Cache Budget Management

```javascript
// In tool-crib.js:
const CACHE_BUDGET = {
  tierA: 15 * 1024 * 1024,     // 15MB — metadata + thumbnails (always)
  tierB: 80 * 1024 * 1024,     // 80MB — operating manuals (my sites)
  total: 100 * 1024 * 1024,    // 100MB total budget
};

// On tool assignment to crew's site:
async function onToolAssignedToMySite(toolId) {
  const tool = await getToolFromCatalog(toolId);
  const manual = tool.children?.find(c => c.metadata?.url_type === 'manual');

  if (manual && manual.size_bytes) {
    const currentUsage = await getCacheUsage('tierB');
    if (currentUsage + manual.size_bytes <= CACHE_BUDGET.tierB) {
      await cacheManualToIndexedDB(toolId, manual);
    } else {
      // LRU evict oldest manual, then cache new one
      await evictOldestManual();
      await cacheManualToIndexedDB(toolId, manual);
    }
  }
}

// On tool leaving crew's site:
async function onToolLeftMySite(toolId) {
  // Only evict if tool isn't at ANY of crew's other sites
  const stillAtMySites = await isToolAtAnyOfMySites(toolId);
  if (!stillAtMySites) {
    await evictManualFromCache(toolId);
  }
}
```

---

## Data Architecture

### Core Principle: One Table, Many Classes

Instead of `cal_tools`, `cal_tool_assignments`, `cal_daily_reports`, etc., we use:

```
cal_assets (universal — one row per asset)
  ├── cal_asset_media (one row per file/photo/clip/URL)
  ├── cal_asset_events (lifecycle events: status changes, assignments, audits)
  └── cal_assets (children — self-referencing via parent_asset_id)
```

Class-specific fields live in `metadata` (JSONB). Class-specific behavior lives in code
(AI processors, UI components, validation rules).

### Neon Schema

```sql
-- =====================================================
-- UNIVERSAL ASSET TABLE
-- One row per asset (tool, report, photo, design file)
-- =====================================================
CREATE TABLE cal_assets (
  id SERIAL PRIMARY KEY,

  -- Classification
  asset_class TEXT NOT NULL,                   -- 'tool', 'daily_report', 'progress', 'design', etc.
  status TEXT NOT NULL,                        -- lifecycle status (from class registry, e.g., 'cataloged', 'deployed')

  -- Hierarchy (nested assets)
  parent_asset_id INTEGER REFERENCES cal_assets(id),  -- NULL = top-level asset
  -- Examples: tool → manual (child), plan set → individual sheet (child)

  -- Anchor: JobSite
  property_id TEXT,                             -- NULL = shop/unassigned
  property_name TEXT,                           -- denormalized for fast display

  -- Provenance
  created_by TEXT NOT NULL,                    -- employee_id or external user id
  created_by_name TEXT NOT NULL,               -- denormalized name
  created_by_type TEXT NOT NULL DEFAULT 'employee',  -- 'employee' | 'customer' | 'sub'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Visibility (external access control)
  visibility TEXT NOT NULL DEFAULT 'internal', -- 'internal' | 'published' | 'shared'
  -- internal:  BB employees only (default)
  -- published: visible to all customers/subs with property access
  -- shared:    visible to specific users named in cal_property_access

  -- Location at creation
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  gps_accuracy DOUBLE PRECISION,

  -- Class-specific data (flexible JSONB)
  metadata JSONB NOT NULL DEFAULT '{}',
  -- Tool example:    {"brand":"Milwaukee","model":"2781-20","name":"Circular Saw",
  --                   "category":"power_tool","fingerprint":"Red cordless...",
  --                   "pool_size":1,"serial_number":"SN123"}
  -- Report example:  {"report_date":"2026-03-29","weather":"sunny",
  --                   "crew_present":["Mike","John"],"work_performed":"Framing complete"}
  -- Design example:  {"file_type":"dwg","version":"Rev C","discipline":"structural",
  --                   "sheet_number":"S-101","software":"AutoCAD 2026"}

  -- AI analysis results (populated by class-specific AI processor)
  ai_analysis JSONB,
  -- Tool: {"brand":"Milwaukee","model":"2781-20","confidence":0.95}
  -- Report: {"summary":"Framing completed on north wall...","sentiment":"positive"}
  -- Progress: {"description":"Drywall installed in master bedroom","changes_from_prior":"..."}

  -- Tags (user-defined, cross-class searchable)
  tags TEXT[] DEFAULT '{}',
  -- Examples: ['phase-1', 'framing', 'issue', 'client-visible', 'before']

  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT
);

-- Primary query patterns
CREATE INDEX idx_cal_assets_class ON cal_assets(asset_class);
CREATE INDEX idx_cal_assets_property ON cal_assets(property_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cal_assets_class_property ON cal_assets(asset_class, property_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cal_assets_created ON cal_assets(created_at DESC);
CREATE INDEX idx_cal_assets_status ON cal_assets(status);
CREATE INDEX idx_cal_assets_tags ON cal_assets USING GIN(tags);
CREATE INDEX idx_cal_assets_metadata ON cal_assets USING GIN(metadata jsonb_path_ops);
CREATE INDEX idx_cal_assets_parent ON cal_assets(parent_asset_id) WHERE parent_asset_id IS NOT NULL;
CREATE INDEX idx_cal_assets_visibility ON cal_assets(visibility, property_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cal_assets_created_by_type ON cal_assets(created_by_type) WHERE created_by_type != 'employee';


-- =====================================================
-- ASSET MEDIA TABLE
-- One row per file (photo, audio clip, video, document)
-- An asset can have multiple media (e.g., tool = 3 angle photos)
-- =====================================================
CREATE TABLE cal_asset_media (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES cal_assets(id) ON DELETE CASCADE,

  -- File identity
  media_type TEXT NOT NULL,                    -- 'image', 'audio', 'video', 'document', 'binary', 'url'
  mime_type TEXT NOT NULL,                      -- 'image/jpeg', 'audio/webm', 'video/mp4', 'url/reference', etc.
  file_name TEXT,                               -- original filename if applicable
  size_bytes INTEGER,

  -- Storage (Google Drive)
  drive_file_id TEXT,                          -- primary file
  drive_folder_id TEXT,                        -- which Drive folder
  thumb_drive_file_id TEXT,                    -- thumbnail/preview (images, video keyframe)

  -- Media-specific metadata
  metadata JSONB DEFAULT '{}',
  -- Image: {"width":1920,"height":2560,"angle":"front","exif_gps":{...}}
  -- Audio: {"duration_seconds":45,"sample_rate":44100,"transcription":"..."}
  -- Video: {"duration_seconds":120,"resolution":"1080p","keyframe_at":5}
  -- Document: {"page_count":3,"has_text":true}
  -- Binary: {"software":"AutoCAD","format_version":"2026"}
  -- URL: {"url":"https://...","url_type":"manual","verified_at":"...","description":"..."}

  -- AI analysis of this specific media item
  ai_analysis JSONB,
  -- Image: {"objects_detected":["circular saw","workbench"],"text_found":["Milwaukee"]}
  -- Audio: {"transcription":"We finished the framing today...","language":"en"}

  -- Ordering within asset
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,   -- primary display thumbnail

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ                      -- when actually uploaded to Drive (null if pending)
);

CREATE INDEX idx_cal_asset_media_asset ON cal_asset_media(asset_id);
CREATE INDEX idx_cal_asset_media_type ON cal_asset_media(media_type);
CREATE INDEX idx_cal_asset_media_drive ON cal_asset_media(drive_file_id) WHERE drive_file_id IS NOT NULL;


-- =====================================================
-- ASSET EVENTS TABLE
-- Lifecycle events: assignment, transfer, audit, status change
-- Replaces class-specific tables (tool_assignments, tool_audits)
-- =====================================================
CREATE TABLE cal_asset_events (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES cal_assets(id) ON DELETE CASCADE,

  -- Event classification
  event_type TEXT NOT NULL,
  -- Universal: 'created', 'updated', 'deleted', 'status_changed',
  --            'assigned', 'transferred', 'returned', 'tagged'
  -- Tool-specific: 'audit_found', 'audit_missing', 'audit_stolen',
  --               'audit_broken', 'audit_lent'
  -- Report-specific: 'submitted', 'reviewed'
  -- Progress-specific: 'tagged_milestone', 'published_to_client'

  -- Context
  property_id TEXT,                            -- which jobsite (for assign/transfer/audit)
  performed_by TEXT NOT NULL,                  -- employee_id
  performed_by_name TEXT,                      -- denormalized
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Event-specific data
  details JSONB DEFAULT '{}',
  -- assigned:     {"from_property_id":null,"to_property_id":"prop_789","quantity":1}
  -- transferred:  {"from_property_id":"prop_789","to_property_id":"prop_456"}
  -- audit_found:  {"audit_id":42,"confidence":0.95,"match_method":"ai_scan",
  --               "evidence_media_id":101}
  -- audit_missing:{"audit_id":42,"status":"stolen","notes":"Not seen in 2 weeks"}
  -- status_changed:{"from":"active","to":"retired","reason":"Blade worn out"}

  -- GPS at time of event
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  gps_accuracy DOUBLE PRECISION
);

CREATE INDEX idx_cal_asset_events_asset ON cal_asset_events(asset_id);
CREATE INDEX idx_cal_asset_events_type ON cal_asset_events(event_type);
CREATE INDEX idx_cal_asset_events_property ON cal_asset_events(property_id);
CREATE INDEX idx_cal_asset_events_date ON cal_asset_events(performed_at DESC);
CREATE INDEX idx_cal_asset_events_audit ON cal_asset_events(event_type, property_id)
  WHERE event_type LIKE 'audit_%';


-- =====================================================
-- AUDIT SESSIONS (universal — any auditable asset class)
-- Groups audit events into a single session
-- Examples: tool inventory audit, design doc completeness audit,
--           receipt reconciliation, permit status check
-- =====================================================
CREATE TABLE cal_asset_audit_sessions (
  id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL,
  asset_class TEXT NOT NULL,                   -- 'tool', 'progress', 'design', 'permit', etc.
  audited_by TEXT NOT NULL,
  audited_by_name TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  gps_accuracy DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | complete | abandoned
  summary JSONB,                               -- {total, found, missing, stolen, broken, lent}
  is_offline BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ
);

CREATE INDEX idx_cal_audit_sessions_property ON cal_asset_audit_sessions(property_id);
CREATE INDEX idx_cal_audit_sessions_date ON cal_asset_audit_sessions(started_at DESC);


-- =====================================================
-- RECEIPT ADAPTER VIEW
-- Makes existing cal_receipts appear as assets in the Assets tab
-- No migration needed — receipts stay in their table
-- IMPORTANT: Only POSTED receipts are confirmed assets.
-- Filed/pending receipts are still in validation.
-- =====================================================
CREATE VIEW cal_assets_receipts_view AS
  SELECT
    -- Synthetic asset ID (negative to avoid collision with cal_assets.id)
    -(r.id) AS id,
    'receipt' AS asset_class,
    r.status,                                  -- 'filed' or 'posted'
    NULL::integer AS parent_asset_id,          -- receipts don't nest (yet)
    -- Receipt doesn't have property_id directly — use nearest_jobsite_id
    r.nearest_jobsite_id AS property_id,
    r.jobcode_name AS property_name,
    r.employee_id AS created_by,
    r.crew_name AS created_by_name,
    r.created_at,
    r.created_at AS updated_at,
    r.scan_lat AS gps_lat,
    r.scan_lng AS gps_lng,
    r.scan_accuracy AS gps_accuracy,
    jsonb_build_object(
      'vendor', r.vendor,
      'amount', r.amount,
      'receipt_date', r.receipt_date,
      'jobcode_id', r.jobcode_id,
      'jobcode_name', r.jobcode_name,
      'invoice_no', r.invoice_no,
      'document_type', r.document_type,
      'is_receipt', r.is_receipt,
      'payment_method', r.payment_method,
      'cc4', r.cc4
    ) AS metadata,
    NULL::jsonb AS ai_analysis,
    ARRAY[]::text[] AS tags,
    NULL::timestamptz AS deleted_at,
    NULL::text AS deleted_by
  FROM cal_receipts r
  WHERE r.status = 'posted';
  -- Default: posted only (validated assets)
  -- Back-office can query cal_receipts directly for filed/pending


-- =====================================================
-- TOOL LOCATION VIEW
-- "Where is tool X?" — derived from latest events
-- =====================================================
CREATE VIEW cal_tool_last_seen AS
  SELECT DISTINCT ON (a.id)
    a.id AS asset_id,
    a.metadata->>'name' AS tool_name,
    a.metadata->>'brand' AS tool_brand,
    a.metadata->>'model' AS tool_model,
    a.status AS tool_status,
    a.property_id AS assigned_property_id,
    a.property_name AS assigned_property_name,
    COALESCE(
      (a.metadata->>'pool_size')::int, 1
    ) AS pool_size,
    e.event_type AS last_event,
    e.property_id AS last_seen_property_id,
    e.performed_at AS last_seen_at,
    e.performed_by_name AS last_seen_by,
    e.details AS last_event_details
  FROM cal_assets a
  LEFT JOIN cal_asset_events e ON e.asset_id = a.id
  WHERE a.asset_class = 'tool'
    AND a.deleted_at IS NULL
    AND a.status = 'active'
  ORDER BY a.id, e.performed_at DESC NULLS LAST;


-- =====================================================
-- CORRECTIONS TABLE (universal — for improving AI across all classes)
-- =====================================================
CREATE TABLE cal_asset_corrections (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER REFERENCES cal_assets(id),
  asset_class TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  field TEXT NOT NULL,                         -- 'brand', 'model', 'vendor', 'amount', etc.
  ai_value TEXT,
  user_value TEXT,
  ai_confidence DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cal_asset_corrections_class ON cal_asset_corrections(asset_class);
```

---

## Storage Architecture

### Write-Optimized Design (Deposit-Heavy)

The core insight: field users deposit assets frequently, back-office retrieves them occasionally.
This means we optimize for **fast writes** and accept **lazy reads**.

```
DEPOSIT FLOW (fast, on-site):
─────────────────────────────

Phone captures media (photo/audio/video)
  │
  ├── ONLINE: Upload immediately
  │     │
  │     POST /api/assets  (metadata + media as multipart)
  │     │
  │     ├── Insert cal_assets row (instant — metadata only)
  │     ├── Insert cal_asset_media row (instant — metadata only)
  │     ├── Queue Drive upload (background, non-blocking)
  │     │     └── Upload completes → update drive_file_id + uploaded_at
  │     └── Queue AI processing (background, non-blocking)
  │           └── Claude analysis → update ai_analysis column
  │
  │     Response to phone: 200 OK (within 500ms)
  │     User doesn't wait for Drive or AI
  │
  └── OFFLINE: Queue locally
        │
        Save to IndexedDB (asset_deposits queue)
        │
        On reconnect → POST /api/assets/bulk-deposit
        │
        Same background processing as above


RETRIEVAL FLOW (lazy, back-office):
────────────────────────────────────

Back-office opens JobSite → Assets tab
  │
  GET /api/assets?property_id=X&class=tool (metadata only, fast)
  │
  Thumbnails load lazily (LRU cache → Drive on miss)
  │
  User clicks specific asset → full detail + media loads on demand
  │
  Large files (video, CAD, LIDAR) → Drive direct download link
  │
  No full media preloading — only thumbnails cached
```

### Google Drive Folder Structure

```
BB_Assets/
├── tools/
│   ├── catalog/
│   │   ├── {asset_id}_front.jpg
│   │   ├── {asset_id}_side.jpg
│   │   └── {asset_id}_back.jpg
│   └── audits/
│       └── {YYYY-MM}/
│           └── {property}_{date}_{asset_id}_evidence.jpg
│
├── daily_reports/
│   └── {YYYY-MM}/
│       └── {property}_{date}/
│           ├── report_text.txt
│           ├── audio_001.webm
│           ├── video_001.mp4
│           └── photo_001.jpg
│
├── progress/
│   └── {property}/
│       ├── {milestone}_{date}_001.jpg
│       ├── {milestone}_{date}_002.jpg
│       └── {milestone}_{date}_video.mp4
│
├── site_docs/
│   └── {property}/
│       └── {YYYY-MM}/
│           └── {doc_type}_{date}_{description}.{ext}
│
├── design/
│   └── {property}/
│       ├── plans/
│       │   ├── S-101_Rev_C.dwg
│       │   └── S-101_Rev_C.pdf
│       ├── lidar/
│       │   └── site_scan_20260315.las
│       └── models/
│           └── framing_model.skp
│
└── receipts/                      ← existing BB_Receipts_Pending (unchanged)
    └── (managed by receipt pipeline)
```

### Media Size Budgets

| Media Type | Typical Size | Processing | Storage |
|------------|-------------|------------|---------|
| Tool photo (catalog) | 150KB (512px JPEG) | Resize + sharpen on upload | Drive catalog/ |
| Tool audit evidence | 100KB (512px JPEG) | Resize on upload | Drive audits/ |
| Receipt photo | 200KB (processed JPEG) | Existing pipeline | Drive receipts/ |
| Daily report audio | 500KB-2MB (30s-2min WebM) | Transcribe via Claude/Whisper | Drive daily_reports/ |
| Daily report video | 5-15MB (30s-60s MP4) | Keyframe extract for thumbnail | Drive daily_reports/ |
| Progress photo | 500KB-2MB (full res JPEG) | Thumbnail for list view | Drive progress/ |
| Progress video | 10-50MB (1-5 min) | Keyframe thumbnail | Drive progress/ |
| Design CAD | 1-50MB (DWG) | None (binary pass-through) | Drive design/ |
| Design LIDAR | 50-500MB (LAS) | None (binary pass-through) | Drive design/ |
| Design blueprint PDF | 1-10MB | Thumbnail of first page | Drive design/ |

**Monthly storage estimate (active project):**
- 10 sites × 30 tool audit photos × 100KB = ~30MB
- 10 sites × 20 daily report days × 5 media × 1MB = ~1GB
- 10 sites × 10 progress photos × 1MB = ~100MB
- Design files: varies widely, ~500MB typical per project
- **Total: ~2GB/month** — well within Google Drive limits

---

## Audit Trail Architecture (Drive as Source of Truth)

The receipt pipeline uses an elegant pattern: the PDF *is* the audit trail. All metadata is
embedded in PDF properties (Title, Author, Keywords, Creator). If the database disappears,
the inventory can be reconstructed from Drive alone. We extend this pattern to all asset classes
using a hybrid approach.

### The Problem

| Asset Type | Self-Describing File? | Can Embed Metadata? |
|------------|----------------------|---------------------|
| Receipt (PDF) | YES | YES — PDF properties carry everything |
| Tool photo (JPEG) | Partial — EXIF has GPS/date | NO — can't carry "this is a Milwaukee saw" |
| Audio clip (WebM) | NO | NO — binary blob |
| Video clip (MP4) | Partial — MP4 atoms | Limited, fragile, non-standard |
| CAD file (DWG) | NO | NO — proprietary binary |
| URL reference | N/A | N/A — it's a pointer |

### Hybrid Strategy (Option C)

High-value, long-lived assets get **wrapper PDFs** (same audit rigor as receipts).
Everything else gets **sidecar JSON manifests** (lightweight, complete, reconstructable).

| Asset Class | Audit Trail | Why |
|-------------|-------------|-----|
| **Tools** | **Wrapper PDF** | High-value ($50-$900), long lifecycle, audited weekly, same rigor as receipts |
| **Receipts** | **PDF** (existing) | Already works perfectly — unchanged |
| **Daily Reports** | **Sidecar JSON** | Write-once, rarely updated, lighter than PDF |
| **Progress Photos** | **Sidecar JSON** | Capture once, tag, done |
| **Site Docs** | **Sidecar JSON** | Mixed media, hard to wrap in single PDF |
| **Design Assets** | **Sidecar JSON** | Binary files can't embed metadata |
| **Permits** | **Wrapper PDF** (future) | Legal documents — may need PDF audit trail |

### Sidecar JSON Manifest (For Most Asset Classes)

For every asset uploaded to Drive, a `.manifest.json` file is stored alongside:

```
BB_Assets/daily_reports/2026-03/smith_20260330/
├── report_text.txt
├── audio_001.webm
├── photo_001.jpg
└── manifest.json                    ← full asset record
```

**Manifest content** — complete enough to reconstruct the asset without the database:

```json
{
  "_bb_version": "1.0",
  "_generated_at": "2026-03-30T15:30:00Z",
  "asset_id": 55,
  "asset_class": "daily_report",
  "status": "submitted",
  "property_id": "prop_789",
  "property_name": "Smith Residence",
  "created_by": "emp_123",
  "created_by_name": "Mike",
  "created_at": "2026-03-30T14:30:00Z",
  "gps_lat": 47.6205,
  "gps_lng": -122.3212,
  "metadata": {
    "report_date": "2026-03-30",
    "weather": "sunny",
    "crew_present": ["Mike", "John"],
    "work_performed": "Framing north wall complete"
  },
  "media": [
    { "file": "report_text.txt", "type": "text", "size_bytes": 450 },
    { "file": "audio_001.webm", "type": "audio", "size_bytes": 820000,
      "duration_seconds": 45 },
    { "file": "photo_001.jpg", "type": "image", "size_bytes": 150000,
      "width": 1920, "height": 2560 }
  ],
  "events": [
    { "type": "created", "at": "2026-03-30T14:30:00Z", "by": "Mike" },
    { "type": "status_changed", "at": "2026-03-30T15:00:00Z",
      "by": "Mike", "from": "draft", "to": "submitted" }
  ],
  "tags": ["phase-1", "framing"],
  "ai_analysis": {
    "summary": "Framing completed on north wall..."
  }
}
```

**When manifests are written/updated:**
- On asset creation (initial manifest)
- On status change (manifest regenerated)
- On media added (manifest updated)
- On audit event (manifest updated)

**Manifest is append-aware:** Events array grows over time. Full manifest is rewritten on
each update (not appended) to keep it valid JSON, but the events array preserves full history.

### Tool Wrapper PDF (Same Pattern as Receipts)

Tools get a proper PDF — generated on creation, regenerated on lifecycle changes.
The PDF contains the primary photo + all metadata in searchable PDF properties.

> **Full tool PDF details:** See `TOOL_TRACKER_SPEC.md` §Tool Wrapper PDF

**PDF visual layout:**

```
┌─────────────────────────────────┐
│ BAINBRIDGE BUILDERS INC.        │
│ Tool Inventory Record           │
├─────────────────────────────────┤
│                                 │
│ Milwaukee M18 FUEL              │
│ 7-1/4" Circular Saw             │
│ Model: 2781-20                  │
│ Serial: SN-2024-1234            │
│                                 │
│ ┌───────────────────────────┐   │
│ │                           │   │
│ │  [professional product    │   │
│ │   photo or catalog photo] │   │
│ │                           │   │
│ └───────────────────────────┘   │
│                                 │
│ Status:    Deployed             │
│ Location:  Smith Residence      │
│ Purchased: 2026-03-30 · $299   │
│ Vendor:    Home Depot           │
│ Cataloged: Mike (emp_123)       │
│ Last Audit: 2026-04-05 ✓       │
│                                 │
│ Lifecycle:                      │
│  Mar 30 · Purchased (HD $299)  │
│  Mar 30 · Cataloged by Mike    │
│  Mar 30 · Assigned to Smith    │
│  Apr 01 · Deployed             │
│  Apr 05 · Audit found (John)   │
│                                 │
│ Resources:                      │
│  📄 Operating Manual (attached) │
│  🔗 milwaukeetool.com/2781-20  │
│                                 │
└─────────────────────────────────┘
```

**PDF metadata (same pattern as `receipt-pdf.js`):**

```javascript
{
  title: 'Tool - Milwaukee M18 FUEL Circular Saw',
  author: 'Mike (emp_123) | Bainbridge Builders Inc.',
  subject: 'Milwaukee 2781-20 | Deployed @ Smith Residence | $299',
  creator: 'BB Tool Tracker v1.0 | ' + JSON.stringify({
    asset_id: 42,
    lifecycle: [
      { event: 'purchased', date: '2026-03-30', vendor: 'Home Depot', price: 299 },
      { event: 'cataloged', date: '2026-03-30', by: 'emp_123' },
      { event: 'assigned', date: '2026-03-30', to: 'Smith Residence' },
      { event: 'audit_found', date: '2026-04-05', by: 'emp_456' }
    ]
  }),
  keywords: [
    'tool', 'Milwaukee', '2781-20', 'circular saw', 'power_tool',
    'Smith Residence', 'deployed', 'Mike', 'emp_123', '$299',
    'Home Depot', 'SN-2024-1234'
  ].join(', '),
  creationDate: new Date('2026-03-30'),      // purchase date
  modificationDate: new Date('2026-04-05')   // last lifecycle event
}
```

**Drive file description (searchable):**

```
BBInc Tool | Milwaukee M18 FUEL 7-1/4" Circular Saw | Model: 2781-20 |
Serial: SN-2024-1234 | Status: Deployed | Site: Smith Residence |
Purchased: 3/30/26 $299 Home Depot | Cataloged: Mike (emp_123) |
Last Audit: 4/5/26 Found
```

**When tool PDF is regenerated:**
- On creation (initial PDF)
- On status change (cataloged → assigned → deployed → retired, etc.)
- On transfer (new site in PDF)
- After audit (last audit date updated)
- On major metadata change (serial number added, notes updated)

NOT regenerated for every audit check — only when status/location actually changes.
The events array in Creator field accumulates full history.

### Drive Folder Structure (Updated)

```
BB_Assets/
├── tools/
│   ├── catalog/
│   │   ├── tool_042_Milwaukee_M18_CircSaw.pdf     ← wrapper PDF (audit trail)
│   │   ├── tool_042_front.jpg                      ← catalog photo
│   │   ├── tool_042_side.jpg
│   │   └── tool_042_pro.jpg                        ← enrichment product photo
│   └── audits/
│       └── {YYYY-MM}/
│           └── {property}_{date}_{asset_id}_evidence.jpg
│
├── daily_reports/
│   └── {YYYY-MM}/
│       └── {property}_{date}/
│           ├── report_text.txt
│           ├── audio_001.webm
│           ├── photo_001.jpg
│           └── manifest.json                       ← sidecar JSON (audit trail)
│
├── progress/
│   └── {property}/
│       ├── {milestone}_{date}_001.jpg
│       └── manifest.json                           ← sidecar JSON
│
├── site_docs/
│   └── {property}/
│       └── {YYYY-MM}/
│           ├── {doc_type}_{date}_{description}.{ext}
│           └── manifest.json                       ← sidecar JSON
│
├── design/
│   └── {property}/
│       ├── plans/
│       │   ├── S-101_Rev_C.dwg
│       │   └── S-101_Rev_C.pdf
│       └── manifest.json                           ← sidecar JSON
│
└── receipts/                      ← existing (managed by receipt pipeline)
    └── (PDF is the audit trail — no sidecar needed)
```

### Database Reconstruction (Disaster Recovery)

If the Neon database is lost, the full asset inventory can be reconstructed from Drive:

**For tools:**
1. Scan `BB_Assets/tools/catalog/` for `*.pdf` files
2. Extract PDF metadata (Title, Author, Keywords, Creator)
3. Parse Creator JSON for full lifecycle history
4. Reconstruct `cal_assets` + `cal_asset_events` rows

**For other assets:**
1. Scan `BB_Assets/{class}/` for `manifest.json` files
2. Parse manifest → reconstruct `cal_assets` + `cal_asset_media` + `cal_asset_events`

**For receipts:**
1. Existing: scan `BB_Receipts_*/` for PDF files
2. Extract metadata from PDF properties → reconstruct `cal_receipts`

This is a last-resort recovery path, not a regular operation. But it means **Drive is the
source of truth, database is the fast index.**

### Who Sees What (Device vs Back-Office)

| Data | Crew Phone (on-site) | Back-Office (iPad/desktop) |
|------|---------------------|---------------------------|
| Tool thumbnail | Tier A cache (always) | Tier A cache or Drive |
| Operating manual | Tier B cache (my sites) | Drive on-demand |
| Tool wrapper PDF | NOT cached — fetch from Drive if needed | Drive on-demand |
| Sidecar JSON manifest | NOT cached | Drive on-demand |
| Audit checklist | Tier A cache (metadata + assignments) | API + Drive |
| Full lifecycle history | Online API call (stale cache ok) | Online API call |

**Crew on-site needs:** "What is this tool?" (thumbnail) + "How do I use it?" (manual).
**Back-office needs:** "What's the full history?" (wrapper PDF) + "Can we reconstruct?" (manifests).

The wrapper PDF and sidecar manifests are **compliance/insurance/DR artifacts**, not daily-use
resources. Caching them on crew phones would waste ~40MB of budget that's better spent on
operating manuals.

### Audit Trail Config (Per Class)

Added to `ASSET_CLASS_REGISTRY`:

```javascript
tool: {
  // ... existing fields ...
  auditTrail: {
    type: 'wrapper_pdf',             // wrapper_pdf | sidecar_json
    regenerateOn: ['status_changed', 'transferred', 'audit_found',
                   'audit_missing', 'metadata_updated'],
    pdfTemplate: 'tool-pdf',         // template ID for pdf-lib generation
  },
},

daily_report: {
  // ... existing fields ...
  auditTrail: {
    type: 'sidecar_json',
    regenerateOn: ['status_changed', 'media_added'],
  },
},

progress: {
  auditTrail: {
    type: 'sidecar_json',
    regenerateOn: ['status_changed', 'tagged'],
  },
},

// ... same pattern for all classes
```

---

## Caching Strategy

### Three-Tier Caching

```
┌─────────────────────────────────────────────────────────────────┐
│ TIER 1: LRU In-Memory (BB_Micro_Bridge)                         │
│                                                                  │
│ Purpose: Fast thumbnail serving for API responses                │
│ Scope:   Tool thumbnails + recent asset thumbnails               │
│ TTL:     24h (tools), 4h (other assets)                          │
│ Size:    2000 entries (shared with receipt + street view cache)   │
│ Key:     asset-{id} or asset-media-{media_id}                    │
│                                                                  │
│ Warm: Startup + incremental every 5 minutes                      │
│ Evict: Oldest 10% when full                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ cache miss
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ TIER 2: IndexedDB (CalExp5 on-device)                            │
│                                                                  │
│ Purpose: Offline access for active work                           │
│ Scope:   ONLY cacheable classes (tools for audits)               │
│          NOT daily reports, progress photos, design files         │
│ TTL:     Sync-based (delta sync every 15 min)                    │
│ Size:    ~12MB for 200 tools                                     │
│                                                                  │
│ Also: Deposit queue (pending uploads for all asset classes)       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ authoritative source
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ TIER 3: Google Drive (permanent storage)                         │
│                                                                  │
│ Purpose: Durable storage for all media files                     │
│ Scope:   Everything — photos, audio, video, CAD, LIDAR          │
│ Access:  Direct download links for large files                   │
│          Proxy through Bridge for thumbnails                     │
│                                                                  │
│ Organization: BB_Assets/{class}/{property}/{date}/               │
└─────────────────────────────────────────────────────────────────┘
```

### What Gets Cached on Device (IndexedDB)

| Asset Class | Cached? | Reason |
|-------------|---------|--------|
| Tools (catalog + thumbnails) | YES | Needed for offline audits — crew must see checklist photos |
| Tool site assignments | YES | Needed for offline audit checklists |
| Pending deposits (all classes) | YES | Queue for sync when online |
| Everything else | NO | Deposit-only from field; retrieved in back-office with good connectivity |

---

## API Architecture

### Universal Endpoints

| Method | Path | Purpose | Notes |
|--------|------|---------|-------|
| POST | `/api/assets` | Create asset (any class) | Multipart: metadata + media files + URLs |
| POST | `/api/assets/bulk-deposit` | Sync offline deposits | Array of assets with media blobs |
| GET | `/api/assets` | List assets (filtered) | `?property_id=&class=&status=&since=&tags=&parent_id=` |
| GET | `/api/assets/:id` | Single asset full detail | Includes media, events, children, AI analysis |
| PUT | `/api/assets/:id` | Update asset metadata | Class validation applied |
| DELETE | `/api/assets/:id` | Soft delete | Sets deleted_at (children become orphans) |
| **POST** | **`/api/assets/:id/transition`** | **Lifecycle status change** | **Validates against class transitions** |
| GET | `/api/assets/:id/media` | List media for asset | Sorted by sort_order |
| GET | `/api/assets/:id/media/:mediaId/thumb` | Cached thumbnail | LRU → Drive fallback |
| GET | `/api/assets/:id/media/:mediaId/file` | Full file (proxy or redirect) | Large files → Drive direct link |
| POST | `/api/assets/:id/media` | Add media to existing asset | Multipart upload, URL reference, or file |
| GET | `/api/assets/:id/events` | Event history for asset | Full lifecycle timeline |
| POST | `/api/assets/:id/events` | Record event (assign, transfer, etc.) | Validates event_type for class |
| **GET** | **`/api/assets/:id/children`** | **List child assets** | **Manuals, warranties, repair receipts, etc.** |
| **POST** | **`/api/assets/:id/children`** | **Add child asset** | **Creates asset with parent_asset_id set** |
| GET | `/api/assets/property/:propertyId` | All top-level assets for a jobsite | Grouped by class, sorted by date |
| GET | `/api/assets/property/:propertyId/timeline` | Chronological timeline | All classes interleaved by date |
| GET | `/api/assets/sync?since=` | Delta sync for cacheable assets | Returns changed tools + assignments |
| GET | `/api/assets/search?q=` | Cross-class search | Searches metadata, tags, AI analysis |
| POST | `/api/assets/corrections` | Log AI corrections | Universal across all AI-processed classes |
| **GET** | **`/api/assets/class/:class/lifecycle`** | **Get lifecycle definition** | **Returns valid statuses + transitions for a class** |

### Lifecycle Transition Endpoint

```javascript
// POST /api/assets/:id/transition
// Body: { status: 'deployed', reason: 'Moved to jobsite', notes: 'Truck delivery' }
//
// Validates:
//   1. Asset exists and not deleted
//   2. New status is valid for asset's class
//   3. Transition from current status to new status is allowed
//   4. Creates cal_asset_events record (event_type: 'status_changed')
//   5. Updates cal_assets.status
//
// Returns: { asset_id, old_status, new_status, event_id }
```

### Tool-Specific Endpoints (built on universal foundation)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/assets/tools/scan` | Claude vision identification |
| POST | `/api/assets/tools/audit/start` | Begin audit session (universal audit, class='tool') |
| POST | `/api/assets/tools/audit/check` | Submit match during audit |
| POST | `/api/assets/tools/audit/complete` | Finalize with missing statuses |
| GET | `/api/assets/tools/audit/:auditId` | Audit detail |
| GET | `/api/assets/tools/audit/site/:propertyId` | Audit history for site |
| GET | `/api/assets/tools/dashboard` | Admin overview across all sites |
| POST | `/api/assets/tools/assign` | Assign tools to site (lifecycle: cataloged→assigned, creates event) |
| POST | `/api/assets/tools/transfer` | Move tools between sites (lifecycle: →transferred, creates events) |

### Universal Audit Endpoints (any auditable class)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/assets/audit/start` | Begin audit session (`{property_id, asset_class}`) |
| POST | `/api/assets/audit/:auditId/check` | Check off an asset in audit |
| POST | `/api/assets/audit/:auditId/complete` | Finalize audit with summary |
| GET | `/api/assets/audit/:auditId` | Audit detail with all items |
| GET | `/api/assets/audit/site/:propertyId` | All audit history for a site (all classes) |
| GET | `/api/assets/audit/site/:propertyId?class=tool` | Filtered to specific class |

### Receipt Adapter Endpoint

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/assets/property/:propertyId/receipts` | **Posted** receipts for a jobsite (queries cal_receipts, returns in asset format) |

### Auth & Access Endpoints (Unified)

> `cal_external_users` replaced by `cal_auth_users` + human assets in `cal_assets`.
> `cal_property_access` replaced by `cal_asset_events` (event_type: `'granted_access'`).
> See §Neon Schema — Auth & Access for full schema.

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/auth/invite` | Create human asset + auth record + send magic link | `admin` |
| POST | `/api/auth/magic` | Validate magic link token → set PIN → issue JWT | public |
| POST | `/api/auth/pin` | PIN login (all user types) → issue JWT | public |
| GET | `/api/assets/me` | Get own profile (human asset + children) | any |
| PUT | `/api/assets/me` | Update own contact info, skills | any |
| POST | `/api/assets/me/children` | Add cert/doc to own profile | any |
| GET | `/api/assets/people` | List human assets (filtered by class/role) | manager, admin |
| GET | `/api/assets/people/:id` | View profile + children | manager (team), admin |
| GET | `/api/assets/people/compliance` | Compliance dashboard (expiring, missing) | manager, admin |
| POST | `/api/assets/:id/grant-access` | Grant property access (creates event) | admin, manager |
| POST | `/api/assets/:id/revoke-access` | Revoke property access (creates event) | admin, manager |
| POST | `/api/assets/:id/publish` | Set visibility to `published` | manager, admin |
| POST | `/api/assets/:id/share` | Set visibility to `shared` | manager, admin |
| POST | `/api/assets/:id/unpublish` | Revert visibility to `internal` | manager, admin |

### API Visibility Middleware

Every asset query automatically filters based on the requesting user's type:

```javascript
// Middleware applied to all /api/assets/* GET routes:
function applyVisibilityFilter(req, baseQuery) {
  const { userId, userType, propertyAccess, scopes } = req.auth;

  if (userType === 'employee') {
    // BB employees see everything (existing behavior)
    return baseQuery;
  }

  // External users: filter by property access + visibility + scopes
  return baseQuery
    .where('property_id', 'IN', propertyAccess.map(a => a.property_id))
    .where(qb => {
      qb.where('visibility', 'published')
        .orWhere(qb2 => {
          qb2.where('visibility', 'shared')
            .where('created_by', userId);  // they can always see their own deposits
        });
    })
    .where('asset_class', 'IN', scopes);  // only classes they have access to
}
```

---

## Deposit Flow (Universal)

### Online Deposit (All Classes)

```
Phone: user captures media (camera, mic, file picker, URL, manual text)
  │
  POST /api/assets (multipart/form-data)
  │
  Body:
  {
    asset_class: 'tool',
    property_id: 'prop_789',
    parent_asset_id: null,           // or parent ID for child assets
    metadata: { name: 'Circular Saw', brand: 'Milwaukee', ... },
    tags: ['power-tool', 'cordless'],
    urls: [                           // URL references (no file upload needed)
      { url: 'https://milwaukeetool.com/2781-20', url_type: 'manufacturer_page',
        description: 'Product page' },
      { url: 'https://milwaukeetool.com/manuals/2781-20.pdf', url_type: 'manual',
        description: 'Operating manual' },
    ],
    gps_lat: 47.62, gps_lng: -122.32, gps_accuracy: 15
  }
  + files[]: [photo_front.jpg, photo_side.jpg]  // optional, may be empty for manual entry
  │
  Bridge handler:
  │
  1. Validate asset_class against ASSET_CLASS_REGISTRY
  2. Validate metadata against class required/optional fields
  3. Validate lifecycle: set status = class.lifecycle.initialStatus
  4. INSERT into cal_assets (instant)
  5. For each file:
  │   a. INSERT into cal_asset_media (metadata only, instant)
  │   b. Generate thumbnail if image/video (background)
  │   c. Queue Google Drive upload (background)
  │   d. Queue AI processing if class has aiProcessor (background)
  6. For each URL:
  │   a. INSERT into cal_asset_media (media_type='url', no Drive upload)
  7. Create initial lifecycle event (event_type: 'created')
  8. Return 200 with asset_id (within 500ms)
  │
  Background workers complete:
  │
  ├── Drive upload → update cal_asset_media.drive_file_id + uploaded_at
  ├── Thumbnail → upload to Drive → update thumb_drive_file_id
  └── AI analysis → update cal_assets.ai_analysis + cal_asset_media.ai_analysis
```

### Offline Deposit Queue (IndexedDB)

```javascript
const DB_NAME = 'bb-asset-deposits';
const STORE_NAME = 'pending';

// Each queued deposit:
{
  localId: 'deposit_20260329_143022_abc',
  asset_class: 'daily_report',
  property_id: 'prop_789',
  metadata: { report_date: '2026-03-29', weather: 'sunny' },
  tags: ['phase-1'],
  gps_lat: 47.62,
  gps_lng: -122.32,
  gps_accuracy: 15,
  media: [
    { fileName: 'photo_001.jpg', mimeType: 'image/jpeg', blob: Blob, size: 150000 },
    { fileName: 'audio_001.webm', mimeType: 'audio/webm', blob: Blob, size: 800000 },
  ],
  timestamp: '2026-03-29T14:30:22Z',
  status: 'queued',           // queued | uploading | failed
  retryCount: 0
}
```

### Sync-on-Reconnect

```
window.addEventListener('online', async () => {
  // 1. Sync Tool Crib (delta sync for audit readiness)
  await syncToolCrib();

  // 2. Upload pending deposits (all classes)
  const pending = await getPendingDeposits();
  for (const deposit of pending) {
    try {
      await uploadDeposit(deposit);     // POST /api/assets or /bulk-deposit
      await markSynced(deposit.localId);
      showToast(`${deposit.asset_class} uploaded`);
    } catch (err) {
      deposit.retryCount++;
      if (deposit.retryCount >= 3) deposit.status = 'failed';
      await updateDeposit(deposit);
    }
  }

  // 3. Upload pending audit results (tool-specific)
  await syncPendingAudits();
});
```

---

## JobSite Assets View (CalExp5)

### Unified Assets Tab in Property Detail

```
┌─────────────────────────────────┐
│ ← Back    Smith Residence       │
│ 123 Oak St, Bainbridge Island   │
├─────────────────────────────────┤
│ Client: John Smith  📞          │
│ 3bd/2ba | 1,850 sqft            │
├─────────────────────────────────┤
│ [Map section - existing]        │
├─────────────────────────────────┤
│ Assets                          │
│                                 │
│ ┌─────┬──────┬──────┬─────┐    │
│ │ All │Tools │Docs  │More▾│    │  ← Filter pills (scrollable)
│ └─────┴──────┴──────┴─────┘    │
│                                 │     More: Receipts, Progress,
│ (filtered content below)        │           Design, Reports
│                                 │
│ ─── Tools (30) ────────── ⚠️2  │  ← Section header with alert
│ Last audit: Mar 28 ✓           │
│ [▶ Start Audit]                │
│ 28 found · 2 missing            │
│                                 │
│ ─── Documents (12) ───────────  │
│ Latest: Mar 29 by Mike          │
│ [📷] Crack in foundation wall   │
│ [📷] Plumbing rough-in complete │
│ [📋] Daily report - Mar 29      │
│                                 │
│ ─── Receipts (8) ─────────────  │
│ $2,847.33 total this month      │
│ [📷] Home Depot $247.83         │
│ [📷] Ace Hardware $89.50        │
│                                 │
│ ─── Progress (5) ─────────────  │
│ [📷][📷] Before/After: Kitchen  │
│ [📷] Framing milestone          │
│                                 │
│ ─── Design (3) ───────────────  │
│ [📐] S-101 Rev C (Structural)   │
│ [📐] Floor plan PDF             │
│                                 │
│ [+ Add Asset]                    │
└─────────────────────────────────┘
```

### "All" Timeline View

When "All" filter is selected, assets display chronologically across all classes:

```
│ ─── Mar 29, 2026 ─────────────  │
│ 📋 Daily Report    Mike  2:30pm │
│ 📷 Foundation crack Mike  1:15pm│
│ 🧾 Home Depot $248  Mike 11:00am│
│ 🔧 Audit: 28/30 ✓  Mike  8:00am│
│                                  │
│ ─── Mar 28, 2026 ─────────────  │
│ 📋 Daily Report    John  3:00pm │
│ 📸 Progress: Kitchen John 2:15pm│
│ 🧾 Ace Hardware $90 John 10:30am│
│                                  │
│ (load more...)                   │
```

---

## AI Processing Pipeline (Background)

### Per-Class AI Processors

```javascript
// BB_Micro_Bridge: src/clients/asset-ai.js

const AI_PROCESSORS = {
  'tool-ai': {
    model: 'claude-sonnet-4-6',
    // See TOOL_TRACKER_SPEC.md for full catalog + audit prompts
  },

  'report-ai': {
    model: 'claude-sonnet-4-6',
    // Audio: transcribe via Whisper → summarize via Claude
    // Video: extract keyframes → describe via Claude vision
    // Photos: describe scene, identify notable items
    // Text: summarize, extract action items
    promptTemplate: (mediaDescriptions) => `
      Summarize this daily construction report from a job site.
      Media items: ${JSON.stringify(mediaDescriptions)}
      Return JSON:
      {
        "summary": "2-3 sentence summary of the day's work",
        "work_completed": ["list of tasks completed"],
        "issues_flagged": ["any problems or concerns mentioned"],
        "action_items": ["follow-up items needed"],
        "safety_notes": ["any safety observations"],
        "sentiment": "positive | neutral | concerning"
      }
    `,
  },

  'progress-ai': {
    model: 'claude-sonnet-4-6',
    // Compare current photo against prior milestone photos
    promptTemplate: (currentPhoto, priorPhoto) => `
      Compare these two construction progress photos from the same location.
      Describe: what changed, what work was completed, current state.
      Return JSON:
      {
        "description": "what is visible in the current photo",
        "changes": "what changed since the prior photo",
        "phase": "demolition | framing | rough-in | drywall | finishing | complete",
        "estimated_completion": "percentage estimate"
      }
    `,
  },

  'doc-ai': {
    model: 'claude-sonnet-4-6',
    // Categorize and extract key info from site documents/photos
    promptTemplate: (image) => `
      Analyze this construction site photo/document.
      Categorize it and extract key observations.
      Return JSON:
      {
        "category": "issue | condition | measurement | observation | safety | other",
        "severity": "critical | moderate | minor | informational",
        "description": "what this shows",
        "requires_action": true/false,
        "recommended_action": "what should be done, if applicable"
      }
    `,
  },
};
```

### Processing Queue (Background)

```
Asset deposited → DB row created → media files queued
  │
  Background worker (runs after response sent):
  │
  1. Upload media files to Google Drive
  │   - Sequential (avoid Drive API rate limits)
  │   - Update cal_asset_media.drive_file_id on success
  │
  2. Generate thumbnails
  │   - Images: resize to 600px, JPEG 85%
  │   - Video: extract keyframe at 25% duration
  │   - Audio: generate waveform image (optional, v2)
  │   - Upload thumbs to Drive, update thumb_drive_file_id
  │
  3. Run AI processor (if class has one)
  │   - Build prompt from media descriptions
  │   - Send to Claude (Sonnet for speed/cost)
  │   - Update cal_assets.ai_analysis
  │   - For individual media: update cal_asset_media.ai_analysis
  │
  4. Update cal_asset_media.uploaded_at timestamps
```

---

## Notification System

CalExp5 already has push notification infrastructure (`web-push` with VAPID keys, `push-v1.js`
routes, `push-registration.js` client, per-employee toggle in admin panel). The asset system
extends this to cross-party notifications.

### Notification Channels

| Channel | Used For | Infra |
|---------|----------|-------|
| **Push (web-push)** | Time-sensitive alerts to phone | Existing — `web-push` + VAPID + `push-v1.js` |
| **In-app badge** | Non-urgent indicators (alerts card on home screen) | New — poll-based or SSE |
| **Email** | External user invites, digest summaries | Existing — Nodemailer (receipt emails) |

Push is primary for crew (they have the app open daily). Email is primary for customers/subs
(may not have the app open constantly). In-app badges are for context when the user is already
in the app.

### Notification Events

| Event | Push To | Email To | In-App Badge |
|-------|---------|----------|--------------|
| **Customer deposits photo/note** | Assigned crew + manager | — | Alerts card |
| **Sub submits daily report** | Project manager | — | Alerts card |
| **Sub uploads compliance doc** | Admin | — | Compliance dashboard |
| **BB publishes progress photo** | — | Customer (if subscribed) | — |
| **BB shares design file with sub** | Sub | Sub | — |
| **Foreman posts daily note** | Assigned crew | — | Assignment card |
| **Tool audit overdue (7+ days)** | Assigned crew | Admin (weekly digest) | Alerts card |
| **Compliance doc expiring (30d)** | Asset owner (employee/sub) | Admin | Alerts card + compliance dashboard |
| **Compliance doc EXPIRED** | Asset owner | Admin | Red alert |
| **Tool reported missing/stolen** | Admin | — | Tool dashboard |
| **Receipt → tool detected** | Crew who scanned | — | Receipt result card (🔧 icon) |
| **Task assigned by foreman** | Assigned crew | — | Tasks card |

### Notification Preferences (Per User)

```javascript
// Stored in cal_auth_users.features alongside feature flags:
{
  "notifications": {
    "push_enabled": true,
    "email_digest": "weekly",         // 'daily' | 'weekly' | 'none'
    "quiet_hours": { "start": 20, "end": 6 },  // no push 8pm-6am
    "subscribe": {
      "compliance_alerts": true,
      "tool_audits": true,
      "foreman_notes": true,
      "customer_deposits": true,      // admin/manager only
      "sub_reports": true             // admin/manager only
    }
  }
}
```

### Implementation

```javascript
// Centralized notification dispatcher (new file):
// BB_Micro_Bridge/src/utils/notify.js

async function notify(event, { recipients, data }) {
  for (const userId of recipients) {
    const user = await getAuthUser(userId);
    if (!user) continue;

    const prefs = user.features?.notifications || {};

    // Push notification (if enabled + not quiet hours)
    if (prefs.push_enabled && !isQuietHours(prefs.quiet_hours)) {
      const sub = await getPushSubscription(userId);
      if (sub) {
        await webPush.sendNotification(sub, JSON.stringify({
          title: event.title,
          body: event.body,
          icon: '/icons/bb-192.png',
          data: { url: event.actionUrl }
        }));
      }
    }

    // Email (for external users or digest subscribers)
    if (user.role === 'customer' || user.role === 'sub') {
      if (event.emailTemplate && user.email) {
        await queueEmail(user.email, event.emailTemplate, data);
      }
    }
  }
}
```

### New Files

| File | Purpose |
|------|---------|
| `BB_Micro_Bridge/src/utils/notify.js` | Centralized notification dispatcher (push + email + in-app) |

---

## Weather Integration

The crew home screen shows weather on the assignment card and foreman notes auto-populate
forecast data. Weather also useful for daily reports (crew currently types weather manually).

### Source: National Weather Service (NWS) API

**Why NWS over OpenWeatherMap:**
- **Free** — no API key required, no rate limit concerns at BB's scale
- **US-only** — fine for BB (Northern California)
- **Accurate** — official NOAA data, hourly/daily forecasts
- **No signup** — just hit the API with a User-Agent header

```javascript
// Two-step NWS API:
// Step 1: Get grid point from lat/lng
// GET https://api.weather.gov/points/{lat},{lng}
// Returns: forecast URL for that location

// Step 2: Get forecast
// GET {forecastUrl}  (from step 1 response)
// Returns: 7-day forecast with temperature, conditions, wind

// Cache strategy:
// - Cache grid point lookup indefinitely (lat/lng → grid doesn't change)
// - Cache forecast for 1 hour (refreshed on home screen load if stale)
// - Fallback: show last cached forecast if API is down
```

### Where Weather Appears

| Location | Data Shown | Source |
|----------|-----------|--------|
| Crew home screen (assignment card) | Current temp + condition icon | NWS hourly forecast |
| Foreman note (auto-populated) | Today's forecast summary | NWS daily forecast |
| Daily report form (auto-populated) | Weather at time of report | NWS hourly for site location |

### New Files

| File | Purpose |
|------|---------|
| `BB_Micro_Bridge/src/clients/weather.js` | NWS API client with caching |

---

## Migration Plan (Calendar-First → Map-First Home Screen)

The current CalExp5 opens to a calendar month view with employee selector. The new design
opens to a map-centric command center. This is a significant UX shift for existing crew.

### Strategy: Hard Switch (No Beta Rolled Out Yet)

CalExp5 has not been rolled out to crew yet — still in beta. No gradual migration needed.
The map-centric home screen IS the launch experience. Crew will never see the old calendar-first
layout as their home screen.

```
Build the map home screen → launch to crew → map IS home from day one
```

### What Crew Sees

| Function | Where It Lives | Bottom Bar Icon | Notes |
|---|---|---|---|
| **Map home** | Home screen (default) | — (always visible) | The landing page |
| **Calendar** | Own view via bottom bar | 📅 (calendar icon) | Month view with stacked hours bars, date tap, etc. |
| **Pay Period report** | Own view via bottom bar | ◷ (clock icon) | Existing "My Hours" / WorkReport — pay period summary |
| **JobSites** | Own view via bottom bar | ◉ (map pin icon) | Existing JobsitesView |
| **My Notes** | Own view via bottom bar | ✎ (pencil icon) | New daily notes journal |
| **Menu** | Drawer via bottom bar | ≡ (hamburger) | Everything else |

### Bottom Bar (Updated — 6 Slots)

```
┌──────┬──────┬──────┬──────┬──────┬────┐
│  ◉   │  ✎   │  📅  │  ◷   │  ▤   │ ≡  │
└──────┴──────┴──────┴──────┴──────┴────┘
Sites  Notes  Cal   Period Rcpts  Menu     ← tooltips (not visible)
```

| Slot | Icon | Tooltip | Action |
|------|------|---------|--------|
| 1 | ◉ (map pin) | Sites | Opens JobsitesView |
| 2 | ✎ (pencil) | Notes | Opens My Notes |
| 3 | 📅 (calendar) | Calendar | Opens MonthView (existing calendar with hours bars) |
| 4 | ◷ (clock) | Period | Opens WorkReport / My Hours (pay period summary) |
| 5 | ▤ (receipt) | Receipts | Opens ReceiptHistoryModal |
| 6 | ≡ (hamburger) | Menu | Opens MenuDrawer |

Slots 1-5 configurable via Profile → Home Screen Settings. Slot 6 (Menu) locked.

### Calendar vs Period — The Distinction

| | Calendar (📅) | Period (◷) |
|---|---|---|
| **What it is** | MonthView — visual calendar with stacked hour bars per date tile | WorkReport — pay period summary with totals, jobcode breakdown |
| **Existing name** | (was the home screen) | "My Hours" in MenuDrawer |
| **Use case** | "What did I work on March 15th?" — tap a date tile | "How many hours this pay period?" — totals at a glance |
| **Interaction** | Tap date → hours detail, long-press → entry mode | View/export pay period report |

### What Moves Out of the Drawer

| Drawer Item | New Location | Stays in Drawer Too? |
|---|---|---|
| **My Hours** (WorkReport) | Bottom bar → ◷ Period | NO — moved entirely |
| **JobSites** | Bottom bar → ◉ Sites | NO — moved entirely |
| **My Receipts** | Bottom bar → ▤ Receipts | NO — moved entirely |
| **My PTO** | Drawer only (less frequent) | YES |
| **My Report** (FullReport) | Drawer only | YES |
| **My Team** | Drawer only (manager) | YES |
| **All Receipts** (was Vault) | Drawer only | YES |
| **GPS sections** | Drawer only | YES |
| **Tool Crib** | Drawer only | YES |
| **Tool Dashboard** | Drawer only (admin) | YES |
| **Admin sections** | Drawer only | YES |

### Technical Implementation

```javascript
// In App.jsx — hard switch, no feature flag needed:
return (
  <>
    <CrewHomeScreen />          {/* Map-centric home — always the default */}
    <ActionFAB />               {/* Preserved for creation actions */}
    <BottomActionBar />         {/* 6-slot icon bar */}
    <MenuDrawer />              {/* Trimmed — items moved to bottom bar removed */}
    {/* Modals render on top as always */}
    {calendarOpen && <MonthView />}
    {periodOpen && <WorkReport />}
    {/* ... other modals unchanged */}
  </>
);
```

### Customer/Sub Portal — Separate Experience

External users get their portal view (CustomerPortal / SubPortal). They never see the
map home screen, calendar, FAB, or bottom bar. Their experience is entirely separate.

---

## Feature Flags (Extended)

```javascript
// Add to FEATURE_CATALOG in feature-defaults.js
'tools.view':      'View tool inventory and site assignments',
'tools.catalog':   'Catalog new tools via camera',
'tools.audit':     'Conduct tool audits on jobsites',
'tools.admin':     'Tool dashboard, assign/transfer, manage inventory',
'assets.deposit':  'Deposit daily reports, site docs, progress photos',
'assets.design':   'Upload and view design assets (CAD, LIDAR, blueprints)',
'assets.admin':    'Full asset management, timeline view, storybook export',
// No home.map_view flag — hard switch. Map home IS the crew experience from launch.
```

---

## New Files

### BB_Micro_Bridge

| File | Purpose |
|------|---------|
| `src/config/asset-classes.js` | Asset class registry (types, validation, AI processors) |
| `src/routes/assets-v1.js` | Universal `/api/assets/*` endpoints |
| `src/routes/tools-v1.js` | Tool-specific endpoints (scan, audit, dashboard) |
| `src/clients/asset-ai.js` | AI processor dispatcher (routes to class-specific prompts) |
| `src/clients/asset-storage.js` | Google Drive upload/retrieval for all asset media |
| `src/clients/asset-manifest.js` | Sidecar JSON manifest generation + tool wrapper PDF |
| `src/clients/tool-ai.js` | Tool-specific Claude prompts (catalog + audit match) |
| `src/clients/tool-pdf.js` | Tool wrapper PDF generation (mirrors receipt-pdf.js) |
| `src/routes/auth-v1.js` | Unified auth (invite, magic link, PIN — all user types) |
| `src/routes/profile-v1.js` | Profile self-management (`/api/assets/me`, `/api/assets/people`) |
| `src/middleware/visibility.js` | Asset visibility filter middleware (internal/published/shared) |
| `src/clients/compliance-ai.js` | Claude: extract cert numbers, expiry dates from uploaded docs |

### CalExp5

| File | Purpose |
|------|---------|
| `src/components/modals/ToolScanModal.jsx` | Continuous scanning camera loop |
| `src/components/shared/ToolScanner.jsx` | Camera viewfinder + stability detection |
| `src/components/shared/AssetDeposit.jsx` | Universal deposit UI (capture media + metadata per class) |
| `src/components/views/AssetsTab.jsx` | Unified assets view in property detail |
| `src/components/views/AssetTimeline.jsx` | Chronological "All" view |
| `src/components/views/AuditChecklist.jsx` | Tool audit interactive checklist |
| `src/components/views/AuditSummary.jsx` | Post-audit summary |
| `src/components/views/ToolDashboard.jsx` | Admin tool dashboard (MenuDrawer) |
| `src/store/slices/toolSlice.js` | Tool state (audits, scanner) |
| `src/store/slices/assetSlice.js` | Universal asset state (deposits, per-site lists) |
| `src/utils/asset-api.js` | API calls for universal asset endpoints |
| `src/utils/tool-api.js` | API calls for tool-specific endpoints |
| `src/utils/tool-crib.js` | IndexedDB Tool Crib cache |
| `src/utils/asset-deposit-queue.js` | Offline deposit queue (all classes) |
| `src/components/views/MyProfile.jsx` | Self-service profile view (all users) |
| `src/components/views/PeopleList.jsx` | Admin: list employees/subs/customers |
| `src/components/views/PersonDetail.jsx` | Admin: view/manage someone's profile + children |
| `src/components/views/ComplianceDashboard.jsx` | Admin: expiring certs, missing docs across all subs/employees |

### Modified Files

| File | Changes |
|------|---------|
| `ActionFAB.jsx` | Add 5th button (Tool Scan) |
| `MenuDrawer-v2.jsx` | Add "Tool Dashboard" (gated: `tools.admin`) |
| `JobsitesView.jsx` | Add Assets tab in property detail panel |
| `src/store/slices/uiSlice.js` | Add asset/tool modal states |
| `BB_Micro_Bridge/src/utils/feature-defaults.js` | Add `tools.*` + `assets.*` flags |
| `BB_Micro_Bridge/src/index-v2.js` | Register `/api/assets` + `/api/assets/tools` prefixes |
| `BB_Micro_Bridge/src/clients/image-cache.js` | Add `asset-{id}` key prefix |

---

## Build Order (Phased)

| Phase | What | Effort | Delivers |
|-------|------|--------|----------|
| **1a** | `cal_assets` + `cal_asset_media` + `cal_asset_events` tables | Medium | Universal schema |
| **1b** | `asset-classes.js` registry + `/api/assets` CRUD endpoints | Medium | Universal API |
| **1c** | `cal_asset_audit_sessions` + receipt adapter view | Small | Audit foundation + receipts visible |
| **2a** | `tool-ai.js` + `/api/assets/tools/scan` | Medium | Claude identifies tools |
| **2b** | `ToolScanner.jsx` + `ToolScanModal.jsx` + FAB button | Large | Continuous scanning works |
| **2c** | `tool-crib.js` (IndexedDB) + `/api/assets/sync` | Medium | Offline Tool Crib |
| **3a** | `AssetsTab.jsx` + `AssetTimeline.jsx` in JobsitesView | Medium | Assets visible per site |
| **3b** | Receipt adapter in Assets view | Small | Receipts appear alongside tools |
| **3c** | Tool assign/transfer API + UI | Medium | Move tools between sites |
| **4a** | `AuditChecklist.jsx` + `AuditSummary.jsx` + audit API | Large | Full audit workflow |
| **4b** | Offline audit queue + bulk-sync | Medium | Audits work offline |
| **5** | `ToolDashboard.jsx` + dashboard API + search | Medium | Sam's overview |
| **6** | `AssetDeposit.jsx` + daily report/site doc deposit | Medium | Crew can deposit reports + docs |
| **7** | `asset-deposit-queue.js` (offline deposits for all classes) | Medium | All deposits work offline |
| **8** | Progress photos + before/after AI comparison | Medium | Milestone tracking |
| **9** | Design asset upload + binary storage | Medium | CAD/LIDAR/blueprint storage |
| **10** | Feature flags + role assignment + full access control | Small | Production access control |
| **11** | Audit trail: tool wrapper PDFs + sidecar JSON manifests | Medium | Drive-based disaster recovery |
| **12a** | Human asset classes (employee/sub/customer) + `cal_auth_users` + compliance/financial classes | Medium | People are assets |
| **12b** | `MyProfile.jsx` + self-service profile management + cert upload | Medium | All users manage own profile |
| **12c** | `auth-v1.js` unified auth (magic link + PIN for all user types) | Medium | Subs + customers can log in |
| **12d** | Visibility middleware + customer/sub filtered views | Large | External users see curated view |
| **13** | `ComplianceDashboard.jsx` + expiry monitoring cron | Medium | Sam sees expiring certs/docs |
| **14** | Publish/share actions + notification bridge | Medium | BB controls what externals see |
| **15** | Storybook timeline view for customers | Large | Project story deliverable |
| **16** | Receipt → Tool detection (real-time + retroactive scan) | Medium | Auto-discover tools from receipts |

**Phase 1-5 = Tool Tracker (fully functional)**
**Phase 6-7 = Daily Reports + Site Docs**
**Phase 8-9 = Progress + Design**
**Phase 10 = Production hardening**
**Phase 11 = Audit trail (Drive as source of truth)**
**Phase 12 = Human assets + profiles + auth + external access**
**Phase 13 = Compliance dashboard**
**Phase 14 = Publish/share + notifications**
**Phase 15 = Storybook (customer deliverable)**
**Phase 16 = Receipt → Tool bridge**
**Phase 17-18 = Ticket system**
**Phase 19-22 = Subscription services + scheduling engine**

---

## Ticket System (Warranty Claims, Defect Reports, Requests)

Tickets are assets (`asset_class: 'ticket'`) anchored to properties, with conversation
threads modeled as `cal_asset_events`. Zero new tables — the universal asset system handles
tickets the same way it handles everything else.

### Ticket Categories

| Category | Example | Default Urgency | Typical Resolution |
|----------|---------|-----------------|-------------------|
| `defect` | Cracking tile, leaking faucet | Normal | Crew or sub repairs |
| `warranty` | Anything within 1-year warranty | Normal | BB responsible, may involve sub |
| `emergency` | Pipe burst, electrical failure | URGENT | Immediate dispatch |
| `request` | "Want to add a deck" | Low | Sales/estimate follow-up |
| `question` | "When is inspector coming?" | Low | Simple response |
| `feedback` | "Great work on the kitchen!" | Low | Acknowledge, save as testimonial |

### Ticket Asset Class

```javascript
ticket: {
  label: 'Ticket',
  pluralLabel: 'Tickets',
  icon: '🎫',
  isHuman: false,
  mediaTypes: ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf', 'text/plain'],
  maxMediaPerAsset: 20,
  aiProcessor: 'ticket-ai',          // Claude: categorize, assess urgency, match to warranty/sub
  auditable: false,
  cacheable: false,
  allowsChildren: true,               // repair receipts, sub invoices, inspection reports
  inputMethods: ['camera', 'manual', 'file_upload'],
  selfManageable: true,               // customer creates + comments
  lifecycle: {
    initialStatus: 'open',
    transitions: {
      open:                 ['triaged', 'assigned', 'closed'],
      triaged:              ['assigned', 'deferred', 'closed'],
      assigned:             ['in_progress', 'deferred', 'closed'],
      in_progress:          ['waiting_on_customer', 'waiting_on_sub', 'resolved', 'escalated'],
      waiting_on_customer:  ['in_progress', 'closed'],
      waiting_on_sub:       ['in_progress', 'escalated'],
      escalated:            ['in_progress', 'resolved'],
      deferred:             ['open', 'closed'],
      resolved:             ['closed', 'reopened'],
      reopened:             ['assigned'],
      closed:               ['reopened'],
    },
  },
  metadata: {
    required: ['subject', 'category'],
    optional: ['description', 'urgency', 'warranty_claim', 'warranty_expiry',
               'warranty_days_remaining', 'assigned_to', 'assigned_sub_id',
               'related_work_asset_id', 'resolution', 'resolution_date',
               'customer_satisfaction'],
  },
}
```

### Warranty Auto-Detection

When a customer submits a ticket with category `warranty`, the system auto-enriches:

```javascript
// In ticket creation handler:
if (metadata.category === 'warranty') {
  const property = await getProperty(asset.property_id);
  const completionDate = property.metadata?.completion_date;
  const warrantyMonths = property.metadata?.warranty_months || 12;
  const warrantyExpiry = addMonths(completionDate, warrantyMonths);
  const daysRemaining = daysUntil(warrantyExpiry);

  metadata.warranty_claim = true;
  metadata.warranty_expiry = warrantyExpiry;
  metadata.warranty_days_remaining = daysRemaining;

  if (daysRemaining <= 0) {
    metadata.warranty_expired = true;
    // Still create ticket — BB decides policy on expired claims
  }

  // Find related sub by matching ticket description to trade
  const relatedSub = await findSubByTrade(asset.property_id, metadata.description);
  if (relatedSub) {
    metadata.suggested_sub_id = relatedSub.id;
    metadata.suggested_sub_name = relatedSub.metadata.name;
  }
}
```

### Conversation Thread (Events-Based)

The ticket conversation uses `cal_asset_events` — no separate messaging table:

```
Customer creates:     event_type: 'created', details: { text: '...', urgency: 'normal' }
Customer adds photo:  event_type: 'media_added'
Sam triages:          event_type: 'status_changed', details: { from: 'open', to: 'triaged', note: '...' }
Sam assigns to sub:   event_type: 'assigned', details: { assigned_to: 'usr_mike', note: '...' }
Sub comments:         event_type: 'comment', performed_by: 'usr_mike', details: { text: '...' }
Customer replies:     event_type: 'comment', performed_by: 'usr_erik', details: { text: '...' }
Sub resolves:         event_type: 'status_changed', details: { to: 'resolved', note: '...' }
Sam closes:           event_type: 'status_changed', details: { to: 'closed' }
```

### Customer Portal — Ticket Submission

```
Customer taps "Submit Request" on their portal:

┌──────────────────────────────────┐
│ New Request                      │
├──────────────────────────────────┤
│ Category: [Warranty Claim  ▾]    │
│ Subject:  [Kitchen faucet leak ] │
│ ┌────────────────────────────┐   │
│ │ Describe the issue...      │   │
│ └────────────────────────────┘   │
│ [📷 Add Photo]  [🎤 Voice]      │
│ Urgency: ○ Normal  ○ Urgent     │
│ [Submit]                         │
└──────────────────────────────────┘

After submission — conversation thread:

┌──────────────────────────────────┐
│ ← Requests    #T-2026-042       │
│ Kitchen faucet leak              │
│ Status: Assigned · Warranty ✓   │
├──────────────────────────────────┤
│ 👤 You · Mar 30, 2:15 PM        │
│ The faucet has been dripping...  │
│ [📷 photo]                       │
│                                  │
│ 🔴 BB · Mar 30, 3:00 PM         │
│ Covered under warranty (169 days │
│ remaining). Sending plumber Thu. │
│                                  │
│ 🔧 DAE Plumbing · 3:30 PM       │
│ I can be there Thursday 10am.    │
│                                  │
│ 👤 You · 3:45 PM                 │
│ Thursday works, I'll be home.    │
│                                  │
│ ┌────────────────────────────┐   │
│ │ Type a reply...    [📷][→]│   │
│ └────────────────────────────┘   │
└──────────────────────────────────┘
```

### Sam's Ticket Dashboard

```
┌──────────────────────────────────┐
│ Tickets                    🔍   │
├──────────────────────────────────┤
│ 🔴 2 urgent  🟡 5 open  ✅ 12  │
├──────────────────────────────────┤
│ 🔴 URGENT                       │
│ #T-042 Pipe burst — Johnson     │
│ 15 min ago · Unassigned         │
│                                  │
│ 🟡 OPEN                         │
│ #T-041 Faucet leak — Eklund     │
│ 2h ago · DAE Plumbing           │
│ Warranty ✓ (169 days)           │
│                                  │
│ #T-040 Deck estimate — Harbor   │
│ 1d ago · Request                │
│                                  │
│ ✅ RESOLVED (this week)          │
│ #T-039 Paint touch-up — Smith   │
│ Closed Mar 28                    │
└──────────────────────────────────┘
```

### Ticket Notifications

| Event | Customer | BB Admin | Assigned Sub |
|-------|----------|----------|-------------|
| Ticket created | Confirmation push | Push + dashboard badge | — |
| BB responds | Push | — | — |
| Assigned to sub | Push ("plumber scheduled") | — | Push + portal badge |
| Sub comments | Push | Push | — |
| Customer replies | — | Push | Push |
| Resolved | Push | Badge | Push |
| URGENT ticket | — | Push + SMS (Sam's cell) | — |

---

## Subscription Services (Recurring Maintenance)

Customers can subscribe to recurring maintenance services (window cleaning, solar panel
maintenance, tree service, gutter cleaning, HVAC, etc.). BB orchestrates — assigns providers
(subs), manages scheduling, ensures quality. Recurring revenue for BB.

### Service Plans (Template Config)

```javascript
// src/config/service-plans.js
const SERVICE_PLANS = {
  window_cleaning: {
    name: 'Window Cleaning',
    description: 'Interior + exterior window cleaning',
    icon: '🪟',
    frequency: 'biannual',
    default_price: 350,
    estimated_duration_hours: 3,
    requires_access: true,
    seasonal_preference: ['spring', 'fall'],
    provider_trade: 'window_cleaning',
  },
  solar_maintenance: {
    name: 'Solar Panel Cleaning & Inspection',
    description: 'Panel cleaning, wire inspection, inverter check, production report',
    icon: '☀️',
    frequency: 'biannual',
    default_price: 450,
    estimated_duration_hours: 4,
    requires_access: false,
    seasonal_preference: ['spring', 'fall'],
    provider_trade: 'solar',
  },
  tree_service: {
    name: 'Tree Trimming & Health Check',
    description: 'Trim, shape, deadwood removal, health assessment',
    icon: '🌲',
    frequency: 'annual',
    default_price: 600,
    estimated_duration_hours: 6,
    requires_access: false,
    seasonal_preference: ['winter'],
    provider_trade: 'arborist',
  },
  gutter_cleaning: {
    name: 'Gutter Cleaning & Inspection',
    description: 'Clean gutters + downspouts, check for damage, flush test',
    icon: '🏠',
    frequency: 'biannual',
    default_price: 250,
    estimated_duration_hours: 2.5,
    requires_access: false,
    seasonal_preference: ['spring', 'late_fall'],
    provider_trade: 'gutter',
  },
  hvac_maintenance: {
    name: 'HVAC Maintenance',
    description: 'Filter replacement, coil cleaning, refrigerant check, duct inspection',
    icon: '❄️',
    frequency: 'biannual',
    default_price: 300,
    estimated_duration_hours: 2.5,
    requires_access: true,
    seasonal_preference: ['spring', 'fall'],
    provider_trade: 'hvac',
  },
  general_maintenance: {
    name: 'General Home Maintenance',
    description: 'BB crew: inspect caulking, grout, paint touch-up, hardware, fixtures',
    icon: '🔧',
    frequency: 'annual',
    default_price: 500,
    estimated_duration_hours: 5,
    requires_access: true,
    seasonal_preference: ['spring'],
    provider_trade: null,             // BB's own crew
  },
};
```

### Subscription Asset Class

```javascript
subscription: {
  label: 'Service Subscription',
  pluralLabel: 'Subscriptions',
  icon: '🔄',
  isHuman: false,
  allowsChildren: true,               // service visits are children
  selfManageable: false,               // admin creates, customer views/modifies dates
  lifecycle: {
    initialStatus: 'pending',
    transitions: {
      pending:     ['active', 'cancelled'],
      active:      ['paused', 'cancelled', 'expired'],
      paused:      ['active', 'cancelled'],
      expired:     ['renewed', 'cancelled'],
      renewed:     ['active'],
      cancelled:   ['reactivated'],
      reactivated: ['active'],
    },
  },
  metadata: {
    required: ['plan_id', 'customer_asset_id', 'billing_cycle'],
    optional: ['properties', 'start_date', 'end_date', 'renewal_date',
               'price_per_visit', 'annual_price', 'billing_method',
               'payment_status', 'assigned_provider_id', 'promo_code', 'notes'],
  },
}
```

### Service Visit Asset Class

```javascript
service_visit: {
  label: 'Service Visit',
  pluralLabel: 'Service Visits',
  icon: '📆',
  isHuman: false,
  allowsChildren: true,               // before/after photos, report, invoice
  selfManageable: false,
  lifecycle: {
    initialStatus: 'scheduling',
    transitions: {
      scheduling:  ['scheduled', 'cancelled'],
      scheduled:   ['confirmed', 'rescheduled', 'cancelled'],
      confirmed:   ['in_progress', 'rescheduled', 'no_show', 'cancelled'],
      rescheduled: ['scheduling'],
      in_progress: ['completed', 'incomplete'],
      incomplete:  ['rescheduled'],
      completed:   ['invoiced'],
      invoiced:    ['paid', 'disputed'],
      paid:        [],
      disputed:    ['invoiced', 'credited'],
      credited:    [],
      no_show:     ['rescheduled', 'cancelled'],
      cancelled:   [],
    },
  },
  metadata: {
    required: ['plan_id', 'scheduled_date'],
    optional: ['scheduled_window', 'provider_id', 'provider_name',
               'actual_date', 'actual_duration_hours', 'requires_access',
               'access_notes', 'customer_notified', 'provider_notified',
               'before_notes', 'after_notes', 'customer_satisfaction',
               'next_visit_date', 'invoice_amount'],
  },
}
```

### Smart Scheduling Engine

Three-party matching: customer availability + provider availability + BB routing optimization.

**Provider availability** (stored on sub human asset metadata):

```json
{
  "service_availability": {
    "default_days": ["mon", "tue", "wed", "thu", "fri"],
    "default_hours": { "start": "08:00", "end": "17:00" },
    "service_area_miles": 30,
    "base_lat": 47.62, "base_lng": -122.52,
    "max_visits_per_day": 3,
    "blackout_dates": ["2026-04-20", "2026-04-21"],
    "advance_notice_days": 7
  }
}
```

**Scheduling flow:**

```
T-30 days: Scheduling cron generates service_visit (status: 'scheduling')
  │
  Customer gets notification: "Pick your preferred dates"
  │
  Customer opens scheduling calendar in portal:
  │
  ┌──────────────────────────────────┐
  │ ← Schedule Service               │
  │ Gutter Cleaning · ~2-3 hours     │
  ├──────────────────────────────────┤
  │ Select days that work for you:   │
  │                                  │
  │       April 2026                 │
  │ Mo Tu We Th Fr Sa Su             │
  │     1  2  3  4  5  6             │
  │  7  8  9 10 11 12 13             │
  │ 14 ●  ● 17 ●  19 20             │  ← Green = provider available
  │ 21 ●  ● 24 ●  26 27             │    Tap to select your days
  │ 28 ●  ●                          │
  │                                  │
  │ ○ Morning (8am-12pm)             │
  │ ● Afternoon (12pm-5pm)           │
  │ ○ No preference                  │
  │                                  │
  │ Access notes:                    │
  │ [Gate code: 4521            ]    │
  │                                  │
  │ [Confirm Availability]           │
  │                                  │
  │ ── or ──                         │
  │ [Any day works — you pick]       │  ← Zero friction shortcut
  └──────────────────────────────────┘
  │
  System matches: customer prefs ∩ provider avail ∩ routing optimization
  │
  ┌──────────────────────────────────┐
  │ ✅ Confirmed!                     │
  │ 📅 Tuesday, April 15             │
  │ 🕐 Afternoon (12pm-5pm)          │
  │ 🔧 CleanPro Gutters              │
  │                                  │
  │ [Looks Good ✓] [Pick Different]  │
  └──────────────────────────────────┘
```

**Matching algorithm:**

```javascript
async function findBestDate(visit, customerPrefs, provider) {
  const providerDays = getProviderAvailableDays(provider, visit.due_window);
  const overlaps = customerPrefs.any_day_works
    ? providerDays
    : providerDays.filter(d => customerPrefs.selected_dates.includes(d));

  if (overlaps.length === 0) {
    return { matched: false, suggestions: providerDays.slice(0, 3) };
  }

  // Score each candidate
  const scored = await Promise.all(overlaps.map(async day => {
    let score = 0;

    // Routing bonus: other visits nearby on same day (+20 per nearby visit)
    const nearby = await getVisitsNearProperty(visit.property_id, day, 10);
    score += nearby.length * 20;

    // Time preference match
    if (customerPrefs.time_pref === 'no_preference') score += 10;

    // Advance notice bonus (not too soon, not too late)
    const daysOut = daysUntil(day);
    if (daysOut >= 14 && daysOut <= 25) score += 5;

    // Seasonal match
    if (plan.seasonal_preference.includes(getSeason(day))) score += 3;

    return { date: day, score };
  }));

  scored.sort((a, b) => b.score - a.score);
  return { matched: true, bestDate: scored[0].date, alternatives: scored.slice(1, 3) };
}
```

**Routing bonus is the secret sauce:** If 3 customers on Bainbridge Island all need gutter
cleaning in April, the system clusters them on the same day. Better for provider (full day),
better for BB (one coordination effort), customer doesn't even notice.

### Auto-Fallback (Customer Doesn't Respond)

```
T-30: "Pick your dates" notification → customer opens calendar
T-23: No response → gentle reminder: "Still need your preferred dates"
T-16: No response → auto-schedule with "any day works" logic
      "We've scheduled your gutter cleaning for April 15. Reschedule?"
T-14: Standard 14-day reminder
```

Customer never has to do anything if they don't want to — system picks the best date automatically.

### Rescheduling (Same Zero-Friction Calendar)

Customer, provider, or BB can trigger reschedule. The same calendar UI reopens with
updated provider availability. Status cycles: `scheduled → rescheduled → scheduling → scheduled`.

### Edge Cases

| Edge Case | Handling |
|---|---|
| Customer ignores all notifications | Auto-schedule at T-16 days |
| Provider has no availability | Widen window 2 weeks. Still nothing → alert BB admin → find alternate |
| Weather cancellation day-of | Provider marks `no_show` (weather). Auto-reschedule within 7 days |
| Customer cancels last minute | Status `cancelled`. Provider notified. No charge (or fee per policy) |
| Customer pauses subscription | Status `paused`. No visits generated. Resume anytime |
| Provider no-shows | Alert BB admin immediately. Apology to customer + priority reschedule |
| Access required, customer not home | Provider marks `incomplete`. Auto-reschedule + customer notified |
| Subscription expires | 30-day notice: "Your plan expires May 15. Renew?" → `expired` if not |

### Notification Timeline

```
T-30: Customer → "Pick your dates" (push + email)
T-23: Customer → reminder if no response
T-16: Auto-schedule if still no response
T-14: Customer → "Your service is April 15" (push)
T-7:  Provider → "3 visits: Bainbridge, April 15" (push + portal)
T-2:  Customer → "Service in 2 days. Anything we should know?" (push)
T-0:  Customer → "CleanPro arrives this afternoon" (push, morning of)
      Provider → route + addresses + access notes
T+0:  Provider submits report + before/after photos
      Customer → "Service complete! View report →" (push + email)
      Invoice generated
```

### Customer Portal — Subscriptions Tab

```
Customer portal → "Maint" tab:

┌──────────────────────────────────┐
│ ┌──────┬──────┬──────┬───────┐  │
│ │Photos│ Docs │Maint │Tickets│  │
│ └──────┴──────┴──────┴───────┘  │
│                                  │
│ ─── My Maintenance Plan ──────  │
│                                  │
│ ✅ Window Cleaning (biannual)    │
│    Next: April 15 · $350        │
│    [Confirm] [Reschedule]        │
│                                  │
│ ✅ Gutter Cleaning (biannual)    │
│    Next: May 1 · $250           │
│                                  │
│ ✅ Solar Panel Service           │
│    Last: Oct 12 · Next: Apr 12  │
│                                  │
│ ─── Visit History ─────────────  │
│ [📷] Gutter cleaning Oct 15 ✓   │
│ [📷] Window cleaning Oct 3 ✓    │
│                                  │
│ [+ Browse Available Services]    │
└──────────────────────────────────┘
```

### Customer Lifecycle (Final)

```
prospect → active (construction) → completed → subscriber → churned
                                       │             │
                                       │             ├── warranty tickets (1 year)
                                       │             ├── subscription services (ongoing)
                                       │             └── storybook (permanent)
                                       │
                                       └── portal NEVER fully deactivates:
                                           - Storybook (pride, referrals)
                                           - Tickets (warranty, defects)
                                           - Subscriptions (recurring revenue)
                                           - Future construction projects
```

### Revenue Model

```
10 completed projects/year → 10 potential subscribers
Average 3 services per subscriber × 2 visits/year = 60 visits/year
Average margin per visit: $100 (BB markup over sub cost)
Annual recurring revenue: $6,000-10,000
Growing: each year adds ~10 more subscribers (cumulative)
Year 3: 30 subscribers × $600 avg annual spend = $18,000 recurring
```

### Build Phases (Updated)

| Phase | What | Effort |
|-------|------|--------|
| **17** | `ticket` asset class + warranty auto-detection + conversation thread | Medium |
| **18** | Ticket views: customer submission + admin dashboard + sub assignment | Medium |
| **19** | `subscription` + `service_visit` asset classes + `service-plans.js` | Small |
| **20** | Scheduling engine: cron + provider availability + matching algorithm | Large |
| **21** | Customer scheduling calendar UI + rescheduling flow | Large |
| **22** | Service visit workflow: provider before/after photos + report + completion | Medium |
| **23** | Invoice generation + payment tracking | Medium |
| **24** | Stripe recurring billing (future, if volume justifies) | Large |

---

## Storybook / Before-After Reports (Architecture Only — UI Deferred)

### Data Foundation (built into Phase 8)

Progress photos tagged with `milestone` metadata + `before`/`after` tags create a natural timeline:

```sql
-- Query: project storybook for Smith Residence
SELECT a.*, m.thumb_drive_file_id
FROM cal_assets a
JOIN cal_asset_media m ON m.asset_id = a.id AND m.is_primary = true
WHERE a.property_id = 'prop_789'
  AND a.asset_class = 'progress'
  AND a.deleted_at IS NULL
ORDER BY a.metadata->>'milestone', a.created_at;
```

**Future UI** (deferred): Swipeable before/after comparison view, exportable PDF storybook
for clients, embeddable timeline widget.

The schema supports this today — no migration needed when we build the UI.

---

## Relationship to Existing Systems

```
┌──────────────────────────────────────────────────────────────────┐
│                    JobSite (Property)                              │
│                    The Universal Anchor                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  cal_assets   │  │ cal_receipts │  │  QBT Hours   │           │
│  │  (universal)  │  │ (existing)   │  │  (existing)  │           │
│  │              │  │              │  │              │           │
│  │ · Tools     │  │ · R_ docs    │  │ · Timesheets │           │
│  │ · Reports   │  │ · B_ docs    │  │ · PTO        │           │
│  │ · Progress  │  │ · Filed to   │  │ · Manual hrs │           │
│  │ · Site Docs │  │   Drive + QBO│  │              │           │
│  │ · Design    │  │              │  │              │           │
│  │ · Future... │  │              │  │              │           │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘           │
│         │                 │                                       │
│         ▼                 ▼                                       │
│  ┌──────────────────────────────┐                                │
│  │     Assets Tab (unified)     │  ← All visible in one place    │
│  │     in JobsitesView          │                                 │
│  └──────────────┬───────────────┘                                │
│                 │                                                  │
│                 │ visibility filter                                │
│                 ▼                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                   WHO SEES WHAT                            │    │
│  │                                                           │    │
│  │  BB Crew ──── all assets (internal + published + shared)  │    │
│  │  Customer ─── published + shared + own deposits           │    │
│  │  Sub ──────── shared (their trade) + own deposits         │    │
│  │                                                           │    │
│  │  Scoped by: cal_property_access (property + class + role) │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    Audit Trail (Drive = Source of Truth)           │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Tools ────────── Wrapper PDF (same pattern as receipts)          │
│  Receipts ─────── PDF (existing, unchanged)                       │
│  Everything else─ Sidecar JSON manifest                           │
│                                                                   │
│  Database is the fast index.                                      │
│  Drive is the source of truth for disaster recovery.              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

*Companion doc: TOOL_TRACKER_SPEC.md covers tool-specific UX (scanner, audits, dashboard).*
*This document covers the universal foundation all asset classes share.*

*Ready to implement? Say "go" or request changes.*
