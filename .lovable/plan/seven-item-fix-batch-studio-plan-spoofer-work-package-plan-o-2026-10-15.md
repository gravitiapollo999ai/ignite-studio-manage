# Seven-item fix batch: Studio plan + Spoofer work package (PLAN ONLY, revision 1)

Captain approval refs: Slack 1792032883.853169, reaffirmed 1792051698.462929. Revision 1 folds in review corrections A–F. Nothing gets built, changed, published, emailed, charged or DB-tested until this plan is approved. Credits before: 172.71 regular / 0 daily.

## Current state (checked in the code)
- Real job statuses: `submitted, in_review, prompt_ready, generating, qa, delivered, revision, cancelled`. There is no `in_production`.
- `buildPayload` (src/lib/spoofer-sync.server.ts) sends signed source/reference URLs, plus segment fields only when SPOOFER_SEGMENT_FIELDS=on. It does not send `jobs.source_sha256`.
- Segment reasons are limited in the database to `explicit | auto_first_30 | auto_first_30_unknown_length | measured_short`. The TypeScript side uses loose strings.
- Admin final upload goes straight from the browser to storage, then inserts a `deliverables` row directly. Admins have insert/delete grants and policies on `deliverables`, and there is no server check of status, attempt, segment or bytes.
- Link jobs have no source bytes. Restricted jobs stay held because nothing writes trim evidence.

## Order (as mandated; thumbnail is last, Spoofer only)

### 1. Send source hash, Spoofer verifies bytes
- `buildPayload` always adds `files[source_video].sha256` and `brief.source_sha256` from the persisted `jobs.source_sha256`. This is an additive field and is not behind the flag. Links and legacy rows without a fingerprint send `null`.
- Spoofer downloads the bytes, streams SHA-256, and only then compares. A match is `verified`. A mismatch is `intake_conflict` and the job does not advance. `null` is `unverified_legacy`: never labelled verified. With flags OFF, current copy behaviour is kept; with flags ON, a restricted job stays held.
- No hash is ever computed from a URL or fabricated.

### 2. One canonical restriction rule
- `src/lib/segment-reasons.ts`: `SEGMENT_REASONS`, `SegmentReason` type, `isRestricted()`, ES/EN labels, and `parseSegmentReason()` (unknown values become `invalid`, never `measured_short`).
- `contracts/segment-reasons.json` is the shared fixture table, pasted verbatim into Spoofer for its contract test.
- `measured_short` (measured, 30.05 s or less) is unrestricted. Every other reason is restricted. Unknown length is always `auto_first_30_unknown_length`, never measured. A test checks SQL `is_segment_restricted` against the same table (read-only).

### 3. Flags ON: link jobs need a real uploaded source
- The flag is read only in trusted server code (`process.env` inside server functions and the sync pusher). The database never reads it, and no client value can bypass it (correction D). DB functions only enforce rules that do not depend on the flag: source present, hash present, reference present, row-locked.
- New authenticated server function `attachLinkSource` (owner or staff): reuses `verifySourceVideo` (structure + streamed SHA-256 + `record_source_check`), requires the reference image, then calls a security-definer `attach_job_source(job_id, path, sha256, check_id)`. That function locks the job, re-verifies the check row matches the stored object identity, and refuses delivered/cancelled jobs.
- `pushOne` (server): when the flag is on, a restricted link job without `source_sha256` stays `held_segment` with reason `link_needs_upload`. When the flag is off, every restricted job stays held exactly as today.
- Client and admin job pages: an ES/EN panel "Upload this clip as an MP4 before production", with an upload button. No downloader and no IG/TikTok fetching.

### 4. Old-attempt copy race
Spoofer side only (see the package). Studio adds the contract doc and the fixture.

### 5. Fixed reason list everywhere
Intake/payload, the `deliver-video` validator, the jobs feed, the AI draft header and the UI all use `parseSegmentReason` and the labels; free text is removed. With flags OFF, segment fields are not sent, so old receivers are unaffected.

### 6. Server-validated final replacement
- Stage A migration `0015_final_upload_reservations.sql` (additive only, no policy changes):
  - `final_upload_reservations` table (job_id, try_number, path, token, status, expires_at), with grants and staff-read RLS.
  - `reserve_final_upload(job_id, try_number)` (security definer, `is_admin`): locks the job. Admits only status `generating`, `qa` or `revision`, and always refuses `delivered`/`cancelled`. Refuses a stale attempt (≠ current `try_number`) and restricted jobs (no trim evidence exists, so they stay HELD). Returns a fenced path `<job>/try<n>/<reservation uuid>/final.mp4` and a token.
  - `commit_final_upload(reservation_id, token, sha256, size, duration)`: only callable by service_role.
