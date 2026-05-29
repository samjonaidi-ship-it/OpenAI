# BB Bridge vs Superset Audit | v1.1 | 2026-03-14 | BB

> **Purpose:** Compares every payload and response in Mini_API_Bridge against BB_QBO_QBT_FIELD_SUPERSET.md to identify discrepancies — fields the Bridge uses that aren't in the superset, fields the superset documents that the Bridge never touches, and field naming/transformation mismatches.
>
> **Status:** All discrepancies resolved in BB_QBO_QBT_FIELD_SUPERSET.md v3.0. Data duplication documented in superset Section 21 for resolution during Neon DB migration.

---

## LEGEND

| Symbol | Meaning |
|--------|---------|
| MISSING FROM SUPERSET | Bridge uses this field but superset doesn't document it |
| MISSING FROM BRIDGE | Superset documents this field but Bridge never references it |
| NAME MISMATCH | Bridge renames/transforms the field differently than superset implies |
| SHAPE MISMATCH | Bridge restructures the data differently than superset documents |
| UNDOCUMENTED ENTITY | Bridge accesses an entity type not covered in the superset |

---

## 1. QBO EMPLOYEE DISCREPANCIES

### Fields Bridge Extracts (via `/qbo/employee/details`) vs Superset Section 1

| Bridge Field | QBO Source | Superset Status | Issue |
|-------------|-----------|----------------|-------|
| `id` | Id | Documented | OK |
| `syncToken` | SyncToken | Documented | OK |
| `displayName` | DisplayName | Documented | OK |
| `givenName` | GivenName | Documented | OK (superset says `first_name`) |
| `familyName` | FamilyName | Documented | OK (superset says `last_name`) |
| `printOnCheckName` | PrintOnCheckName | Documented as NOT USED | **DISCREPANCY** — Bridge extracts it, superset says NOT USED |
| `employeeNumber` | EmployeeNumber | Documented as NOT USED | **DISCREPANCY** — Bridge extracts it, superset says NOT USED |
| `billableTime` | BillableTime | Documented as NOT USED | **DISCREPANCY** — Bridge extracts it, superset says NOT USED |
| `billRate` | BillRate | Documented as NOT USED | **DISCREPANCY** — Bridge extracts it (note in superset says "BB uses enrichment.billRate instead") |
| `costRate` | CostRate | NOT IN SUPERSET | **MISSING FROM SUPERSET** — Bridge extracts Employee.CostRate but superset doesn't list this field at all |
| `releasedDate` | ReleasedDate | Documented as NOT USED | **DISCREPANCY** — Bridge extracts it |
| `birthDate` | BirthDate | Documented as NOT USED | **DISCREPANCY** — Bridge extracts it |
| `gender` | Gender | Documented as NOT USED | **DISCREPANCY** — Bridge extracts it |
| `primaryAddr` | PrimaryAddr | Documented as NOT USED | **DISCREPANCY** — Bridge extracts Line1, City, State, Zip |
| `primaryPhone` | PrimaryPhone.FreeFormNumber | Documented | OK |
| `mobile` | Mobile.FreeFormNumber | Documented as NOT USED | **DISCREPANCY** — Bridge extracts it |
| `primaryEmailAddr` | PrimaryEmailAddr.Address | Documented | OK |
| `ssnLastFour` | SSN (masked) | Documented as NOT USED | **DISCREPANCY** — Bridge extracts last 4 digits |
| `createTime` | MetaData.CreateTime | Documented as NOT USED | **DISCREPANCY** — Bridge extracts it |
| `lastUpdatedTime` | MetaData.LastUpdatedTime | Documented | OK |
| `_raw` | Full object | N/A | Bridge passes full raw object (not a discrepancy, just FYI) |

**Summary:** 10 fields the Bridge actively extracts are marked "NOT USED" in the superset. 1 field (`CostRate`) is completely missing from the superset.

---

## 2. QBO CUSTOMER DISCREPANCIES

### Fields Bridge Uses vs Superset Section 2

