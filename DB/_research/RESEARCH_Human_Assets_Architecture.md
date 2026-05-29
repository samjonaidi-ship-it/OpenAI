# Research Report: Human Assets in Construction Digital Systems | v1.0 | 2026-03-29 | BB

## Executive Summary

This report covers best practices for treating employees, subcontractors, and customers as "human assets" in Bainbridge Builders' digital system. Research spans subcontractor compliance, employee certifications, self-service portals, customer-facing features, unified auth, and project storybooks. Findings are drawn from platform analysis (Procore, Buildertrend, BuildBook, CompanyCam, CoConstruct), regulatory sources (OSHA, CA CSLB, CA DIR), and auth provider documentation (Auth0, Supabase, Descope).

---

## 1. SUBCONTRACTOR COMPLIANCE MANAGEMENT

### 1.1 Required Documents for Subs

Every subcontractor working for a GC should have the following on file:

| Document | Purpose | Expiry Tracking |
|----------|---------|-----------------|
| **Certificate of Insurance (COI)** | Proves GL, WC, auto coverage | Annual renewal |
| **W-9 (or W-8BEN for foreign)** | Tax ID for 1099 reporting | On file, update on info change |
| **Contractor License** | CA CSLB license verification | Biennial renewal (odd years) |
| **Contractor Bond** | $25,000 contractor license bond (CA) | Must stay current with license |
| **Workers Comp Certificate** | Proves WC coverage for sub's employees | Annual renewal |
| **Business License** | Local jurisdiction business license | Annual |
| **Subcontractor Agreement** | Master agreement or per-project | Per project |
| **Safety Program / EMR** | Experience Modification Rate, safety record | Annual |
| **Additional Insured Endorsement** | Names BB as additional insured on sub's GL policy | Per project |
| **Waiver of Subrogation** | Prevents sub's insurer from suing BB | Per project |

### 1.2 California-Specific Requirements

**CSLB Licensing:**
- California requires a license for ANY work valued over $500 (including labor and materials)
- License classifications: A (General Engineering), B (General Building), C-1 through C-61 (Specialty)
- BB likely holds a B license (General Building)
- All subs must hold the appropriate C-classification for their trade
- License verification: CSLB online lookup tool at cslb.ca.gov (shows license status, bond, WC, classifications, complaints)
- Licenses renew biennially; bond and WC must remain active continuously

**Contractor License Bond:**
- Currently **$25,000** for all licensed contractors (increased from $15,000 in 2023)
- This is a SURETY bond, not insurance -- it protects consumers, not the contractor
- Separate from any performance/payment bonds required on specific projects

**Workers Compensation (California):**
- CA Labor Code Section 3700: ALL employers with 1+ employees MUST carry WC
- No exceptions for construction
- Penalties for operating without WC:
  - Criminal: Up to $10,000 fine and/or 1 year in jail (misdemeanor)
  - Civil: Greater of 2x unpaid premium OR $1,500 per employee during uninsured period
  - Appeals Board: Additional $10,000 per employee (compensable injury) up to $100,000
  - Stop-work orders from DLSE
  - Personal liability for ALL medical bills and benefits
- Sole proprietors with no employees can opt out but must file a Certificate of Exemption

**AB5 / ABC Test (Independent Contractor Classification):**
- California presumes ALL workers are EMPLOYEES unless hiring entity proves all three prongs:
  - A: Worker is free from control and direction
  - B: Work is outside the hiring entity's usual business
  - C: Worker has an independently established business
- Construction subcontractors with their own CSLB license generally pass the ABC test
- Misclassification penalties: $5,000-$25,000 per violation (willful), plus back wages, taxes, benefits
- Business-to-Business exception exists if: written contract, separate business location, ability to negotiate rates, advertised to public

### 1.3 Insurance Requirements (Industry Standard)

Typical minimums a GC should require from subs:

| Coverage Type | Typical Minimum | Notes |
|---------------|----------------|-------|
| General Liability | $1M per occurrence / $2M aggregate | Must name GC as Additional Insured |
| Workers Compensation | Statutory limits (CA mandated) | Required if sub has ANY employees |
| Commercial Auto | $1M combined single limit | If sub drives to job sites |
| Umbrella/Excess | $1M-$5M | For higher-risk trades |
| Professional Liability | $1M | For design-build subs |

