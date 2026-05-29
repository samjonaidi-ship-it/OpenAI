# BB QBO/QBT Field Superset | v3.0 | 2026-03-14 | BB

> **Purpose:** Comprehensive mapping of what fields QBO and QBT APIs make available for each entity BB uses, compared to what BB currently stores in C1 tables. Identifies what BB uses, what's available but unused, and what's BB-only (enrichment).
>
> **Sources:** Intuit Developer API docs, QBO XSD schemas (IntuitBaseTypes.xsd, Finance.xsd), QuickBooks Time API Reference, BB_PLATFORM_SCHEMA-v2.md v2.23.
>
> **API Capabilities Note:** Neither QBO nor QBT provides field-level change history or previous record versions via API. QBO offers SyncToken (optimistic lock counter), MetaData timestamps, and CDC (30-day lookback, current state only, no diffs). QBT offers last_modified timestamps and modified_since filtering. The QBO Audit Log is UI-only (not API-accessible) and cannot filter by entity.

---

## 1. EMPLOYEES

**QBO Source:** Employee entity (`/v3/company/{realmId}/employee/{id}`)
**QBT Source:** Users endpoint (`/api/v1/users`)

### QBO Employee Fields

| QBO Field | Type | BB Column | Status | Notes |
|-----------|------|-----------|--------|-------|
| **Id** | String | `qbo_id` | USED | QBO unique identifier |
| **SyncToken** | String | `qbo_sync_token` | USED | Optimistic lock counter (increments on each update) |
| **MetaData.CreateTime** | DateTime | — | BRIDGE PASSTHROUGH | When record was created in QBO. Bridge extracts in `/qbo/employee/details` |
| **MetaData.LastUpdatedTime** | DateTime | `qbo_last_updated` | USED | When record was last modified in QBO |
| **DisplayName** | String (100) | `display_name` | USED | Must be unique across Customer/Employee/Vendor |
| **GivenName** | String (25) | `first_name` | USED | |
| **MiddleName** | String (25) | — | NOT USED | |
| **FamilyName** | String (25) | `last_name` | USED | |
| **Title** | String (16) | — | NOT USED | Mr., Mrs., etc. |
| **Suffix** | String (16) | — | NOT USED | Jr., Sr., etc. |
| **PrintOnCheckName** | String (110) | — | BRIDGE PASSTHROUGH | Name on checks. Bridge extracts in `/qbo/employee/details` |
| **PrimaryEmailAddr** | Email | `email` | USED | |
| **PrimaryPhone** | Phone | `phone` | USED | |
| **Mobile** | Phone | — | BRIDGE PASSTHROUGH | Mobile phone number. Bridge extracts in `/qbo/employee/details` |
| **PrimaryAddr** | Address | — | BRIDGE PASSTHROUGH | Home address (Line1, City, State, Zip, Country). Bridge extracts Line1, City, State, Zip |
| **SSN** | String | — | BRIDGE PASSTHROUGH | Social Security Number (write-only, masked on read). Bridge extracts last 4 digits only |
| **EmployeeNumber** | String (99) | — | BRIDGE PASSTHROUGH | Bridge extracts in `/qbo/employee/details` |
| **HiredDate** | Date | `hire_date` | USED | |
| **ReleasedDate** | Date | — | BRIDGE PASSTHROUGH | Termination date. Bridge extracts in `/qbo/employee/details` |
| **BirthDate** | Date | — | BRIDGE PASSTHROUGH | Bridge extracts in `/qbo/employee/details` |
| **Gender** | Enum | — | BRIDGE PASSTHROUGH | Male/Female. Bridge extracts in `/qbo/employee/details` |
| **Active** | Boolean | `is_active` | USED | |
| **BillableTime** | Boolean | — | BRIDGE PASSTHROUGH | Whether time is billable. Bridge extracts in `/qbo/employee/details` |
| **BillRate** | Decimal | — | BRIDGE PASSTHROUGH | QBO bill rate. Bridge extracts; BB also has enrichment.billRate |
| **CostRate** | Decimal | — | BRIDGE PASSTHROUGH | QBO cost rate (labor cost per hour). Bridge extracts in `/qbo/employee/details`. BB also has enrichment.costRate |
| **Organization** | Boolean | — | NOT USED | |
| **CustomField[]** | Custom | — | NOT USED | QBO custom fields (limited, recently expanded 2025) |
| **V4IDPseudonym** | String | — | NOT USED | Internal Intuit ID |

### QBT User Fields

| QBT Field | Type | BB Column | Status | Notes |
|-----------|------|-----------|--------|-------|
| **id** | Integer | `qbt_id` | USED | QBT unique identifier |
| **first_name** | String | `first_name` | USED (merged with QBO) | |
| **last_name** | String | `last_name` | USED (merged with QBO) | |
| **display_name** | String | `display_name` | USED (merged with QBO) | |
| **email** | String | `email` | USED (merged with QBO) | |
| **email_verified** | Boolean | — | NOT USED | |
| **username** | String | — | NOT USED | QBT login username |
| **mobile_number** | String | — | NOT USED | |
| **employee_number** | String | — | NOT USED | |
| **hire_date** | Date | `hire_date` | USED (merged with QBO) | Format: YYYY-MM-DD |
| **term_date** | Date | — | NOT USED | Termination date |
| **active** | Boolean | `is_active` | USED (merged with QBO) | |
| **salaried** | Boolean | `is_salaried` | USED | From id-crossref |
| **exempt** | Boolean | — | NOT USED | Overtime exempt status |
| **group_id** | Integer | — | BRIDGE PASSTHROUGH | QBT group assignment. Bridge extracts in employee-dashboard and crew-calendar |
| **group_name** | String | — | NOT USED | QBT group name |
| **pay_rate** | Decimal | — | NOT USED | QBT pay rate (BB uses enrichment.payRate) |
| **pay_interval** | String | — | NOT USED | "hour", "year" |
| **payroll_id** | String | — | NOT USED | External payroll system ID |
| **pto_balances** | Object | — | BRIDGE PASSTHROUGH (volatile) | Bridge reads live in employee-dashboard (extractPTOBalances). Not persisted to C1 |
| **submitted_to** | DateTime | — | NOT USED | Timesheets submitted through date |
| **approved_to** | DateTime | — | NOT USED | Timesheets approved through date |
| **manager_of_group_ids** | Array | — | NOT USED | |
| **permissions** | Object | — | NOT USED | Admin, mobile, reports, manage_timesheets, etc. |
| **profile_image_url** | String | — | NOT USED | |
| **last_modified** | DateTime | — | NOT USED | QBT last modification timestamp |
| **last_active** | DateTime | — | NOT USED | QBT last activity timestamp |
| **created** | DateTime | — | NOT USED | QBT creation timestamp |
| **client_url** | String | — | NOT USED | |
| **company_name** | String | — | NOT USED | |
| **require_password_change** | Boolean | — | NOT USED | |
| **customfields** | Object | — | NOT USED | QBT custom fields |

### BB-Only Enrichment Fields (28 fields)

| Enrichment Field | Type | Used By | Notes |
|-----------------|------|---------|-------|
| defaultCrew | select | CalExp5 | Crew assignment: A, B, C |
| scheduleColor | color | CalExp5 | Calendar display color |
| alias | text | TS_Exp5 | Short display name |
| payType | select | TS_Exp5 | hourly, salary, regular |
| payRate | number | TS_Exp5 | Hourly pay rate |
| billRate | number | TS_Exp5 | Hourly bill rate |
| workScheduleType | select | TS_Exp5 | full-time, part-time |
| workDays | tags | TS_Exp5 | Mon-Fri selection |
| workStartTime | text | TS_Exp5 | HH:MM |
| workEndTime | text | TS_Exp5 | HH:MM |
| allowedWindowEarliest | text | TS_Exp5 | HH:MM |
| allowedWindowLatest | text | TS_Exp5 | HH:MM |
| lunchDefaultStart | text | TS_Exp5 | HH:MM |
| lunchDefaultEnd | text | TS_Exp5 | HH:MM |
| lunchDuration | number | TS_Exp5 | Minutes |
| lunchRequired | boolean | TS_Exp5 | |
| lunchRequiredAfterHours | number | TS_Exp5 | |
| mileageDailyAllowance | number | TS_Exp5 | |
| mileageVehicleType | select | TS_Exp5 | company, personal, none |
| mileageHomeZip | text | TS_Exp5 | |
| payPeriodTargetHours | number | TS_Exp5 | |
| overtimeApproved | boolean | TS_Exp5 | |
| costRate | number | RevExp5 | Labor cost rate |
| cardLast4 | text | Chase | Chase card last 4 digits |
| certifications | tags | Cross-app | OSHA-30, etc. |
| vehicleAssignment | text | Cross-app | Truck ID |
| emergencyContact | text | Cross-app | Phone number |
| tShirtSize | select | Cross-app | |
| role | select | Cross-app | crew, lead, foreman, pm, owner |

---

## 2. CUSTOMERS

**QBO Source:** Customer entity (`/v3/company/{realmId}/customer/{id}`)
**QBT Source:** N/A (QBT does not have a customer entity)

### QBO Customer Fields