The Bridge accesses customers via generic list/search endpoints (`/qbo/customers`, `/qbo/customers/search`) and returns the **full QBO response** without field-level extraction. This means:

| Issue | Detail |
|-------|--------|
| No explicit field mapping | Bridge passes through raw QBO Customer objects — all fields are technically "used" |
| `FullyQualifiedName` | Used in customer search/display but marked NOT USED in superset |
| `Balance` | Available in raw response, marked NOT USED in superset — Bridge doesn't extract but clients may read it |
| `TotalRevenue`, `TotalExpense` | Available in raw response — same situation |

**Note:** Since Bridge passes raw objects, any consuming app (PorjExp5, DocEngine, etc.) could be reading fields the superset marks as NOT USED. This is a **documentation gap** — the superset tracks C1 storage, not Bridge passthrough.

---

## 3. QBO VENDOR DISCREPANCIES

Same pattern as Customers — Bridge uses generic list endpoint and passes raw QBO objects through. No field-level extraction in Bridge code.

| Issue | Detail |
|-------|--------|
| Vendor alias system | Bridge config has 119 vendor name aliases (Vendor_settings.json) — this normalization layer is NOT documented in superset |
| `GivenName`/`FamilyName` | Available in raw response, superset marks NOT USED |
| `Balance` | Available in raw response, superset marks NOT USED |

---

## 4. QBO INVOICE DISCREPANCIES

### Fields Bridge Extracts vs Superset Section 7

| Bridge Field | QBO Source | Superset Status | Issue |
|-------------|-----------|----------------|-------|
| `Id` | Id | Documented | OK |
| `DocNumber` | DocNumber | Documented | OK |
| `TxnDate` | TxnDate | Documented | OK |
| `CustomerRef` | CustomerRef | Documented | OK |
| `Line[]` | Line | Documented | OK |
| `LinkedTxn[]` | LinkedTxn | Documented | OK |
| `Balance` | Balance | Documented | OK |
| `TotalAmt` | TotalAmt | Documented | OK |
| `MetaData` | MetaData | Documented | OK |

### Enrichment Fields Bridge Adds (not from QBO)

| Bridge Enrichment | Source | Superset Status | Issue |
|------------------|--------|----------------|-------|
| `_enriched.PaymentDate` | Looked up from LinkedTxn Payment refs | **MISSING FROM SUPERSET** — Bridge computes this by fetching linked Payment.TxnDate |
| `_enriched.AttachmentCount` | Count of matched Attachables | **MISSING FROM SUPERSET** |
| `_enriched.Attachments[]` | Attachable query filtered by InvoiceId | **MISSING FROM SUPERSET** |
| `_stats` | Duration, counts, pagination metadata | **MISSING FROM SUPERSET** (operational, not schema) |

### Invoice Line Detail — Bridge Usage vs Superset

| Line Field | Bridge Uses | Superset Documents | Issue |
|-----------|------------|-------------------|-------|
| `SalesItemLineDetail.ServiceDate` | YES (export-labor-csv) | YES | OK |
| `SalesItemLineDetail.ItemRef` | YES | YES | OK |
| `SalesItemLineDetail.Qty` | YES | YES | OK |
| `SalesItemLineDetail.UnitPrice` | YES | YES | OK |
| `LinkedTxn` (line-level) | YES (recon-enhanced checks line.LinkedTxn) | **NOT DOCUMENTED** at line level | **MISSING FROM SUPERSET** — superset shows LinkedTxn only at invoice level |
| `SubTotalLineDetail` | YES (filtered out in export) | YES | OK |
| `DiscountLineDetail` | YES (filtered out in export) | YES | OK |
| `Detail.BillableStatus` | YES (bill-recon, chase-recon) | **NOT ON INVOICE** in superset | **DISCREPANCY** — BillableStatus is on Purchase/Bill line details, not Invoice. Bridge reads it from Bill/Purchase lines but maps results alongside invoice data |
| `Detail.CustomerRef` | YES (bill/chase recon extract job name) | Not explicitly listed as line-level field | **MISSING FROM SUPERSET** — CustomerRef on line items (AccountBasedExpenseLineDetail.CustomerRef) |