- Server function `commitFinalUpload` (authenticated, admin):
  - It first locks the reservation (`claim_final_commit`, status `uploaded` → `committing`), so a reservation can be committed only once.
  - It reads the exact stored object with the service client and records its identity (etag/version, updated_at, size). It streams SHA-256 and checks the actual size against the caps.
  - It runs `probeMp4`. A final must be `measured` with duration ≤ 30.05 s, or within the segment span. `unknown_declared`, `malformed` and `io_error` are rejected; an unmeasured final length is never accepted.
  - It then re-reads the object identity. If anything changed since hashing, the commit is rejected as a TOCTOU failure.
  - It calls `commit_final_upload` with only these server-computed values; browser-supplied size or hash is ignored. The RPC locks the job and the reservation, rechecks status, attempt, restriction, token, expiry and identity, then inserts the deliverable with `sha256` and `size_bytes`.
  - On any failure, the reservation becomes `rejected`. Trusted service code then removes that reservation-owned, uncommitted object only.
- Earlier finals are never overwritten or deleted by this flow (`upsert:false`). JOB-000002 is delivered, so it is refused at reserve.
- The new admin UI flow is reserve → upload → commit. Disabling the button is a convenience only.
- Stage B enforcement migration `0016_final_upload_enforcement.sql` is not applied during the build. It runs only after the new Studio UI is published and checked (correction E).
  - Table: revoke direct `insert`/`delete` on `public.deliverables` from authenticated (commit goes via service_role), and drop "deliv admin insert" and "deliv admin delete".
  - Storage: today the policies "admin storage insert", "admin storage update" and "admin storage delete" (0000_migration.sql lines 350–355) cover both `deliverables` and `branding`. Stage B splits them:
    - `branding`: insert, update and delete for admins are recreated unchanged.
    - `deliverables` UPDATE: no policy, so overwrite and replace are denied to every client.
    - `deliverables` INSERT: admin only, and only when the path equals a live `reserved` reservation (not expired, uploader = auth.uid()). Since UPDATE is denied, `upsert` cannot replace the object.
    - `deliverables` DELETE: no client policy. Committed or delivered finals cannot be removed. Only trusted service code may delete a reservation-owned uncommitted orphan.
  - The current admin "remove file" button is changed in the new UI to a server function that refuses committed finals.

### 7. Verification and release
Tests (`bunx vitest run`, after approval):
- `segment-reasons.test.ts`: the canonical table; unknown never becomes measured.
- `spoofer-contract.test.ts`: `source_sha256` is present for uploads and `null` for links/legacy; segment fields only appear when the flag is on.
- `final-upload.test.ts` (pure admission/validation logic): status matrix (generating/qa/revision admitted, delivered/cancelled refused), stale try, restricted refused, unknown/malformed/unmeasured length refused, size/hash computed server-side, identity change between hash and commit refused.
- `scripts/final-upload-db-race.ts`: only on JOB-000004 (92372d5b-bb4f-4633-8e18-b3d5a862857b), with a fixture-label assertion (correction F). It first reads and records the job's current state, deliverables and reservations. Races covered: stale try, attempt bump mid-upload, status flip to delivered mid-upload, expired token, double commit, and object replaced after hashing but before commit (TOCTOU). Afterwards it restores only the synthetic fields and artifacts it created and asserts the snapshot matches. If JOB-000004's state does not allow a case (it is Delivered), that case is reported as a prerequisite instead of creating new fixtures or accounts.
- `scripts/storage-policy-check.ts` runs after Stage B only, as the existing admin session against JOB-000004 paths. It checks that these are refused: deliverables update/upsert overwrite; insert outside a reservation; delete of a committed final; direct `deliverables` row insert/delete. It checks that these still work: branding upload, update and delete; and a reserved insert.
- Existing suites: mp4-duration, post-review, delivery-contract, private-video-player, eta, ai-helper.

Staged release (all segment/delivery flags OFF throughout; no publish without captain OK):

