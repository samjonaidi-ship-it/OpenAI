# BB Field Statistics | v1.1 | 2026-03-14 | BB

> **Source:** BB_QBO_QBT_FIELD_SUPERSET.md v3.0 + BB_BRIDGE_SUPERSET_AUDIT.md v1.1
> **Scope:** Every field documented in the superset, classified by source system and utilization status
>
> **Changelog v1.1 (2026-03-14):** Reconciled with BB_BRIDGE_SUPERSET_AUDIT.md v1.1. Corrected 10 QBO Employee fields from NOT USED to BRIDGE PASSTHROUGH (Bridge actively extracts them). Updated grand totals: BRIDGE PASSTHROUGH 28→38, NOT USED 286→276. Updated utilization percentages accordingly. Fixed Employee (QBO) corrected breakdown. Corrected Master Summary Table counts.

---

## GRAND TOTALS

| Metric | Count |
|--------|-------|
| **Total API fields documented** | **371** |
| QBO fields (across all entities) | 265 |
| QBT fields (across all entities) | 106 |
| **BB-only enrichment fields** | **76** |
| **Grand total (API + enrichment)** | **447** |

### Utilization Breakdown (API fields only)

| Status | Count | % of 371 |
|--------|-------|----------|
| **USED** (stored in C1) | 57 | 15.4% |
| **BRIDGE PASSTHROUGH** (Bridge extracts/serves but not in C1) | 38 | 10.2% |
| **NOT USED** (available but untouched) | 276 | 74.4% |

> **Note (v1.1):** BB_BRIDGE_SUPERSET_AUDIT.md v1.1 identified 10 QBO Employee fields (PrintOnCheckName, EmployeeNumber, BillableTime, BillRate, CostRate, ReleasedDate, BirthDate, Gender, PrimaryAddr components, Mobile, SSN last 4) that the Bridge actively extracts via `/qbo/employee/details` but were originally classified as NOT USED. These are now correctly classified as BRIDGE PASSTHROUGH.

### Combined Utilization (USED + BRIDGE)

| Metric | Count | % of 371 |
|--------|-------|----------|
| Actively utilized (C1 + Bridge) | **95** | **25.6%** |
| Available but unused | **276** | **74.4%** |

---

## BY ENTITY: QBO NAMED LIST ENTITIES (C1 tables)

### 1. Employee (QBO)

| Status | Count | Fields |
|--------|-------|--------|
| USED (in C1) | 10 | Id, SyncToken, MetaData.LastUpdatedTime, DisplayName, GivenName, FamilyName, PrimaryEmailAddr, PrimaryPhone, HiredDate, Active |
| BRIDGE PASSTHROUGH | 13 | MetaData.CreateTime, PrintOnCheckName, Mobile, PrimaryAddr (Line1/City/State/Zip), SSN (last 4), EmployeeNumber, ReleasedDate, BirthDate, Gender, BillableTime, BillRate, CostRate |
| NOT USED | 5 | MiddleName, Title, Suffix, Organization, CustomField[], V4IDPseudonym |
| **Total QBO Employee** | **28** | |

### 2. Employee (QBT Users)

| Status | Count |
|--------|-------|
| USED (in C1) | 8 |
| BRIDGE PASSTHROUGH | 2 |
| NOT USED | 15 |
| **Total** | **25** |

**USED:** id, first_name, last_name, display_name, email, hire_date, active, salaried
**BRIDGE:** group_id, pto_balances
**NOT USED:** email_verified, username, mobile_number, employee_number, term_date, exempt, group_name, pay_rate, pay_interval, payroll_id, submitted_to, approved_to, manager_of_group_ids, permissions, profile_image_url, last_modified, last_active, created, client_url, company_name, require_password_change, customfields

### 3. Employee BB Enrichment: **28 fields**

### Employee Combined

| Category | Count |
|----------|-------|
| QBO API fields | 28 |
| QBT API fields | 25 |
| BB enrichment | 28 |
| **Total Employee fields** | **81** |
| Utilized (USED + BRIDGE) | 33 (40.7% of API) |

---

### 4. Customer (QBO)

| Status | Count |
|--------|-------|
| USED (in C1) | 14 |
| BRIDGE PASSTHROUGH | 0 |
| NOT USED | 19 |
| **Total** | **33** |