**Critical: Additional Insured Endorsement**
- Per Insureon: "The only way a subcontractor would be covered under someone else's policy is if the subcontractor is specifically named in an additional insured endorsement"
- GCs commonly require subs to add the GC as Additional Insured on the sub's GL policy
- This provides the GC with coverage under the sub's policy for claims arising from the sub's work

**Waiver of Subrogation:**
- Prevents the sub's insurance company from suing the GC to recover claim payments
- Standard requirement in most subcontract agreements

### 1.4 What Happens When Insurance Lapses Mid-Project

This is a critical scenario. Best practices from industry:

1. **Immediate notification** -- Insurance carriers send cancellation notices to certificate holders (the GC) if they're listed on the COI
2. **Stop work** -- GC should have contractual right to stop the sub's work immediately upon lapse
3. **Cure period** -- Typically 10-30 days to reinstate coverage (should be in subcontract)
4. **GC liability exposure** -- If sub works uninsured and an injury/damage occurs, the GC may be held liable as the "upstream" party
5. **Back-charge** -- GC may procure coverage and back-charge the sub
6. **Termination** -- If not cured, GC can terminate the subcontract for cause

**Digital system implication:** Expiry monitoring with 60/30/14/7 day advance warnings is essential. The system should flag ANY sub with expired insurance and prevent them from being assigned to active projects.

### 1.5 How Platforms Handle This

**Procore Prequalification:**
- Standardized application forms for all subs
- Collects: W-9, COI samples, OSHA 300A, EMR, financial statements, bonding info, trade licenses
- Four-step workflow: establish criteria -> standardized application -> verify through third parties -> maintain database
- Tracks: litigation history, license suspensions, safety awards, project backlog
- Ongoing vs. project-specific prequalification options

**GCPay:**
- Focuses on payment compliance (lien waivers, certified payroll)
- Automates compliance document collection tied to payment applications
- Links compliance status to payment approval -- subs can't get paid without current documents

**Levelset (now Procore-owned):**
- Specializes in lien rights and preliminary notice tracking
- Monitors sub payment compliance and mechanic's lien exposure

### 1.6 Recommendations for BB's System

1. **Sub profile = asset with child documents:** Each sub is an asset record with attached COI, W-9, license, bond, WC cert, agreements
2. **Automated expiry tracking:** 60/30/14/7 day email alerts for expiring documents
3. **Traffic light status:** GREEN (all current) / YELLOW (expiring within 30 days) / RED (expired)
4. **Project assignment gates:** Cannot assign a RED sub to an active project
5. **CSLB API integration:** Auto-verify license status (CSLB has a public lookup)
6. **Annual prequalification cycle:** Request updated documents annually, not just at onboarding
7. **COI auto-parsing:** Many COIs follow ACORD 25 format -- parse carrier, policy numbers, limits, dates
8. **Additional insured verification:** Flag if BB is not listed as additional insured

---

## 2. EMPLOYEE CERTIFICATION TRACKING

### 2.1 OSHA Training Requirements

**Federal OSHA Outreach (OSHA-10 / OSHA-30):**

| Aspect | OSHA-10 | OSHA-30 |
|--------|---------|---------|
| Target Audience | Entry-level workers | Supervisors, foremen, safety leads |
| Duration | 10 hours | 30 hours |
| Content | Basic hazard recognition, worker rights | In-depth safety management, hazard analysis |
| Focus Four | Falls, Struck-By, Caught-In/Between, Electrocution | Same plus advanced topics |
| Card Validity | 5 years (for replacement purposes) | 5 years (for replacement purposes) |
| Federal Mandate | **NOT required by federal OSHA** | **NOT required by federal OSHA** |
| Cost | ~$25-$90 online | ~$150-$300 online |

**Critical clarification from OSHA.gov:** "Although some states, municipalities or others may require outreach training as a condition of employment, it is not an OSHA requirement." The Outreach Training Program is VOLUNTARY at the federal level.

**However:** OSHA does NOT waive the requirement for employers to provide hazard-specific training. The Outreach cards do NOT satisfy OSHA's standards-specific training requirements (fall protection training under 1926.503, scaffolding under 1926.454, etc.).

**State Mandates:**
- **California:** Does NOT mandate OSHA-10/30 statewide (Cal/OSHA has its own standards)
- **New York:** Requires OSHA-10 for ALL construction workers on public projects (OSHA-30 for supervisors)
- **Connecticut:** Requires OSHA-10 for all construction workers
- **Massachusetts, Missouri, Nevada, New Hampshire, Rhode Island:** Various OSHA-10/30 mandates