| QBO Field | Type | BB Column | Status | Notes |
|-----------|------|-----------|--------|-------|
| **Id** | String | `qbo_id` | USED | |
| **SyncToken** | String | `qbo_sync_token` | USED | |
| **MetaData.CreateTime** | DateTime | — | NOT USED | |
| **MetaData.LastUpdatedTime** | DateTime | `qbo_last_updated` | USED | |
| **DisplayName** | String (500) | `display_name` | USED | Must be unique |
| **CompanyName** | String (500) | `company_name` | USED | |
| **GivenName** | String (25) | `name1` | USED | Mapped as first homeowner name |
| **MiddleName** | String (25) | — | NOT USED | |
| **FamilyName** | String (25) | `last_name` | USED | |
| **Title** | String (16) | — | NOT USED | |
| **Suffix** | String (16) | — | NOT USED | |
| **FullyQualifiedName** | String | — | NOT USED | Parent:Customer:Job hierarchy |
| **PrintOnCheckName** | String (110) | — | NOT USED | |
| **PrimaryPhone** | Phone | `phone1` | USED | |
| **AlternatePhone** | Phone | `phone2` | USED | |
| **Mobile** | Phone | `mobile` | USED | PorjExp5 syncs this |
| **Fax** | Phone | — | NOT USED | |
| **PrimaryEmailAddr** | Email | `email1` | USED | |
| **WebAddr** | URL | — | NOT USED | Website |
| **BillAddr** | Address | `address`, `city`, `state`, `zip` | USED | Billing address components |
| **ShipAddr** | Address | — | NOT USED | Shipping address |
| **Notes** | String (1024) | `notes` | USED | Free-form notes |
| **Active** | Boolean | `is_active` | USED | |
| **Balance** | Decimal | — | NOT USED | Current open balance |
| **BalanceWithJobs** | Decimal | — | NOT USED | Balance including sub-jobs |
| **OpenBalanceDate** | Date | — | NOT USED | |
| **CreditLimit** | Decimal | — | NOT USED | |
| **OverDueBalance** | Decimal | — | NOT USED | |
| **TotalRevenue** | Decimal | — | NOT USED | Read-only lifetime revenue |
| **TotalExpense** | Decimal | — | NOT USED | Read-only lifetime expense |
| **Job** | Boolean | — | NOT USED | Is this a sub-customer/job? |
| **BillWithParent** | Boolean | — | NOT USED | |
| **ParentRef** | Reference | — | NOT USED | Parent customer ID |
| **Level** | Integer | — | NOT USED | Hierarchy depth |
| **IsProject** | Boolean | — | NOT USED | QBO Projects feature |
| **Taxable** | Boolean | — | NOT USED | |
| **TaxExemptionReasonId** | Integer | — | NOT USED | |
| **PreferredDeliveryMethod** | Enum | — | NOT USED | Print, Email, None |
| **PaymentMethodRef** | Reference | — | NOT USED | |
| **SalesTermRef** | Reference | — | NOT USED | Net 30, etc. |
| **CurrencyRef** | Reference | — | NOT USED | |
| **AcctNum** | String (15) | — | NOT USED | Account number |
| **ResaleNum** | String | — | NOT USED | Resale number |
| **CustomField[]** | Custom | — | NOT USED | |

### BB-Only Fields

| BB Column | Source | Notes |
|-----------|-------|-------|
| `name2` | Manual | Second homeowner name (couples) |
| `email2` | Manual | Second email |

### BB-Only Enrichment Fields (6 fields)

| Enrichment Field | Type | Used By |
|-----------------|------|---------|
| preferredContact | select | BB-DocEngine |
| referralSource | text | BB-DocEngine |
| customerType | select | BB-DocEngine |
| tags | tags | BB-DocEngine |
| revenueCategory | select | RevExp5 |
| paymentTerms | select | RevExp5 |

---

## 3. VENDORS

**QBO Source:** Vendor entity (`/v3/company/{realmId}/vendor/{id}`)
**QBT Source:** N/A

### QBO Vendor Fields

| QBO Field | Type | BB Column | Status | Notes |
|-----------|------|-----------|--------|-------|
| **Id** | String | `qbo_id` | USED | |
| **SyncToken** | String | `qbo_sync_token` | USED | |
| **MetaData.CreateTime** | DateTime | — | NOT USED | |
| **MetaData.LastUpdatedTime** | DateTime | `qbo_last_updated` | USED | |
| **DisplayName** | String (500) | `display_name` | USED | Must be unique |
| **CompanyName** | String (500) | `company` | USED | |
| **GivenName** | String (25) | — | NOT USED | Vendor contact first name |
| **MiddleName** | String (25) | — | NOT USED | |
| **FamilyName** | String (25) | — | NOT USED | Vendor contact last name |
| **Title** | String (16) | — | NOT USED | |
| **Suffix** | String (16) | — | NOT USED | |
| **PrintOnCheckName** | String (110) | — | NOT USED | |
| **PrimaryPhone** | Phone | `phone` | USED | |
| **AlternatePhone** | Phone | — | NOT USED | |
| **Mobile** | Phone | — | NOT USED | |
| **Fax** | Phone | — | NOT USED | |
| **PrimaryEmailAddr** | Email | `email` | USED | |
| **WebAddr** | URL | — | NOT USED | Website |
| **BillAddr** | Address | `address`, `city`, `state`, `zip` | USED | |
| **Active** | Boolean | `is_active` | USED | |
| **Vendor1099** | Boolean | `is_1099` | USED | Independent contractor flag |
| **Balance** | Decimal | — | NOT USED | Open balance (unpaid amount) |
| **AcctNum** | String (15) | — | NOT USED | Account number |
| **TaxIdentifier** | String | — | NOT USED | Tax ID / EIN |
| **BillRate** | Decimal | — | NOT USED | QBO bill rate |
| **TermRef** | Reference | — | NOT USED | Payment terms |
| **CurrencyRef** | Reference | — | NOT USED | |
| **APAccountRef** | Reference | — | NOT USED | Accounts Payable account |
| **BusinessNumber** | String | — | NOT USED | CA/UK only |
| **HasTPAR** | Boolean | — | NOT USED | Australia only |
| **CustomField[]** | Custom | — | NOT USED | |

### BB-Only Fields

| BB Column | Source | Notes |
|-----------|-------|-------|
| `short_name` | PorjExp5/DocEngine | Short display name ("AcePortable") |

### BB-Only Enrichment Fields (13 fields)

| Enrichment Field | Type | Used By |
|-----------------|------|---------|
| trade | select | DocEngine, PorjExp5 |
| license | text | DocEngine, PorjExp5 |
| keywords | text | DocEngine, PorjExp5 |
| notes | text | DocEngine, PorjExp5 |
| isSub | boolean | PorjExp5 |
| inVendorsDir | boolean | PorjExp5 |
| autoTrade | text | PorjExp5 |
| _userEdited | object | DocEngine |
| aliases | context_map | GS_Receipts, Chase, InvVal2 |
| defaultJobcode | text | GS_Receipts |
| chaseCategory | select | Chase |
| receiptFilenamePatterns | tags | InvVal2 |
| paymentMethod | select | Cross-app |
| w9OnFile | boolean | Cross-app |
| insuranceExpiry | date | Cross-app |

---

## 4. WORK JOBCODES

**QBO Source:** N/A (QBO has Item entity for services, not jobcodes)
**QBT Source:** Jobcodes endpoint (`/api/v1/jobcodes`)

### QBT Jobcode Fields

| QBT Field | Type | BB Column | Status | Notes |
|-----------|------|-----------|--------|-------|
| **id** | Integer | `qbt_id` | USED | |
| **name** | String | `name` | USED | Full jobcode name |
| **short_code** | String | `short_name` | USED | Short code/abbreviation |
| **parent_id** | Integer | `parent_id` | USED | 0 if top-level |
| **type** | Enum | `jobcode_type` | USED | regular, pto, unpaid_break, paid_break |
| **active** | Boolean | `is_active` | USED | |
| **has_children** | Boolean | `has_children` | USED | |
| **billable** | Boolean | `billable` | USED | |
| **billable_rate** | Decimal | — | NOT USED | QBT billable rate |
| **assigned_to_all** | Boolean | — | BRIDGE PASSTHROUGH | Whether assigned to all employees. Bridge uses in PUT /qbt/jobcode |
| **last_modified** | DateTime | — | NOT USED | QBT modification timestamp |
| **created** | DateTime | — | NOT USED | QBT creation timestamp |
| **customfields** | Object | — | NOT USED | QBT custom fields |
| **filtered_customfielditems** | Object | — | NOT USED | |
| **required_customfields** | Array | — | NOT USED | |
| **locations** | Array | — | NOT USED | Associated locations |
| **project_id** | Integer | — | NOT USED | QBT Projects integration |

### BB-Only Enrichment Fields (12 fields)

| Enrichment Field | Type | Used By |
|-----------------|------|---------|
| color | color | CalExp5 |
| sortOrder | number | CalExp5 |
| excludeFromProcessing | boolean | TS_Exp5 |
| excludeReason | text | TS_Exp5 |
| receiptAliases | context_map | GS_Receipts, InvVal2 |
| propertyAddress | text | GS_Receipts |
| revenueCategory | select | RevExp5 |
| projectStatus | select | RevExp5 |
| estimateNumber | text | RevExp5 |
| customerLastName | text | InvVal2 |
| customerName | text | Cross-app |
| propertyId | text | Cross-app |

---

## 5. PROPERTIES

**QBO Source:** Derived from Customer addresses (no dedicated QBO Property entity)
**QBT Source:** N/A
**Other Sources:** Google Geocoding API, Google Street View, Zillow, Redfin

Properties are a BB-created entity — QBO has no property concept. BB derives properties from customer billing/shipping addresses and enriches with geocoding and real estate data.

### QBO Customer Address Fields → Property

| QBO Source Field | BB Column | Notes |
|-----------------|-----------|-------|
| Customer.BillAddr.Line1 | `address` | Street address |
| Customer.BillAddr.City | `city` | |
| Customer.BillAddr.CountrySubDivisionCode | `state` | |
| Customer.BillAddr.PostalCode | `zip` | |
| Customer.Id | `qbo_id` | Sub-customer ID (if applicable) |

### BB-Created Fields (from geocoding + real estate APIs)

| BB Column | Source | Notes |
|-----------|-------|-------|
| lat, lng | Google Geocoding | Coordinates |
| placeId | Google Places | Google Places ID |
| googleFormatted | Google Geocoding | Normalized address |
| googleMapsUrl | Generated | |
| beds, baths, sqft, lotSqft, yearBuilt, garage | Zillow/Redfin | Property details |
| propertyType | Zillow/Redfin | single_family, condo, etc. |