**USED:** Id, SyncToken, MetaData.LastUpdatedTime, DisplayName, CompanyName, GivenName, FamilyName, PrimaryPhone, AlternatePhone, Mobile, PrimaryEmailAddr, BillAddr, Notes, Active
**NOT USED:** MetaData.CreateTime, MiddleName, Title, Suffix, FullyQualifiedName, PrintOnCheckName, Fax, WebAddr, ShipAddr, Balance, BalanceWithJobs, OpenBalanceDate, CreditLimit, OverDueBalance, TotalRevenue, TotalExpense, Job, BillWithParent, ParentRef, Level, IsProject, Taxable, TaxExemptionReasonId, PreferredDeliveryMethod, PaymentMethodRef, SalesTermRef, CurrencyRef, AcctNum, ResaleNum, CustomField[]

### Customer BB Enrichment: **6 fields** + 2 BB-only (name2, email2)

### Customer Combined

| Category | Count |
|----------|-------|
| QBO API fields | 33 |
| BB enrichment | 8 |
| **Total Customer fields** | **41** |
| Utilized | 14 (42.4% of API) |

---

### 5. Vendor (QBO)

| Status | Count |
|--------|-------|
| USED (in C1) | 10 |
| BRIDGE PASSTHROUGH | 0 |
| NOT USED | 17 |
| **Total** | **27** |

**USED:** Id, SyncToken, MetaData.LastUpdatedTime, DisplayName, CompanyName, PrimaryPhone, PrimaryEmailAddr, BillAddr, Active, Vendor1099

### Vendor BB Enrichment: **15 fields** (13 enrichment + 1 BB-only short_name + vendor alias system)

### Vendor Combined

| Category | Count |
|----------|-------|
| QBO API fields | 27 |
| BB enrichment | 15 |
| **Total Vendor fields** | **42** |
| Utilized | 10 (37.0% of API) |

---

### 6. Jobcode (QBT)

| Status | Count |
|--------|-------|
| USED (in C1) | 8 |
| BRIDGE PASSTHROUGH | 1 |
| NOT USED | 8 |
| **Total** | **17** |

**USED:** id, name, short_code, parent_id, type, active, has_children, billable
**BRIDGE:** assigned_to_all

### Jobcode BB Enrichment: **12 fields**

### Jobcode Combined

| Category | Count |
|----------|-------|
| QBT API fields | 17 |
| BB enrichment | 12 |
| **Total Jobcode fields** | **29** |
| Utilized | 9 (52.9% of API) |

---

### 7. Properties (BB-created entity)

| Category | Count |
|----------|-------|
| QBO-derived fields | 5 |
| Geocoding/RE API fields | 8 |
| BB enrichment | 7 |
| **Total Property fields** | **20** |
| All fields utilized | 20 (100%) |

---

## BY ENTITY: QBO TRANSACTION ENTITIES (Bridge runtime, not C1)

### 8. Invoice (QBO)

| Status | Count |
|--------|-------|
| Bridge reads | 13 |
| Available/unused | 25 |
| **Total (entity-level)** | **38** |
| Line-level fields | 8 |
| Line detail types | 5 |
| **Total incl. lines** | **51** |

**Bridge reads:** Id, SyncToken, MetaData, DocNumber, TxnDate, DueDate, CustomerRef, Line[], TotalAmt, Balance, LinkedTxn[], Deposit + line-level (Id, LineNum, Amount, Description, DetailType, LinkedTxn[], CustomerRef, ServiceDate)

### 9. Purchase (QBO)

| Status | Count |
|--------|-------|
| Bridge reads | 10 |
| Available/unused | 8 |
| **Total** | **18** |
| Line detail types | 2 |

**Bridge reads:** Id, SyncToken, MetaData, PaymentType, AccountRef, EntityRef, TxnDate, DocNumber, TotalAmt, Line[], Credit, CurrencyRef, CustomField, PurchaseEx, PrivateNote

### 10. Bill (QBO)

| Status | Count |
|--------|-------|
| Bridge reads | 9 |
| Available/unused | 10 |
| **Total** | **19** |

**Bridge reads:** Id, SyncToken, MetaData, VendorRef, TxnDate, DueDate, DocNumber, TotalAmt, Balance, Line[] (incl. CustomerRef, BillableStatus)