```text
1. Build: Studio code + Stage A migration (additive; old live admin upload and legacy sync keep working)
2. Spoofer publishes its compatible receiver (flags OFF)
3. Joint old/new compatibility check (old Studio payload -> new Spoofer; new payload -> old shape tolerated)
4. Studio publishes (new reserve/commit UI live)
5. Admin live checks: upload, link-needs-upload panel, measured_short, first-30 held, player/download
6. Stage B enforcement migration applied (captain OK), then storage-policy-check + re-check admin upload and branding logo
7. Owner-client checks only with an existing client session; else reported UNTESTED (admin view != owner proof)
```

Restricted jobs stay HELD. No evidence is hand-entered and no trimming is claimed.

## Invariants
No account, role, secret, domain or email setup. No payments. No Generate. JOB2 c0376b39… stays Delivered with its original final; JOB3 and the credit ledger are untouched; no new real orders. JOB-000004 is the only DB-mutating fixture. Legacy Bearer sync, strict HMAC receipts and leases are kept. WORKER_API_KEY and the worker API are unchanged, and the cancelled worker lockdown is not restored.

## Studio files touched
`src/lib/segment-reasons.ts`, `contracts/segment-reasons.json`, `src/lib/spoofer-sync.server.ts`, `src/lib/spoofer-contract.ts`, `src/lib/delivery-contract.ts`, `src/routes/api/public/deliver-video.ts`, `src/lib/source-video.functions.ts`, `src/lib/final-upload.functions.ts` (new), `src/routes/_authenticated/admin/jobs.$jobId.tsx`, `src/routes/_authenticated/jobs.$jobId.tsx`, `src/lib/ai-helper.functions.ts`, `drizzle/migrations/0015_*` (Stage A) and `0016_*` (Stage B, applied later), the tests above, `docs/spoofer-work-package-2026-10.md`, `docs/deliver-video-contract.md`, `AGENTS.md`.

## Unresolved prerequisites
- The Spoofer editor has to apply its package.
- There is no trim-evidence writer yet.
- An existing owner-client session is needed for owner proof.
- JOB-000004 being Delivered may limit some race cases.
- Email stays on hold.

---

## Copyable Spoofer Plan prompt

```text
PLAN ONLY (Spoofer). Captain-approved batch 1792032883.853169 (revision 1). Do not build/publish until approved. Keep WORKER_API_KEY + worker API unchanged; do not restore the cancelled worker allowlist/lockdown; keep h264_amf/libx264 encoder, auth/RLS, legacy Bearer sync, strict HMAC receipts. All segment/delivery flags stay OFF.
1. Source hash: read optional files[source_video].sha256 / brief.source_sha256. Download the actual source bytes, stream SHA-256, THEN compare: match=verified, mismatch=intake_conflict (no advance), null=unverified_legacy (never labelled verified; flags OFF keeps current behaviour, flags ON + restricted stays held).
2. Paste Studio contracts/segment-reasons.json; one enum explicit|auto_first_30|auto_first_30_unknown_length|measured_short; measured_short unrestricted, rest restricted; contract test against the fixture; unknown values rejected, never treated as measured.
3. Flags ON: restricted link jobs stay held until Studio sends an uploaded source with sha256. Flag decisions live in trusted server code only (DB functions cannot read env flags; no client-forgeable bypass).
4. Copy race: write each copy to a unique immutable path studio-inputs/<receiver id>/try<n>/<request uuid>/<content sha256>/<file> with upsert:false (two same-attempt copies of different bytes can never collide). Then commit metadata via a guarded RPC that locks the job row and accepts only try_number = current and not delivered/cancelled; stale copies never overwrite current attempt bytes or final metadata. studio_mark_file returning false or erroring = hard intake failure. Race tests: stale try finishing after newer try, concurrent same-try different-bytes copies, delivered job untouched.
5. Segment reason fixed enum in intake, validators, UI with ES/EN labels; flags OFF tolerates absent fields.
6. Sender: include video_size_bytes; respect Studio caps (URL 40 MiB / multipart 20 MiB / JSON 16 KiB); keep strict receipt verification. Restricted finals stay HELD (no trim-evidence writer; never hand-enter evidence or claim trimming).
7. Release: publish Spoofer first (flags OFF) -> joint old/new compatibility check with Studio -> Studio publishes -> Studio enforcement migration later. Report PASS/FAIL/UNTESTED per test.
LAST - SpoofHistory RunThumb: keep Library thumbnail (run.video_id) first; else signedRunFileUrl of the first completed output in a muted <video preload="metadata" playsInline> frame; on error/expired URL show an honest "Preview unavailable" placeholder. UI only: no worker, upload endpoint, DB, key or encoder changes.
```