### BB-Only Enrichment Fields (~8 fields)

| Enrichment Field | Type | Used By |
|-----------------|------|---------|
| tags | tags | DocEngine, PorjExp5 |
| notes | text | DocEngine |
| streetView | object | DocEngine |
| zillowUrl | text | DocEngine |
| redfinUrl | text | DocEngine |
| salesHistory | object | DocEngine |
| photos | array | DocEngine |

---

## 6. QBO ITEMS (reference — not a C1 table)

**QBO Source:** Item entity (`/v3/company/{realmId}/item/{id}`)

BB's `master_items` table is NOT synced from QBO Items. It's a manually maintained estimate catalog. However, QBO has an Item entity that could be relevant for future invoice line-item matching.

### QBO Item Fields (for reference)

| QBO Field | Type | Status | Notes |
|-----------|------|--------|-------|
| Id | String | — | |
| SyncToken | String | — | |
| MetaData | Object | — | CreateTime, LastUpdatedTime |
| Name | String (100) | — | |
| Description | String (4000) | — | Sales description |
| PurchaseDesc | String (4000) | — | Purchase description |
| Active | Boolean | — | |
| Type | Enum | — | Inventory, NonInventory, Service, Group, Category, Bundle, FixedAsset |
| SubItem | Boolean | — | Is this a sub-item? |
| ParentRef | Reference | — | Parent item ID |
| Level | Integer | — | Hierarchy depth |
| FullyQualifiedName | String | — | Parent:Child name chain |
| IncomeAccountRef | Reference | — | Income account |
| ExpenseAccountRef | Reference | — | Expense account (COGS) |
| AssetAccountRef | Reference | — | Inventory asset account |
| UnitPrice | Decimal | — | Sales price |
| RatePercent | Decimal | — | Rate as percentage |
| PurchaseCost | Decimal | — | Purchase cost |
| QtyOnHand | Decimal | — | Inventory count |
| ReorderPoint | Decimal | — | Reorder threshold |
| Taxable | Boolean | — | |
| SalesTaxIncluded | Boolean | — | Tax included in price |
| PurchaseTaxIncluded | Boolean | — | Tax included in purchase cost |
| SKU | String | — | Stock keeping unit |
| TrackQtyOnHand | Boolean | — | Inventory tracking enabled |
| InvStartDate | Date | — | Inventory start date |
| AbatementRate | Decimal | — | India GST |
| ReverseChargeRate | Decimal | — | India GST |
| ServiceType | Enum | — | India GST |
| ItemCategoryType | Enum | — | Product, Service |
| ClassRef | Reference | — | QBO class |
| TaxClassificationRef | Reference | — | Tax classification |
| CustomField[] | Custom | — | |

---

## 7. QBO INVOICES

**QBO Source:** Invoice entity (`/v3/company/{realmId}/invoice/{id}`)
**BB Usage:** RevExp5 (revenue tracking), InvVal2 (receipt validation) — read at runtime via Bridge, NOT stored in C1

### QBO Invoice Fields

| QBO Field | Type | BB Usage | Notes |
|-----------|------|----------|-------|
| **Id** | String | Key | QBO unique identifier |
| **SyncToken** | String | — | Optimistic lock counter |
| **MetaData** | Object | — | CreateTime, LastUpdatedTime |
| **DocNumber** | String (21) | RevExp5 | Invoice number |
| **TxnDate** | Date | RevExp5, InvVal2 | Transaction date |
| **DueDate** | Date | RevExp5 | Payment due date |
| **CustomerRef** | Reference | RevExp5, InvVal2 | Customer ID + name |
| **CustomerMemo** | MemoRef | — | Message to customer |
| **BillAddr** | Address | — | Billing address (Line1-5, City, State, Zip, Country, Lat, Long) |
| **ShipAddr** | Address | — | Shipping address |
| **ShipFromAddr** | Address | — | Ship-from address |
| **ShipMethodRef** | Reference | — | Shipping method |
| **ShipDate** | Date | — | Shipping date |
| **TrackingNum** | String | — | Shipment tracking number |
| **Line[]** | Array | RevExp5, InvVal2 | Line items (see detail below) |
| **TxnTaxDetail** | Object | — | Tax summary (TotalTax, TaxLine[]) |
| **TotalAmt** | Decimal | RevExp5, InvVal2 | Total amount (read-only) |
| **Balance** | Decimal | RevExp5 | Remaining balance (read-only) |
| **Deposit** | Decimal | — | Deposit collected |
| **DepositToAccountRef** | Reference | — | Account for deposit |
| **LinkedTxn[]** | Array | — | Linked payments, credit memos, etc. |
| **EmailStatus** | Enum | — | NotSet, NeedToSend, EmailSent |
| **PrintStatus** | Enum | — | NotSet, NeedToPrint, PrintComplete |
| **BillEmail** | Email | — | Email address for invoice delivery |
| **BillEmailCc** | Email | — | CC email |
| **BillEmailBcc** | Email | — | BCC email |
| **DeliveryInfo** | Object | — | DeliveryType, DeliveryTime |
| **AllowIPNPayment** | Boolean | — | Allow Intuit Payment Network |
| **AllowOnlinePayment** | Boolean | — | Allow online payment |
| **AllowOnlineCreditCardPayment** | Boolean | — | Allow credit card payment |
| **AllowOnlineACHPayment** | Boolean | — | Allow ACH payment |
| **PrivateNote** | String (4000) | — | Internal note |
| **SalesTermRef** | Reference | — | Payment terms (Net 30, etc.) |
| **PaymentMethodRef** | Reference | — | Payment method |
| **ApplyTaxAfterDiscount** | Boolean | — | Tax calculation order |
| **DepartmentRef** | Reference | — | QBO department/location |
| **ClassRef** | Reference | — | QBO class |
| **CurrencyRef** | Reference | — | Currency code |
| **ExchangeRate** | Decimal | — | Exchange rate for currency |
| **HomeBalance** | Decimal | — | Balance in home currency |
| **HomeTotalAmt** | Decimal | — | Total in home currency |
| **GlobalTaxCalculation** | Enum | — | TaxExcluded, TaxInclusive, NotApplicable |
| **FreeFormAddress** | Boolean | — | If true, address is free-form |
| **ProjectRef** | Reference | — | QBO Project reference |
| **RecurDataRef** | Reference | — | Recurring template reference |
| **TxnSource** | String | — | Source of transaction |
| **CustomField[]** | Custom | — | Custom fields (2025 API) |

### Invoice Line Detail Types

| Line Type | Key Fields | Notes |
|-----------|-----------|-------|
| **SalesItemLineDetail** | ItemRef, UnitPrice, Qty, TaxCodeRef, ServiceDate, ClassRef, DiscountAmt, DiscountRate | Standard line item |
| **GroupLineDetail** | GroupItemRef, Quantity, Line[] | Grouped items |
| **DescriptionOnly** | Description | Text-only line |
| **DiscountLineDetail** | PercentBased, DiscountPercent, DiscountAccountRef | Discount line |
| **SubTotalLineDetail** | — | Subtotal line (read-only) |

### Invoice Line-Level Fields (per line item)

| Line Field | Type | BB Usage | Notes |
|-----------|------|----------|-------|
| **Id** | String | — | Line item ID (unique within invoice) |
| **LineNum** | Integer | RevExp5 | Line number |
| **Amount** | Decimal | RevExp5, InvVal2 | Line amount |
| **Description** | String (4000) | RevExp5 | Line description |
| **DetailType** | Enum | RevExp5 | Determines which detail object to read |
| **LinkedTxn[]** | Array | RevExp5 | Line-level linked transactions (e.g., TimeActivity links). Bridge reads in export-labor-csv and recon-enhanced |
| **SalesItemLineDetail.CustomerRef** | Reference | RevExp5 | Customer/job at line level — Bridge parses job name from `CustomerRef.name` (split by `:` for sub-customer hierarchy) |
| **SalesItemLineDetail.ServiceDate** | Date | RevExp5 | Service date for this line |

---

## 8. QBO PURCHASES (Expenses / Checks / Credit Card Charges)

**QBO Source:** Purchase entity (`/v3/company/{realmId}/purchase/{id}`)
**BB Usage:** InvVal2 (expense validation), Chase (credit card matching), Landfill — read at runtime via Bridge

### QBO Purchase Fields

| QBO Field | Type | BB Usage | Notes |
|-----------|------|----------|-------|
| **Id** | String | Key | |
| **SyncToken** | String | — | |
| **MetaData** | Object | — | CreateTime, LastUpdatedTime |
| **PaymentType** | Enum | InvVal2, Chase | **Cash** (= Expense), **Check**, **CreditCard** |
| **AccountRef** | Reference | — | Bank/CC account (required) |
| **EntityRef** | Reference | InvVal2, Chase | Vendor, Customer, or Employee |
| **TxnDate** | Date | InvVal2, Chase | Transaction date |
| **DocNumber** | String (21) | InvVal2 | Check number or reference |
| **TotalAmt** | Decimal | InvVal2, Chase | Total amount (read-only) |
| **Line[]** | Array | InvVal2 | Line items (see detail below) |
| **TxnTaxDetail** | Object | — | Tax summary |
| **DepartmentRef** | Reference | — | Department/location |
| **CurrencyRef** | Reference | — | Currency code |
| **ExchangeRate** | Decimal | — | Exchange rate |
| **PrivateNote** | String (4000) | — | Internal note |
| **Memo** | String (4000) | — | Memo on check/expense |
| **Credit** | Boolean | — | If true, this is a refund/credit |
| **PrintStatus** | Enum | — | Check print status |
| **PaymentMethodRef** | Reference | — | Payment method |
| **LinkedTxn[]** | Array | — | Linked transactions |
| **GlobalTaxCalculation** | Enum | — | Tax calculation mode |
| **TxnSource** | String | — | Source of transaction |
| **RecurDataRef** | Reference | — | Recurring template |
| **PurchaseEx** | Object | — | Internal QBO extension data (NameValue pairs). Read-only, not for developer use. Bridge preserves during convert-to-item-based |
| **CustomField[]** | Custom | — | |

