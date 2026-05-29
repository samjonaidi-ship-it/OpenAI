// BB Platform Schema — Drizzle Sanity Check File
// Source: BB_PLATFORM_SCHEMA-v2.md v2.23 + BB_DB_STRATEGY.md v1.4
// 13 tables: 7 C1 (master data) + 6 infrastructure
// Generated: 2026-03-15
//
// This file is for VALIDATION ONLY — not the production schema.
// Production schema will live in the Data Manager project.

import {
  pgTable,
  text,
  boolean,
  integer,
  date,
  timestamp,
  doublePrecision,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================
// COMPARTMENT 1: MASTER DATA (7 tables)
// ============================================================

// --- 2.1 EMPLOYEES ---
export const employees = pgTable('employees', {
  id:              text('id').primaryKey(),
  qboId:           text('qbo_id').unique(),
  qbtId:           text('qbt_id').unique(),

  displayName:     text('display_name').notNull(),
  firstName:       text('first_name'),
  lastName:        text('last_name'),
  email:           text('email'),
  phone:           text('phone'),
  hireDate:        date('hire_date'),
  isActive:        boolean('is_active').default(true),
  isSalaried:      boolean('is_salaried').default(false),

  enrichment:      jsonb('enrichment').default({}),
  enrichmentVersion: integer('enrichment_version').default(1),

  version:         integer('version').default(1),
  syncSource:      text('sync_source').default('qbo'),
  qboSyncToken:    text('qbo_sync_token'),
  qboLastUpdated:  timestamp('qbo_last_updated', { withTimezone: true }),
  syncedAt:        timestamp('synced_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_emp_active').on(table.isActive),
  index('idx_emp_display').on(table.displayName),
  // ISSUE #1: GIN index on JSONB path requires raw SQL
  // Drizzle's .using('gin', ...) syntax needs the sql`` helper
  index('idx_emp_card').using('gin', sql`${table.enrichment}->'cardLast4'`),
]);

// --- 2.2 CUSTOMERS ---
export const customers = pgTable('customers', {
  id:              text('id').primaryKey(),
  qboId:           text('qbo_id').unique(),

  displayName:     text('display_name').notNull(),
  companyName:     text('company_name'),
  name1:           text('name_1'),
  name2:           text('name_2'),
  lastName:        text('last_name'),
  email1:          text('email_1'),
  email2:          text('email_2'),
  phone1:          text('phone_1'),
  phone2:          text('phone_2'),
  mobile:          text('mobile'),
  address:         text('address'),
  city:            text('city'),
  state:           text('state'),
  zip:             text('zip'),
  isActive:        boolean('is_active').default(true),
  notes:           text('notes'),

  enrichment:      jsonb('enrichment').default({}),
  enrichmentVersion: integer('enrichment_version').default(1),

  version:         integer('version').default(1),
  syncSource:      text('sync_source').default('qbo'),
  qboSyncToken:    text('qbo_sync_token'),
  qboLastUpdated:  timestamp('qbo_last_updated', { withTimezone: true }),
  syncedAt:        timestamp('synced_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_cust_active').on(table.isActive),
  index('idx_cust_display').on(table.displayName),
  index('idx_cust_last').on(table.lastName),
]);

// --- 2.3 VENDORS ---
export const vendors = pgTable('vendors', {
  id:              text('id').primaryKey(),
  qboId:           text('qbo_id').unique(),

  displayName:     text('display_name').notNull(),
  shortName:       text('short_name'),
  company:         text('company'),
  email:           text('email'),
  phone:           text('phone'),
  address:         text('address'),
  city:            text('city'),
  state:           text('state'),
  zip:             text('zip'),
  isActive:        boolean('is_active').default(true),
  is1099:          boolean('is_1099').default(false),

  enrichment:      jsonb('enrichment').default({}),
  enrichmentVersion: integer('enrichment_version').default(1),

  version:         integer('version').default(1),
  syncSource:      text('sync_source').default('qbo'),
  qboSyncToken:    text('qbo_sync_token'),
  qboLastUpdated:  timestamp('qbo_last_updated', { withTimezone: true }),
  syncedAt:        timestamp('synced_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_ven_active').on(table.isActive),
  index('idx_ven_display').on(table.displayName),
]);

// --- 2.4 WORK_JOBCODES ---
export const workJobcodes = pgTable('work_jobcodes', {
  id:              text('id').primaryKey(),
  qbtId:           text('qbt_id').unique(),

  name:            text('name').notNull(),
  shortName:       text('short_name'),
  parentId:        text('parent_id'),  // Self-referencing FK — see ISSUE #2
  jobcodeType:     text('jobcode_type').notNull(),
  isActive:        boolean('is_active').default(true),
  hasChildren:     boolean('has_children').default(false),
  billable:        boolean('billable').default(true),

  enrichment:      jsonb('enrichment').default({}),
  enrichmentVersion: integer('enrichment_version').default(1),

  version:         integer('version').default(1),
  syncSource:      text('sync_source').default('qbt'),
  syncedAt:        timestamp('synced_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_jc_active').on(table.isActive),
  index('idx_jc_type').on(table.jobcodeType),
  index('idx_jc_parent').on(table.parentId),
]);

// --- 2.5 PROPERTIES ---
export const properties = pgTable('properties', {
  id:              text('id').primaryKey(),
  customerId:      text('customer_id').notNull().references(() => customers.id),  // FK enforced
  qboId:           text('qbo_id').unique(),

  name:            text('name'),
  address:         text('address').notNull(),
  city:            text('city'),
  state:           text('state'),
  zip:             text('zip'),
  zipPlus4:        text('zip_plus4'),
  county:          text('county'),
  googleFormatted: text('google_formatted'),
  lat:             doublePrecision('lat'),
  lng:             doublePrecision('lng'),
  placeId:         text('place_id'),
  geocodeStatus:   text('geocode_status'),
  googleMapsUrl:   text('google_maps_url'),
  googleMapsEmbedUrl: text('google_maps_embed_url'),

  beds:            integer('beds'),
  baths:           doublePrecision('baths'),
  sqft:            integer('sqft'),
  lotSqft:         integer('lot_sqft'),
  yearBuilt:       integer('year_built'),
  garage:          integer('garage'),
  propertyType:    text('property_type'),

  status:          text('status').default('active'),
  relationship:    text('relationship'),
  isPrimary:       boolean('is_primary').default(false),
  displayName:     text('display_name'),
  createdBy:       text('created_by'),

  enrichment:      jsonb('enrichment').default({}),
  enrichmentVersion: integer('enrichment_version').default(1),

  source:          text('source').default('qbo-sync'),
  dataConfidence:  text('data_confidence'),
  version:         integer('version').default(1),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_prop_customer').on(table.customerId),
  index('idx_prop_status').on(table.status),
  index('idx_prop_city').on(table.city),
]);

// --- 2.6 TRADES (lookup table) ---
export const trades = pgTable('trades', {
  id:              text('id').primaryKey(),
  label:           text('label').notNull(),
  aliases:         jsonb('aliases').default([]),
  autoDetectPatterns: jsonb('auto_detect_patterns').default([]),
  sortOrder:       integer('sort_order').default(0),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// --- 2.7 MASTER_ITEMS (estimate cost catalog) ---
export const masterItems = pgTable('master_items', {
  id:              text('id').primaryKey(),
  name:            text('name').notNull(),
  section:         text('section'),
  phase:           text('phase'),
  defaultBy:       text('default_by'),
  duration:        integer('duration'),
  sequence:        text('sequence'),
  leadTimeDays:    integer('lead_time_days').default(0),
  defaultHours:    doublePrecision('default_hours').default(0),
  defaultNonLabor: doublePrecision('default_non_labor').default(0),
  avgCost:         doublePrecision('avg_cost'),
  tiers:           jsonb('tiers'),
  trade:           text('trade').references(() => trades.id),  // Optional FK
  isActive:        boolean('is_active').default(true),
  enrichmentVersion: integer('enrichment_version').default(1),
  sortOrder:       integer('sort_order').default(0),
  version:         integer('version').default(1),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_mi_section').on(table.section),
  index('idx_mi_phase').on(table.phase),
]);


// ============================================================
// INFRASTRUCTURE (6 tables)
// ============================================================

// --- ENRICHMENT_FIELDS ---
export const enrichmentFields = pgTable('enrichment_fields', {
  id:            text('id').primaryKey(),
  entityType:    text('entity_type').notNull(),
  fieldKey:      text('field_key').notNull(),
  displayName:   text('display_name').notNull(),
  fieldType:     text('field_type').notNull(),
  options:       jsonb('options').default(null),
  defaultValue:  jsonb('default_value').default(null),
  isRequired:    boolean('is_required').default(false),
  isArchived:    boolean('is_archived').default(false),
  sortOrder:     integer('sort_order').default(0),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_enr_fields_entity_key').on(table.entityType, table.fieldKey),
  index('idx_enr_fields_entity').on(table.entityType),
]);

// --- APP_FIELD_SUBSCRIPTIONS ---
export const appFieldSubscriptions = pgTable('app_field_subscriptions', {
  id:            text('id').primaryKey(),
  appName:       text('app_name').notNull(),
  entityType:    text('entity_type').notNull(),
  fieldKey:      text('field_key').notNull(),
  isRequired:    boolean('is_required').default(false),
  isActive:      boolean('is_active').default(true),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_app_subs_unique').on(table.appName, table.entityType, table.fieldKey),
  index('idx_app_subs_app').on(table.appName),
]);

// --- APP_SETTINGS ---
export const appSettings = pgTable('app_settings', {
  id:            text('id').primaryKey(),
  appName:       text('app_name').notNull(),
  category:      text('category').notNull(),
  settings:      jsonb('settings').default({}).notNull(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy:     text('updated_by'),
}, (table) => [
  uniqueIndex('idx_app_settings_unique').on(table.appName, table.category),
]);

// --- AUDIT_LOG ---
export const auditLog = pgTable('audit_log', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        text('user_id'),
  userName:      text('user_name'),
  appName:       text('app_name'),
  action:        text('action').notNull(),
  entityType:    text('entity_type').notNull(),
  entityId:      text('entity_id'),
  oldValue:      jsonb('old_value'),
  newValue:      jsonb('new_value'),
  metadata:      jsonb('metadata').default({}),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_audit_user').on(table.userId),
  index('idx_audit_action').on(table.action),
  index('idx_audit_created').on(table.createdAt),
  index('idx_audit_entity').on(table.entityType, table.entityId),
  index('idx_audit_app').on(table.appName),
]);

// --- SYNC_LOG ---
export const syncLog = pgTable('sync_log', {
  id:            uuid('id').primaryKey().defaultRandom(),
  source:        text('source').notNull(),
  entityType:    text('entity_type').notNull(),
  status:        text('status').notNull(),
  recordsChecked:  integer('records_checked').default(0),
  recordsUpdated:  integer('records_updated').default(0),
  recordsInserted: integer('records_inserted').default(0),
  recordsSkipped:  integer('records_skipped').default(0),
  recordsFailed:   integer('records_failed').default(0),
  changes:       jsonb('changes').default([]),
  errors:        jsonb('errors').default([]),
  durationMs:    integer('duration_ms'),
  syncedAt:      timestamp('synced_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_sync_log_source').on(table.source),
  index('idx_sync_log_synced').on(table.syncedAt),
]);

// --- ENRICHMENT_HISTORY ---
export const enrichmentHistory = pgTable('enrichment_history', {
  id:                 text('id').primaryKey(),
  entityType:         text('entity_type').notNull(),
  entityId:           text('entity_id').notNull(),
  fieldName:          text('field_name').notNull(),
  oldValue:           jsonb('old_value'),
  newValue:           jsonb('new_value'),
  enrichmentVersion:  integer('enrichment_version').notNull(),
  changedBy:          text('changed_by').default('system'),
  changedAt:          timestamp('changed_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_eh_entity').on(table.entityType, table.entityId),
  index('idx_eh_version').on(table.entityId, table.enrichmentVersion),
  index('idx_eh_date').on(table.changedAt),
]);
