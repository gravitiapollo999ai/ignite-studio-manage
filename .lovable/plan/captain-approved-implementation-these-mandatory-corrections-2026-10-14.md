# CAPTAIN APPROVED IMPLEMENTATION — these mandatory corrections supersede every conflicting sentence below. Implement all Studio items a→e in ONE run after Approve. Do not publish automatically: independent coordinated source/compatibility review and live-preview verification precede sequential Spoofer then Studio publication with flags OFF. Studio cannot edit Spoofer: return exact coordinated work package, actual schema/path/hook details and tests for its existing editor. Never claim full E2E or first30 PASS from unit/mock tests or missing evidence.

1 CACHE: content SHA-256 or storage identity proven immutable across overwrites is authoritative. Size and age alone NEVER suffice, including same-size overwrite. Bind verification/create_job to that authoritative identity with fail-closed race handling.

2 LARGE UPLOADS: preserve currently supported upload sizes, including >20 MiB. Hash through bounded streaming/chunks without unbounded full buffering. Never silently reject/skip. If hashing cannot complete, record explicit retry/held verification and preserve file, do not fake proof or measured status. Parser 2MiB read budget is separate from streaming hash budget. No new arbitrary upload cap.

3 REAL TRIM: inspect real receiver storage paths/receiver job ID and actual production trim writer/hook from code. The example studio-inputs/<studio_job_id>/ is NOT authoritative. Evidence must be written by a real completed trim and bind actual source hash/file/object identity + receiver/Studio IDs + attempt + exact segment + actual final SHA/size/duration. No invented hook, fabricated evidence or duration-only proof. If existing pipeline lacks a trim writer or source evidence for links, keep restricted job HELD and report concrete missing integration. No Generate/provider calls to manufacture proof.

4 RECEIPTS: compare canonical persisted job/try/delivery ID/SHA/size/status/email state/completed time, normalizing outcome and received_at. Raw completed/already_completed JSON need not match byte-for-byte. Retain strict HMAC of each actual raw response and strict exact size/SHA/IDs for both types.

5 held_segment: wire DB constraints, TS types, enqueue/retry paths, admin UI ES/EN and recovery. ALL restricted jobs, including explicit segments, must be blocked from legacy production when segment transport is OFF; no omission bypass. Keep historical Delivered untouched and nonrestricted compatible. Add flag-OFF explicit-segment tests.

Preserve JOB2/JOB3, all ledger/balances, files and events; no real-client orders/charges, emails/domain/sender changes, accounts/roles/secrets, Generate or replacement fixtures. JOB4 alreadyDelivered: exact persisted bytes/SHA/size idempotency ONLY; no reset. No production fixtures mutated for tests. Unit/mock suites allowed; pinned existing JOB4 DB check only with read/idempotent invariants. No further DeepSeek live smoke needed. Release flags remain OFF; actual owner session and first30 trim evidence remain UNTESTED until independently verified. Return counts, changed sources/migrations, limitations and exact Spoofer work package.

Post-build remediation and verification plan: Studio + Spoofer release (captain order, review batch)

Scope: one batch of fixes for the same approved, unpublished release. Priority order stays (a) DeepSeek, (b) player, (c) 30 s, (d) delivery/email on hold, (e) ETA. The only cross-item dependency: (c) segment persistence must exist before the (d) delivery gate can enforce it. That is already true, because migration 0010 is applied. Nothing below runs until the captain gives an OK.

Invariants (unchanged): no publishing, mail, Generate, charges, new fixtures/accounts/secrets, or reading/repeating secrets. JOB2 c0376b39-d2a8-4021-a802-9f03af337e22 stays Delivered with its one 21,039,849-byte final and balance 49. JOB3, all credits, files and events stay untouched. Studio JOB4 92372d5b-bb4f-4633-8e18-b3d5a862857b is Delivered and can only be reused idempotently (same SHA, size and bytes), never reset. Spoofer fixture dc823c96-4676-4328-8067-c636174ec7bd. Model stays deepseek-flash: max_tokens 4000, thinking disabled, JSON validation, key server-only.

(a) DeepSeek helper: findings confirmed in source

ai-helper.server.ts reads the response with res.json() and has no byte cap.

Fix: stream-read with a 256 KiB cap that cancels the body when exceeded, giving invalid_output. The 30 s timeout must cover both headers and body: one AbortSignal per attempt, and an overall budget of 65 s for 2 attempts.

aiDraftPrompt sends only the booleans has_source/has_reference. It also always appends "Inputs: source video + subject reference image (paired)", even when one of them is missing.

Fix:

Refuse with a new reason missing_inputs (ES/EN text added) unless the job has a source (file or URL) and a reference image.

The draft header states the facts truthfully: job code, try_number, segment start–end and the segment reason.

Add the fixed line "Timing not analysed from media: no source analysis was supplied". Any approved source analysis would be a future feature.

The system prompt forbids claiming specific timing or camera details unless they are in the brief.

The returned duration_seconds is not checked against the segment.

Fix: reject (invalid_output) when the duration is more than (segment_end − segment_start) + 0.05 s, or more than 30 s.