### Purchase Line Detail Types

| Line Type | Key Fields | Notes |
|-----------|-----------|-------|
| **AccountBasedExpenseLineDetail** | AccountRef, Amount, TaxCodeRef, ClassRef, CustomerRef, BillableStatus, MarkupInfo | Expense by account. Bridge reads CustomerRef.name for job and BillableStatus for reconciliation |
| **ItemBasedExpenseLineDetail** | ItemRef, UnitPrice, Qty, TaxCodeRef, ClassRef, CustomerRef, BillableStatus, MarkupInfo | Expense by item. Bridge reads CustomerRef.name for job and BillableStatus for reconciliation |

---

## 9. QBO BILLS

**QBO Source:** Bill entity (`/v3/company/{realmId}/bill/{id}`)
**BB Usage:** InvVal2 (vendor bill validation), Chase — read at runtime via Bridge

### QBO Bill Fields

| QBO Field | Type | BB Usage | Notes |
|-----------|------|----------|-------|
| **Id** | String | Key | |
| **SyncToken** | String | — | |
| **MetaData** | Object | — | CreateTime, LastUpdatedTime |
| **VendorRef** | Reference | InvVal2 | Vendor ID + name (required) |
| **TxnDate** | Date | InvVal2 | Bill date |
| **DueDate** | Date | InvVal2 | Payment due date |
| **DocNumber** | String (21) | InvVal2 | Vendor's invoice/bill number |
| **TotalAmt** | Decimal | InvVal2 | Total amount (read-only) |
| **Balance** | Decimal | — | Remaining balance (read-only) |
| **Line[]** | Array | InvVal2 | Line items (AccountBased or ItemBased) |
| **TxnTaxDetail** | Object | — | Tax summary |
| **APAccountRef** | Reference | — | Accounts Payable account |
| **SalesTermRef** | Reference | — | Payment terms |
| **LinkedTxn[]** | Array | — | Linked bill payments |
| **DepartmentRef** | Reference | — | Department/location |
| **CurrencyRef** | Reference | — | Currency code |
| **ExchangeRate** | Decimal | — | Exchange rate |
| **HomeBalance** | Decimal | — | Balance in home currency |
| **PrivateNote** | String (4000) | — | Internal note |
| **RemitToAddr** | Address | — | Remittance address |
| **VendorAddr** | Address | — | Vendor mailing address |
| **GlobalTaxCalculation** | Enum | — | Tax calculation mode |
| **RecurDataRef** | Reference | — | Recurring template |
| **TxnSource** | String | — | Source of transaction |
| **CustomField[]** | Custom | — | |

### Related: BillPayment Entity

| QBO Field | Type | Notes |
|-----------|------|-------|
| Id | String | |
| VendorRef | Reference | Required |
| TotalAmt | Decimal | Payment amount |
| PayType | Enum | Check, CreditCard |
| CheckPayment | Object | BankAccountRef, PrintStatus, CheckDetail |
| CreditCardPayment | Object | CCAccountRef, CCDetail |
| Line[] | Array | LinkedTxn references to Bills being paid |
| TxnDate | Date | Payment date |
| PrivateNote | String | |
| ProcessBillPayment | Boolean | Process payment through Intuit |

---

## 10. QBO ESTIMATES

**QBO Source:** Estimate entity (`/v3/company/{realmId}/estimate/{id}`)
**BB Usage:** RevExp5 (project estimates), PorjExp5 (project management) — read at runtime via Bridge

### QBO Estimate Fields

| QBO Field | Type | BB Usage | Notes |
|-----------|------|----------|-------|
| **Id** | String | Key | |
| **SyncToken** | String | — | |
| **MetaData** | Object | — | CreateTime, LastUpdatedTime |
| **DocNumber** | String (21) | RevExp5, PorjExp5 | Estimate number |
| **TxnDate** | Date | RevExp5 | Estimate date |
| **ExpirationDate** | Date | — | When estimate expires |
| **CustomerRef** | Reference | RevExp5, PorjExp5 | Customer ID + name |
| **CustomerMemo** | MemoRef | — | Message to customer |
| **Line[]** | Array | RevExp5, PorjExp5 | Line items (SalesItemLineDetail) |
| **TxnTaxDetail** | Object | — | Tax summary |
| **TotalAmt** | Decimal | RevExp5, PorjExp5 | Total amount |
| **TxnStatus** | Enum | RevExp5 | **Pending**, **Accepted**, **Closed**, **Rejected** |
| **AcceptedBy** | String | — | Who accepted (name) |
| **AcceptedDate** | Date | — | When accepted |
| **BillAddr** | Address | — | Billing address |
| **ShipAddr** | Address | — | Shipping address |
| **BillEmail** | Email | — | Email for estimate delivery |
| **EmailStatus** | Enum | — | NotSet, NeedToSend, EmailSent |
| **PrintStatus** | Enum | — | NotSet, NeedToPrint, PrintComplete |
| **DeliveryInfo** | Object | — | DeliveryType, DeliveryTime |
| **LinkedTxn[]** | Array | — | Linked invoices (converted from estimate) |
| **SalesTermRef** | Reference | — | Payment terms |
| **DepartmentRef** | Reference | — | Department/location |
| **ClassRef** | Reference | — | QBO class |
| **CurrencyRef** | Reference | — | Currency code |
| **ExchangeRate** | Decimal | — | Exchange rate |
| **HomeTotalAmt** | Decimal | — | Total in home currency |
| **GlobalTaxCalculation** | Enum | — | Tax calculation mode |
| **PrivateNote** | String (4000) | — | Internal note |
| **ApplyTaxAfterDiscount** | Boolean | — | |
| **FreeFormAddress** | Boolean | — | |
| **ProjectRef** | Reference | — | QBO Project reference |
| **RecurDataRef** | Reference | — | Recurring template |
| **TxnSource** | String | — | |
| **CustomField[]** | Custom | — | |

---

## 11. QBO TIME ACTIVITY

**QBO Source:** TimeActivity entity (`/v3/company/{realmId}/timeactivity/{id}`)
**BB Usage:** TS_Exp5 primarily uses QBT timesheets, but QBO TimeActivity is the QBO-side representation

### QBO TimeActivity Fields

| QBO Field | Type | BB Usage | Notes |
|-----------|------|----------|-------|
| **Id** | String | — | |
| **SyncToken** | String | — | |
| **MetaData** | Object | — | CreateTime, LastUpdatedTime |
| **NameOf** | Enum | — | **Employee** or **Vendor** (required) |
| **EmployeeRef** | Reference | TS_Exp5 | Employee ID (if NameOf=Employee) |
| **VendorRef** | Reference | — | Vendor ID (if NameOf=Vendor) |
| **CustomerRef** | Reference | TS_Exp5 | Customer/job this time is for |
| **ItemRef** | Reference | — | Service item |
| **ClassRef** | Reference | — | QBO class |
| **DepartmentRef** | Reference | — | Department |
| **TxnDate** | Date | TS_Exp5 | Date of work |
| **Description** | String | — | Work description |
| **Hours** | Integer | TS_Exp5 | Hours worked |
| **Minutes** | Integer | TS_Exp5 | Minutes worked |
| **BreakHours** | Integer | — | Break hours |
| **BreakMinutes** | Integer | — | Break minutes |
| **StartTime** | DateTime | — | Clock-in time |
| **EndTime** | DateTime | — | Clock-out time |
| **Duration** | Integer | Bridge | Total seconds worked. Bridge reads in reconcile-unbilled. Not an official QBO documented field — computed from Hours/Minutes or StartTime/EndTime |
| **HourlyRate** | Decimal | — | Rate per hour (Intuit notes: "Unsupported field") |
| **BillableStatus** | Enum | Bridge | Billable, NotBillable, HasBeenBilled. Bridge reads in reconcile-unbilled and recon-enhanced |
| **Taxable** | Boolean | — | |
| **CostRate** | Decimal | — | Cost rate |
| **PayrollItemRef** | Reference | — | Payroll item (determines pay category). Employee must have UseTimeEntry set |
| **HoursSpecified** | Boolean | — | Whether Hours is explicitly set |
| **MinutesSpecified** | Boolean | — | Whether Minutes is explicitly set |
| **BreakHoursSpecified** | Boolean | — | Whether BreakHours is explicitly set |
| **BreakMinutesSpecified** | Boolean | — | Whether BreakMinutes is explicitly set |
| **ProjectRef** | Reference | — | QBO Project |

---

## 12. QBO ADDITIONAL TRANSACTION ENTITIES (reference)

These QBO entities exist but are not currently central to BB workflows. Listed for completeness.

### Credit Memo

| Key Fields | Notes |
|-----------|-------|
| Id, SyncToken, MetaData, DocNumber, TxnDate, CustomerRef, Line[], TotalAmt, Balance, RemainingCredit, BillAddr, BillEmail, PrivateNote, LinkedTxn[], DepartmentRef, ClassRef, CurrencyRef, CustomField[] | Credit issued to customer; links to Invoice payments |

### Payment (Customer Payment)

| Key Fields | Notes |
|-----------|-------|
| Id, SyncToken, MetaData, TxnDate, CustomerRef, TotalAmt, UnappliedAmt, DepositToAccountRef, PaymentMethodRef, PaymentRefNum, Line[] (LinkedTxn to invoices), PrivateNote, CurrencyRef, ExchangeRate, ProcessPayment | Customer payment applied to invoices |

### Deposit

| Key Fields | Notes |
|-----------|-------|
| Id, SyncToken, MetaData, TxnDate, TotalAmt, DepositToAccountRef, Line[], CashBack, DepartmentRef, CurrencyRef, PrivateNote | Bank deposit grouping payments |