**Even though CA doesn't mandate OSHA-10/30, most GCs require it as a best practice and many project owners require it in contract specs.**

### 2.2 Certifications a Small GC Should Track

| Certification | Who Needs It | Duration | Renewal | Penalty Risk |
|--------------|-------------|----------|---------|--------------|
| **OSHA-10 Construction** | All field workers | Card valid for replacement 5 yrs | Retake course | Best practice, some clients require |
| **OSHA-30 Construction** | Foremen, supers, safety leads | Card valid for replacement 5 yrs | Retake course | Best practice |
| **Fall Protection (1926.503)** | Anyone working at heights >6ft | No set expiration | Employer determines frequency | OSHA citation: $16,550/violation |
| **Scaffolding (1926.454)** | Scaffold erectors/users | No set expiration | Before use on new type | OSHA citation: $16,550/violation |
| **Forklift/Equipment Operator** | Equipment operators | 3 years (OSHA 1910.178) | Every 3 years + after incident | $16,550/serious violation |
| **First Aid/CPR** | At least 1 person per crew | 2 years | Every 2 years | Required where no nearby medical facility |
| **Confined Space (1926 Subpart AA)** | Anyone entering permit spaces | No set expiration | Before entry + annual review | $16,550/violation |
| **Crane Operator (1926.1427)** | Crane operators | 5 years | Recertify every 5 years | Formal NCCCO or equivalent cert required |
| **Hazard Communication (1926.59)** | All workers exposed to chemicals | No set expiration | When new hazards introduced | $16,550/violation |
| **Silica Awareness (1926.1153)** | Workers exposed to silica dust | No set expiration | Employer-determined | $16,550/violation |
| **Lead Awareness (1926.62)** | Workers in lead exposure areas | No set expiration | As needed | Required for renovation of pre-1978 buildings |
| **CA Sexual Harassment Prevention** | All employees (CA SB 1343) | 2 years | Every 2 years | CA DFEH enforcement |
| **Driver's License** | Anyone driving company vehicles | Varies | State renewal cycle | Liability exposure |

### 2.3 OSHA Penalty Structure (Effective Jan 15, 2025)

| Violation Type | Maximum Penalty |
|---------------|----------------|
| Serious | $16,550 per violation |
| Other-Than-Serious | $16,550 per violation |
| Willful or Repeated | $165,514 per violation |
| Failure to Abate | $16,550 per DAY beyond abatement date |
| Posting Requirements | $16,550 per violation |

**Note:** States with their own OSHA plans (including California/Cal-OSHA) must adopt penalties "at least as effective as" federal OSHA's.

### 2.4 Digital Cert Tracking Best Practices

1. **Cert record structure:** cert_type, cert_number, issuing_body, issue_date, expiry_date, document_scan, verified_by, verification_date
2. **Auto-alerts:** 90/60/30/14 day warnings for expiring certs
3. **Project assignment gates:** Cannot assign worker to confined space task without current confined space cert
4. **Verification workflow:** Manager reviews uploaded cert scan, marks as verified
5. **Training matrix:** Grid showing all workers vs. all required certs with status colors
6. **Audit trail:** Log all cert uploads, verifications, and expirations for OSHA inspection readiness
7. **Bulk renewal tracking:** When sending a crew to training, batch-update certs

### 2.5 Recommendations for BB's System

1. **Employee profile = asset with child cert documents:** Each employee has a cert portfolio
2. **Cert types as a configurable list:** Admin can add new cert types as requirements change
3. **Task-cert matrix:** Define which project tasks require which certs
4. **Dashboard view:** "Training Matrix" showing all employees x all certs with RED/YELLOW/GREEN
5. **Cert upload with OCR:** Parse cert cards for dates and numbers where possible
6. **OSHA inspection readiness:** One-click report showing all current certs for a job site crew

---

## 3. SELF-SERVICE PROFILE MANAGEMENT

### 3.1 The Sub Self-Registration Problem

Subcontractors work for MULTIPLE general contractors. They don't want to:
- Create a new account for every GC they work with
- Re-upload the same documents to 10 different systems
- Remember 10 different passwords

**What Procore does:**
- Subs create a Procore account ONCE
- Multiple GCs can "invite" that sub to their company directory
- Sub's profile (insurance, licenses, etc.) follows them across GC relationships
- Sub controls their own profile data
- GCs see a filtered view relevant to their relationship

