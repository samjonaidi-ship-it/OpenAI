# Geospatial And Place Model

This document defines how the platform should model place, address, property location, service areas, and geospatial anchors.

It is a companion to:

- `DB_ARCHITECTURE.md`
- `OBSERVATIONS_AND_TELEMETRY_MODEL.md`
- `SCHEDULING_AND_DISPATCH_MODEL.md`

## Purpose

Many platform capabilities depend on place:

- properties and jobsites
- crew GPS traces
- weather by region
- routing and ETA
- service areas
- geofences
- public-record linkage

## Core Principle

Do not treat place as only a display string.

Separate:

1. address
2. site/place
3. geospatial region
4. service area
5. geofence/zone

## Core Objects

### Address

Human-readable postal address.

Recommended table:

- `addresses`

### Place / Site

Stable physical anchor.

Examples:

- property
- parcel
- facility
- yard
- office

### Region

Shared geographic grouping.

Examples:

- weather region
- dispatch region
- operating region
- zip cluster

### Service Area

Operational area where a crew or provider can work.

### Zone / Geofence

Sub-area used for detection, proof, and monitoring.

Examples:

- tool crib zone
- driveway zone
- yard boundary
- jobsite boundary

## Recommended Core Tables

- `addresses`
- `places`
- `place_geometries`
- `regions`
- `service_areas`
- `geofences`
- `entity_place_links`

## Why This Matters

This model supports:

- property/jobsite anchoring
- telemetry attachment
- weather mapping
- travel calculations
- security zones
- public-record enrichment

## Track A Activation

Track A should activate the minimum needed subset:

- addresses
- place anchor for jobsite/property context
- entity-to-place linkage
- optional region mapping for weather/ops support

Do not overbuild parcel intelligence in Track A.

## Future Extensions

Later this model should support:

- service territories
- provider travel radius
- geofence breach detection
- security zone monitoring
- route stop sequencing

## Design Rules

1. Address is not the same thing as place.
2. Place is not the same thing as entity identity.
3. Regions and service areas should be reusable shared geospatial anchors.
4. Geofences should be modeled explicitly where detection matters.
5. Geospatial logic should enrich scheduling, telemetry, and property context without collapsing into one table.

## Next Design Step

The next practical step is to define:

- canonical address schema
- place vs property vs jobsite linkage rules
- region/service-area strategy
- whether PostGIS is needed now or later
