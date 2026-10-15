# Seven-item fix batch: Studio plan + Spoofer work package (PLAN ONLY)

Captain approval refs: Slack 1792032883.853169, reaffirmed 1792051698.462929. Nothing gets built, changed, published, emailed or charged until this plan is approved. Credits before: 172.71 regular / 0 daily.

## Current state (checked in the code)
- `buildPayload` (src/lib/spoofer-sync.server.ts) sends signed source/reference URLs, plus segment fields only when SPOOFER_SEGMENT_FIELDS=on. It does **not** send `jobs.source_sha256`.
- Segment reasons are already limited in the database to `explicit | auto_first_30 | auto_first_30_unknown_length | measured_short`, but the TypeScript side uses loose strings (`isSegmentRestricted`, `checkTrimEvidence`, `startsWith("auto_first_30")` in the client job page).
- Restricted = any non-null reason except `measured_short` (Studio). Spoofer's matching rule is not shared or contract-tested.
- Link jobs (reel/TikTok/Shorts) have no source bytes, so `checkTrimEvidence` returns `source_unverifiable` and they stay held.
- Admin final upload (src/routes/_authenticated/admin/jobs.$jobId.tsx) uploads straight from the browser to `deliverables/<job>/try<n>/<uuid>-name` and then inserts a row. There is no server check of job status, attempt or segment, and no recheck on commit.

## Order (as mandated)

### 1. Send source hash, Spoofer verifies bytes
- `buildPayload`: add `files[source_video].sha256 = jobs.source_sha256` and `brief.source_sha256` whenever an uploaded source exists. Send it **always** (additive field, not behind the flag). Links send `null` and are never marked verified.
- Legacy rows with no hash (uploads from before migration 0014) send `null`. Spoofer treats that as `unverified_legacy`: with flags OFF it copies as today (current behaviour unchanged), and with flags ON a restricted job stays held.
- Never compute a hash in the payload builder from a URL; only the persisted value is used.

### 2. One canonical restriction rule
- New `src/lib/segment-reasons.ts`: `SEGMENT_REASONS` constant, `SegmentReason` type, `isRestricted()`, ES/EN labels, and `parseSegmentReason()` (unknown values become `invalid`, never `measured_short`).
- New `contracts/segment-reasons.json`: a shared fixture table with each reason, whether it is restricted, and its labels. The same JSON is pasted into Spoofer for its contract test.
- `spoofer-contract.ts`, `delivery-contract.ts`, `deliver-video.ts` and the job pages import from this module. The SQL `is_segment_restricted` is checked against the same table by a DB-read test.
- Measured uploads of 30.05 s or less keep `measured_short` and stay unrestricted. Unknown length is always `auto_first_30_unknown_length`.

### 3. Flags ON: link jobs need a real uploaded source
- New migration `0015_link_source_requirement.sql`: `jobs.source_upload_required boolean default false` and a `request_link_source(job_id)` staff function. Adds a `create_job`/intake guard: when the flag is on and the job is restricted with `source_type <> 'upload'`, `spoofer_sync` stays `held_segment` with reason `link_needs_upload` until a verified source is attached.
- New server function `attachLinkSource` (requires login, owner or staff): reuses `verifySourceVideo` (structure + streamed SHA-256 + `record_source_check`), requires the reference image to be present, then sets `source_file_path` and `source_sha256` under a row lock.
- Client job page and admin job page: ES/EN panel "This link must be uploaded as an MP4 before production" with an upload button. No downloader, no IG/TikTok fetching.
- Flags OFF: behaviour unchanged, restricted jobs stay HELD and legacy sync keeps working.

### 4. Old-attempt copy race (Spoofer only, see package)
Studio part: none, except the contract doc and the compatibility test fixture.

### 5. Fixed reason list everywhere
- Intake/payload, the `deliver-video` validator, the jobs feed, the AI draft header and the UI all use `parseSegmentReason` and the labels. Free text is removed (`?? "unspecified"` becomes an explicit `none` label).
- With flags OFF, segment fields are not sent, so old receivers are unaffected. Feed consumers get the same strings already allowed by the database.

### 6. Server-validated final replacement
- Migration `0015` also adds a `final_upload_reservations` table (job_id, try_number, path, token, expires_at, status), staff-only RLS plus grants, and these functions:
  - `reserve_final_upload(job_id, try_number)`: locks the job, then rejects delivered or terminal jobs, a stale attempt (≠ current try_number), wrong status (only `in_production`/`qa`/`revision`), or a missing or invalid source/segment check. Returns a fenced unique path `deliverables/<job>/try<n>/<reservation uuid>/final.mp4` and a token.
  - `commit_final_upload(reservation_id, token, size, sha256)`: locks the job, rechecks every condition plus the token, expiry and that the object exists. Then inserts the deliverable. If anything changed, the reservation is marked `rejected` and the server removes the orphan object.