**This is the gold standard but requires network effects BB won't have as a single company.**

### 3.2 Self-Service Features for Subs

| Feature | Priority | Security Concern | Mitigation |
|---------|----------|-------------------|------------|
| Upload COI / insurance docs | HIGH | Fake documents | Visual review + carrier verification |
| Update contact information | HIGH | Account hijacking | Email verification on changes |
| Upload W-9 | HIGH | PII exposure | Encrypted storage, limited access |
| View assigned projects | MEDIUM | Data leakage | Only show their projects |
| Submit bid/proposal | MEDIUM | Unauthorized submissions | Invitation-only bidding |
| View payment status | MEDIUM | Financial data exposure | Only show their payments |
| Upload license/cert scans | MEDIUM | Fake certs | CSLB API verification |
| Update insurance coverage | LOW | Incorrect data | COI must match uploaded doc |

### 3.3 Verification Workflows

**Document upload flow:**
1. Sub uploads document (COI, W-9, license scan)
2. System auto-extracts key fields (dates, amounts, policy numbers) if possible
3. Document enters "PENDING REVIEW" status
4. BB admin reviews document, verifies against source (CSLB lookup, call carrier)
5. Admin marks as "VERIFIED" or "REJECTED" with notes
6. Sub receives notification of status
7. Verified documents update the sub's compliance status

**Identity verification (first registration):**
1. Sub receives email invitation from BB
2. Sub clicks magic link, creates account
3. Sub uploads driver's license or CSLB license scan
4. BB admin verifies identity against known sub contact
5. Account activated

### 3.4 Security Concerns

1. **Document authenticity:** Subs could upload doctored COIs or fake certs
   - Mitigation: Cross-reference with CSLB API, call insurance carriers, verify ACORD form details
2. **PII protection:** W-9s contain SSN/EIN, COIs contain policy numbers
   - Mitigation: Encrypt at rest, restrict access to admins only, audit log all views
3. **Account takeover:** If sub's email is compromised, attacker gains access
   - Mitigation: Magic link + device fingerprinting, notify on new device login
4. **Data leakage between projects:** Sub should not see other subs' data or project financials
   - Mitigation: Row-level security, strict permission model
5. **Over-permissioning:** Sub accidentally gets employee-level access
   - Mitigation: Role-based access with separate sub role, principle of least privilege

### 3.5 Recommendations for BB's System

1. **Invitation-only registration:** Subs can't self-register; BB sends invite link
2. **Magic link auth for subs:** No passwords to manage (see Section 5)
3. **Upload + review workflow:** Every document goes through admin review
4. **CSLB auto-verify:** On sub registration, auto-check license status
5. **Encrypted document storage:** AES-256 for W-9s and sensitive docs
6. **Expiry-driven re-upload prompts:** System emails sub when their COI is about to expire, with a direct upload link

---

## 4. CUSTOMER PORTAL IN CONSTRUCTION

### 4.1 What Platforms Offer

**Buildertrend:**
- Client portal with real-time project progress
- Unlimited photo, video, and document storage
- Centralized messaging with team-only vs. client-facing toggle
- Invoice visibility and payment processing
- Change order documentation
- Selection boards for finishes/materials
- **Notable limitation:** Job-based structure, not client-based -- clients need separate logins per project
- **Highly reviewed:** Users praise the communication centralization

**BuildBook:**
- Client Dashboard as central communication hub
- Daily Logs shared with clients
- Team and Client Chat (separate channels)
- Mobile apps for field and client access
- Target market: Custom home builders and residential remodelers
- Emphasis on "zero training required" -- modern, intuitive interface
- Full lifecycle: "from first impression to final payment"

**CoConstruct (now Buildertrend-owned):**
- Selections management (clients choose finishes, materials)
- Change order approval workflow
- Budget tracking and financial transparency
- Scheduling visibility
- Message threading by topic/room

**CompanyCam:**
- Unlimited photo/video with auto GPS + timestamp
- Galleries organized by project
- Annotations and markup tools
- Project Feed showing recent activity
- Tags and Labels for organization
- In-app communication
- **Key differentiator:** Photo-first approach -- everything revolves around visual documentation

### 4.2 What Customers Actually Want

Based on platform analysis and industry patterns:

| Feature | Customer Demand | Implementation Complexity |
|---------|----------------|--------------------------|
| **Progress photos** | HIGHEST -- #1 requested feature | LOW -- photo upload + timeline |
| **Schedule/timeline** | HIGH -- "when will X happen?" | MEDIUM -- needs schedule data |
| **Messaging with builder** | HIGH -- replaces texting/email | LOW -- basic messaging |
| **Change order approvals** | HIGH -- transparency on cost changes | MEDIUM -- approval workflow |
| **Financial summary** | MEDIUM -- payments made, balance due | LOW -- read-only view |
| **Document access** | MEDIUM -- contracts, permits, warranties | LOW -- document links |
| **Selection boards** | MEDIUM -- choosing finishes | HIGH -- catalog integration |
| **Daily log summaries** | LOW-MEDIUM -- what happened today | LOW -- text + photos |
| **3D models/plans** | LOW -- nice to have | HIGH -- requires 3D tools |

### 4.3 Adoption and Engagement

**Industry reality:**
- Customer portal adoption varies wildly: 30-70% of clients actively use portals
- Adoption drivers:
  - Simplicity of access (magic link >> password)
  - Mobile-first design (clients check on phone)
  - Push notifications for updates
  - Photo-heavy content (visual > text)
- Adoption killers:
  - Complex login (passwords, 2FA for a homeowner viewing their kitchen reno)
  - Desktop-only design
  - Infrequent updates (if nothing new, clients stop checking)
  - Too much information (overwhelming dashboards)

**Best practice for adoption:**
1. Send a "your project portal is ready" email with a magic link
2. Post the FIRST progress photo within 24 hours of project start
3. Update at least 2x/week with photos
4. Send push/email notifications when new content is added
5. Keep the interface dead simple -- 3-4 sections maximum
6. Make it mobile-first

### 4.4 What Generates Referrals

Research and platform patterns show:
- **Before/after photos** are the #1 referral driver -- clients share them
- **Project timelines** showing the journey from demo to completion
- **Shareable project links** -- "Show your friends what we're building"
- **Testimonial prompts** after project completion
- **Social media integration** -- easy sharing to Instagram/Facebook

### 4.5 Recommendations for BB's System

1. **Photo-first portal:** Progress photos are the centerpiece, not schedules or financials
2. **Magic link access:** Customers get a link, click it, see their project. No passwords.
3. **Mobile-first design:** 80%+ of client portal access is mobile
4. **Weekly digest email:** Auto-generated email with new photos and a "View Your Project" button
5. **Shareable storybook:** Public link (optional) for the finished project that clients can share
6. **Simple structure:** Photos | Schedule | Messages | Documents -- four sections max
7. **Push notifications:** Notify on new photos, messages, change orders
8. **Post-completion:** Portal becomes a warranty/maintenance hub with project documentation

---

## 5. UNIFIED AUTH FOR MIXED INTERNAL/EXTERNAL USERS

### 5.1 The Challenge

BB needs one app serving three very different user types:

| User Type | Frequency | Tech Comfort | Security Needs | Device |
|-----------|-----------|-------------|----------------|--------|
| Employees | Daily | Medium | Medium-High | Phone + Desktop |
| Subs | Weekly-Monthly | Low-Medium | Medium | Phone |
| Customers | Weekly | Low | Low | Phone |

### 5.2 Authentication Methods Compared

**Magic Links:**
- How: User enters email, receives link, clicks to authenticate
- Pros: Zero friction, no password to remember, works on any device
- Cons: Depends on email security, email delivery delays, browser-switching issue on iOS (Auth0 noted: "Both the initial request and its response must take place in the same browser or the transaction will fail")
- Best for: Subs and customers who log in infrequently
- Security: Token-based, single-use, time-limited (typically 5-15 minutes)

**Email OTP (One-Time Password):**
- How: User enters email, receives 6-digit code, enters code
- Pros: Works even when email opens in different browser/app (solves iOS issue)
- Cons: Slightly more friction than magic link (must copy/type code)
- Best for: When magic links have delivery/browser issues
- Security: Similar to magic link but more resilient to browser-switching

**PIN/Password:**
- How: Traditional username/password
- Pros: Familiar, no email dependency, instant access
- Cons: Password fatigue, reuse, forgotten passwords, support burden
- Best for: Daily-use employees who need instant access
- Security: Only as good as the password; requires hashing, breach monitoring