### Transfer

| Key Fields | Notes |
|-----------|-------|
| Id, SyncToken, MetaData, TxnDate, Amount, FromAccountRef, ToAccountRef, PrivateNote, TransactionLocationType | Transfer between bank accounts |

### JournalEntry

| Key Fields | Notes |
|-----------|-------|
| Id, SyncToken, MetaData, DocNumber, TxnDate, Line[] (JournalEntryLineDetail: PostingType=Debit/Credit, AccountRef, Amount, Entity), TotalAmt, Adjustment, PrivateNote, CurrencyRef, ExchangeRate | Manual journal entries |

### SalesReceipt

| Key Fields | Notes |
|-----------|-------|
| Id, SyncToken, MetaData, DocNumber, TxnDate, CustomerRef, Line[] (SalesItemLineDetail), TotalAmt, DepositToAccountRef, PaymentMethodRef, PaymentRefNum, BillAddr, ShipAddr, BillEmail, PrintStatus, EmailStatus, Balance, PrivateNote, DepartmentRef, ClassRef, CurrencyRef, CustomField[] | Sale with immediate payment (no invoice) |

### RefundReceipt

| Key Fields | Notes |
|-----------|-------|
| Id, SyncToken, MetaData, DocNumber, TxnDate, CustomerRef, Line[], TotalAmt, DepositToAccountRef, PaymentMethodRef, PaymentRefNum, BillAddr, BillEmail, Balance, PrivateNote, CheckPayment, CreditCardPayment, ClassRef, DepartmentRef, CurrencyRef, CustomField[] | Refund to customer |

### PurchaseOrder

| Key Fields | Notes |
|-----------|-------|
| Id, SyncToken, MetaData, DocNumber, TxnDate, VendorRef, APAccountRef, Line[] (ItemBased), TotalAmt, DueDate, POEmail, POStatus (Open/Closed), ShipAddr, ShipMethodRef, SalesTermRef, LinkedTxn[], PrivateNote, Memo, DepartmentRef, ClassRef, CurrencyRef, CustomField[] | Purchase order to vendor |

### VendorCredit

| Key Fields | Notes |
|-----------|-------|
| Id, SyncToken, MetaData, DocNumber, TxnDate, VendorRef, Line[] (AccountBased or ItemBased), TotalAmt, Balance, APAccountRef, LinkedTxn[], PrivateNote, DepartmentRef, ClassRef, CurrencyRef | Credit from vendor (applied to bills) |

---

## 13. QBO COMPANY INFO

**QBO Source:** CompanyInfo entity (`/v3/company/{realmId}/companyinfo/{realmId}`)
**BB Usage:** Critical for company-level settings, tax configuration, and identity

### QBO CompanyInfo Fields

| QBO Field | Type | BB Relevance | Notes |
|-----------|------|-------------|-------|
| **Id** | String | Key | Same as realmId |
| **SyncToken** | String | — | |
| **MetaData** | Object | — | CreateTime, LastUpdatedTime |
| **CompanyName** | String | HIGH | "Bainbridge Builders Inc." |
| **LegalName** | String | HIGH | Legal entity name |
| **CompanyAddr** | Address | HIGH | Primary business address (Line1-5, City, State, Zip, Country, Lat, Long) |
| **LegalAddr** | Address | HIGH | Registered legal address |
| **CustomerCommunicationAddr** | Address | MEDIUM | Address shown on invoices/estimates |
| **CustomerCommunicationEmailAddr** | Email | MEDIUM | Reply-to email on customer docs |
| **PrimaryPhone** | Phone | HIGH | Main business phone |
| **Mobile** | Phone | MEDIUM | Mobile number |
| **Fax** | Phone | LOW | |
| **CompanyEmailAddr** | Email | HIGH | Main company email |
| **WebAddr** | URL | MEDIUM | Company website |
| **CompanyStartDate** | Date | HIGH | When company was established in QBO |
| **FiscalYearStartMonth** | Enum | HIGH | January=1 through December=12 |
| **TaxYearStartMonth** | Enum | HIGH | Tax year start month |
| **Country** | Enum | — | US, CA, UK, AU, IN, FR |
| **DefaultTimeZone** | String | MEDIUM | e.g., "America/Los_Angeles" |
| **SupportedLanguages** | String | LOW | Comma-separated language codes |
| **NameValue[]** | Pairs | MEDIUM | Additional company attributes (key-value pairs) |
| **EmployerId** | String | HIGH | EIN / Federal Tax ID |
| **LegalAddr** | Address | HIGH | |
| **CompanyFileName** | String | LOW | Internal QBO filename |
| **FlavorStrId** | String | LOW | QBO edition (QBOSimpleStart, QBOEssentials, QBOAdvanced) |
| **QBVersion** | String | LOW | QBO version string |

---

## 14. QBO PREFERENCES

**QBO Source:** Preferences entity (`/v3/company/{realmId}/preferences`)
**BB Usage:** Controls company-wide settings, affects how transactions behave

### QBO Preferences Sections

#### AccountingInfoPrefs
| Field | Type | Notes |
|-------|------|-------|
| TrackDepartments | Boolean | Departments/locations enabled |
| DepartmentTerminology | Enum | Department, Division, Location, Business |
| ClassTrackingPerTxn | Boolean | Class tracking per transaction |
| ClassTrackingPerTxnLine | Boolean | Class tracking per line item |
| CustomerTerminology | Enum | Customers, Clients, Donors, Guests, Members, Patients, Tenants |
| BookCloseDate | Date | Books closed through this date |
| FirstMonthOfFiscalYear | Enum | January through December |
| TaxYearMonth | Enum | Tax year start month |
| TaxForm | Enum | Tax form type |

#### SalesFormsPrefs
| Field | Type | Notes |
|-------|------|-------|
| AllowDeposit | Boolean | Allow deposits on invoices |
| AllowDiscount | Boolean | Allow discounts |
| AllowEstimates | Boolean | Estimates enabled |
| AllowServiceDate | Boolean | Service date on line items |
| AllowShipping | Boolean | Shipping fields enabled |
| CustomTxnNumbers | Boolean | Custom transaction numbering |
| DefaultCustomerMessage | String | Default message on invoices |
| DefaultDiscountAccount | String | Default discount account |
| DefaultShippingAccount | String | Default shipping account |
| DefaultTerms | Reference | Default payment terms |
| EmailCopyToCompany | Boolean | CC company on emails |
| ETransactionAttachPDF | Boolean | Attach PDF to emails |
| ETransactionEnabledStatus | Enum | Email delivery status |
| ETransactionPaymentEnabled | Boolean | Online payments enabled |
| IPNSupportEnabled | Boolean | Intuit Payment Network |
| AutoApplyCredit | Boolean | Auto-apply credits |
| AutoApplyPayments | Boolean | Auto-apply payments |
| CustomField[] | Object | Custom fields on sales forms |
| SalesEmailBcc | Email | Default BCC |
| SalesEmailCc | Email | Default CC |
| UsingProgressInvoicing | Boolean | Progress invoicing enabled |
| UsingPriceLevels | Boolean | Price levels enabled |

#### VendorAndPurchasesPrefs
| Field | Type | Notes |
|-------|------|-------|
| BillableExpenseTracking | Boolean | Track billable expenses |
| DefaultMarkup | Decimal | Default markup percentage |
| DefaultMarkupAccount | Reference | Account for markup |
| DefaultTerms | Reference | Default vendor payment terms |
| POCustomField[] | Object | Custom fields on purchase orders |
| TrackingByCustomer | Boolean | Track expenses by customer |
| UsingInventory | Boolean | Inventory tracking enabled |

#### TimeTrackingPrefs
| Field | Type | Notes |
|-------|------|-------|
| UseServices | Boolean | Service items in time tracking |
| BillCustomers | Boolean | Allow billing customers for time |
| ShowBillRateToAll | Boolean | Show bill rate to all users |
| WorkWeekStartDate | Enum | Monday through Sunday |
| MarkTimeEntriesBillable | Boolean | Default billable status |

#### TaxPrefs
| Field | Type | Notes |
|-------|------|-------|
| UsingSalesTax | Boolean | Sales tax enabled |
| TaxGroupCodeRef | Reference | Default tax code |
| HideTaxExemption | Boolean | |
| PartnerTaxEnabled | Boolean | Automated sales tax |

#### CurrencyPrefs
| Field | Type | Notes |
|-------|------|-------|
| MultiCurrencyEnabled | Boolean | Multi-currency enabled |
| HomeCurrency | Reference | Home currency code |

#### ProductAndServicesPrefs
| Field | Type | Notes |
|-------|------|-------|
| ForSales | Boolean | Products/services for sales |
| ForPurchase | Boolean | Products/services for purchases |
| QuantityWithPriceAndRate | Boolean | Quantity and rate on forms |
| QuantityOnHand | Boolean | Track inventory quantity |
| RevenueRecognitionEnabled | Boolean | Revenue recognition feature |

#### EmailMessagesPrefs
| Field | Type | Notes |
|-------|------|-------|
| InvoiceMessage | Object | Subject + Message for invoice emails |
| EstimateMessage | Object | Subject + Message for estimate emails |
| SalesReceiptMessage | Object | Subject + Message for sales receipt emails |
| StatementMessage | Object | Subject + Message for statement emails |

#### ReportPrefs
| Field | Type | Notes |
|-------|------|-------|
| ReportBasis | Enum | Accrual, Cash |
| CalcAgingReportFromTxnDate | Boolean | Age from transaction date vs due date |

#### OtherPrefs
| Field | Type | Notes |
|-------|------|-------|
| NameValue[] | Pairs | Miscellaneous settings as key-value pairs |

---

## 15. QBT COMPLETE DATA MODEL

**QBT Source:** QuickBooks Time API (`/api/v1/...`)
**Reference:** TSheets/QBT API documentation