- Storage policy: staff may insert into `deliverables` only at a path that matches a live reservation. Existing objects are never overwritten (`upsert:false`) and earlier finals are never deleted.
- The admin page `upload()` calls reserve, then upload, then commit. Disabling the button stays as a convenience only.
- JOB-000002 is delivered, so it is rejected by reserve. Its original bytes are untouched.

### 7. Verification and release
Tests (new or extended, run with `bunx vitest run`):
- `segment-reasons.test.ts`: canonical table, every reason restricted or not, unknown never becomes measured.
- `spoofer-contract.test.ts`: payload has `source_sha256` for uploads and `null` for links/legacy; segment fields only when the flag is on.
- `final-upload.test.ts` (pure guard logic) plus `scripts/final-upload-db-race.ts` pinned to JOB-000004 (92372d5b-bb4f-4633-8e18-b3d5a862857b) with a fixture assertion: stale try, higher try during upload, delivered state flip mid-upload, expired token, double commit.
- Existing suites: mp4-duration, post-review, delivery-contract, private-video-player, eta, ai-helper.
- Manual/admin checks after release: upload, link-needs-upload panel, measured_short, first-30 held, download/player. Owner-client proof is reported separately and stays UNTESTED unless an existing client session exists.

Release: Spoofer publishes first (flags off) → joint old/new compatibility check → Studio publishes (SPOOFER_SEGMENT_FIELDS off) → admin live checks → owner checks. No broken live window, because every field is additive. Restricted jobs stay HELD, since there is still no trim-evidence writer.

## Invariants
No account, role, secret, domain or email setup. No payments. No Generate. JOB2 c0376b39… stays Delivered, JOB3 and the credit ledger are untouched, no new real orders. JOB-000004 is the only DB-mutating fixture. Legacy Bearer sync, strict HMAC receipts and leases are kept. WORKER_API_KEY and the worker API are unchanged, and the cancelled worker lockdown is not restored.

## Studio files touched
`src/lib/segment-reasons.ts` (new), `contracts/segment-reasons.json` (new), `src/lib/spoofer-sync.server.ts`, `src/lib/spoofer-contract.ts`, `src/lib/delivery-contract.ts`, `src/routes/api/public/deliver-video.ts`, `src/lib/source-video.functions.ts` (attachLinkSource), `src/lib/final-upload.functions.ts` (new), `src/routes/_authenticated/admin/jobs.$jobId.tsx`, `src/routes/_authenticated/jobs.$jobId.tsx`, `src/lib/ai-helper.functions.ts`, `drizzle/migrations/0015_*`, the tests above, `docs/spoofer-work-package-2026-10.md`, `docs/deliver-video-contract.md`, `AGENTS.md`.

## Unresolved prerequisites
Spoofer editor applies its package. A trim-evidence writer exists (none yet). An existing owner-client session is needed for owner proof. The email domain remains on hold.

---

## Copyable Spoofer Plan prompt

```text
PLAN ONLY (Spoofer). Captain-approved batch 1792032883.853169. Do not build/publish until approved. Keep WORKER_API_KEY + worker API unchanged; do not restore the cancelled worker allowlist/lockdown; keep h264_amf/libx264 encoder, auth/RLS, legacy Bearer sync, strict HMAC receipts.
1. Intake: read optional files[source_video].sha256 / brief.source_sha256. After copying the source, stream SHA-256 of the copied bytes; mismatch -> intake_conflict, no job advance. null -> mark unverified (links/legacy); flags OFF keeps current copy behaviour; flags ON + restricted -> stay held. Never fabricate a hash.
2. Paste Studio contracts/segment-reasons.json; one enum explicit|auto_first_30|auto_first_30_unknown_length|measured_short; measured_short unrestricted, rest restricted; contract test against the fixture; unknown values rejected, never treated as measured.
3. Flags ON: restricted link jobs stay held until Studio sends an uploaded source with sha256.
4. Old-attempt copy race: write every copy to immutable studio-inputs/<receiver id>/try<n>/<content sha>/... (never overwrite); commit metadata via a guarded RPC that locks the job row and only accepts try_number = current and not delivered; studio_mark_file returning false = hard error. Race tests: stale try finishing after newer try, concurrent same-try copies, delivered job untouched.
5. Segment reason fixed enum in intake, validators, UI with ES/EN labels; flags OFF tolerates absent fields.
6. Sender: include video_size_bytes, respect Studio caps (URL 40 MiB / multipart 20 MiB / JSON 16 KiB), keep strict receipt verification.
7. SpoofHistory RunThumb: keep Library thumbnail (run.video_id) first; else signedRunFileUrl of the first completed output in a muted <video preload="metadata" playsInline> frame; on error/expired URL show an honest "Preview unavailable" placeholder. UI only: no worker, upload endpoint, DB, key or encoder changes.
Tests: list each. Publish Spoofer first with flags OFF; report PASS/FAIL/UNTESTED.
```
