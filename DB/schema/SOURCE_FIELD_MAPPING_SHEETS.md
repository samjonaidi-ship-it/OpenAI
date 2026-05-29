# Source Field Mapping Sheets

This document defines the mapping-sheet structure agents and humans should use when translating source systems into the new DB.

It does not attempt to enumerate every source field yet.
It defines the canonical mapping format.

## Purpose

Migration will fail if source mapping is implicit.

Each source domain should get a concrete mapping sheet using the structure below.

## Required Mapping Sheet Columns

For each source field, define:

- source system
- source object/table
- source field
- source field type
- target table
- target column
- transform rule
- required or optional
- source-of-truth rule
- overwrite rule
- historical handling
- notes

## Example Structure

### QBO Vendor / Customer Mapping

- source system: QBO
- source object: customer / vendor
- source field: `DisplayName`
- target table: `parties`
- target column: `display_name`
- transform: trim / normalize whitespace
- source-of-truth: QBO preferred unless local override
- historical handling: capture changes in `attribute_history`

### QBT Worker Mapping

- source system: QBT
- source object: worker or time activity related identity
- source field: worker name / external worker id
- target table: `entity_external_links`
- target column: source linkage fields
- transform: normalize identifiers
- source-of-truth: QBT for source identity record, local resolution for canonical entity link

### Current CalExp5 User Mapping

- source system: CalExp5 current state
- source object: user/employee/app profile
- source field: local role or app identity field
- target table: `users` / `employees_profile`
- transform: normalize role semantics to Track A role model

## Recommended Source Mapping Packs

Create separate mapping packs for:

1. QBO identity and financial records
2. QBT worker/time records
3. current CalExp5 operational records
4. communication sources
5. telemetry sources

## Historical Handling Rules

Each mapped field must explicitly choose one of:

- current-state only
- preserve in `attribute_history`
- preserve in raw source payload only

## Overwrite Rules

Each mapped field must explicitly choose one of:

- source always wins
- local override may win
- append-only / never overwrite
- merge required

## Resolution Rules

Each mapped source object should declare:

- identity key(s)
- matching rule
- ambiguity rule
- manual review threshold

## Track A Priority Mapping Packs

Priority order:

1. users / employee identities
2. QBO source records needed for Track A financial queries
3. QBT source records needed for Track A operational queries
4. CalExp5 crew scheduling / assignment context
5. workflow-supporting operational records

## Design Rules

1. Do not migrate without explicit field mappings.
2. Do not hide transform rules inside code only.
3. Do not assume one overwrite rule for all fields in a source object.
4. Preserve historical semantics where the target architecture requires it.