**SMS OTP:**
- How: User enters phone number, receives SMS code
- Pros: Phone-based (construction workers always have phones), no email needed
- Cons: SIM swapping attacks, SMS interception, carrier costs
- Best for: Field workers who may not check email
- Security: Weaker than email-based methods due to SIM swap risk

**Passkeys/WebAuthn:**
- How: Biometric (fingerprint/face) or device-based authentication
- Pros: Highest security, zero friction after setup
- Cons: Device-dependent, not all users understand it, recovery is complex
- Best for: Future-proofing; not yet mature enough for low-tech user base
- Security: Strongest option available

### 5.3 The "Sub Who Works for Multiple GCs" Problem

This is a real architectural challenge. Options:

**Option A: Org-scoped accounts (like Procore)**
- Sub has ONE global account
- Each GC "invites" the sub to their org
- Sub switches between GC contexts
- Pros: Sub manages one profile, one set of documents
- Cons: Requires platform-level identity (BB is not building a platform for multiple GCs)

**Option B: Separate accounts per GC (current reality for most small GCs)**
- Sub creates a new account for each GC's system
- Documents are uploaded separately to each
- Pros: Simple to build, no cross-org complexity
- Cons: Sub frustration, document duplication

**Option C: BB-scoped account with good UX (RECOMMENDED)**
- Sub has one account in BB's system
- Profile and documents are stored once
- If sub works on multiple BB projects, one profile serves all
- No cross-GC complexity since BB is a single company
- Pros: Simple, solves BB's needs without over-engineering
- Cons: Doesn't help the sub with other GCs (not BB's problem to solve)

### 5.4 Recommended Auth Architecture

```
ROLE-BASED AUTH STRATEGY
========================

EMPLOYEES (daily use):
  Primary: PIN + device trust (4-digit PIN after first magic link setup)
  Fallback: Magic link
  Session: 30-day rolling on trusted device
  MFA: Optional (for admin roles)

SUBCONTRACTORS (periodic use):
  Primary: Magic link (email)
  Fallback: Email OTP (for iOS browser-switching issues)
  Session: 7-day rolling
  MFA: Not required (low-value target, high friction cost)

CUSTOMERS (occasional use):
  Primary: Magic link (email)
  Fallback: Email OTP
  Session: 30-day rolling (they should never feel logged out)
  MFA: Not required

ALL USERS:
  - Single users table with 'role' column (employee/sub/customer)
  - Permission system: role -> capabilities mapping
  - Route guards check role before rendering
  - API endpoints check role before responding
  - No shared passwords; every auth method is email-linked
```

### 5.5 Implementation with Supabase Auth

Supabase (which BB is already using Neon, but Supabase Auth is standalone-compatible):
- Magic links enabled by default
- Rate limiting built in
- PKCE flow available for enhanced security
- Redirect URL restrictions prevent token theft
- Auto-creates user on first magic link request (configurable)

Alternatively, build custom magic link on Neon:
- Generate UUID token, store in `auth_tokens` table with user_id, expiry, used_at
- Send email via SendGrid/Resend with link containing token
- On click: validate token, mark used, create session JWT
- Simple, no external auth dependency

### 5.6 Recommendations for BB's System

1. **Magic link as primary auth for all user types** -- simplest UX
2. **PIN as secondary for employees** -- allows quick daily access after initial setup
3. **Role-based permissions** -- employee/sub/customer roles with capability mapping
4. **Single users table** -- all user types in one table with role differentiation
5. **Long sessions for customers** -- 30-day rolling; never make a homeowner log in twice
6. **Device trust for employees** -- after first magic link on a device, allow PIN-only access
7. **Build custom on Neon** -- no external auth dependency, full control, simple implementation

---

## 6. BEFORE/AFTER STORYBOOKS

### 6.1 What Makes a Compelling Project Story

Based on analysis of CompanyCam, Houzz, and industry marketing patterns:

**The Narrative Arc:**
1. **The Problem:** "Here's what the kitchen looked like before" (demo photos, dated finishes, damage)
2. **The Process:** Key milestone photos showing transformation (framing, rough-in, drywall, finishes)
3. **The Reveal:** Polished final photos (staged, well-lit, multiple angles)
4. **The Impact:** Client testimonial, before/after side-by-side

**Photo Best Practices:**
- Same angle/position for before and after (tripod or marked spots)
- Natural lighting preferred; consistent time of day
- Wide shots + detail shots (hardware, tile patterns, trim work)
- Include context (exterior, street view, neighborhood)
- Clean the space before "after" photos (no tools, debris, ladders)
- Capture every room/area that was touched
- Include "in-progress" milestone shots (not just before/after)

