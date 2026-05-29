# BB Micro-Bridge 1-to-2 Replica Production Cutover

## Purpose
This runbook defines the exact procedure for moving `BB-Micro-Bridge` production from `1` replica to `2` replicas on Railway after the recent HA hardening work.

The goal is to improve deploy and restart continuity without introducing duplicate work, duplicate notifications, token instability, or readiness flaps.

## Scope
Applies to:
- Railway project: `BB-Production`
- Railway service: `BB-Micro-Bridge`
- Environment: `production`
- Region: `us-west2`

## Intended visible outcome
The most visible effect of a second replica is smoother deploys and fewer visible restart blips.

With `1` replica:
- one restart or deploy can make the whole Bridge briefly unavailable

With `2` replicas:
- one instance can keep serving while the other is restarting or being replaced
- readiness remains available more consistently during rolling changes

## Preconditions
Do not proceed unless all of the following are true.

1. Production is currently healthy
- `/api/health` returns `status=ok`
- `/ready` returns `status=ready`
- `qbo=ok`
- `qboPersistence=ok`
- `qbt=ok`
- both circuit breakers closed

2. Staging has already been smoke-validated
- staging `/api/health` healthy
- staging `/ready` healthy
- repeated smoke loop passes

3. Current HA hardening is already deployed to production
- shared idempotency
- shared rate limiting
- shared worker/cron leases
- notification dedupe/send ledger
- readiness-based Railway health check
- `DATABASE_URL_DIRECT` configured in production

4. No active maintenance or migration activity
- no DB schema migration in flight
- no manual token reset in flight
- no env var edits in progress

## Pre-cutover checks
Run these before changing replica count.

### Production health
- `GET https://bb-micro-bridge-production.up.railway.app/api/health`
- `GET https://bb-micro-bridge-production.up.railway.app/ready`

Expected:
- `status=ok` on health
- `status=ready` on ready
- all provider checks `ok`

### Quick smoke
Run 10 rounds of:
- `/api/health`
- `/ready`

Expected:
- all requests succeed
- no readiness flap

### Log sanity
Review Railway production logs for recent:
- repeated restarts
- token persistence errors
- lease renewal failures
- duplicate notification warnings
- DB connection exhaustion

Do not cut over if logs already show instability.

## Cutover action
### Railway scale command
Scale production Bridge to 2 replicas in `us-west2`.

```powershell
railway scale --service "BB-Micro-Bridge" --environment production --us-west2 2 --json
```

If using Railway UI, set:
- Service: `BB-Micro-Bridge`
- Environment: `production`
- Region: `us-west2`
- Replicas: `2`

## Immediate verification window
Watch the service continuously for the next 5 to 10 minutes.

### Health checks
Poll every 15 to 30 seconds:
- `/api/health`
- `/ready`

Expected:
- no sustained failures
- no sustained readiness flap
- `qbo`, `qboPersistence`, `qbt` remain `ok`

### Logs
Watch for:
- startup lines from more than one instance
- lease acquisition behaving normally
- no duplicate cron bursts
- no duplicate push runs
- no duplicate receipt sync runs
- no refresh-token contention or `invalid_grant`
- no DB saturation or connection storm

### Functional checks
Verify:
- token status endpoint responds normally
- one normal authenticated request path still works
- no spike in errors from consumers

## 10-minute post-cutover soak
After the second replica is live, run a 10-minute soak against safe endpoints.

Recommended endpoints:
- `/api/health`
- `/ready`
- `/api/qbo/token-status`

Recommended posture:
- moderate concurrency only
- no refresh storm
- no write-route pressure during initial cutover

Success criteria:
- all iterations pass
- no readiness flap
- stable provider checks
- stable memory footprint per instance
- no duplicate-work symptoms in logs

## What to watch most carefully
These are the first signs that the second replica is not behaving correctly.

1. Duplicate worker execution
Symptoms:
- repeated push batch logs in the same interval
- repeated receipt sync activity in the same interval
- duplicated image warmer runs outside expected cadence

2. Duplicate notifications
Symptoms:
- same notification emitted twice
- same send ledger key appearing with conflicting outcomes

3. Token contention
Symptoms:
- repeated refresh attempts close together
- `invalid_grant`
- token persistence degradation

4. Shared-state regression
Symptoms:
- rate limiting behaves inconsistently
- idempotent requests execute twice
- lease renewal failures

5. Readiness instability
Symptoms:
- `/ready` intermittently failing even while `/live` would pass
- provider checks flipping away from `ok`

## Rollback criteria
Rollback immediately if any of the following occur and persist beyond a brief startup window.

1. `/ready` fails repeatedly
2. `qbo`, `qboPersistence`, or `qbt` degrade unexpectedly
3. duplicate worker runs are observed
4. duplicate notifications are observed
5. token refresh contention appears
6. DB connection pressure rises abnormally
7. error rate from consumers rises materially

## Rollback action
Scale production back to `1` replica.

```powershell
railway scale --service "BB-Micro-Bridge" --environment production --us-west2 1 --json
```

Then verify again:
- `/api/health`
- `/ready`
- logs for recovery to normal cadence

## Decision standard
Proceed to keep `2` production replicas only if:
- health stays clean through the cutover window
- soak stays clean for 10 minutes
- logs show no duplicate worker symptoms
- token path remains stable
- consumer-facing behavior remains normal

If any of those are not true, revert to `1` replica and fix the specific failure mode before retrying.