BB currently uses Users, Jobcodes, and Timesheets from QBT. The full QBT data model includes many more entities.

### QBT Timesheets (currently used indirectly via QBO TimeActivity sync)

| QBT Field | Type | BB Usage | Notes |
|-----------|------|----------|-------|
| **id** | Integer | TS_Exp5 | Timesheet ID |
| **user_id** | Integer | TS_Exp5 | Employee who clocked this |
| **jobcode_id** | Integer | TS_Exp5 | Jobcode/project |
| **locked** | Integer | Bridge | 0=not locked, 1=locked, 2=approved. Bridge reads in CSV export |
| **type** | Enum | Bridge | regular, manual, pto, holiday. Bridge reads in validate-labor-exact |
| **notes** | String | Bridge | Employee notes. Bridge reads in validate-labor-exact traceability |
| **start** | DateTime | TS_Exp5 | Clock-in time (ISO 8601) |
| **end** | DateTime | TS_Exp5 | Clock-out time |
| **date** | Date | TS_Exp5 | Work date (manual timesheets) |
| **duration** | Integer | TS_Exp5 | Seconds worked |
| **on_the_clock** | Boolean | Bridge | Currently clocked in? Bridge reads in CSV export |
| **tz** | Integer | — | Timezone offset in seconds |
| **tz_str** | String | — | Timezone name (e.g., "tsMT") |
| **location** | Object | — | GPS coordinates object (lat, lng, accuracy, altitude, speed, source, device_type) |
| **location_id** | Integer | Bridge | Reference to QBT Location entity. Bridge reads in CSV export. Distinct from `location` GPS object |
| **state** | Enum | — | pending, approved, denied, submitted |
| **origin_hint** | String | — | How timesheet was created (web, ios, android, api) |
| **created** | DateTime | Bridge | When created. Bridge reads in validate-labor-exact traceability |
| **last_modified** | DateTime | Bridge | When last modified. Bridge reads in validate-labor-exact and CSV export |
| **created_by_user_id** | Integer | — | Who created it |
| **customfields** | Object | — | Custom field values |
| **attached_files** | Array | — | File attachments |

### QBT Locations

| QBT Field | Type | BB Usage | Notes |
|-----------|------|----------|-------|
| **id** | Integer | — | |
| **addr1** | String | — | Street address line 1 |
| **addr2** | String | — | Street address line 2 |
| **city** | String | — | |
| **state** | String | — | |
| **zip** | String | — | |
| **country** | String | — | |
| **formatted_address** | String | — | Full formatted address |
| **latitude** | Decimal | — | |
| **longitude** | Decimal | — | |
| **label** | String | — | Location name |
| **notes** | String | — | |
| **geocoding_status** | Enum | — | none, in_progress, complete, error |
| **geofence_config_id** | Integer | — | Geofence configuration |
| **active** | Boolean | — | |
| **place_id_hash** | String | — | Google Places hash |
| **linked_objects** | Object | — | Linked jobcodes/users |
| **created** | DateTime | — | |
| **last_modified** | DateTime | — | |

### QBT Groups

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | Group ID |
| **name** | String | Group name |
| **active** | Boolean | |
| **last_modified** | DateTime | |
| **created** | DateTime | |
| **manager_ids** | Array | User IDs of group managers |

### QBT CustomFields

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | |
| **name** | String | Field name |
| **short_code** | String | Abbreviated code |
| **required** | Boolean | |
| **applies_to** | Enum | timesheet, user, jobcode |
| **type** | Enum | managed-list, free-form |
| **show_to_all** | Boolean | |
| **required_customfields** | Array | |
| **active** | Boolean | |
| **ui_preference** | Enum | drop_down, text_box_list |
| **regex_filter** | String | Validation pattern |
| **last_modified** | DateTime | |
| **created** | DateTime | |

### QBT CustomFieldItems (values for managed-list custom fields)

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | |
| **customfield_id** | Integer | Parent custom field |
| **name** | String | Item value |
| **short_code** | String | |
| **active** | Boolean | |
| **last_modified** | DateTime | |
| **created** | DateTime | |

### QBT Schedule Calendars

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | |
| **name** | String | Calendar name |
| **active** | Boolean | |
| **last_modified** | DateTime | |
| **created** | DateTime | |

### QBT Schedule Events

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | |
| **schedule_calendar_id** | Integer | Parent calendar |
| **start** | DateTime | Event start |
| **end** | DateTime | Event end |
| **all_day** | Boolean | All-day event |
| **title** | String | Event title |
| **notes** | String | |
| **color** | String | Hex color |
| **active** | Boolean | |
| **draft** | Boolean | Draft status |
| **timezone** | String | |
| **assigned_user_ids** | Array | Assigned users |
| **jobcode_id** | Integer | Associated jobcode |
| **location_id** | Integer | Associated location |
| **last_modified** | DateTime | |
| **created** | DateTime | |

### QBT Time Off Requests

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | |
| **user_id** | Integer | Requesting user |
| **time_off_request_notes** | Array | Notes/comments on request |
| **time_off_request_entries** | Array | Each entry: date, duration, jobcode_id, status |
| **status** | Enum | pending, approved, denied, canceled |
| **active** | Boolean | |
| **last_modified** | DateTime | |
| **created** | DateTime | |

### QBT Projects

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | |
| **name** | String | Project name |
| **jobcode_id** | Integer | Associated jobcode |
| **status** | Enum | in_progress, complete |
| **description** | String | |
| **start_date** | Date | |
| **end_date** | Date | |
| **completed_date** | Date | |
| **active** | Boolean | |
| **last_modified** | DateTime | |
| **created** | DateTime | |

### QBT Estimates (QBT-native, not QBO Estimates)

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | |
| **project_id** | Integer | Parent project |
| **name** | String | Estimate name |
| **estimate_items** | Array | Line items: jobcode_id, hours, cost_rate, bill_rate, notes |
| **status** | Enum | |
| **active** | Boolean | |
| **last_modified** | DateTime | |
| **created** | DateTime | |

### QBT Notifications

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | |
| **user_id** | Integer | Target user |
| **message** | String | Notification text |
| **method** | Enum | push, email, sms |
| **precheck** | Enum | none, clock_in, clock_out |
| **delivery_time** | DateTime | |
| **created** | DateTime | |

### QBT Reminders

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | |
| **user_id** | Integer | Target user |
| **reminder_type** | Enum | clock_in, clock_out |
| **due_time** | String | Time of day (HH:MM:SS) |
| **due_days_of_week** | String | Comma-separated day codes |
| **distribution_methods** | Array | push, email, sms |
| **active** | Boolean | |
| **enabled** | Boolean | |
| **last_modified** | DateTime | |
| **created** | DateTime | |

### QBT Files (Attachments)

| QBT Field | Type | Notes |
|-----------|------|-------|
| **id** | Integer | |
| **uploaded_by_user_id** | Integer | Who uploaded |
| **file_name** | String | Original filename |
| **active** | Boolean | |
| **size** | Integer | File size in bytes |
| **meta_data** | Object | file_description, image_rotation |
| **linked_objects** | Object | Associated timesheets/users/jobcodes |
| **created** | DateTime | |
| **last_modified** | DateTime | |

---

## 16. QBT COMPANY SETTINGS (effective_settings)

**QBT Source:** `GET /api/v1/effective_settings`
**BB Relevance:** HIGH — controls company-wide time tracking behavior

### General Settings

| Setting | Type | Notes |
|---------|------|-------|
| **general.shields_up** | Boolean | Account lockdown |
| **general.employee_pto_tracking** | Boolean | PTO tracking enabled |
| **general.calculate_overtime** | Boolean | Overtime calculation enabled |
| **general.clockout_override** | Boolean | Allow clock-out time override |
| **general.clockout_override_hours** | Integer | Max hours for override |
| **general.max_time_entry_hours** | Integer | Max single timesheet hours |
| **general.track_breaks** | Boolean | Break tracking enabled |
| **general.payroll_integration_enabled** | Boolean | Payroll integration |

### Time Entry Settings

| Setting | Type | Notes |
|---------|------|-------|
| **time_entry.time_entry_method** | Enum | clock (real-time), manual, both |
| **time_entry.allow_manual_time_entries** | Boolean | |
| **time_entry.require_notes** | Boolean | Notes required on timesheets |
| **time_entry.require_jobcodes** | Boolean | Jobcode required |
| **time_entry.require_location** | Boolean | GPS location required |
| **time_entry.auto_clock_out** | Object | Enabled, hours_after |
| **time_entry.rounding** | Object | Enabled, type, interval, direction |
| **time_entry.photos_enabled** | Boolean | Photo capture on clock-in/out |

### Overtime Settings

| Setting | Type | Notes |
|---------|------|-------|
| **overtime.weekly_threshold** | Integer | Weekly OT threshold (hours) |
| **overtime.daily_threshold** | Integer | Daily OT threshold |
| **overtime.double_time_daily_threshold** | Integer | Daily double-time threshold |
| **overtime.double_time_weekly_threshold** | Integer | Weekly double-time threshold |
| **overtime.consecutive_day_threshold** | Integer | 7th consecutive day rule |
| **overtime.overtime_rate** | Decimal | OT multiplier (typically 1.5) |
| **overtime.double_time_rate** | Decimal | DT multiplier (typically 2.0) |

### Break Settings

| Setting | Type | Notes |
|---------|------|-------|
| **breaks.type** | Enum | paid, unpaid, both |
| **breaks.auto_deduct** | Object | Enabled, duration, after_hours |
| **breaks.require_break** | Boolean | |
| **breaks.require_break_after_hours** | Decimal | |

### Scheduling Settings

| Setting | Type | Notes |
|---------|------|-------|
| **scheduling.enabled** | Boolean | Scheduling feature enabled |
| **scheduling.notify_employees** | Boolean | Notify on schedule publish |
| **scheduling.remind_before_shift** | Object | Enabled, minutes_before |