### 6.2 Existing Tools

| Tool | Approach | Strengths | Weaknesses |
|------|----------|-----------|------------|
| **CompanyCam** | Photo-first field documentation | Auto GPS/timestamp, unlimited storage, galleries, annotations, tags, sharing | Not designed for client-facing storybooks |
| **Houzz** | Portfolio/ideabook platform | Massive audience, SEO value, homeowner discovery | You're building on someone else's platform |
| **Instagram/Facebook** | Social media galleries | Free, massive reach, clients already there | No project organization, algorithm-dependent |
| **Buildertrend** | Project portal with photo timeline | Integrated with project management | Photos are inside the portal, not shareable |
| **BuildBook** | Daily logs with photos | Simple, client-facing | Limited storybook/timeline format |
| **Custom website portfolio** | Builder's own website | Full control, SEO, branding | Requires manual curation |

### 6.3 What Generates Referrals

1. **Shareable before/after links** -- Client sends to friends: "Look what our builder did"
2. **Side-by-side comparisons** -- Slider or split-screen before/after images
3. **Project timeline** -- Scrollable journey from start to finish
4. **Testimonial integration** -- Client quote paired with project photos
5. **Social media optimization** -- Instagram carousel format, Pinterest-friendly
6. **Google Business integration** -- Photos linked to Google Business Profile reviews
7. **Neighborhood marketing** -- "Recently completed in [neighborhood]" with photos

### 6.4 The Storybook Format

A "project storybook" for BB should include:

```
PROJECT STORYBOOK STRUCTURE
============================

COVER:
  - Hero "after" photo
  - Project name / address
  - Completion date
  - BB branding

CHAPTER 1 - BEFORE:
  - 4-8 "before" photos with captions
  - Brief description of client's goals
  - Scope of work summary

CHAPTER 2 - THE BUILD:
  - Timeline of key milestones with dates
  - 8-15 progress photos at key stages:
    - Demo/demolition
    - Framing/structural
    - Rough-in (electrical, plumbing)
    - Insulation/drywall
    - Finishes (tile, cabinets, fixtures)
    - Final details
  - Optional: Fun moments, crew photos (humanizes the brand)

CHAPTER 3 - THE REVEAL:
  - 8-12 polished "after" photos
  - Every room/area that was transformed
  - Detail shots of craftsmanship
  - Side-by-side before/after comparisons

CHAPTER 4 - CLIENT STORY (optional):
  - Testimonial quote
  - What the project means to the homeowner
  - Star rating

SHARING:
  - Unique URL (bb.com/projects/smith-kitchen-2026)
  - Social media share buttons
  - QR code for print materials
  - "Interested in a similar project?" CTA
```

### 6.5 Recommendations for BB's System

1. **Auto-generate from project photos:** System creates a draft storybook from tagged photos (before/during/after)
2. **Photo tagging at upload:** When crew uploads photos, tag them as "before", "progress", or "after"
3. **Milestone markers:** Link photos to project milestones in the schedule
4. **Side-by-side generator:** Auto-create before/after comparison images from matched photo pairs
5. **Shareable public link:** Each project gets a public URL for the completed storybook
6. **Social media export:** One-click export as Instagram carousel or Facebook album
7. **Client testimonial prompt:** After project completion, system sends email asking for review + permission to share photos
8. **Portfolio page:** All completed storybooks appear on a portfolio/gallery page
9. **QR code generation:** For yard signs, business cards, and print materials linking to the storybook

---

## 7. ARCHITECTURE RECOMMENDATIONS SUMMARY

### 7.1 Unified "Human Asset" Data Model

```
PEOPLE TABLE (unified):
  id, type (employee|sub|customer), status (active|inactive|archived)
  first_name, last_name, email, phone
  company_name (subs), role (employees)
  auth_role, last_login, created_at

DOCUMENTS TABLE (child records):
  id, person_id, doc_type (coi|w9|license|cert|contract|photo_id)
  file_url, file_hash
  issue_date, expiry_date
  status (pending|verified|rejected|expired)
  verified_by, verified_at, rejection_reason
  metadata JSONB (policy_number, coverage_amount, cert_number, etc.)

CERTIFICATIONS TABLE (employee-specific):
  id, person_id, cert_type, cert_number
  issuing_body, issue_date, expiry_date
  document_id (links to uploaded scan)
  status (current|expiring|expired)
  verified_by, verified_at

PROJECT_ASSIGNMENTS TABLE:
  id, person_id, project_id, role (gc_contact|sub|homeowner)
  start_date, end_date, status

COMPLIANCE_ALERTS TABLE:
  id, person_id, document_id, alert_type (expiring|expired|missing)
  alert_date, acknowledged_by, acknowledged_at
  notification_sent_at
```

