# Rollback Checklist

This checklist defines how to return Track A operations to the prior path if the new DB cutover proves unsafe.

## Rollback Principle

Rollback should be operationally simple because:

- current production remains on the old DB/system until confidence is proven
- the new DB is a parallel build, not an in-place mutation

## Rollback Triggers

Rollback should be considered if any of the following occur:

- critical workflow execution failures
- approval/governance failure
- identity-resolution failure causing operational risk
- projection corruption or unacceptable staleness
- source sync failure beyond agreed threshold
- access/visibility leak
- unacceptable agent answer regression

## Immediate Actions

- [ ] stop enabling new high-risk writes
- [ ] disable new DB write path if needed
- [ ] return Track A runtime config to old production path
- [ ] preserve logs, traces, and audit evidence
- [ ] pause nonessential migration jobs if they complicate recovery

## Verification After Rollback

- [ ] old path healthy
- [ ] operators can continue core work
- [ ] no pending critical actions lost
- [ ] rollback status communicated to team

## Data Handling Rules

- do not delete new DB records during initial rollback
- preserve failed/cutover-era evidence for analysis
- isolate rollback-period records for later reconciliation

## Post-Rollback Review

- [ ] identify failure class
- [ ] determine whether issue is:
  - schema
  - migration
  - workflow
  - projection
  - access
  - source sync
- [ ] document remediation plan
- [ ] define new shadow-test criteria before next cutover attempt
