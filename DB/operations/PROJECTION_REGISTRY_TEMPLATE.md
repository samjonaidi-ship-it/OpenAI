# PROJECTION_REGISTRY_TEMPLATE.md

## Purpose

This template defines the minimum metadata every projection must have.

Use one registry row per projection version.

## Registry Fields

- `projection_name`
- `projection_version`
- `projection_family`
- `business_purpose`
- `consumer_apps`
- `owning_domain`
- `source_layers`
- `canonical_dependencies`
- `source_systems`
- `refresh_trigger_model`
- `freshness_class`
- `target_freshness_sla`
- `incremental_refresh_strategy`
- `full_rebuild_strategy`
- `write_path_dependency`
- `security_scope`
- `contains_sensitive_financials`
- `contains_pii`
- `contains_attachment_metadata`
- `row_key_shape`
- `expected_cardinality`
- `indexes_required`
- `validation_checks`
- `cutover_status`
- `retirement_status`

## Template

### Projection Identity
- Projection Name:
- Projection Version:
- Projection Family:
- Owning Domain:

### Purpose
- Business Purpose:
- Consumer Apps:
- Primary Queries Served:

### Dependency Graph
- Source Systems:
- Raw Source Tables:
- Canonical Tables:
- Upstream Projections Used:
- Downstream Projections Impacted:

### Refresh Model
- Freshness Class:
- Target Freshness SLA:
- Refresh Trigger Model:
- Incremental Refresh Strategy:
- Full Rebuild Strategy:
- Watermark / Cursor Dependency:

### Data Shape
- Row Key Shape:
- Grain:
- Expected Cardinality:
- Major Derived Fields:
- Large/Variable Payload Columns:

### Security And Access
- Security Scope:
- Sensitive Financial Data:
- PII:
- Attachment Metadata:
- Role/Portal Filtering Required:

### Performance
- Indexes Required:
- Sort Patterns:
- Typical Query Filters:
- Expected Read Frequency:
- Expected Write / Refresh Frequency:

### Validation
- Row Count Validation:
- Freshness Validation:
- Source-to-Projection Reconciliation:
- Consumer App Smoke Checks:

### Lifecycle
- Cutover Status:
- Rebuild Command / Job:
- Rollback Plan:
- Retirement Status:

## Example Minimal Registry Table

Suggested DB metadata table:
- `projection_registry`

Suggested supporting tables:
- `projection_refresh_state`
- `projection_refresh_job`
- `projection_dependency_registry`
- `projection_validation_result`

## Governance Rules

1. No production projection without a registry entry.
2. No semantic projection change without version bump review.
3. No app should consume an unregistered projection.
4. Every projection must define both incremental refresh and full rebuild.
5. Every projection must define security scope explicitly.
