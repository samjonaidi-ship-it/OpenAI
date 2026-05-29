# Cutover Checklist

This checklist defines the minimum conditions and steps for switching Track A operations to the new DB.

## Preconditions

- new DB schema deployed
- ingestion pipelines stable
- identity resolution validated
- core projections healthy
- workflow and approval system tested
- rollback path documented

## Technical Readiness

- [ ] schema migrations applied cleanly in target environment
- [ ] application connected to new DB in staging/shadow mode
- [ ] source sync jobs running
- [ ] no critical ingestion errors in the last validation window
- [ ] projection refresh jobs healthy
- [ ] workflow outbox processing healthy
- [ ] retry/compensation paths tested

## Data Readiness

- [ ] user and entity counts reconciled
- [ ] source watermark lag within agreed threshold
- [ ] unmatched identity records reviewed
- [ ] high-value sample records verified
- [ ] approval queues rendering correctly
- [ ] crew scheduling context verified

## Access And Policy Readiness

- [ ] Track A role matrix enforced
- [ ] admin / lead / crew slices verified
- [ ] no customer/homeowner product surfaces activated
- [ ] harness/product DB boundary preserved

## Workflow Readiness

- [ ] idempotent action paths validated
- [ ] approval-required actions validated
- [ ] low-risk auto-approved actions validated
- [ ] failed execution retry behavior validated
- [ ] compensation behavior validated

## Agent Readiness

- [ ] Track A prompts/use cases tested against new DB projections
- [ ] crew knowledge vs structured query split respected
- [ ] freshness indicators visible where needed
- [ ] no unacceptable answer regressions found in shadow testing

## Cutover Steps

1. confirm source sync freshness
2. freeze or control conflicting writes if required
3. run final reconciliation queries
4. switch Track A environment config to new DB
5. enable initial low-risk writes
6. monitor workflow, projections, and source lag
7. keep rollback path ready until stability window passes

## Post-Cutover Monitoring

- [ ] source lag monitored
- [ ] projection freshness monitored
- [ ] workflow failure rate monitored
- [ ] approval queue monitored
- [ ] agent answer quality monitored
- [ ] cost/performance monitored

## Cutover Success Criteria

- [ ] no critical workflow failures
- [ ] no critical identity mismatch discovered
- [ ] no unacceptable access leak
- [ ] Track A operational use cases functioning
- [ ] rollback not required after agreed observation window