---

## 17. QBO COMPLETE ENTITY LIST

All entities available in QBO API for reference.

### Transaction Entities
| Entity | Endpoint | BB Relevance |
|--------|----------|-------------|
| Account | /v3/company/{id}/account | LOW — chart of accounts |
| Bill | /v3/company/{id}/bill | HIGH — vendor bills |
| BillPayment | /v3/company/{id}/billpayment | MEDIUM — bill payment tracking |
| Budget | /v3/company/{id}/budget | LOW |
| CreditMemo | /v3/company/{id}/creditmemo | MEDIUM — customer credits |
| Deposit | /v3/company/{id}/deposit | LOW |
| Estimate | /v3/company/{id}/estimate | HIGH — project estimates |
| Invoice | /v3/company/{id}/invoice | HIGH — revenue/billing |
| JournalEntry | /v3/company/{id}/journalentry | LOW |
| Payment | /v3/company/{id}/payment | MEDIUM — customer payments |
| Purchase | /v3/company/{id}/purchase | HIGH — expenses/checks/CC charges |
| PurchaseOrder | /v3/company/{id}/purchaseorder | MEDIUM — vendor POs |
| RefundReceipt | /v3/company/{id}/refundreceipt | LOW |
| SalesReceipt | /v3/company/{id}/salesreceipt | LOW |
| TimeActivity | /v3/company/{id}/timeactivity | HIGH — time tracking |
| Transfer | /v3/company/{id}/transfer | LOW |
| VendorCredit | /v3/company/{id}/vendorcredit | MEDIUM — vendor credits |

### Named List Entities
| Entity | Endpoint | BB Relevance |
|--------|----------|-------------|
| Account | /v3/company/{id}/account | See above |
| Class | /v3/company/{id}/class | LOW — categorization |
| Customer | /v3/company/{id}/customer | HIGH — C1 entity |
| Department | /v3/company/{id}/department | LOW — location/department |
| Employee | /v3/company/{id}/employee | HIGH — C1 entity |
| Item | /v3/company/{id}/item | MEDIUM — products/services |
| PaymentMethod | /v3/company/{id}/paymentmethod | LOW |
| TaxCode | /v3/company/{id}/taxcode | LOW |
| TaxRate | /v3/company/{id}/taxrate | LOW |
| Term | /v3/company/{id}/term | LOW — payment terms definitions |
| Vendor | /v3/company/{id}/vendor | HIGH — C1 entity |

### Supporting Entities
| Entity | Endpoint | BB Relevance |
|--------|----------|-------------|
| Attachable | /v3/company/{id}/attachable | **HIGH** — Bridge has 5+ endpoints. See Section 18 |
| CompanyInfo | /v3/company/{id}/companyinfo | HIGH — company identity |
| Preferences | /v3/company/{id}/preferences | HIGH — company settings |
| ExchangeRate | /v3/company/{id}/exchangerate | LOW |

### Query & Reporting
| Feature | Endpoint | BB Relevance |
|---------|----------|-------------|
| CDC (Change Data Capture) | /v3/company/{id}/cdc | HIGH — sync detection |
| Query | /v3/company/{id}/query | HIGH — SQL-like queries |
| Reports | /v3/company/{id}/reports/{name} | MEDIUM — ProfitAndLoss, BalanceSheet, etc. |
| Batch | /v3/batch | MEDIUM — batch operations |

---

## 18. QBO ATTACHABLE (File Attachments)

**QBO Source:** Attachable entity (`/v3/company/{realmId}/attachable/{id}`)
**BB Usage:** HIGH — Bridge has 5+ endpoints for attachment CRUD; used in invoice reconciliation, bill reconciliation, chase reconciliation

### QBO Attachable Fields

| QBO Field | Type | Bridge Usage | Notes |
|-----------|------|-------------|-------|
| **Id** | String | All attachment routes | Unique identifier |
| **SyncToken** | String | Delete operations | Optimistic lock counter |
| **MetaData** | Object | Display | CreateTime, LastUpdatedTime |
| **FileName** | String | All routes | Original filename (e.g., "receipt.pdf") |
| **ContentType** | String | Upload, display | MIME type (e.g., "application/pdf", "image/jpeg") |
| **Size** | Integer | Upload verify, display | File size in bytes |
| **Category** | String | — | Attachment category |
| **Note** | String | Display | Text note associated with the attachment |
| **Tag** | String | — | Tag for the attachment |
| **FileAccessUri** | String | Display | Full-path file access URI (read-only) |
| **TempDownloadUri** | String | Download, display | Temporary download URL (valid 15 minutes, read-only). Bridge uses for direct streaming |
| **ThumbnailFileAccessUri** | String | — | Thumbnail URI (if content type supports thumbnails, read-only) |
| **ThumbnailTempDownloadUri** | String | — | Thumbnail temp download URL (read-only) |
| **Lat** | String | — | Latitude (if location-tagged) |
| **Long** | String | — | Longitude (if location-tagged) |
| **PlaceName** | String | — | Place name (if location-tagged) |
| **AttachableRef[]** | Array | All routes | Links attachment to entities. Each ref contains: |
| | | | — **EntityRef** (type + value, e.g., type="Invoice", value="123") |
| | | | — **IncludeOnSend** (Boolean — include when emailing entity) |
| | | | — **LineInfo** (String — line-level reference) |
| | | | — **NoRefOnly** (Boolean) |
| | | | — **Inactive** (Boolean) |
| **AttachableEx** | Object | — | Internal extension data (NameValue pairs, read-only) |
| **CustomField[]** | Custom | — | Custom fields |

### Bridge Attachment Operations

| Endpoint | Operation | Key Fields Used |
|----------|-----------|----------------|
| `POST /qbo/attachables` | List/query | AttachableRef.EntityRef.Type, EntityRef.value |
| `POST /qbo/attachment-download` | Get metadata | Id |
| `POST /qbo/attachment-fetch` | Download file binary | Id, TempDownloadUri (direct stream if available) |
| `POST /qbo/attachment-delete` | Delete | Id, SyncToken |
| `POST /qbo/attachment-upload` | Upload (multipart) | FileName, ContentType, AttachableRef[].EntityRef |
| `POST /qbo/attachment-upload-smart` | Upload with pre-check + verify | FileName, Size (dedupe), EntityRef (link verify) |
| `GET /qbo/invoice/:id/attachments` | Lazy-load per invoice | AttachableRef.EntityRef.Type="Invoice" |
| Invoice enrichment (`invoices-enriched`) | Bulk attachment mapping | Id, FileName, Size, ContentType, TempDownloadUri, FileAccessUri, MetaData.CreateTime |
| Bill reconciliation | Receipt check | Id, FileName, Size, TempDownloadUri, ContentType |
| Chase reconciliation | Receipt check | Id, FileName, Size, TempDownloadUri, ContentType |

### Supported Entity Types for Attachment

Purchase, Bill, Invoice, Estimate, SalesReceipt, CreditMemo, VendorCredit, JournalEntry

---

## 19. QBT GEOLOCATIONS

**QBT Source:** Geolocations endpoint (`/api/v1/geolocations`)
**BB Usage:** Bridge has auto-paginated endpoint (`POST /qbt/geolocations`); GPS tracking for field crews

### QBT Geolocation Fields

| QBT Field | Type | Bridge Usage | Notes |
|-----------|------|-------------|-------|
| **id** | Integer | Key | Geolocation point ID |
| **user_id** | Integer | Filter | Employee who recorded this point |
| **accuracy** | Decimal | — | GPS accuracy in meters |
| **altitude** | Decimal | — | Altitude in meters |
| **latitude** | Decimal | — | GPS latitude (decimal degrees) |
| **longitude** | Decimal | — | GPS longitude (decimal degrees) |
| **speed** | Decimal | — | Speed of travel at recording time |
| **heading** | Decimal | — | Direction of travel in degrees |
| **source** | String | — | GPS data source (e.g., "gps", "wifi", "cell") |
| **device_identifier** | String | — | Device that recorded the point |
| **created** | DateTime | — | When the point was recorded |

### Geolocation API Filters

| Filter | Operators | Notes |
|--------|----------|-------|
| **ids** | =, IN | Comma-separated geolocation IDs |
| **user_ids** | =, IN | Filter by user |
| **group_ids** | =, IN | Filter by group |
| **modified_since** | = | ISO 8601 timestamp |
| **modified_before** | = | ISO 8601 timestamp |
| **per_page** | = | Results per page (Bridge uses 200) |
| **page** | = | Page number |

### Bridge Pagination

Bridge auto-paginates at 200 records/page until `pageGeolocations.length < PAGE_SIZE`. Returns `{ results, count, pagesFetched, _autoPaginated: true }`.

---

## 20. QBO REPORTS API (used by Bridge, not an entity)

**QBO Source:** Reports endpoint (`/v3/company/{realmId}/reports/{reportName}`)
**BB Usage:** Bridge uses TransactionList report for reconciliation status

### TransactionList Report (used by Bridge)

| Column | Bridge Field | Notes |
|--------|-------------|-------|
| **tx_date** | date | Transaction date |
| **txn_type** | type | Transaction type (Bill, Check, etc.) |
| **doc_num** | docNum | Document/check number |
| **name** | name | Customer/vendor name |
| **memo** | memo | Transaction memo |
| **account_name** | account | Account name |
| **subt_nat_amount** | amount | Amount (natural sign) |

### Cleared Status Filter

Bridge queries the report 3 times with different `cleared` parameter values:
- `Reconciled` — transactions reconciled with bank
- `Cleared` — transactions cleared but not reconciled
- `Uncleared` — transactions not yet cleared

### Other Available Reports (not currently used by Bridge)

