# Staging Environment Variable Matrix | 2026-04-03

## Purpose

This matrix defines the expected environment shape for:
- local
- staging
- production

Do not share one mutable env set across these environments.

## BB_Micro_Bridge

| Variable | Local | Staging | Production | Notes |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `production` | `production` | Staging should behave like prod |
| `PORT` | local port | Railway-set | Railway-set | |
| `HOST` | `0.0.0.0` or `::` | Railway default | Railway default | |
| `DATABASE_URL` | optional/dev DB | staging pooled Neon URL | prod pooled Neon URL | app traffic only |
| `DATABASE_URL_DIRECT` | optional/dev direct URL | staging direct Neon URL | prod direct Neon URL | migrations/admin only |
| `TOKEN_STORE` | optional | explicit | explicit | avoid implicit behavior once stabilized |
| `QBO_CLIENT_ID` | local/dev or blank | staging/sandbox value | prod value | |
| `QBO_CLIENT_SECRET` | local/dev or blank | staging/sandbox value | prod value | |
| `QBO_REALM_ID` | local/dev or blank | staging/sandbox value | prod value | |
| `QBO_ENVIRONMENT` | `sandbox` or `production` | preferred `sandbox` | `production` | use prod-safe strategy if sandbox unavailable |
| `QBO_ACCESS_TOKEN` | optional seed | staging seed | prod seed | only bootstrap source |
| `QBO_REFRESH_TOKEN` | optional seed | staging seed | prod seed | only bootstrap source |
| `QBT_ACCESS_TOKEN` | local/dev | staging value | prod value | |
| `QBT_BASE_URL` | default | default | default | |
| `API_KEY_*` | dev keys | staging keys | prod keys | never reuse prod keys in staging |
| `CORS_ORIGINS` | loose/dev | explicit staging origins | explicit prod origins | must be explicit in non-local |
| `SESSION_SECRET` | dev secret | strong staging secret | strong prod secret | minimum 32 chars |
| `PORTAL_ROOT_DOMAIN` | optional | preferred staging root domain | prod root domain | enables wildcard portal resolution |
| `PORTAL_RESERVED_SUBDOMAINS` | optional | explicit | explicit | `crew,admin,app,api,www` style list |
| `WEBAUTHN_RP_ID` | localhost | staging domain | prod domain | |
| `WEBAUTHN_RP_NAME` | local name | staging name | prod name | |
| `WEBAUTHN_ORIGIN` | localhost URL | staging app URL | prod app URL | |
| `LOG_LEVEL` | `debug`/`info` | `info` | `info` | |
| `LOGTAIL_TOKEN` | optional | staging token if used | prod token if used | separate sinks preferred |
| `GOOGLE_MAPS_API_KEY` | optional | staging value | prod value | |
| `OPENAI_API_KEY` | optional | staging value | prod value | |
| `ANTHROPIC_API_KEY` | optional | staging value | prod value | |
| `GEMINI_API_KEY` | optional | staging value | prod value | |
| `VAPID_PUBLIC_KEY` | optional | staging value | prod value | |
| `VAPID_PRIVATE_KEY` | optional | staging value | prod value | |
| `VAPID_SUBJECT` | optional | staging value | prod value | |
| `SERP_API_KEY` | optional | staging value | prod value | |
| `TRACCAR_URL` | local/dev | staging value | prod value | |
| `TRACCAR_USER` | local/dev | staging value | prod value | |
| `TRACCAR_PASSWORD` | local/dev | staging value | prod value | |
| `OSRM_URL` | local/public | staging value | prod value | |

## CalExp5

| Variable | Local | Staging | Production | Notes |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `production` | `production` | |
| `PORT` | local port | Railway-set | Railway-set | |
| `BRIDGE_URL` | localhost bridge | staging internal Bridge URL | prod internal Bridge URL | canonical path |
| `BRIDGE_PUBLIC_URL` | optional | staging public Bridge URL if needed | prod public Bridge URL if needed | only for designated long-running paths |
| `BRIDGE_API_KEY` | dev key | staging app key | prod app key | |
| `VITE_API_BASE` | local preference | empty or proxy-safe value | empty or proxy-safe value | must not bypass CalExp5 proxy |
| `VITE_ENABLE_AUTH` | dev choice | staging behavior | prod behavior | |
| `VITE_GOOGLE_MAPS_API_KEY` | optional | staging key | prod key | build-time |
| `VITE_TRACCAR_DEVICE_URL` | optional | staging value | prod value | build-time |
| `VITE_VAPID_PUBLIC_KEY` | optional | staging key | prod key | build-time |
| `RAILWAY_PUBLIC_DOMAIN` | n/a | Railway-set | Railway-set | informational |

## Required Environment Rules

### Bridge
- `DATABASE_URL` must be pooled URL
- `DATABASE_URL_DIRECT` must be direct URL
- `CORS_ORIGINS` must be explicit in staging and prod
- `TOKEN_STORE` should be explicit in staging and prod
- `PORTAL_ROOT_DOMAIN` should be explicit once wildcard domain rollout begins
- no secrets in scripts or committed files

### CalExp5
- app should always route through its own proxy for app traffic
- do not point frontend directly at Bridge unless a route is explicitly designed for that
- production/staging should not rely on file fallback for settings persistence

## Separation Rules

- staging keys must not equal prod keys
- staging notification destinations must not equal prod destinations by default
- staging domains must be distinct from prod
- staging DB branch must be distinct from prod branch
- local `.env` files must never be treated as deployment truth
