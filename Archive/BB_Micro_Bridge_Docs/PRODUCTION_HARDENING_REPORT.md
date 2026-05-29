# BB_Micro_Bridge Production Hardening Report | v1.0 | 2026-03-27 | BB

Comprehensive research findings for hardening the Fastify 5 API gateway on Railway with Neon Postgres.

---

## Table of Contents

1. [Fastify 5 Production Hardening](#1-fastify-5-production-hardening)
2. [Railway Deployment Optimization](#2-railway-deployment-optimization)
3. [Node.js Process Resilience](#3-nodejs-process-resilience)
4. [High Availability Patterns](#4-high-availability-patterns)
5. [Observability & Monitoring](#5-observability--monitoring)
6. [Database Connection Resilience (Neon Postgres)](#6-database-connection-resilience-neon-postgres)
7. [Caching & Performance](#7-caching--performance)
8. [Security Hardening](#8-security-hardening)
9. [Zero-Downtime Operations](#9-zero-downtime-operations)
10. [Cost Optimization](#10-cost-optimization)

---

## 1. Fastify 5 Production Hardening

### 1.1 Server Configuration (Timeouts, Keep-Alive, Connections)

**Best practice:** Set explicit timeouts at the server level and override per-route for long-running endpoints. Never rely on Node.js defaults.

```js
import Fastify from 'fastify';

const app = Fastify({
  logger: true, // Pino structured JSON logging

  // --- Timeouts ---
  connectionTimeout: 10_000,     // 10s - max time to receive full HTTP request headers
  requestTimeout: 30_000,        // 30s - max time for the entire request (socket level)
  keepAliveTimeout: 72_000,      // 72s - idle keep-alive connection lifetime (> ALB 60s default)
  headersTimeout: 15_000,        // 15s - prevents Slowloris attacks
  handlerTimeout: 60_000,        // 60s - application-level handler timeout, sends 503 on expiry

  // --- Connection Management ---
  forceCloseConnections: 'idle', // Close idle keep-alive connections on shutdown
                                 // Use true if 'idle' causes issues on older Node versions

  // --- Body Limits ---
  bodyLimit: 10 * 1024 * 1024,  // 10MB global (override per-route for receipts/images)

  // --- Graceful Shutdown ---
  return503OnClosing: true,      // Return 503 once fastify.close() is called
});
```

**Per-route timeout override** (e.g., for receipt AI processing):

```js
app.post('/api/receipts/process', {
  handler: receiptHandler,
  handlerTimeout: 120_000, // 2 minutes for AI processing
  bodyLimit: 30 * 1024 * 1024, // 30MB for receipt images
});
```

**Key insight:** `handlerTimeout` is cooperative -- when it fires, Fastify sends 503 but async work continues. Use `request.signal` to detect cancellation:

```js
async function receiptHandler(request, reply) {
  const result = await aiProcess(request.body, { signal: request.signal });
  return result;
}
```

### 1.2 Graceful Shutdown

**Best practice:** Use `fastify-graceful-shutdown` or implement manually. Railway sends SIGTERM with configurable drain time before SIGKILL.

```js
import closeWithGrace from 'close-with-grace';

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) {
    app.log.error({ err }, 'Server closing due to error');
  }
  app.log.info({ signal }, 'Graceful shutdown initiated');
  await app.close(); // Stops accepting new connections, drains in-flight
});
```

Alternatively, manual signal handling:

```js
const shutdown = async (signal) => {
  app.log.info({ signal }, 'Shutdown signal received');
  try {
    await app.close();       // Drains in-flight requests, calls onClose hooks
    await pool.end();        // Close DB pool (registered in onClose hook ideally)
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Safety net -- force exit after 15 seconds
const FORCE_SHUTDOWN_MS = 15_000;
process.on('SIGTERM', () => {
  setTimeout(() => {
    app.log.error('Forced shutdown after timeout');
    process.exit(1);
  }, FORCE_SHUTDOWN_MS).unref();
});
```

### 1.3 Health Check & Readiness Probes

**Best practice:** Use `@fastify/under-pressure` for automatic load shedding + custom health endpoint.

```js
import underPressure from '@fastify/under-pressure';

await app.register(underPressure, {
  maxEventLoopDelay: 1000,           // 1s event loop delay threshold
  maxHeapUsedBytes: 500 * 1024 * 1024, // 500MB heap threshold
  maxRssBytes: 800 * 1024 * 1024,      // 800MB RSS threshold
  maxEventLoopUtilization: 0.90,       // 90% event loop utilization
  retryAfter: 5,                        // Retry-After header value (seconds)
  pressureHandler: (req, rep, type, value) => {
    app.log.warn({ type, value }, 'Server under pressure');
    rep.status(503).send({ error: 'Service temporarily unavailable', type });
  },
  healthCheck: async () => {
    // Custom check: verify DB is reachable
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } catch (err) {
      app.log.error(err, 'Health check DB query failed');
      return false;
    } finally {
      client.release();
    }
  },
  healthCheckInterval: 5000, // Check every 5 seconds
  exposeStatusRoute: {
    url: '/health',
    routeOpts: {
      logLevel: 'silent', // Don't spam logs with health checks
    },
  },
});
```

**Dedicated health endpoints:**

```js
// Liveness -- is the process alive?
app.get('/live', { logLevel: 'silent' }, async () => ({ status: 'ok' }));

// Readiness -- can it serve traffic? (checks dependencies)
app.get('/ready', { logLevel: 'silent' }, async () => {
  const dbOk = await checkDb();
  const status = dbOk ? 'ready' : 'degraded';
  return { status, db: dbOk, uptime: process.uptime() };
});

// Deep health -- full dependency check (for internal monitoring only)
app.get('/health/deep', async () => {
  const [dbOk, cacheOk, qbOk] = await Promise.allSettled([
    checkDb(),
    checkCache(),
    checkQuickBooks(),
  ]);
  return {
    db: dbOk.status === 'fulfilled' && dbOk.value,
    cache: cacheOk.status === 'fulfilled' && cacheOk.value,
    quickbooks: qbOk.status === 'fulfilled' && qbOk.value,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  };
});
```

### 1.4 JSON Schema Validation

**Best practice:** Fastify compiles JSON schemas with Ajv v8 at startup for near-zero runtime validation cost. Always define schemas.

```js
const pingBodySchema = {
  type: 'object',
  required: ['device_id', 'lat', 'lng', 'timestamp'],
  properties: {
    device_id: { type: 'string', minLength: 1, maxLength: 100 },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
    timestamp: { type: 'string', format: 'date-time' },
    accuracy: { type: 'number', minimum: 0 },
    speed: { type: 'number', minimum: 0 },
  },
  additionalProperties: false,
};

app.post('/api/gps/ingest/generic', {
  schema: {
    body: pingBodySchema,
    response: {
      200: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          id: { type: 'integer' },
        },
      },
    },
  },
  handler: genericIngestHandler,
});
```

**Default Ajv config** (Fastify defaults, usually fine):
- `removeAdditional: true` -- strips unknown properties
- `useDefaults: true` -- fills missing fields from `default` keyword
- `coerceTypes: true` -- auto-coerces query strings to correct types

### 1.5 Rate Limiting

**Best practice:** Use `@fastify/rate-limit` with tiered limits per route type.

```js
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  global: true,
  max: 200,           // Default: 200 requests per window
  timeWindow: 60_000, // 1 minute window
  allowList: ['127.0.0.1', '::1'], // Exempt localhost
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
});

// Override per-route for GPS ingestion (high frequency)
app.post('/api/gps/ingest/:source', {
  config: {
    rateLimit: { max: 600, timeWindow: 60_000 }, // 10 req/sec
  },
  handler: gpsIngestHandler,
});

// Tighter limit for expensive AI operations
app.post('/api/receipts/process', {
  config: {
    rateLimit: { max: 20, timeWindow: 60_000 }, // 20/min
  },
  handler: receiptHandler,
});

// Exempt health checks and images from rate limiting
app.get('/health', { config: { rateLimit: false } }, healthHandler);
app.get('/api/properties/streetview/:lat/:lng', {
  config: { rateLimit: false },
  handler: streetViewHandler,
});
```

**Sources:**
- [Fastify Server Options](https://fastify.dev/docs/latest/Reference/Server/)
- [fastify-graceful-shutdown](https://github.com/hemerajs/fastify-graceful-shutdown)
- [@fastify/under-pressure](https://github.com/fastify/under-pressure)
- [Fastify Validation & Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit)
- [Handling HTTP Timeouts in Fastify (Nearform)](https://nearform.com/digital-community/handling-http-timeouts-in-fastify/)
- [fastify-healthcheck npm](https://www.npmjs.com/package/fastify-healthcheck)

---

## 2. Railway Deployment Optimization

### 2.1 Health Check Configuration

**Railway config:** Set health endpoint in service Settings or `railway.json`.

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**Critical rules:**
- Endpoint must return HTTP 200 when ready
- Default timeout is 300 seconds (5 minutes) -- configurable via `RAILWAY_HEALTHCHECK_TIMEOUT_SEC`
- Railway only checks health at deploy time, NOT continuously
- Your app MUST listen on `process.env.PORT` -- Railway uses this port for health checks
- Health checks originate from `healthcheck.railway.app` -- allowlist this if restricting hostnames
- Volume-attached services WILL have brief downtime during redeploy regardless of health checks

### 2.2 Zero-Downtime Deploys

**Railway config (environment variables):**

```
RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=10     # Old deployment stays active 10s after new goes live
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15    # Time for SIGTERM -> SIGKILL on old deployment
```

**How it works:**
1. New deployment starts, health check begins
2. Health check passes -> new deployment goes active
3. Old deployment remains active for `OVERLAP_SECONDS` (traffic overlap)
4. Old deployment receives SIGTERM
5. Old deployment has `DRAINING_SECONDS` to finish in-flight requests
6. SIGKILL sent if still running

**Railway does per-service blue-green deploys by default.** No multi-service atomic deploys available.

### 2.3 Dockerfile (Recommended over Nixpacks)

**Best practice:** Use a custom Dockerfile for 9x faster builds and 70-90% smaller images.

```dockerfile
# === Build Stage ===
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Copy source and build (if TypeScript)
COPY . .
# RUN npm run build  # Uncomment if using TypeScript

# === Production Stage ===
FROM node:22-alpine AS production
WORKDIR /app

# Security: run as non-root
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup

# Install production deps only
COPY package.json package-lock.json ./
RUN npm ci --production --ignore-scripts && npm cache clean --force

# Copy application code
COPY --from=builder /app/src ./src
# COPY --from=builder /app/dist ./dist  # If TypeScript

# Set ownership
RUN chown -R appuser:appgroup /app
USER appuser

# Railway injects PORT at runtime
EXPOSE 3105

# Use node directly (not npm) for proper signal handling
CMD ["node", "src/server.js"]
```

**Build comparison on Railway:**

| Method | Build + Deploy Time | Image Size |
|--------|-------------------|------------|
| Nixpacks | ~1m 27s | Large (bloated /nix/store) |
| Custom Dockerfile | ~15s | Small (~150MB with Alpine) |
| Pre-built Image | ~6s | Smallest |
| Railpack (new, beta) | Faster than Nixpacks | 38% smaller than Nixpacks |

**Key:** Railway is moving from Nixpacks to Railpack (March 2026). For maximum control, custom Dockerfile remains best.

### 2.4 Memory/CPU Optimization

**Railway service settings (Replica Limits):**
- Navigate to Settings > Deploy > Replica Limits
- Set memory limit to 512MB-768MB for a typical Node.js API bridge
- Set vCPU limit based on workload (0.5-1 vCPU for most APIs)

**Node.js memory flags (in Dockerfile CMD or start command):**

```dockerfile
CMD ["node", "--max-old-space-size=460", "src/server.js"]
```

Set `--max-old-space-size` to ~85% of your Railway memory limit to leave room for native allocations.

### 2.5 Environment Variables

**Railway best practices:**
- Variables are injected at runtime, never written to disk
- Use Railway's variable management in dashboard (Settings > Variables)
- Use variable references to share values between services: `${{ shared.DATABASE_URL }}`
- Never commit secrets to code -- Railway's env vars are the source of truth

### 2.6 Sleep Prevention

**For production API bridges that must stay awake:**
- Disable Serverless: Settings > Serverless > Toggle OFF "Enable Serverless"
- Any outbound traffic (DB connections, HTTP calls, telemetry) keeps the service awake
- Active database connection pools inherently prevent sleeping
- Cold start time is typically < 1 second, but for an API bridge this is unacceptable

**If you want sleep for staging/dev:**
- Leave Serverless enabled (default)
- Service sleeps after 10 minutes of no outbound traffic
- First inbound request wakes it (requests are queued during startup)

### 2.7 Persistent Storage

Railway filesystem is ephemeral -- wiped on every deploy. Options:
- **Neon Postgres**: Primary data store (already using)
- **Railway Volumes**: Persistent disk ($0.15/GB/month), but causes downtime on redeploy
- **Upstash Redis**: Serverless Redis for caching (see Section 7)
- **R2/S3**: Object storage for files (receipts, etc.)

**Sources:**
- [Railway Healthchecks](https://docs.railway.com/deployments/healthchecks)
- [Railway Deployment Teardown](https://docs.railway.com/deployments/deployment-teardown)
- [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [Railway Pricing](https://docs.railway.com/pricing)
- [Railway App Sleeping](https://docs.railway.com/reference/app-sleeping)
- [Nixpacks vs Railpack](https://blog.railway.com/p/introducing-railpack)
- [Comparing Deployment Methods on Railway](https://blog.railway.com/p/comparing-deployment-methods-in-railway)

---

## 3. Node.js Process Resilience

### 3.1 Signal Handling

**Best practice:** Handle SIGTERM and SIGINT only. Use `node` directly as CMD (not npm/yarn which don't forward signals properly).

```js
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return; // Prevent duplicate shutdowns
  isShuttingDown = true;

  app.log.info({ signal }, 'Graceful shutdown started');

  // 1. Stop accepting new connections
  try {
    await app.close();
    app.log.info('Fastify server closed');
  } catch (err) {
    app.log.error(err, 'Error closing Fastify');
  }

  // 2. Close database pool
  try {
    await pool.end();
    app.log.info('Database pool closed');
  } catch (err) {
    app.log.error(err, 'Error closing database pool');
  }

  // 3. Exit cleanly
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Safety net: force exit after 15 seconds
process.on('SIGTERM', () => {
  setTimeout(() => {
    app.log.error('Forced shutdown -- timeout exceeded');
    process.exit(1);
  }, 15_000).unref();
});
```

### 3.2 Unhandled Rejection & Uncaught Exception

**Best practice:** Log everything, then die. Never try to keep running after an uncaught exception.

```js
process.on('uncaughtException', (err, origin) => {
  // CRITICAL: Do NOT try to keep running. State is corrupted.
  app.log.fatal({ err, origin }, 'UNCAUGHT EXCEPTION -- crashing');

  // Attempt graceful shutdown, but force exit quickly
  gracefulShutdown('uncaughtException').finally(() => process.exit(1));

  // Absolute safety net
  setTimeout(() => process.exit(1), 5000).unref();
});

process.on('unhandledRejection', (reason, promise) => {
  app.log.fatal({ reason, promise }, 'UNHANDLED REJECTION -- crashing');

  gracefulShutdown('unhandledRejection').finally(() => process.exit(1));

  setTimeout(() => process.exit(1), 5000).unref();
});
```

**Key:** Railway will auto-restart the service on crash (with `restartPolicyType: "ON_FAILURE"`).

### 3.3 Memory Leak Prevention

**Strategies for long-running Node.js services:**

1. **Bound all caches** -- Always use `max` or `maxSize` on LRU caches
2. **Clean up timers** -- Clear `setInterval`/`setTimeout` in `onClose` hooks
3. **Use WeakRef/WeakMap** for object references that should be GC'd
4. **Monitor with `@fastify/under-pressure`** -- catches growing heap/RSS
5. **Set `--max-old-space-size`** -- prevents V8 from consuming all container memory
6. **Nullify closures** -- Set large objects to `null` after use in closures

**Runtime monitoring:**

```js
// Periodic memory check (log every 5 minutes)
setInterval(() => {
  const mem = process.memoryUsage();
  app.log.info({
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    rss: Math.round(mem.rss / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
  }, 'Memory usage (MB)');
}, 5 * 60 * 1000).unref();
```

**Debugging tools (staging, not production):**
- `clinic heapprofiler -- node server.js` (Clinic.js) -- flame graphs for memory allocations
- `node --inspect server.js` + Chrome DevTools heap snapshots
- Compare two snapshots to find growing objects

### 3.4 Connection Pool Management

**Best practice:** Register pool cleanup in Fastify's `onClose` hook.

```js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 15,                    // Max connections in pool
  idleTimeoutMillis: 30_000,  // Close idle connections after 30s
  connectionTimeoutMillis: 5_000, // Fail fast on connection timeout
  ssl: { rejectUnauthorized: false },
});

// Listen for unexpected pool errors
pool.on('error', (err) => {
  app.log.error(err, 'Unexpected database pool error');
});

// Register cleanup
app.addHook('onClose', async () => {
  app.log.info('Closing database pool');
  await pool.end();
});
```

### 3.5 Cluster Mode on Railway

**Recommendation: Do NOT use Node.js cluster mode on Railway.** Railway's horizontal scaling (multiple replicas) handles this better. Cluster mode within a single container adds complexity and makes debugging harder. Instead:
- Scale horizontally by adding replicas in Railway settings
- Each replica is an independent container with its own process
- Railway load-balances across replicas automatically

**Sources:**
- [Graceful Shutdown (DEV Community)](https://dev.to/nse569h/dont-let-your-nodejs-app-die-ugly-a-guide-to-perfect-graceful-shutdowns-ing)
- [Node.js Process Lifecycle](https://www.thenodebook.com/node-arch/node-process-lifecycle)
- [Heroku Best Practices for Node.js Errors](https://www.heroku.com/blog/best-practices-nodejs-errors/)
- [Memory Leak Detection (OneUptime)](https://oneuptime.com/blog/post/2026-01-26-nodejs-memory-leak-profiling/view)
- [Memory Leaks (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/high-performance-nodejs/nodejs-memory-leaks/)

---

## 4. High Availability Patterns

### 4.1 Circuit Breaker (Cockatiel)

**Best practice:** Use `cockatiel` (already in BB_Micro_Bridge). It provides circuit breaker, retry, bulkhead, timeout, and fallback policies with a composable `wrap()` API.

```js
import {
  circuitBreaker,
  retry,
  handleAll,
  handleType,
  handleWhenResult,
  ConsecutiveBreaker,
  SamplingBreaker,
  ExponentialBackoff,
  bulkhead,
  timeout,
  wrap,
  TimeoutStrategy,
} from 'cockatiel';

// --- QuickBooks API Circuit Breaker ---
const qbCircuitBreaker = circuitBreaker(handleAll, {
  halfOpenAfter: 30_000,                    // Try again after 30s
  breaker: new ConsecutiveBreaker(5),       // Open after 5 consecutive failures
});

qbCircuitBreaker.onBreak(() => {
  app.log.warn('QuickBooks circuit breaker OPEN -- stopping calls');
});
qbCircuitBreaker.onReset(() => {
  app.log.info('QuickBooks circuit breaker CLOSED -- resuming calls');
});

// --- Retry with Exponential Backoff ---
const qbRetry = retry(handleAll, {
  maxAttempts: 3,
  backoff: new ExponentialBackoff({
    initialDelay: 1000,   // 1s initial
    maxDelay: 30_000,     // 30s max
    exponent: 2,
  }),
});

// --- Timeout ---
const qbTimeout = timeout(15_000, TimeoutStrategy.Aggressive); // 15s

// --- Compose into a single policy ---
const qbPolicy = wrap(qbRetry, qbCircuitBreaker, qbTimeout);

// Usage:
const result = await qbPolicy.execute(({ signal }) =>
  fetchFromQuickBooks('/api/v3/company/...', { signal })
);
```

### 4.2 Bulkhead Isolation

**Best practice:** Limit concurrent executions per route type to prevent one slow dependency from consuming all resources.

```js
// GPS ingestion: max 10 concurrent, 50 queued
const gpsBulkhead = bulkhead(10, 50);

// Receipt AI: max 3 concurrent, 10 queued (expensive)
const receiptBulkhead = bulkhead(3, 10);

// QuickBooks: max 5 concurrent, 20 queued
const qbBulkhead = bulkhead(5, 20);

// Usage in route handler:
app.post('/api/receipts/process', async (request, reply) => {
  try {
    const result = await receiptBulkhead.execute(() =>
      processReceipt(request.body)
    );
    return result;
  } catch (err) {
    if (err.name === 'BulkheadRejectedError') {
      reply.status(429).send({ error: 'Too many receipt processing requests' });
    }
    throw err;
  }
});
```

### 4.3 OSRM Circuit Breaker

**Already implemented** in BB_Micro_Bridge via `osrmExecute`. Ensure the pattern matches:

```js
// OSRM self-hosted: more lenient (it's our server)
const osrmBreaker = circuitBreaker(handleAll, {
  halfOpenAfter: 10_000,
  breaker: new SamplingBreaker({
    threshold: 0.5,    // Open at 50% failure rate
    duration: 30_000,  // Over 30 second window
    minimumRps: 2,     // Need at least 2 req/s before sampling
  }),
});

const osrmRetry = retry(handleAll, {
  maxAttempts: 2,
  backoff: new ExponentialBackoff({ initialDelay: 500 }),
});

const osrmPolicy = wrap(osrmRetry, osrmBreaker);
```

### 4.4 Rate Limiting Tiers

| Path | Max Requests | Window | Rationale |
|------|-------------|--------|-----------|
| `/api/gps/ingest/*` | 600 | 1 min | High-frequency GPS pings |
| `/api/receipts/*` | 60 | 1 min | Moderate use |
| `/api/receipts/process` | 20 | 1 min | Expensive AI processing |
| `/api/qbo/*` | 100 | 1 min | QuickBooks has its own limits |
| `/api/properties/*` | 200 | 1 min | Street View + property data |
| `/health`, `/live`, `/ready` | No limit | -- | Always available |
| Image endpoints | No limit | -- | Served from cache |
| Default (all others) | 200 | 1 min | General safety net |

**Sources:**
- [Cockatiel GitHub](https://github.com/connor4312/cockatiel)
- [Cockatiel npm](https://www.npmjs.com/package/cockatiel)
- [Opossum GitHub](https://github.com/nodeshift/opossum)

---

## 5. Observability & Monitoring

### 5.1 Structured Logging with Pino

**Best practice:** Fastify uses Pino by default. Configure for Railway's log parser.

```js
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    // In production: raw JSON (no pino-pretty)
    // In development: use pino-pretty
    ...(process.env.NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    }),
    // Redact sensitive fields
    redact: {
      paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
    // Custom serializers
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          hostname: req.hostname,
          remoteAddress: req.ip,
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  },
});
```

**Railway structured log format** (single-line JSON, `level` field auto-colored):

```json
{"level":"info","time":1711545600000,"msg":"Request completed","method":"GET","url":"/api/gps/status","statusCode":200,"responseTime":12}
```

**Railway log rules:**
- Rate limit: 500 log lines per second per replica
- Retention: 7 days (Hobby), 30 days (Pro), 90 days (Enterprise)
- Filter in Log Explorer: `@level:error`, `NOT @url:"/health"`, `@method:POST`

### 5.2 Health Endpoint Design

```
GET /health       -- Railway deployment health check (simple 200)
GET /live         -- Liveness probe (is the process alive?)
GET /ready        -- Readiness probe (can it serve traffic?)
GET /health/deep  -- Full dependency check (internal monitoring only)
GET /metrics      -- Lightweight metrics endpoint (optional)
```

### 5.3 Lightweight Metrics (Without Prometheus)

**Best practice:** For a single-instance API bridge, a simple `/metrics` endpoint is sufficient.

```js
// Track basic metrics in-process
const metrics = {
  requests: { total: 0, byStatus: {} },
  latency: { sum: 0, count: 0, max: 0 },
  errors: { total: 0, byType: {} },
  circuitBreakers: { qb: 'closed', osrm: 'closed' },
  startTime: Date.now(),
};

app.addHook('onResponse', (request, reply, done) => {
  metrics.requests.total++;
  const status = reply.statusCode;
  metrics.requests.byStatus[status] = (metrics.requests.byStatus[status] || 0) + 1;

  const latency = reply.elapsedTime;
  metrics.latency.sum += latency;
  metrics.latency.count++;
  if (latency > metrics.latency.max) metrics.latency.max = latency;

  if (status >= 500) metrics.errors.total++;
  done();
});

app.get('/metrics', { logLevel: 'silent' }, async () => ({
  uptime: Math.round((Date.now() - metrics.startTime) / 1000),
  requests: metrics.requests,
  latency: {
    avg: Math.round(metrics.latency.sum / Math.max(metrics.latency.count, 1)),
    max: Math.round(metrics.latency.max),
  },
  errors: metrics.errors,
  circuitBreakers: metrics.circuitBreakers,
  memory: {
    heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
  },
  pool: {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  },
}));
```

### 5.4 Error Tracking

**Options (ranked by effort/value for this project):**

| Tool | Cost | Setup Effort | Features |
|------|------|-------------|----------|
| **Sentry** (recommended) | Free tier: 5k events/mo | Low -- `@sentry/node` + Fastify integration | Error grouping, breadcrumbs, performance monitoring |
| **Better Stack** | Free tier: 10 monitors | Low | Uptime + log management + incident management |
| **GlitchTip** | Free (self-hosted) | Medium -- deploy on Railway | Sentry-compatible, lightweight |
| **Pino logs + Railway Log Explorer** | $0 extra | Already done | Manual analysis, no grouping |

**Sentry setup for Fastify:**

```js
// instrument.js -- MUST be imported before all other modules
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  tracesSampleRate: 0.1, // 10% of transactions
  profilesSampleRate: 0.1,
});

// In server.js (after creating Fastify instance):
import * as Sentry from '@sentry/node';
Sentry.setupFastifyErrorHandler(app);
```

### 5.5 External Uptime Monitoring

**Recommendation:** Use one of these to monitor from outside Railway.

| Tool | Free Tier | Check Interval (Paid) | Cost |
|------|-----------|----------------------|------|
| **UptimeRobot** | 50 monitors, 5-min checks | 1-min checks | $7/mo |
| **Better Stack** | 10 monitors, 3-min checks | 30-sec checks | $24/mo |
| **Uptime Kuma** (self-hosted on Railway) | Unlimited | Configurable | ~$5/mo Railway cost |

For BB_Micro_Bridge, UptimeRobot free tier is sufficient: monitor `/health` endpoint every 5 minutes with Slack/Discord alerts on failure.

**Sources:**
- [Railway Observability Dashboard](https://docs.railway.com/observability)
- [Railway Logs](https://docs.railway.com/observability/logs)
- [Railway Monitoring Blog](https://blog.railway.com/p/using-logs-metrics-traces-and-alerts-to-understand-system-failures)
- [Pino Logger Guide (SigNoz)](https://signoz.io/guides/pino-logger/)
- [Pino Logger Guide (Better Stack)](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)
- [Sentry Fastify Integration](https://docs.sentry.io/platforms/javascript/guides/fastify/)
- [UptimeRobot](https://uptimerobot.com)
- [Better Stack Uptime](https://betterstack.com/uptime)

---

## 6. Database Connection Resilience (Neon Postgres)

### 6.1 Connection String Configuration

**Best practice:** Use the pooled connection string (with `-pooler` suffix) for all application queries. Use the direct connection string only for migrations.

```
# Pooled (for application -- goes through PgBouncer, supports 10k concurrent)
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require

# Direct (for migrations/schema push only)
DATABASE_URL_DIRECT=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

**Neon PgBouncer config (not user-configurable):**
- `pool_mode=transaction` (connections returned to pool after each transaction)
- `max_client_conn=10000`
- `default_pool_size=0.9 * max_connections`
- `query_wait_timeout=120`

### 6.2 Drizzle + node-postgres Pool Setup

```js
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Pooled string
  max: 15,                     // Application-side pool (Neon PgBouncer handles the rest)
  idleTimeoutMillis: 30_000,   // Close idle connections after 30s
  connectionTimeoutMillis: 5_000, // Fail fast
  ssl: { rejectUnauthorized: false },
  // For Neon: keepalive helps detect dropped connections
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

const db = drizzle(pool, { schema });

export { db, pool };
```

### 6.3 Connection Retry with Exponential Backoff

```js
async function executeWithRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = (
        err.code === '08006' ||   // Connection failure
        err.code === '08003' ||   // Connection does not exist
        err.code === '40001' ||   // Serialization failure
        err.code === '57P01' ||   // Admin shutdown (Neon scaling)
        err.code === 'ECONNRESET' ||
        err.code === 'ECONNREFUSED' ||
        err.message?.includes('Connection terminated unexpectedly') ||
        err.message?.includes('SSL connection has been closed')
      );

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
      const jitter = Math.random() * 500;
      console.warn(`DB retry ${attempt}/${maxRetries} after ${delay + jitter}ms:`, err.message);
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
}

// Usage:
const employees = await executeWithRetry(() =>
  db.select().from(schema.employees).where(eq(schema.employees.active, true))
);
```

### 6.4 Neon Serverless Driver (HTTP) for Lightweight Queries

For one-shot queries where you don't need a persistent connection (e.g., health checks, single lookups):

```js
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Simple one-shot query over HTTP (no pool needed)
const result = await sql`SELECT 1 AS ok`;
```

**When to use which driver:**

| Driver | Use Case |
|--------|----------|
| `@neondatabase/serverless` (HTTP) | One-shot queries, health checks, edge functions |
| `@neondatabase/serverless` (WebSocket Pool) | Interactive transactions in serverless environments |
| `pg.Pool` (node-postgres) | Long-running Node.js services (BB_Micro_Bridge) |

**For BB_Micro_Bridge:** Use `pg.Pool` with the pooled connection string. The HTTP driver is more suited for serverless/edge environments.

### 6.5 Schema Migrations (No-Downtime)

```bash
# Use DIRECT connection for migrations (not pooled)
DATABASE_URL=$DATABASE_URL_DIRECT npx drizzle-kit push
```

**Neon PgBouncer transaction mode limitations:**
- `SET` statements only work within a transaction
- Use direct connections for `pg_dump`, migrations, and admin tasks

### 6.6 Health Check for Database

```js
async function checkDb() {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}
```

**Sources:**
- [Neon Serverless Driver](https://neon.com/docs/serverless/serverless-driver)
- [Neon Connection Pooling](https://neon.com/docs/connect/connection-pooling)
- [Drizzle + Neon](https://orm.drizzle.team/docs/connect-neon)
- [Drizzle Best Practices (2025)](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717)
- [Neon Connection Errors](https://neon.com/docs/connect/connection-errors)

---

## 7. Caching & Performance

### 7.1 In-Memory LRU Cache

**Best practice:** Use `lru-cache` (by isaacs) for single-instance in-process caching. Always set bounds.

```js
import { LRUCache } from 'lru-cache';

// Image/thumbnail cache (already exists in BB_Micro_Bridge as image-cache.js)
const imageCache = new LRUCache({
  max: 2000,                      // Max entries
  maxSize: 200 * 1024 * 1024,     // 200MB total
  sizeCalculation: (value) => value.length || 1024, // Estimate size
  ttl: 24 * 60 * 60 * 1000,       // 24 hour TTL
  allowStale: true,                // Serve stale while revalidating
  updateAgeOnGet: true,            // Reset TTL on access
});

// API response cache (short TTL for dynamic data)
const apiCache = new LRUCache({
  max: 500,
  ttl: 5 * 60 * 1000, // 5 minutes
  allowStale: true,
});

// Usage in route:
app.get('/api/employees', async (request, reply) => {
  const cacheKey = 'employees:active';
  const cached = apiCache.get(cacheKey);
  if (cached) {
    reply.header('x-cache', 'HIT');
    return cached;
  }

  const data = await db.select().from(employees).where(eq(employees.active, true));
  apiCache.set(cacheKey, data);
  reply.header('x-cache', 'MISS');
  return data;
});
```

**Performance tips from lru-cache docs:**
- Avoid `dispose`, size tracking, and TTL if you don't need them -- they add overhead
- Use short non-numeric strings as keys for best V8 performance
- `fetchMethod` enables stale-while-revalidate pattern

### 7.2 Redis Alternatives for Railway

| Option | Persistence | Cost | Latency | Best For |
|--------|------------|------|---------|----------|
| **In-memory LRU** | None (ephemeral) | $0 | ~0ms | Single-instance, non-critical cache |
| **Upstash Redis** | Serverless, persistent | Pay-per-request | ~1-5ms | Multi-instance, persistent cache |
| **Railway Redis** | Persistent (volume) | ~$5-10/mo | ~1ms (internal network) | Full Redis features |
| **Bentocache** | L1 LRU + L2 Redis | Depends on L2 | L1: ~0ms, L2: ~1-5ms | Sophisticated multi-tier |

**For BB_Micro_Bridge (single instance):** In-memory LRU is sufficient and already implemented. Add Upstash Redis only if you need:
- Cache persistence across deploys
- Multiple replicas sharing cache
- Pub/sub or queue features

### 7.3 Response Caching Headers

```js
// Static assets (Street View images, thumbnails) -- cache aggressively
app.get('/api/properties/streetview/:lat/:lng', async (request, reply) => {
  reply.header('Cache-Control', 'public, max-age=86400, s-maxage=604800'); // 1d browser, 7d CDN
  reply.header('Vary', 'Accept');
  // ... serve image
});

// Dynamic API responses -- short cache or no-cache
app.get('/api/employees', async (request, reply) => {
  reply.header('Cache-Control', 'private, max-age=300'); // 5 min
  // ... serve data
});

// Sensitive data -- never cache
app.get('/api/qbo/token', async (request, reply) => {
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  // ... serve token
});
```

**Sources:**
- [lru-cache npm](https://www.npmjs.com/package/lru-cache)
- [lru-cache GitHub](https://github.com/isaacs/node-lru-cache)
- [Bentocache GitHub](https://github.com/Julien-R44/bentocache)
- [Multi-Layer Caching with Redis (OneUptime)](https://oneuptime.com/blog/post/2026-01-25-multi-layer-caching-redis-nodejs/view)
- [Upstash Redis](https://upstash.com/blog/redis-and-performance-api)

---

## 8. Security Hardening

### 8.1 Security Headers with @fastify/helmet

```js
import helmet from '@fastify/helmet';

await app.register(helmet, {
  global: true,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  // HSTS: Strict Transport Security
  hsts: {
    maxAge: 31536000,    // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Prevent MIME type sniffing
  noSniff: true,
  // XSS filter
  xssFilter: true,
});
```

### 8.2 CORS Configuration

```js
import cors from '@fastify/cors';

await app.register(cors, {
  origin: [
    'https://calexp5-production.up.railway.app',   // CalExp5 production
    'https://calexp5-staging.up.railway.app',       // CalExp5 staging
    /^https?:\/\/localhost(:\d+)?$/,                // Local development
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
  maxAge: 86400,        // Preflight cache: 24 hours
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
});
```

### 8.3 API Key Authentication

```js
// preHandler hook for API key verification
async function verifyApiKey(request, reply) {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    reply.code(401).send({ error: 'Missing API key' });
    return;
  }

  // Compare against stored keys (support multiple active keys for rotation)
  const validKeys = (process.env.API_KEYS || '').split(',').filter(Boolean);

  if (!validKeys.includes(apiKey)) {
    reply.code(403).send({ error: 'Invalid API key' });
    return;
  }
}

// Apply to all routes except health checks
app.addHook('onRequest', async (request, reply) => {
  const publicPaths = ['/health', '/live', '/ready', '/metrics'];
  if (publicPaths.some(p => request.url.startsWith(p))) return;
  await verifyApiKey(request, reply);
});
```

### 8.4 API Key Rotation Pattern

**Best practice:** Support multiple active keys simultaneously for zero-downtime rotation.

```
# Railway environment variable -- comma-separated keys
API_KEYS=key_current_abc123,key_previous_xyz789

# Rotation procedure:
# 1. Generate new key: key_new_def456
# 2. Add to API_KEYS: key_new_def456,key_current_abc123,key_previous_xyz789
# 3. Update all clients to use key_new_def456
# 4. Remove old key: key_new_def456,key_current_abc123
# 5. After grace period, remove oldest: key_new_def456
```

Rotate keys every 90 days. Use cryptographically secure generation:

```js
import { randomBytes } from 'crypto';
const newKey = `bbmb_${randomBytes(32).toString('hex')}`; // bbmb_a1b2c3...
```

### 8.5 Request Size Limits

```js
const app = Fastify({
  bodyLimit: 1 * 1024 * 1024, // 1MB global default
});

// Override for specific routes
app.post('/api/receipts/upload', {
  bodyLimit: 30 * 1024 * 1024, // 30MB for receipt images
  handler: uploadHandler,
});

app.post('/api/gps/ingest/overland', {
  bodyLimit: 512 * 1024, // 512KB for GPS batches
  handler: overlandHandler,
});
```

### 8.6 HTTPS/TLS on Railway

Railway provides HTTPS automatically for all public-facing services -- no configuration needed. All traffic is terminated at Railway's edge. Your app receives HTTP internally on `process.env.PORT`.

**Important:** Do NOT configure TLS in your Node.js app when deploying on Railway. Railway handles it.

### 8.7 Dependency Audit Automation

**Recommended setup:**

1. **GitHub Dependabot** (enable in repo settings) -- automatic PRs for outdated/vulnerable deps
2. **npm audit** in CI:

```yaml
# .github/workflows/audit.yml
name: Security Audit
on:
  schedule:
    - cron: '0 8 * * 1' # Every Monday 8 AM
  push:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm audit --production --audit-level=high
```

3. **Snyk** (optional, for deeper scanning) -- free tier covers open-source projects

**Sources:**
- [@fastify/helmet](https://github.com/fastify/fastify-helmet)
- [@fastify/cors](https://www.npmjs.com/package/@fastify/cors)
- [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit)
- [API Key Rotation Best Practices (GitGuardian)](https://blog.gitguardian.com/api-key-rotation-best-practices/)
- [API Key Management Best Practices 2025](https://multitaskai.com/blog/api-key-management-best-practices/)
- [NPM Security Audit Guide](https://medium.com/@divyanshu.1810/the-complete-developers-guide-to-npm-audit-securing-your-node-js-projects-7798dd0b0fe4)

---

## 9. Zero-Downtime Operations

### 9.1 Railway Rolling Deploys

Railway does per-service blue-green deploys by default:

1. New deployment builds and starts
2. Health check verifies new deployment is ready
3. Traffic switches to new deployment
4. Old deployment gets overlap time, then SIGTERM, then SIGKILL

**Configuration for BB_Micro_Bridge:**

```
RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=10
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15
RAILWAY_HEALTHCHECK_TIMEOUT_SEC=120
```

**Instant rollback:** Railway supports rolling back to any previous successful deployment via the dashboard.

### 9.2 Database Migrations (No-Downtime)

**The Expand-and-Contract Pattern:**

1. **Expand:** Add new columns/tables (backward-compatible with old code)
2. **Deploy:** New code uses new columns, old code still works
3. **Migrate data:** Backfill new columns from old data
4. **Contract:** Remove old columns in a future migration (after verifying stability)

**Example: Renaming a column**

```sql
-- Step 1: Add new column (deploy can happen after this)
ALTER TABLE employees ADD COLUMN full_name TEXT;

-- Step 2: Backfill data
UPDATE employees SET full_name = name WHERE full_name IS NULL;

-- Step 3: Deploy code that reads from full_name (with fallback to name)

-- Step 4: (After verifying) Remove old column
ALTER TABLE employees DROP COLUMN name;
```

**Never do in a single deploy:**
- Drop columns that old code reads
- Rename columns (add new + backfill + drop old instead)
- Change column types (add new column + migrate + swap)

### 9.3 Feature Flags for Safe Rollouts

**Simple implementation (environment variable based):**

```js
// Feature flags via environment variables
const flags = {
  GPS_RECONSTRUCTION_V2: process.env.FF_GPS_RECONSTRUCTION_V2 === 'true',
  RECEIPT_AI_V3: process.env.FF_RECEIPT_AI_V3 === 'true',
  QBT_UPLOAD_ENABLED: process.env.FF_QBT_UPLOAD_ENABLED !== 'false', // Default ON
};

// Usage:
if (flags.GPS_RECONSTRUCTION_V2) {
  await reconstructTimelineV2(deviceId, date);
} else {
  await reconstructTimeline(deviceId, date);
}
```

**Rollout procedure:**
1. Deploy code with feature behind flag (flag OFF)
2. Enable flag for internal testing: `FF_GPS_RECONSTRUCTION_V2=true`
3. Monitor logs and metrics
4. If issues: disable flag instantly (no redeploy needed -- Railway env var update triggers redeploy)
5. If stable: clean up flag and old code path

### 9.4 Blue-Green Deployment on Railway

Railway does this automatically per-service. For multi-service coordinated deploys (e.g., BB_Micro_Bridge + CalExp5 frontend), the process is manual:

1. Deploy BB_Micro_Bridge first (backend-compatible changes)
2. Verify health check passes
3. Deploy CalExp5 frontend
4. If issues: rollback BB_Micro_Bridge from Railway dashboard

**Limitation:** Railway has no native multi-service atomic deploy. Services deploy independently.

**Sources:**
- [Railway Deployments](https://docs.railway.com/reference/deployments)
- [Railway Deployment Teardown](https://docs.railway.com/deployments/deployment-teardown)
- [Zero-Downtime Database Migrations (DeployHQ)](https://www.deployhq.com/blog/database-migration-strategies-for-zero-downtime-deployments-a-step-by-step-guide)
- [Expand-and-Contract Pattern (DrCodes)](https://drcodes.com/posts/zero-downtime-database-migrations-blue-green-deployment-guide)

---

## 10. Cost Optimization

### 10.1 Railway Pricing (as of March 2026)

| Resource | Rate |
|----------|------|
| CPU | $20/vCPU/month |
| Memory | $10/GB/month |
| Network Egress | $0.05/GB |
| Volume Storage | $0.15/GB/month |

| Plan | Monthly Cost | Included Credits |
|------|-------------|-----------------|
| Hobby | $5/mo | $5 toward usage |
| Pro | $20/mo | $20 toward usage |
| Enterprise | Custom | Custom |

### 10.2 Right-Sizing BB_Micro_Bridge

**Estimated monthly cost for a typical Fastify API bridge:**

| Resource | Allocation | Cost |
|----------|-----------|------|
| vCPU | 0.5 vCPU average | $10/mo |
| Memory | 512MB | $5/mo |
| Network | ~5GB egress | $0.25/mo |
| **Total** | | **~$15.25/mo** |

Pro plan at $20/mo covers this entirely.

**Node.js memory flag:**

```dockerfile
CMD ["node", "--max-old-space-size=420", "src/server.js"]
```

Set to ~82% of your memory limit (420MB of 512MB) to leave headroom.

### 10.3 Replica Limits (Prevent Bill Shock)

Set in Railway: Settings > Deploy > Replica Limits

```
Max Memory: 768MB    (caps memory, prevents runaway)
Max vCPU: 1          (caps CPU usage)
```

Also set spending limits: Railway dashboard > Workspace Usage > Set limit to 1.5x expected ($30 for a $20 expected bill).

### 10.4 Sleep vs. Always-On Trade-off

| Strategy | Monthly CPU+Mem Cost | Cold Start | Best For |
|----------|---------------------|------------|----------|
| Always-on (Serverless OFF) | ~$15/mo | None | Production API bridge |
| Sleep-enabled (10min idle) | ~$2-5/mo | < 1 second | Staging/dev |
| Cron-scheduled (deploy/undeploy) | ~$1-3/mo | ~5-15 seconds | Rare-use tools |

**For BB_Micro_Bridge production:** Always-on. The $15/mo cost is trivial compared to the cold-start impact on mobile app users.

**For staging:** Enable sleep. First request after 10min idle takes < 1 second.

### 10.5 Logging Cost Control

Railway charges are usage-based, but excessive logging can:
- Hit the 500 lines/sec rate limit (lines are dropped)
- Make log searching slow
- Consume more memory in the app

**Best practices:**
- Set `LOG_LEVEL=info` in production (not `debug` or `trace`)
- Use `logLevel: 'silent'` on health check routes
- Don't log full request/response bodies
- Redact sensitive fields (saves log storage)

### 10.6 Neon Postgres Cost

Neon pricing is separate from Railway. For BB_Micro_Bridge:
- Free tier: 0.5GB storage, 1 compute (enough for development)
- Launch plan ($19/mo): 10GB storage, autoscaling compute
- Scale plan ($69/mo): 50GB storage, more compute

**Optimization:** Set appropriate minimum compute size to avoid cold starts. Neon scales to zero when idle (free tier) -- the BB_Micro_Bridge's keepalive connections prevent this.

**Sources:**
- [Railway Pricing](https://docs.railway.com/pricing)
- [Railway Pricing Plans](https://docs.railway.com/reference/pricing/plans)
- [Railway Cost Control](https://docs.railway.com/pricing/cost-control)
- [Railway Pricing Breakdown (ServerCompass)](https://servercompass.app/blog/railway-pricing-what-youll-actually-pay)

---

## Implementation Priority

Based on impact and effort, here is the recommended implementation order:

### Phase 1: Quick Wins (1-2 hours)

1. **Add server timeout configuration** (Section 1.1) -- just Fastify options
2. **Add SIGTERM/SIGINT handlers** (Section 3.1) -- prevent dropped requests on deploy
3. **Add `@fastify/under-pressure`** (Section 1.3) -- automatic load shedding
4. **Set Railway health check** (Section 2.1) -- zero-downtime deploys
5. **Set Railway overlap/draining** (Section 9.1) -- env vars only
6. **Set replica limits** (Section 10.3) -- prevent bill shock
7. **Disable Serverless** (Section 2.6) -- keep production always-on

### Phase 2: Security & Resilience (2-4 hours)

8. **Add `@fastify/helmet`** (Section 8.1) -- security headers
9. **Add `@fastify/cors`** (Section 8.2) -- restrict origins
10. **Tiered rate limiting** (Section 1.5) -- protect expensive endpoints
11. **API key rotation support** (Section 8.4) -- multi-key validation
12. **DB retry wrapper** (Section 6.3) -- handle Neon transient errors
13. **Request body size limits** (Section 8.5) -- per-route limits

### Phase 3: Observability (2-3 hours)

14. **Structured logging cleanup** (Section 5.1) -- redact, silence health, add correlation IDs
15. **Health endpoint trio** (Section 5.2) -- /health, /live, /ready
16. **Lightweight metrics** (Section 5.3) -- /metrics endpoint
17. **External uptime monitoring** (Section 5.5) -- UptimeRobot free tier
18. **Memory monitoring** (Section 3.3) -- periodic logging

### Phase 4: Production Polish (2-4 hours)

19. **Custom Dockerfile** (Section 2.3) -- replace Nixpacks, faster deploys
20. **Feature flags** (Section 9.3) -- env-var based
21. **Dependency audit CI** (Section 8.7) -- GitHub Actions workflow
22. **Sentry integration** (Section 5.4) -- error tracking

### Phase 5: Future Consideration

23. **Upstash Redis** (Section 7.2) -- only if multi-replica or persistence needed
24. **Bentocache** (Section 7.2) -- only if cache architecture gets complex
25. **OpenTelemetry** (Section 5.1) -- only if distributed tracing needed

---

## Package Summary

**Already installed (verify versions):**
- `cockatiel` -- circuit breaker, retry, bulkhead
- `lru-cache` -- in-memory caching
- `pg` -- Postgres driver
- `drizzle-orm` -- ORM

**Add for hardening:**
- `@fastify/under-pressure` -- load shedding / health checks
- `@fastify/helmet` -- security headers
- `@fastify/cors` -- CORS management
- `@fastify/rate-limit` -- rate limiting
- `close-with-grace` -- graceful shutdown (or implement manually)
- `@sentry/node` -- error tracking (optional, Phase 4)
- `pino-pretty` -- dev dependency for readable logs

**Do NOT add:**
- `pm2` -- unnecessary in Railway containers; Railway handles restarts
- `cluster` -- use Railway replicas instead
- `express-rate-limit` -- use Fastify's native plugin
- `winston` -- Fastify uses Pino, don't fight it

---

*Research completed 2026-03-27. Sources verified against current documentation.*