### 7.2 Lifecycle States

```
PERSON LIFECYCLE:
  INVITED -> REGISTERED -> ACTIVE -> INACTIVE -> ARCHIVED

  INVITED:    Magic link sent, not yet clicked
  REGISTERED: Account created, documents pending
  ACTIVE:     All required documents current and verified
  INACTIVE:   Lapsed documents or no recent projects
  ARCHIVED:   No longer working with BB (data retained for records)

DOCUMENT LIFECYCLE:
  UPLOADED -> PENDING_REVIEW -> VERIFIED -> EXPIRING -> EXPIRED
                             -> REJECTED (with reason)
```

### 7.3 Permission Matrix

| Capability | Employee | Sub | Customer |
|-----------|----------|-----|----------|
| View own profile | YES | YES | YES |
| Edit own contact info | YES | YES | YES |
| Upload documents | YES (certs) | YES (COI, W-9, license) | NO |
| View assigned projects | YES (all) | YES (theirs only) | YES (theirs only) |
| View project photos | YES | YES (their project) | YES (their project) |
| View financials | Role-based | Their payments only | Their invoices only |
| Message BB team | YES | YES | YES |
| View other people | Role-based | NO | NO |
| Admin functions | Admin role only | NO | NO |
| View storybook | YES | NO | YES (their project) |
| Share storybook link | NO | NO | YES |

### 7.4 Priority Implementation Order

1. **Phase 1: Employee profiles + cert tracking** (internal, highest daily value)
2. **Phase 2: Sub profiles + compliance documents** (reduces risk, satisfies insurance requirements)
3. **Phase 3: Customer portal with photos** (client satisfaction, referral generation)
4. **Phase 4: Self-service for subs** (reduces admin burden)
5. **Phase 5: Storybook generator** (marketing value, referral engine)
6. **Phase 6: Advanced features** (CSLB API integration, COI auto-parsing, social media export)

---

## 8. KEY SOURCES

| Source | URL | Used For |
|--------|-----|----------|
| Procore Prequalification | procore.com/library/subcontractor-prequalification | Sub document requirements, workflow |
| OSHA Outreach Program | osha.gov/training/outreach | OSHA-10/30 voluntary status |
| OSHA Focus Four | osha.gov/training/outreach/construction/focus-four | Construction hazard training |
| OSHA Penalties | osha.gov/penalties | Current penalty amounts (Jan 2025) |
| OSHA 1926 Standards | osha.gov/laws-regs/regulations/standardnumber/1926 | Certification requirements by trade |
| CA DIR - ABC Test | dir.ca.gov/dlse/FAQ_IndependentContractor.htm | AB5 law, misclassification penalties |
| CA DIR - Workers Comp | dir.ca.gov/dwc/faqs.html | WC requirements and penalties |
| CSLB License Lookup | cslb.ca.gov/onlineservices/checklicenseII/ | License verification capabilities |
| CSLB Classifications | cslb.ca.gov/About_Us/Library/Licensing_Classifications/ | License types (A, B, C-series) |
| Insureon - Sub Insurance | insureon.com/blog/subcontractor-insurance-requirements | Insurance types, additional insured |
| Auth0 Magic Links | auth0.com/docs/authenticate/passwordless/ | Magic link implementation, iOS issue |
| Supabase Auth | supabase.com/docs/guides/auth/auth-magic-link | Magic link with PKCE |
| Descope Magic Links | descope.com/learn/post/magic-links | Magic link pros/cons, best practices |
| OneLogin Passwordless | onelogin.com/learn/passwordless-authentication | Auth method comparison |
| CompanyCam Features | companycam.com/features | Photo documentation approach |
| Buildertrend Reviews | softwareadvice.com (Buildertrend reviews) | Client portal feedback |
| BuildBook Features | buildbook.co/features | Client dashboard, daily logs |

---

*Research completed 2026-03-29. All California-specific data current as of research date. OSHA penalties current as of January 15, 2025 adjustment.*