| Report | Endpoint | Notes |
|--------|----------|-------|
| ProfitAndLoss | /reports/ProfitAndLoss | Income statement |
| BalanceSheet | /reports/BalanceSheet | Balance sheet |
| CashFlow | /reports/CashFlow | Cash flow statement |
| GeneralLedger | /reports/GeneralLedger | All transactions by account |
| TrialBalance | /reports/TrialBalance | Trial balance |
| AgedReceivables | /reports/AgedReceivableDetail | AR aging |
| AgedPayables | /reports/AgedPayableDetail | AP aging |
| CustomerIncome | /reports/CustomerIncome | Revenue by customer |
| VendorExpenses | /reports/VendorExpenses | Expenses by vendor |

---

## 21. DATA DUPLICATION: BRIDGE CONFIG vs C1 ENRICHMENT

> **Status:** Documented for resolution during Neon DB migration. Both sources work today; will consolidate when Data Manager is built.

### Duplicated Data Inventory

| Data | Bridge Config File | C1 Enrichment Field | Current Risk |
|------|-------------------|---------------------|--------------|
| Employee short names | `config/Employee_settings.json` → `aliases[].alias` | `enrichment.alias` | LOW — Bridge config used by Chase/receipt matching; C1 used by apps. Could drift if employee added to one but not the other |
| Employee CC last 4 | `config/Employee_settings.json` → `creditCards{}` | `enrichment.cardLast4` | LOW — Same data, two locations. Chase recon uses Bridge config |
| Vendor name aliases | `config/Vendor_settings.json` → 119 alias mappings | `enrichment.aliases` (context_map) | MEDIUM — 119 vendor name variations in Bridge config. DocEngine/GS_Receipts may have different aliases in C1 |
| Jobcode display names | `config/Jobcode_settings.json` → 35 alias mappings | Enrichment fields (customerName, etc.) | LOW — Bridge config used for display only |
| QBO/QBT ID mapping | `config/employee-id-mapping.json` → 16 employees | C1 `qbo_id` + `qbt_id` columns per employee | MEDIUM — Bridge uses for labor validation. If employee added to QBO/QBT, both files need updating |

### Special Jobcodes (Bridge config only, not in C1)

| Jobcode | QBT ID | Used By |
|---------|--------|---------|
| Lunch | 171969570 | validate-labor-exact (OT detection, lunch attribution) |
| Sick | 56172044 | Referenced in settings but not actively used in code |
| Vacation | 56172048 | Referenced in settings but not actively used in code |

### Resolution Plan (Neon DB migration)

When Data Manager is built with Neon DB:
1. **C1 becomes the single source of truth** for all enrichment data (Approach B)
2. Bridge config files become **bootstrap/seed data only** — used for initial load, then C1 takes over
3. Bridge reads aliases/mappings from C1 at runtime (or caches on startup with TTL)
4. Data Manager is the single editor for all enrichment fields
5. Special jobcode IDs move to a `company_settings` table in C1

---

## 22. SUMMARY: WHAT'S AVAILABLE BUT UNUSED

### High-Value Unused QBO Fields (Named Lists)

| Entity | Field | Why Potentially Useful |
|--------|-------|----------------------|
| Employee | **Mobile** | Crew contact for field coordination |
| Employee | **PrimaryAddr** | Home address for mileage calculations |
| Employee | **ReleasedDate** | Track terminations alongside hire_date |
| Employee | **BirthDate** | HR compliance |
| Customer | **Balance** | Outstanding balance at a glance in Data Manager |
| Customer | **TotalRevenue** | Lifetime revenue per customer |
| Customer | **Job/ParentRef/Level** | Sub-customer hierarchy (QBO Projects) |
| Customer | **SalesTermRef** | Payment terms (currently BB enrichment) |
| Customer | **WebAddr** | Customer website |
| Vendor | **GivenName/FamilyName** | Vendor contact person name |
| Vendor | **TaxIdentifier** | EIN for 1099 prep |
| Vendor | **Balance** | Outstanding balance |
| Vendor | **WebAddr** | Vendor website |
| Vendor | **TermRef** | Payment terms |

### High-Value Unused QBT Fields

| Entity | Field | Why Potentially Useful |
|--------|-------|----------------------|
| User | **pay_rate** / **pay_interval** | Could cross-reference with enrichment.payRate |
| User | **exempt** | Overtime exemption status |
| User | **submitted_to** / **approved_to** | Timesheet approval status |
| User | **profile_image_url** | Employee photos in Data Manager |
| Jobcode | **billable_rate** | Could cross-reference with employee billRate |
| Jobcode | **assigned_to_all** | Who can use this jobcode |
| Timesheet | **location** | GPS coordinates of clock-in/out |
| Timesheet | **origin_hint** | How time was entered (web/mobile/api) |
| Timesheet | **attached_files** | Photos/files attached to timesheets |
| Schedule Event | **all fields** | Could power CalExp5 scheduling |
| Location | **geofence_config_id** | Geofencing for job sites |
| Time Off Request | **all fields** | PTO management |

### High-Value Unused Company-Level Data

| Source | Field/Section | Why Potentially Useful |
|--------|--------------|----------------------|
| QBO CompanyInfo | **EmployerId** | EIN for tax/compliance |
| QBO CompanyInfo | **FiscalYearStartMonth** | Align reports to fiscal year |
| QBO CompanyInfo | **CompanyStartDate** | Company age/history |
| QBO Preferences | **TimeTrackingPrefs** | Align BB time rules with QBO settings |
| QBO Preferences | **SalesFormsPrefs** | Know what QBO features are enabled |
| QBO Preferences | **VendorAndPurchasesPrefs** | Billable expense tracking settings |
| QBT effective_settings | **overtime thresholds** | Align BB overtime with QBT rules |
| QBT effective_settings | **break rules** | Align BB break tracking with QBT |
| QBT effective_settings | **time_entry_method** | Clock vs manual vs both |

---

## 23. API VERSIONING & CHANGE TRACKING

### What's Available (Not Version History)

| System | Mechanism | What It Provides | What It DOESN'T Provide |
|--------|-----------|-----------------|------------------------|
| **QBO SyncToken** | Integer counter | Optimistic locking; increments on each update | No history of previous values; only latest token preserved |
| **QBO MetaData** | CreateTime + LastUpdatedTime | When created, when last changed | No WHO changed it (via API), no WHAT changed |
| **QBO CDC** | Poll-based change detection | Full current objects changed since a timestamp (30-day max) | No old values, no field-level diffs, max 1000 objects |
| **QBO Audit Log** | UI-only report | Who changed what, when (2-year retention) | NOT accessible via API; cannot filter by entity name |
| **QBO Custom Fields** | Flexible metadata (2025) | Additional fields on Customer/Invoice/Vendor | Requires Gold/Platinum partner tier; limited field types |
| **QBT last_modified** | Timestamp per object | When object last changed | No history, no diffs, no old values |
| **QBT modified_since** | Filter parameter | Retrieve objects changed since a date | Only current state returned |
| **QBT Timesheet Log** | Per-timesheet change log | All changes to a timesheet (in-app) | UI/export only, NOT available via API endpoint |
| **QBT last_modified_timestamps** | Endpoint | Most recent modification time per object type | Only tells IF something changed, not WHAT |

### BB's Enrichment Versioning (What BB Adds)

| Mechanism | What It Provides |
|-----------|-----------------|
| `enrichment_version` integer on C1 | How many times enrichment has changed per entity |
| `enrichment_history` table | Field-level old_value → new_value with who/when for every enrichment change |
| `enrichmentSnapshotAt` on 6 C2 tables | Point-in-time enrichment reconstruction for analytical records |
| Bridge sync diffs (future) | Could capture core field old→new during QBO/QBT sync if ever needed |

---

*Cross-references: BB_PLATFORM_SCHEMA-v2.md v2.23, BB_MDM_BEST_PRACTICES.md v1.1, BB_BRIDGE_SUPERSET_AUDIT.md v1.0*

Sources:
- [Intuit QBO Employee API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/employee)
- [Intuit QBO Customer API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer)
- [Intuit QBO Vendor API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/vendor)
- [Intuit QBO Item API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/item)
- [Intuit QBO Invoice API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice)
- [Intuit QBO Purchase API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/purchase)
- [Intuit QBO Bill API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/bill)
- [Intuit QBO Estimate API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/estimate)
- [Intuit QBO TimeActivity API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/timeactivity)
- [Intuit QBO CompanyInfo API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/companyinfo)
- [Intuit QBO Preferences API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/preferences)
- [Intuit CDC Documentation](https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/change-data-capture)
- [QuickBooks Time API Reference](https://tsheetsteam.github.io/api_docs/)
- [QBT Data Model (synchub.io)](https://synchub.io/integrations/quickbooks-time)
- [QBO XSD — IntuitBaseTypes.xsd](https://github.com/intuit/QuickBooks-V3-DotNET-SDK/blob/master/IPPDotNetDevKitCSV3/Tools/XsdExtension/Intuit.Ipp.XsdExtension/Schema/IntuitBaseTypes.xsd)
- [SyncToken Explanation](https://support.databuzz.com.au/article/671-what-is-the-quickbooks-synctoken-field)
- [QBO Audit Log Guide](https://quickbooks.intuit.com/learn-support/en-us/help-article/audit-log/use-audit-log-quickbooks-online/L2WoVnW6I_US_en_US)
- [Intuit Custom Fields API (2025)](https://blogs.intuit.com/2025/12/01/custom-fields-api-extending-quickbooks-online-with-flexible-metadata/)
- [Intuit QBO Attachable API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/attachable)
- [QBT Geolocations (CData reference)](https://cdn.cdata.com/help/HCF/mule/pg_table-geolocations.htm)
- [QBO Reports API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account)
- [QBO Employee Pay/Cost/Bill Rates](https://quickbooks.intuit.com/learn-support/en-us/help-article/financial-reports/pay-rates-cost-rates-billable-rates/L2R0jXKWn_US_en_US)
- Mini_API_Bridge source code audit (server/routes/qbo/, server/routes/qbt/, config/)