Inputs are bounded:

Brief text truncated to 2,000 characters.

Subject and business fields capped at 100 characters.

Only fields from the allowlist are sent: never file paths, signed URLs, emails or job_internal content.

Auth and quota:

aiImproveBrief checks the user. aiDraftPrompt checks is_staff with the caller's session before any admin client is used. This is already correct and stays.

consume_ai_quota must be one atomic upsert-and-increment. Review the 0009 SQL, and add migration 0014 only if it uses read-then-write.

Quota is consumed before the provider call. That is intended (protects against abuse) and will be documented.

A failed log insert must not break the response, but must be counted in the server log without content.

UI: ES/EN reason text is added for missing_inputs. The draft is inserted into the editor only. Saving stays a separate staff action through the existing job_internal save. Nothing is sent automatically, and the captain gate text stays.

Files: src/lib/ai-helper.server.ts, src/lib/ai-helper.functions.ts, src/components/ai-helper.tsx, src/lib/ai-helper.test.ts. Possibly migration 0014_ai_quota_atomic.sql.

Tests (mock fetch only):

Oversized body

Slow body causing a timeout

Missing source or reference

Duration longer than the segment

Unknown fields stripped

Quota refused

Non-staff refused

(b) Inline player

What exists: PrivateVideoPlayer makes a 900 s signed URL, which storage only issues to the owner or an admin. It has loading, error and retry states, and the Download button stays separate.

Fixes:

When the video errors after the signed URL expires, re-sign it once automatically, then show the retry button.

Add an aria-label to the video.

Confirm the theme tokens are semantic: bg-muted and border-border, no hard-coded colours.

Verification:

A component test: a failed signed URL shows the ES/EN error, and retry calls signedUrl again.

JOB2 playback is checked only after the approved publication: first signed in as admin, labelled "admin PASS", then separately as the actual owner. The owner check is UNTESTED until the owner signs in.

Files: src/components/private-video-player.tsx, a new src/components/private-video-player.test.tsx.

(c) 30 s source policy: confirmed defect

Current behaviour:

verifySourceVideo catches every readMp4Duration/exactRange error as seconds=null.

classifySource treats any 16-byte head with ftyp at bytes 4–7 as unknown_duration.

Result: truncated, corrupt or unsupported files, and network failures after the header, are wrongly accepted.

Fix: readMp4Duration returns a typed result instead of null or a throw:

Outcome

	

Meaning

	

Action

measured(seconds)

	

finite, >0

	

≤30.05 accept, >30.05 block

unknown_declared

	

valid box tree, mvhd v0 duration 0xffffffff / v1 all-ones, or duration 0 with valid timescale

	

accept with enforced 0–30 segment

malformed

	

bad box size, size < header, size beyond file, u64 > MAX_SAFE_INTEGER, unknown mvhd version, timescale 0, no moov within budget, ftyp brand not in mp4/mov allowlist

	

rejected_media, record it

io_error

	

range non-206, wrong byte count, timeout, storage error

	

retry, write NO row, delete nothing

Also:

Add a work budget: at most 64 top-level boxes and at most 2 MiB of bytes read in total.

A database upsert failure leaves the result as retry (already correct).

No duration is ever invented.

Cache identity: the source_video_checks row key is file_path.

Add a size_bytes check: if the size stored in the row differs from the current object, re-verify.

create_job must reject a check row older than 24 h or with a mismatched size.

Review 0010 bounds: segment_start ≥ 0, end − start in the range (0, 30], both finite and non-null together. Add a CHECK constraint in migration 0015_source_check_identity.sql if one is missing.

Segment travel: buildPayload in spoofer-sync.server.ts leaves out the segment fields while SPOOFER_SEGMENT_FIELDS is off.

New gate: if a job has segment_reason set to auto_first_30* and the flag is off, intake is HELD:

The spoofer_sync status becomes held_segment, with no push.

The admin sync card shows a clear ES/EN reason.

So a first-30 s job never enters legacy production without its restriction. Measured-short and explicit-segment jobs keep flowing as they do now.

Tests: fixtures produced by byte surgery on the existing clips:

ftyp-only

Truncated moov

Box size beyond the file

Box size of 0 in the middle of the file

u64 overflow

mvhd version 2

Timescale 0

Range failure after a valid header (mock), giving retry

Genuine unknown duration

30.00, 30.05 and 30.10 s

Box budget exceeded

Gate behaviour (held / pushed)

The reported config state of both flags must be verified before first-30 counts as PASS.