---

## 5. QBO PURCHASE/EXPENSE DISCREPANCIES

### Fields Bridge Extracts vs Superset Section 8

| Bridge Field | QBO Source | Superset Status | Issue |
|-------------|-----------|----------------|-------|
| `Id` | Id | Documented | OK |
| `TxnDate` | TxnDate | Documented | OK |
| `TotalAmt` | TotalAmt | Documented | OK |
| `DocNumber` | DocNumber | Documented | OK |
| `EntityRef` | EntityRef | Documented | OK |
| `PaymentType` | PaymentType | Documented | OK |
| `AccountRef` | AccountRef | Documented | OK |
| `CurrencyRef` | CurrencyRef | Documented | OK |
| `Credit` | Credit | Documented | OK |
| `CustomField` | CustomField | Documented | OK |
| `PurchaseEx` | PurchaseEx | **MISSING FROM SUPERSET** — Bridge preserves this in convert-to-item-based |
| `PrivateNote` | PrivateNote | Documented | OK |

### Purchase Line Conversion (convert-to-item-based)

| Aspect | Bridge Does | Superset Documents | Issue |
|--------|-----------|-------------------|-------|
| AccountBasedExpenseLineDetail → ItemBasedExpenseLineDetail | Full conversion logic | Both types documented | OK |
| Line.Id omission on new lines | Bridge removes Id when changing DetailType | Not documented | Bridge-specific behavior, not a superset issue |
| `MarkupInfo` | Not used by Bridge | Documented in superset | OK (MISSING FROM BRIDGE) |

---

## 6. QBO BILL DISCREPANCIES

### Fields Bridge Extracts vs Superset Section 9

| Bridge Field | QBO Source | Superset Status | Issue |
|-------------|-----------|----------------|-------|
| `Id` | Id | Documented | OK |
| `DocNumber` | DocNumber | Documented | OK |
| `TxnDate` | TxnDate | Documented | OK |
| `DueDate` | DueDate | Documented | OK |
| `TotalAmt` | TotalAmt | Documented | OK |
| `VendorRef` | VendorRef | Documented | OK |
| `Balance` | Balance | Documented | OK |
| `Line[].BillableStatus` | Line Detail BillableStatus | Documented (in line detail types) | OK |
| `Line[].CustomerRef` | Line Detail CustomerRef | **NOT EXPLICIT** in superset | **MINOR** — superset lists AccountBasedExpenseLineDetail fields but doesn't call out CustomerRef by name in the Bill section |

### Bill Reconciliation Enrichment