### 11. Estimate (QBO)

| Status | Count |
|--------|-------|
| Bridge reads (generic) | 3 |
| Available/unused | 21 |
| **Total** | **24** |

**Bridge reads (via generic entity):** Id, DocNumber, TxnDate (+ full passthrough)

### 12. TimeActivity (QBO)

| Status | Count |
|--------|-------|
| Bridge reads | 12 |
| Available/unused | 10 |
| **Total** | **22** |

**Bridge reads:** Id, SyncToken, MetaData, EmployeeRef, CustomerRef, TxnDate, Hours, Minutes, Duration, BillableStatus, ItemRef, Description, StartTime, EndTime

### 13. Item (QBO)

| Status | Count |
|--------|-------|
| Bridge reads (list passthrough) | 3 |
| Available/unused | 24 |
| **Total** | **27** |

### 14. Attachable (QBO)

| Status | Count |
|--------|-------|
| Bridge reads | 12 |
| Available/unused | 10 |
| **Total** | **22** |

**Bridge reads:** Id, SyncToken, MetaData, FileName, ContentType, Size, Note, FileAccessUri, TempDownloadUri, AttachableRef[] (EntityRef.Type, EntityRef.value, IncludeOnSend)

### 15. Additional Transaction Entities (QBO reference)

| Entity | Fields Listed | Bridge Usage |
|--------|--------------|-------------|
| Credit Memo | ~15 | Generic passthrough |
| Payment | ~12 | Bridge reads Id + TxnDate for invoice enrichment |
| BillPayment | ~11 | Referenced in bill recon |
| Deposit | ~8 | Generic passthrough |
| Transfer | ~6 | Generic passthrough |
| JournalEntry | ~10 | Generic passthrough |
| SalesReceipt | ~18 | Generic passthrough |
| RefundReceipt | ~17 | Generic passthrough |
| PurchaseOrder | ~16 | Generic passthrough |
| VendorCredit | ~12 | Generic passthrough |
| **Subtotal** | **~125** | Mostly passthrough |

---

## BY ENTITY: QBO COMPANY-LEVEL ENTITIES

### 16. CompanyInfo (QBO)

| Status | Count |
|--------|-------|
| Bridge reads (CompanyName only) | 1 |
| Available/passthrough | 19 |
| **Total** | **20** |

### 17. Preferences (QBO)

| Section | Fields |
|---------|--------|
| AccountingInfoPrefs | 9 |
| SalesFormsPrefs | 20 |
| VendorAndPurchasesPrefs | 5 |
| TimeTrackingPrefs | 5 |
| TaxPrefs | 4 |
| CurrencyPrefs | 2 |
| ProductAndServicesPrefs | 5 |
| EmailMessagesPrefs | 4 |
| ReportPrefs | 2 |
| OtherPrefs | 1 |
| **Total Preferences fields** | **57** |
| Bridge reads | Full passthrough (all 57) |

---

## BY ENTITY: QBT ENTITIES

### 18. Timesheet (QBT)

| Status | Count |
|--------|-------|
| Bridge reads | 13 |
| Available/unused | 5 |
| **Total** | **18** |

**Bridge reads:** id, user_id, jobcode_id, locked, type, notes, start, end, date, duration, on_the_clock, location_id, created, last_modified

### 19. Location (QBT)

| Total fields | 17 |
|--------------|------|
| Bridge reads | Passthrough (POST /qbt/locations) |

### 20. Geolocation (QBT)

| Total fields | 11 |
|--------------|------|
| Bridge reads | Passthrough (POST /qbt/geolocations) |

### 21. Other QBT Entities

| Entity | Fields | Bridge Usage |
|--------|--------|-------------|
| Groups | 5 | Not directly |
| CustomFields | 11 | Not directly |
| CustomFieldItems | 6 | Not directly |
| Schedule Calendars | 4 | Not directly |
| Schedule Events | 13 | employee-app reads: id, start, end, all_day, title, location, jobcode_id, assigned_user_ids |
| Time Off Requests | 7 | employee-app reads: id, user_id, status, entries, created, notes |
| Projects | 10 | Not directly |
| Estimates (QBT) | 6 | Not directly |
| Notifications | 6 | Not directly |
| Reminders | 9 | Not directly |
| Files | 7 | Not directly |
| **Subtotal** | **84** | ~20 actively read |

