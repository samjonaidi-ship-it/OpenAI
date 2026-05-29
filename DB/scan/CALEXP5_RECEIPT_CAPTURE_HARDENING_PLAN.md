# CalExp5 Receipt Capture Hardening Plan

Date: 2026-04-06

## Goal

Make CalExp5 receipt capture robust enough for field crew immediately while staying web-based:

- point-and-shoot under poor lighting, thermal paper, wrinkles, dark backgrounds, and construction-site conditions
- maintain fast capture and AI extraction turnaround
- collect enough telemetry to tune thresholds and guidance over time

## Current Architecture

Current active scan path:

1. `DocumentCamera.jsx`
2. `ReceiptScanModal.jsx`
3. Bridge `/api/cal/receipt/scan`
4. Bridge `/api/cal/receipt/file`

Current strengths:

- live document detection overlay
- auto-capture when stable
- manual crop adjustment fallback
- bridge-side image normalization and AI extraction
- GPS-aware context resolution
- scan/file split

Current weaknesses:

- quality checks were advisory only
- contour/edge detection was still doing too much of the decision-making
- no persisted capture telemetry for tuning
- auto-capture could submit frames that looked stable geometrically but were still poor for extraction
- no structured record of why captures failed or needed retry

## Immediate Production Cut

This cut keeps the app web-based and improves the existing architecture instead of replacing it.

### 1. Real quality gating

Auto-capture must pass a lightweight client-side quality gate before hitting AI.

Checks:

- blur variance
- exposure / mean luminance
- glare ratio
- edge-density proxy for text/detail richness

Behavior:

- auto-capture: blocked on hard quality failures
- manual capture: warnings shown, but crew can continue

### 2. Better capture metadata

Each capture should carry operational context:

- capture mode: auto / manual / manual-adjust / gallery
- torch state
- resolution mode: HD / 4K
- zoom level
- stable-frame count
- detection frame counts
- whether corners were available
- whether perspective warp was used
- last guidance hint
- geometric ratios from detection

### 3. Sharper source-frame selection

When a capture happens, compare the saved detection frame against a fresh live frame and use the sharper one before normalization/warp.

This is a low-cost “best of few” step that improves sharpness without turning the capture flow into a slow burst pipeline.

### 3b. Short burst capture

At capture time, take a very short burst and keep the sharpest frame.

Target:

- auto capture: 3 frames
- manual capture: 2 frames
- delay between frames: roughly 55ms

This keeps the flow snappy while rescuing mild hand shake and autofocus lag.

### 3c. Smart live guidance

The camera should surface live hints based on preview state, not only static rotating tips.

Examples:

- too dark -> suggest torch
- small receipt in frame -> move closer / pinch zoom / use 4K
- glare -> reduce glare
- bad geometry -> straighten phone or use manual adjust
- stable but small -> use 4K if needed

### 3d. Text-block fallback

If edge-based contour detection is weak, the scanner should look for the dense, organized text block in the foreground document and use that as a fallback quad.

This is specifically meant to help when:

- a receipt is placed on top of another written page
- the background contains text but the receipt remains the dominant foreground block
- thermal paper edges are weak but the receipt body is visually organized

### 3e. Automatic manual-adjust handoff

If the green overlay is clipping the receipt or the trapezoid is too distorted:

- do not auto-file that frame
- auto-hand off to the manual corner-adjust screen
- preserve the detected corners and the trigger reason in telemetry

This prevents “green but wrong” captures.

### 4. Persisted telemetry

Bridge should persist scanner telemetry into `cal_beta_events` under `type = 'receipt-capture'`.

This provides an immediate historical record without needing a new table first.

### 5. Metrics surface

Bridge `/api/metrics` receipt metrics should now include capture-focused counters:

- auto vs manual captures
- rejected auto-captures
- scan success / failure after capture
- torch usage
- 4K usage
- average capture quality score
- reasons for failures/rejections

## What Shipped In This Cut

### CalExp5

- richer `checkImageQuality()` contract
- hard gate for auto-capture
- manual-capture warnings instead of blind pass-through
- capture telemetry posted to the bridge
- manual-adjust path preserves capture metadata

### DocumentCamera

- emits capture telemetry with each capture
- tracks detection frame counts and geometric state
- compares saved vs burst/live frame sharpness before finalizing capture
- emits preview luminance/glare/detail metrics
- uses smart hints instead of relying only on static tips

### Bridge

- accepts `/api/cal/receipt/capture-telemetry`
- persists payloads to `cal_beta_events`
- rolls capture telemetry into in-memory receipt metrics

## Telemetry Model

Primary event types:

- `capture_rejected`
- `scan_started`
- `scan_result`

Key tuning dimensions:

- `capture.captureMode`
- `capture.torchOn`
- `capture.resolution`
- `capture.zoomLevel`
- `quality.score`
- `quality.metrics.blurVariance`
- `quality.metrics.glareRatio`
- `quality.metrics.meanLuminance`
- `quality.metrics.edgeDensity`
- `reason`
- scan success/failure

## Operational KPIs

Track these immediately:

- auto-capture rejection rate
- scan success rate after auto-capture
- scan success rate after manual capture
- average scan latency
- average quality score
- percent of scans with torch on
- percent of scans in 4K
- top rejection reasons

## Next Cuts

### Near-term

- add low-light/glare-aware capture coaching in the live camera
- add lightweight text-density/documentness scoring to reduce contour-only dependence
- expose capture metrics in Control Tower / admin
- reduce mobile crash risk by limiting burst depth when 4K is enabled

### Medium-term

- short burst capture and best-frame selection
- alternate bridge-side image render retries when extraction confidence is low
- stronger post-capture dewarp/rescue path for tiny or curled receipts

### Later

- live voice coaching using the same capture telemetry
- shared capture pipeline for other inbound document types

## Guardrails

- do not default to 4K for every scan
- do not block manual rescue flows too aggressively
- do not run heavy AI on every preview frame
- prioritize fast capture-to-result time while enforcing minimum extraction quality