| Bridge Enrichment | Superset Status | Issue |
|------------------|----------------|-------|
| Job name parsed from `CustomerRef.name` (split by `:`) | **MISSING FROM SUPERSET** | Bridge-specific transformation — QBO uses `:` separator for Parent:SubCustomer hierarchy |
| `qboBillable` (boolean from any line's BillableStatus) | **MISSING FROM SUPERSET** | Bridge-computed field |

---

## 7. QBO ESTIMATE DISCREPANCIES

### Bridge Usage vs Superset Section 10

The Bridge does NOT have a dedicated Estimate endpoint. Estimates are only referenced in:
- `attachment-upload` / `attachment-upload-smart` — valid entity types include `Estimate`
- Generic entity routes (`/qbo/:entity/:id`) can fetch Estimates

| Issue | Detail |
|-------|--------|
| No field extraction | Bridge never explicitly maps Estimate fields — passes raw objects |
| `TxnStatus` | Superset documents Pending/Accepted/Closed/Rejected but Bridge never reads this |
| `AcceptedBy`/`AcceptedDate` | Superset documents but Bridge never reads |
| `ExpirationDate` | Superset documents but Bridge never reads |

**Note:** BB apps (RevExp5, PorjExp5) likely consume Estimate data through the generic entity endpoint, but the Bridge doesn't validate or transform it.

---

## 8. QBO TIME ACTIVITY DISCREPANCIES

### Fields Bridge Extracts vs Superset Section 11

| Bridge Field | QBO Source | Superset Status | Issue |
|-------------|-----------|----------------|-------|
| `Id` | Id | Documented | OK |
| `TxnDate` | TxnDate | Documented | OK |
| `EmployeeRef` | EmployeeRef | Documented | OK |
| `CustomerRef` | CustomerRef | Documented | OK |
| `Hours` | Hours | Documented | OK |
| `Minutes` | Minutes | Documented | OK |
| `BillableStatus` | BillableStatus | Documented | OK |
| `ItemRef` | ItemRef | Documented | OK |
| `Description` | Description | Documented | OK |
| `StartTime` | StartTime | Documented | OK |
| `EndTime` | EndTime | Documented | OK |
| `Duration` | Duration | **MISSING FROM SUPERSET** | **MISSING** — Bridge reads `Duration` but superset doesn't list it. QBO TimeActivity has a Duration field (total seconds) |
| `HourlyRate` | HourlyRate | Documented | OK |

---

## 9. QBO COMPANY INFO DISCREPANCIES

### Bridge Usage vs Superset Section 13

The Bridge has `GET /qbo/company` which calls `SELECT * FROM CompanyInfo` and returns the full object. However:

| Issue | Detail |
|-------|--------|
| Only `CompanyName` extracted by name | Bridge service (`qbo-client-v2.js:486`) only reads `company.CompanyName` for status display |
| All other fields passthrough | Raw CompanyInfo object returned to clients — superset documents all fields but Bridge doesn't validate any |

**No field discrepancies** — Bridge passes the full object through. Superset Section 13 is accurate.

---

## 10. QBO PREFERENCES DISCREPANCIES

### Bridge Usage vs Superset Section 14

Bridge has `POST /qbo/preferences` which fetches full Preferences object and returns it raw.

| Issue | Detail |
|-------|--------|
| No field extraction | Bridge returns entire Preferences object without any field mapping |
| No discrepancies | Superset Section 14 documents all available fields — Bridge just passes them through |

---

## 11. QBO ATTACHABLE (NOT IN SUPERSET)

### **UNDOCUMENTED ENTITY** — The Bridge makes extensive use of QBO Attachable entity

The Bridge has 5 dedicated attachment endpoints plus attachment enrichment on invoices and reconciliation routes. The superset mentions Attachable only in passing (Section 17 entity list, "LOW" relevance).

**Bridge-extracted Attachable fields:**

| Field | Used In | Superset Status |
|-------|---------|----------------|
| `Id` | All attachment routes | Not documented as fields |
| `FileName` | All attachment routes | Not documented |
| `Size` | Upload verification, display | Not documented |
| `ContentType` | Upload, display | Not documented |
| `TempDownloadUri` | Download, display | Not documented |
| `FileAccessUri` | Display | Not documented |
| `MetaData.CreateTime` | Display | Not documented |
| `AttachableRef[].EntityRef.Type` | Filtering by entity | Not documented |
| `AttachableRef[].EntityRef.value` | Filtering by entity ID | Not documented |
| `Note` | Display | Not documented |

**Recommendation:** Add a dedicated Attachable section to the superset. The Bridge uses it heavily for invoice receipt validation, bill reconciliation, and chase reconciliation.

---

## 12. QBO REPORTS API (NOT IN SUPERSET)

### **UNDOCUMENTED** — Bridge uses QBO Reports API for reconciliation

The Bridge's `advanced.js` calls the QBO Reports API (`/v3/company/{id}/reports/TransactionList`) with columns:
- `tx_date`, `txn_type`, `doc_num`, `name`, `memo`, `account_name`, `subt_nat_amount`
- Filters by `cleared` status: Reconciled, Cleared, Uncleared

**Superset Section 17** lists Reports under "Query & Reporting" with "MEDIUM" relevance but doesn't document the TransactionList report fields.

---

## 13. QBO PAYMENT ENTITY (NOT IN SUPERSET DETAIL)

### Bridge Uses Payment Fields Not Documented in Detail

The Bridge fetches Payment entities to enrich invoices with PaymentDate:
- `Payment.Id`
- `Payment.TxnDate` (mapped to `PaymentDate` on invoice enrichment)

**Superset Section 12** lists Payment as a reference entity with key fields but doesn't call out the Bridge's specific usage pattern (fetching Payment.TxnDate to compute invoice PaymentDate).

---

## 14. QBT USER DISCREPANCIES

### Fields Bridge Extracts vs Superset Section 1 (QBT User Fields)

| Bridge Field | QBT Source | Superset Status | Issue |
|-------------|-----------|----------------|-------|
| `id` | id | Documented | OK |
| `first_name` | first_name | Documented | OK |
| `last_name` | last_name | Documented | OK |
| `display_name` | display_name | Documented | OK |
| `email` | email | Documented | OK |
| `group_id` | group_id | Documented as NOT USED | **DISCREPANCY** — Bridge extracts group_id in employee-dashboard and crew-calendar |
| `pto_balances` | pto_balances | Documented as NOT USED (volatile) | **DISCREPANCY** — Bridge actively reads pto_balances in employee-dashboard (extractPTOBalances helper) |

### Employee ID Mapping (Bridge-specific)

| Aspect | Detail | Superset Status |
|--------|--------|----------------|
| `employee-id-mapping.json` | 16 QBO↔QBT ID cross-references | **MISSING FROM SUPERSET** |
| `Employee_settings.json` aliases | Short names + credit card last 4 | **MISSING FROM SUPERSET** — these are BB enrichment fields (alias, creditCards) stored in Bridge config, not C1 |

**Note:** The employee alias/CC mapping in Bridge config overlaps with C1 enrichment fields (`alias`, `cardLast4`) but is maintained separately. This is a **data duplication risk**.

---

## 15. QBT TIMESHEET DISCREPANCIES

### Fields Bridge Extracts vs Superset Section 15

| Bridge Field | QBT Source | Superset Status | Issue |
|-------------|-----------|----------------|-------|
| `id` | id | Documented | OK |
| `user_id` | user_id | Documented | OK |
| `jobcode_id` | jobcode_id | Documented | OK |
| `type` | type | Documented | OK |
| `date` | date | Documented | OK |
| `duration` | duration | Documented | OK |
| `start` | start | Documented | OK |
| `end` | end | Documented | OK |
| `notes` | notes | Documented | OK |
| `on_the_clock` | on_the_clock | Documented | OK |
| `locked` | locked | Documented | OK |
| `created` | created | Documented | OK |
| `last_modified` | last_modified | Documented | OK |
| `location_id` | location_id | **MISSING FROM SUPERSET** — Bridge reads location_id in CSV export | **MISSING** — superset's Timesheet table has `location` (GPS object) but not `location_id` (reference to Location entity) |
| `created_by_user_id` | created_by_user_id | Documented | OK |
| `origin_hint` | origin_hint | **MISSING FROM SUPERSET** | **MISSING** — superset lists this in "unused" table but not in timesheet field table |

### Timesheet Transformations

| Bridge Transform | Detail | Superset Note |
|-----------------|--------|---------------|
| `duration/3600` → hours | Seconds to hours, rounded to 2 decimals | Not documented as a transformation pattern |
| OT detection (daily > 8h) | Bridge computes overtime from timesheet aggregation | Not in superset (Bridge-specific business logic) |
| Lunch jobcode detection | Uses settings.json `bbinc.jobcodes.lunch` (ID: 171969570) | Not in superset |

---

## 16. QBT JOBCODE DISCREPANCIES

### Fields Bridge Extracts vs Superset Section 4

| Bridge Field | QBT Source | Superset Status | Issue |
|-------------|-----------|----------------|-------|
| `id` | id | Documented | OK |
| `name` | name | Documented | OK |
| `short_code` | short_code | Documented | OK |
| `parent_id` | parent_id | Documented | OK |
| `type` | type | Documented | OK |
| `active` | active | Documented | OK |
| `billable` | billable | Documented | OK |
| `assigned_to_all` | assigned_to_all | Documented as NOT USED | **DISCREPANCY** — Bridge uses it in PUT /qbt/jobcode update |
| `has_children` | has_children | Documented | OK (but Bridge doesn't explicitly extract it — uses parent_id logic instead) |

### Jobcode Config (Bridge-specific)

| Aspect | Detail | Superset Status |
|--------|--------|----------------|
| `Jobcode_settings.json` aliases | 35 jobcode→customer alias mappings | **MISSING FROM SUPERSET** — these are BB-specific display aliases |
| Special jobcodes (lunch/sick/vacation) | Hardcoded in settings.json | Not in superset (Bridge config, not schema) |

---

## 17. QBT SCHEDULE / TIME-OFF / PTO DISCREPANCIES

### Bridge Uses These QBT Entities (employee-app.js)

| QBT Entity | Bridge Usage | Superset Section | Issue |
|-----------|-------------|-----------------|-------|
| Schedule Events | `/schedule_events` — crew-calendar, employee-dashboard | Section 15 (ScheduleEvents) | **OK but limited** — superset documents all fields; Bridge extracts: id, start, end, all_day, title, location, jobcode_id, assigned_user_ids, user_id |
| Time Off Requests | `/time_off_requests` — employee-dashboard, time-off-request | Section 15 (TimeOffRequests) | **OK** — superset documents fields |
| Time Off Request Entries | `/time_off_request_entries` — time-off-request create | Section 15 (via TimeOffRequests) | **MINOR GAP** — superset lists entries as sub-field of requests, but Bridge creates them as separate API calls |
| PTO Balances | `user.pto_balances` or `supplemental_data.pto_balances` | Superset Section 1 marks as NOT USED | **DISCREPANCY** — Bridge actively reads and transforms PTO balances |

### PTO Balance Fields (Bridge extracts, superset says NOT USED)

| Bridge Field | Source | Issue |
|-------------|--------|-------|
| `jobcode_id` | pto_balances object key or field | **MISSING detail** — superset just says "NOT USED (volatile)" |
| `jobcode_name` | supplemental_data lookup | |
| `balance` | seconds → hours conversion | |

---

## 18. QBT GEOLOCATIONS (NOT IN SUPERSET)

### **UNDOCUMENTED ENTITY** — Bridge fetches Geolocations

Bridge endpoint: `POST /qbt/geolocations` with auto-pagination (200/page)

The superset's QBT Complete Data Model (Section 15) does **not** include a Geolocations entity. This is a separate QBT API entity from Locations.

**Geolocation fields (from QBT API, not documented in superset):**
- `id`, `user_id`, `timestamp`, `latitude`, `longitude`, `accuracy`, `altitude`, `speed`, `device`

**Recommendation:** Add QBT Geolocations to superset Section 15.

---

## 19. QBT LOCATIONS vs SUPERSET

Bridge has `POST /qbt/locations` endpoint. Superset Section 15 documents Location fields. No field-level discrepancies identified — Bridge passes raw response.

---

## 20. VENDOR ALIAS SYSTEM (NOT IN SUPERSET)

### **UNDOCUMENTED** — Bridge maintains 119 vendor name aliases

`Vendor_settings.json` maps vendor name variations (e.g., "HOME DEPOT", "The Home Depot", "HOMEDEPOT.COM") to canonical short names (e.g., "HomeDepot").

This is used by Chase reconciliation and receipt matching but is **not documented anywhere in the superset**. It overlaps with the C1 Vendor enrichment field `aliases` (context_map type) but is maintained in a separate config file.

**Data duplication risk:** Same vendor aliases may exist in both Bridge config AND C1 enrichment.

---

## 21. CROSS-SYSTEM ID MAPPING (NOT IN SUPERSET)

### **UNDOCUMENTED** — Bridge maintains QBO↔QBT employee ID cross-reference

`employee-id-mapping.json` maps 16 employees between QBO IDs (1-228) and QBT IDs (2866540-7021552).

The superset documents both `qbo_id` and `qbt_id` as C1 columns but doesn't mention the Bridge-side mapping file. This creates a **single source of truth question** — is the Bridge config or C1 the authority?

---

## SUMMARY OF ALL DISCREPANCIES

### Critical (should be fixed in superset)

| # | Category | Issue |
|---|----------|-------|
| 1 | Employee.CostRate | **MISSING FROM SUPERSET** — QBO Employee has a CostRate field; Bridge extracts it |
| 2 | TimeActivity.Duration | **MISSING FROM SUPERSET** — QBO TimeActivity Duration field not listed |
| 3 | Timesheet.location_id | **MISSING FROM SUPERSET** — QBT Timesheet has location_id (ref to Location entity) |
| 4 | Attachable entity | **NO DEDICATED SECTION** — Bridge uses extensively; superset only lists in entity table |
| 5 | QBT Geolocations | **NOT IN SUPERSET** — Bridge fetches this entity; superset doesn't document it |
| 6 | Invoice line-level LinkedTxn | **MISSING FROM SUPERSET** — Bridge reads LinkedTxn at individual line level |
| 7 | Invoice line-level CustomerRef | **MISSING FROM SUPERSET** — Bridge parses job names from line.Detail.CustomerRef.name |
| 8 | PurchaseEx field | **MISSING FROM SUPERSET** — Bridge preserves this in purchase conversion |

### Important (status corrections needed)

| # | Category | Issue |
|---|----------|-------|
| 9 | 10 Employee "NOT USED" fields | Bridge extracts printOnCheckName, employeeNumber, billableTime, billRate, releasedDate, birthDate, gender, primaryAddr, mobile, ssnLastFour — all marked NOT USED |
| 10 | Employee.MetaData.CreateTime | Bridge extracts; superset says NOT USED |
| 11 | QBT User.group_id | Bridge extracts; superset says NOT USED |
| 12 | QBT User.pto_balances | Bridge actively reads; superset says NOT USED (volatile) |
| 13 | QBT Jobcode.assigned_to_all | Bridge uses in update; superset says NOT USED |

### Documentation Gaps (not errors, but worth adding)

| # | Category | Issue |
|---|----------|-------|
| 14 | Bridge enrichment fields | PaymentDate, AttachmentCount, Attachments[] on invoices — computed by Bridge |
| 15 | Reports API (TransactionList) | Bridge uses for reconciliation; not documented in superset |
| 16 | Vendor alias system | 119 aliases in Bridge config; overlaps with C1 enrichment |
| 17 | Employee ID mapping file | QBO↔QBT cross-ref maintained in Bridge AND C1 |
| 18 | Employee/Jobcode alias configs | Short names in Bridge config; overlaps with C1 enrichment |
| 19 | Special jobcode IDs | Lunch (171969570), Sick (56172044), Vacation (56172048) in Bridge config |
| 20 | QBO Batch API usage | Bridge uses /v3/batch endpoint with 30-item chunks |
| 21 | Timesheet.origin_hint | In superset "unused" list but not in timesheet field table |

### Data Duplication Risks

| # | Data | Bridge Location | C1 Location | Risk |
|---|------|----------------|-------------|------|
| 1 | Employee aliases | Employee_settings.json | enrichment.alias | May drift apart |
| 2 | Employee CC last4 | Employee_settings.json creditCards | enrichment.cardLast4 | May drift apart |
| 3 | Vendor aliases | Vendor_settings.json | enrichment.aliases (context_map) | May drift apart |
| 4 | Jobcode aliases | Jobcode_settings.json | enrichment fields | May drift apart |
| 5 | QBO↔QBT ID mapping | employee-id-mapping.json | C1 qbo_id + qbt_id columns | May drift apart |

---

*Cross-references: BB_QBO_QBT_FIELD_SUPERSET.md v2.0, BB_PLATFORM_SCHEMA-v2.md v2.23*
*Source: Mini_API_Bridge server/routes/ (all active .js files), config/ (all .json files)*