### 22. QBT effective_settings

| Section | Settings |
|---------|----------|
| General | 8 |
| Time Entry | 8 |
| Overtime | 7 |
| Breaks | 4 |
| Scheduling | 3 |
| **Total** | **30** |
| Bridge reads | 0 (not fetched by Bridge) |

---

## MASTER SUMMARY TABLE

### By Source System

| Source | Entities | Total Fields | Used in C1 | Bridge Reads | Unused |
|--------|----------|-------------|------------|-------------|--------|
| **QBO Named Lists** | 4 (Employee, Customer, Vendor, Item) | 115 | 42 | 23 | 50 |
| **QBO Transactions** | 7 (Invoice, Purchase, Bill, Estimate, TimeActivity, Attachable, +ref) | 304 | 0 | ~60 | ~244 |
| **QBO Company** | 2 (CompanyInfo, Preferences) | 77 | 0 | 58 | 19 |
| **QBT Core** | 3 (Users, Jobcodes, Timesheets) | 60 | 16 | 16 | 28 |
| **QBT Extended** | 10 (Location, Geo, Schedule, PTO, etc.) | 112 | 0 | ~20 | ~92 |
| **QBT Settings** | 1 (effective_settings) | 30 | 0 | 0 | 30 |
| **TOTAL API** | **27 entities** | **698** | **58** | **~177** | **~463** |
| **BB Enrichment** | 5 (Emp, Cust, Vendor, Jobcode, Property) | 76 | 76 | — | — |
| **GRAND TOTAL** | **27+ entities** | **774** | **134** | **~177** | **~463** |

### Utilization Rate by System

| System | Total Fields | Actively Used | Utilization % |
|--------|-------------|---------------|---------------|
| QBO (all) | 496 | ~123 | **24.8%** |
| QBT (all) | 202 | ~52 | **25.7%** |
| Combined API | 698 | ~175 | **25.1%** |
| BB Enrichment | 76 | 76 | **100%** |

### By Utilization Category

| Category | Count | Description |
|----------|-------|-------------|
| **Stored in C1** | 58 | Persisted to BB's cache layer (employees, customers, vendors, jobcodes, properties) |
| **Bridge reads/serves** | ~117 | Bridge extracts specific fields for app consumption (invoices, bills, purchases, timesheets, attachments, employee details, reconciliation) |
| **Bridge passthrough** | ~60 | Bridge returns full API objects; consuming apps may read any field |
| **Completely unused** | ~463 | Available in API but neither Bridge nor C1 touches them |
| **BB-only (enrichment)** | 76 | Fields that exist only in BB, added by users via Data Manager |

---

## TOP UTILIZATION OPPORTUNITIES

### High-Value Unused Fields (quick wins — already available, no new API calls)

| # | Entity | Field | Why Valuable | Effort |
|---|--------|-------|-------------|--------|
| 1 | Customer | Balance | Show outstanding balance in Data Manager | Zero — already in passthrough |
| 2 | Customer | TotalRevenue | Lifetime revenue per customer | Zero — already in passthrough |
| 3 | Vendor | Balance | Outstanding AP per vendor | Zero — already in passthrough |
| 4 | Employee | submitted_to / approved_to | Timesheet approval status | Zero — already in QBT passthrough |
| 5 | Employee | profile_image_url | Employee photos | Zero — already in QBT passthrough |
| 6 | Employee | exempt | OT exemption (bridge already does OT detection) | Zero — bridge already fetches users |
| 7 | CompanyInfo | FiscalYearStartMonth | Align reports to fiscal year | Zero — bridge fetches full object |
| 8 | CompanyInfo | EmployerId | EIN for tax/compliance | Zero — bridge fetches full object |
| 9 | Preferences | TimeTrackingPrefs | Align BB time rules with QBO | Zero — bridge fetches full object |
| 10 | QBT effective_settings | All | Overtime thresholds, break rules | One new Bridge endpoint needed |

---

*Cross-references: BB_QBO_QBT_FIELD_SUPERSET.md v3.0, BB_BRIDGE_SUPERSET_AUDIT.md v1.1, BB_CROSS_DOC_AUDIT.md v1.5*