Files: src/lib/mp4-duration.ts, src/lib/source-video.functions.ts, src/lib/spoofer-sync.server.ts, src/components/spoofer-sync-card.tsx, src/lib/mp4-duration.test.ts, src/lib/spoofer-contract.test.ts, docs/[spoofer-receiver-contract.md](http://spoofer-receiver-contract.md), migration 0015.

(d) Delivery: Studio side

Receipts: the strict signed receipt (status, email_state, size, SHA, job, try, delivery UUID) is built from persisted state for both completed and already_completed. This is already done; add a test that compares the two byte for byte.

New Studio delivery gate: for a job with a restricted segment (auto_first_30* or explicit), deliver-video needs a trim_evidence object in the HMAC-covered metadata, otherwise it answers 409 segment_evidence_required. The evidence contains:

segment_start/segment_end matching the job's stored segment

source_sha256 matching the SHA recorded for the Studio source at intake (new column jobs.source_sha256, filled by verifySourceVideo from a streamed hash of ≤20 MiB uploads; for links it stays null, which means held for review)

try_number and the final file's size and SHA

 Measured-short legacy jobs need no evidence, so old senders keep working for them. Studio's own final-duration check (readMp4Duration on the received file) must be ≤ the segment length + 0.05 s.

Close the bypass: the apply_spoofer_callback status path with delivered can no longer set Delivered for segment-restricted jobs. Delivered is allowed only through complete_delivery. That will be migration 0016_delivery_segment_gate.sql. Historical rows that are already Delivered are not changed.

Email stays on hold:

Keep the lease expiry, the current token, the 5-attempt maximum and the finish-RPC checks.

Make no sender or domain changes and release nothing from the queue.

scripts/delivery-db-race.ts stays pinned to JOB4 with claims limited to the fixture. Add an assertion that refuses to run if the fixture UUID is not the pinned one.

Files: src/routes/api/public/deliver-video.ts, src/lib/delivery-contract.ts (+test), src/lib/source-video.functions.ts, docs/[deliver-video-contract.md](http://deliver-video-contract.md), migration 0016, scripts/delivery-db-race.ts.

(d) Spoofer work package (applied in Spoofer's own editor; Studio cannot edit it)

Trim evidence writer: after the actual trim, compute the source SHA-256 from the downloaded studio-inputs/<studio_job_id>/ bytes. Record the segment used, the try_number, and the final SHA and size in studio_trim_evidence. Then send trim_evidence in the deliver-video metadata. Never fabricate it: a final that is short only by duration is not evidence.

trimStatus: compare against the stored source hash, file, attempt and segment, not just an arbitrary string and interval tolerance.

Legacy setStatus(delivered): route it through the same duration/segment gate. It may not deliver restricted jobs.

upsertJob: on a repeat intake with the same try_number, accept it only when brief and segment are identical. If they differ, log intake_conflict and do not overwrite. A higher try_number updates brief and segment. Already-Delivered historical jobs are never mutated.

MP4 parser: add a safe-u64 check, a 64-box limit and a 2 MiB read budget, the same as Studio.

Keep: flag OFF plus a fixture allowlist checked before claim, read or HMAC. Also keep video_size_bytes on every URL send, the caps (URL ≤40 MiB, multipart ≤20 MiB, JSON ≤16 KiB), and strict receipt verification for both receipt types (exact size, SHA, job, try and delivery UUID).

Tests: the Spoofer project adds its own tests and reports its counts separately.

(e) ETA

Review migration 0013, get_job_eta, set_job_eta, src/lib/eta.ts and job-eta.tsx. Fix whatever does not meet the following:

set_job_eta is admin-only.

Overrides are whole minutes from 0 to 10,080, and per-stage values are finite.

Terminal statuses (delivered, cancelled) show no estimate.

Labels use the viewer's local time and refresh once a minute.

The ES/EN wording is "estimated", never a deadline.

Add tests for terminal states, an override with clamping, and jobsAhead×30 + 15/30/15.

Verification and release matrix

Unit/mock results are labelled as such and never called live E2E.

Case

	

Expected

old Bearer status sender → new Studio

	

still accepted for non-restricted jobs

new HMAC deliver → new Studio

	

completed / already_completed identical receipt

old intake → new Spoofer

	

accepted, unknown fields ignored

new intake (segment fields) → old Spoofer

	

Studio flag OFF, so first-30 jobs are HELD, no push

flags OFF

	

zero HMAC sends from Spoofer; first-30 jobs held with an accurate reason

flags ON

	

allowlisted fixture only

timeout / lost response / same idempotency key / stale try / concurrent deliver

	

one stored final, stable receipt, no double status

Fixture plan:

Reuse JOB4 only with its persisted SHA and size, which gives an already_completed receipt check.

Pair it with Spoofer fixture dc823c96. If the exact byte pairing is unavailable, report it as PARTIAL/UNTESTED and propose a reviewed next step. Never create a replacement fixture.

Release order (sequential; at no point do live requests get rejected with 400):

Independent source review of both projects.

Apply Studio migrations 0014–0016, all additive.

Publish Spoofer with its flags OFF.

Publish Studio with SPOOFER_SEGMENT_FIELDS off.

Signed-in live checks: admin first, then the owner.

Turn flags ON for the allowlisted fixture only, which may need a republish (not an instant rollback).

Real-client tests only after the captain approves a concrete test scope that covers the 1-credit charge.

Remaining limits: owner-client playback, live end-to-end delivery and any first-30 production trim stay UNTESTED until after publication and captain approval. Email stays blocked until a domain/sender exists.