# Consolidated plan — Studio Spark (captain order 1791955207.299169)

Plan only. Nothing is implemented, published, sent or generated until the captain gives an explicit OK. All video generation stays paused; Academy is deferred.

## 0. Fixed invariants (checked at every gate)
- Roberto JOB-000002 `c0376b39-d2a8-4021-a802-9f03af337e22`: stays Delivered, try 1, one final (21,039,849 bytes, SHA a4b0f028…09c6), one −1 charge, balance 49. No reupload, status change, email or delivery request.
- JOB-000003 `10279ea5-2d69-46f5-8f84-e0ca7c7463b4` and all historical files stay untouched.
- Synthetic Studio fixture JOB-000004 `92372d5b-bb4f-4633-8e18-b3d5a862857b` (already Delivered by the race test) is the only Studio fixture; no new fixtures get created.
- Spoofer fixture `dc823c96-4676-4328-8067-c636174ec7bd` is reused; Spoofer-side changes are applied by the captain in the Spoofer editor (this project cannot edit Spoofer).
- Pricing, accounts, roles, credentials and credits stay unchanged. No paid video API and no automatic Generate. CaboEnt/Higgsfield Unlimited production gates stay as they are.

## 1. DeepSeek brief helper + Seedance prompt writer
**Provider check (done, read-only):** DeepSeek's official Models & Pricing page lists `deepseek-flash` (DeepSeek-V4.1-Flash, released 2026-09-10) at base URL `https://api.deepseek.com` (OpenAI format), with JSON output supported and a maximum output of 384K. Mismatch to flag: the Quick Start page still names `deepseek-v4-flash` (now an alias routed to V4.1 Flash). The plan uses `deepseek-flash` exactly as requested. Thinking mode is ON by default, so the plan explicitly selects non-thinking mode for JSON output; this gets re-verified against the official Thinking Mode doc before coding. No silent substitution: if the API rejects `deepseek-flash`, the feature fails closed and reports the error.

**Workflow:**
- Client (new-job stepper, optional): a "Help me write my brief" button sends their draft brief plus business type and subject type, and returns a cleaned-up ES/EN brief. The client edits it and submits as before. Nothing is auto-submitted.
- Admin (admin job detail): a "Draft Seedance prompt" button builds a prompt from the brief, clip segment, subject info and a description of the reference image. The result is saved only into admin-only `job_internal.internal_prompt` as a *draft*, marked "Draft — needs captain gate". No production send and no Generate.
- The source video and the subject reference image always stay attached together in the handoff; the prompt writer only adds text and never replaces either file.

**Security and controls:**
- `DEEPSEEK_API_KEY` is server-only, read inside the handler, never logged and never returned. When it's missing, a status function returns `not_configured`, and the UI shows "AI helper not configured yet / Asistente IA aún no configurado" with the buttons disabled. The secret is requested later through the secure form only after captain OK.
- Model call: `max_tokens` 4000, a 30 s AbortSignal timeout, one retry on 429/5xx with backoff, and `response_format: json_object`.
- Output is validated with Zod (`{ brief_en, brief_es }` / `{ prompt, negative_prompt, shot_notes[], duration_seconds<=30 }`), with length bounds. Invalid output leads to an error state, never a partial save.
- Rate limits are per-user and per-day (DB counter table `ai_helper_usage`, e.g. client 10/day, staff 100/day), enforced in a security-definer function.
- Prompt-injection boundary: user text goes in a delimited `user_content` block, the system prompt says to treat it as data, and the output is plain text only (no URLs or tools). Admin review is always required before any use.

**Files:**
- `src/lib/ai-helper.server.ts` (client + validation)
- `src/lib/ai-helper.functions.ts` (`requireSupabaseAuth`; staff check for the prompt writer)
- UI in `jobs.new.tsx` and `admin/jobs.$jobId.tsx`
- Migration: `ai_helper_usage` table plus `ai_helper_log` (admin-read, no content stored beyond hashes and lengths)

**Tests:** schema validation, missing-key fail-closed, timeout/retry bounds and rate-limit refusal, all with a mocked fetch. No live DeepSeek call until the key exists and the captain approves.

## 2. Inline final-video player (already built, verify only)
- Reuse `src/components/private-video-player.tsx`: 15-minute signed URLs that storage policy issues only to the job owner or an admin, controls and playsInline, ES/EN loading/error/retry, theme tokens. Download is unchanged.
- No code change planned unless review finds a defect. One small add: re-request the URL on the player's error event after expiry (already handled through retry).
- Verification after the approved publication:
  - (a) admin signed in views JOB-000002 and it plays, with no network write calls;
  - (b) owner-client verification: only Roberto can do this himself, so it's recorded as UNTESTED by us unless he confirms;
  - (c) a non-owner gets refused.
  The two kinds of check get reported separately.

## 3. 30-second source policy (decided)
**Rule:** uploads measured at ≤30.05 s are accepted; anything longer is blocked with the existing EN text and its natural ES equivalent. The current hardened checks stay: finite/bounds/version checks in the MP4 header reader, exact 206 range reads with byte counts, timeouts, and fail-closed persistence with the DB constraint.

**Unknown or unreadable length:** use only the first 30 seconds, as a real enforced segment.
- New job columns `segment_start_seconds` / `segment_end_seconds` (nullable numeric), plus `segment_reason` (`explicit` | `auto_first_30` | `measured_short`).
- `create_job` sets the segment server-side:
  - Upload measured ≤30.05 s: no segment (whole clip), `measured_short`.
  - Upload measured >30.05 s: blocked with the coming-soon message (EN/ES).
  - Upload whose length can't be read but which passes the safety checks: ACCEPTED for production of only the first 30 s. Segment 0–30, `segment_reason = auto_first_30_unknown_length`, with the ES/EN notice. The check record stores `ok=false`, `duration_ms=null` and a new `status = 'unknown_duration'`, so it is never labelled measured and never given an invented passing duration. `create_job` accepts `unknown_duration` only together with the forced 0–30 segment.
  - Upload that is actually corrupt, unsupported or unsafe: still refused. That covers no `ftyp` box, a container that isn't MP4/MOV, a path or owner mismatch, a missing object, and a size over the bucket limit. Result `status = 'rejected_media'`, with a clear ES/EN error.
  - Regular YouTube: an explicit segment is required, as today (≤30), `explicit`.
  - Instagram Reel / TikTok / Shorts (length not verifiable): forced segment 0–30, `auto_first_30`, unless the client gave an explicit segment ≤30, which is preserved.
- A client notice explains "We'll use only the first 30 seconds / Usaremos solo los primeros 30 segundos".
- The segment travels through:
  - the intake payload (`spoofer-sync.server.ts`, new fields `segment_start_seconds`, `segment_end_seconds`, `segment_reason`; additive and backward-compatible);
  - the production feed (`/api/public/jobs-feed`);
  - the receiver contract doc.
- Production applies the segment with its existing tooling. Studio never claims a trim happened: "trimmed" is recorded only when production reports it. Studio does not download or trim Instagram media itself (no unsupported bypass and no new service). If production cannot access the source, the job stays in review and the admin contacts the client. No duration evidence is invented.

**Schema addition for this item:** `source_video_checks.status` text (`measured_ok` | `measured_too_long` | `unknown_duration` | `rejected_media`), with a CHECK constraint that `measured_ok` requires 0 < duration_ms ≤ 30050 and `unknown_duration` requires duration_ms null. Additive; existing rows are backfilled from `ok` / `duration_ms`.

**Tests:**
- Fixtures at 30.00 and 30.05 accepted, 30.06 and 31 rejected.
- A valid MP4 with a truncated/overflow/unknown-duration header is accepted as `unknown_duration`, with a 0–30 segment enforced in `create_job`.
- A file without `ftyp`, a non-MP4 file and a wrong owner are rejected as `rejected_media`.
- `create_job` refuses `unknown_duration` without the forced segment.
- `create_job` segment rules for each source type.
- Explicit shorter segment preserved.
- Feed and intake payload carry the segment.

**Migration:** additive columns plus a `create_job` replacement, and a backfill of `segment_reason` = null for historical jobs (no historical changes).

## 4. Delivery API + email (built; close remaining gaps)
**Gap fixes in `src/routes/api/public/deliver-video.ts` + SQL:**
- **Stable receipt:** a new service-only `get_delivery_receipt(_request_id)` returns the persisted state (job status, deliverable path/name, size, sha, completed_at, email_outbox status). Both the `already_completed` early branch and normal completion build the receipt from it, so the fields are identical (`status: "delivered"`, `email: <persisted status>`, `size_bytes`, `completed_at`). The receipt stays HMAC-signed and Spoofer's strict verification is not weakened.
- **Email finish:**
  - `dispatchEmails` checks the `finish_email_outbox` RPC error/result and counts any non-`ok` as a failure, never as success.
  - `finish_email_outbox` also requires `lease_until > now()`.
  - `claim_email_outbox` never re-leases rows with attempts ≥5; reclaimed expired leases at attempts ≥5 go to `failed`.
  - `claim_email_outbox` gains an optional `_job_id` scope for tests.
- **Email stays ON HOLD:** `getSender()` returns null, so every row stays blocked. There's no `requeue_blocked_emails` call and historical rows are not unblocked. The template is kept.

**Race script rewrite (`scripts/delivery-db-race.ts`):**
- It no longer inserts. It pins JOB-000004 `92372d5b-bb4f-4633-8e18-b3d5a862857b` and aborts unless the notes carry the synthetic label and the sync state is `failed`.
- Every claim is scoped to that job id.
- Re-runnable checks on the Delivered fixture: concurrent identical → `already_completed` with identical receipts; different bytes → conflict; JOB-000002 refused and unchanged; no new ledger rows. The lease-path checks reuse a transaction-local attempt-2 scenario only if approved; otherwise they're marked covered by the earlier run.

**Coordinated Spoofer follow-up (captain applies in the Spoofer editor):**
- Send `video_size_bytes` (the exact byte count).
- Lower the sender cap to ≤40 MiB for the URL mode, ≤20 MiB for multipart, and a JSON body ≤16 KiB.
- Signed URL exactly `https://lcvqhteqxwbelvqdafni.supabase.co/storage/v1/object/sign/studio-inputs/finals/<receiver UUID>/final.mp4?token=…`, where the receiver UUID is the id Studio recorded at intake.
- Verify `X-Studio-Receipt-Signature`.
- Treat 202/503 as retry with a new nonce and the same bytes.
- Receiver tolerance: Spoofer's `/api/public/studio/jobs` receiver must ignore unknown fields and store the new segment fields when present. The captain confirms this in the Spoofer editor before Studio sends them.
- Feature flag: Spoofer's new deliver-video sender ships behind a non-secret flag, `STUDIO_DELIVER_VIDEO_ENABLED`, default OFF. While it's OFF, Spoofer keeps using the legacy Bearer `/api/public/spoofer/status` callback, which stays unchanged in Studio.

**Staged, additive release (no deliberate live 400 window; no atomic two-site publish assumed):**

```text
Stage 0  today: published Studio has legacy callback only; published Spoofer uses legacy callback.
Stage 1  Spoofer editor: new sender (video_size_bytes, caps, exact URL, receipt verify) behind flag OFF,
         receiver tolerant of segment fields. Tested against Studio PREVIEW. Not yet published.
Stage 2  Compatibility proof (both previews):
           old Spoofer callback  -> new Studio : still 200 (legacy route unchanged)
           new Spoofer sender    -> new Studio : 200 completed / already_completed, receipt verified
           new Studio intake     -> old+new Spoofer receiver : 200, segment fields ignored/stored
           new Spoofer (flag OFF)-> old Studio : legacy callback only, no deliver-video calls
Stage 3  Release gate: captain OK, all Stage 2 checks PASS.
Stage 4  Publish Spoofer (flag OFF)  -> behaviour identical to today; verify legacy callback live.
Stage 5  Publish Studio (includes lock/lease repairs, 0005-0008 code, items a-e)
         -> legacy callback still works; deliver-video live but unused; verify signed probe on JOB-000004.
Stage 6  Turn Spoofer flag ON (config change, no publish) -> first real use on fixture dc823c96 only.
Rollback: flag OFF instantly returns to the legacy callback; no schema rollback needed (all additive).
```

## 5. Estimated ready time
- **Formula (minutes):**
  - Queued: `jobsAhead*30 + review 15 + generating 30 + QA 15`, where `jobsAhead` = non-terminal jobs created earlier in submitted/in_review/generating/qa.
  - In review: remaining review time plus 30 + 15.
  - Generating: remaining generating time plus 15.
  - QA: remaining QA time.
  - Delivered: no estimate.
  - Remaining time = max(5, stage default − elapsed since that stage's `job_events.created_at`).
- **Overrides:**
  - New `settings` columns `eta_queue_minutes` (30), `eta_review_minutes` (15), `eta_generating_minutes` (30), `eta_qa_minutes` (15), editable by admins.
  - Per-job `job_eta_overrides` (`ready_at` whole-job override, or per-stage minutes), admin-only write through a security-definer `set_job_eta` function. Managers get read-only access.
- **Calculation:** `get_job_eta(_job_id)` is security-definer, so the owner/staff can read their own job and see only the queue count, not other clients' data.
- **UI:**
  - The job detail and the list show "Estimated ready ~ 3:40 PM / Listo aprox. 15:40" in the viewer's local time, with the "estimate, not a guaranteed deadline" wording.
  - The value refreshes on realtime `job_events` / status changes and every 60 s.
  - ES/EN, light/dark.
- **Tests:** a pure `computeEta` with fixed clocks covering each stage, queue depth, overrides winning, the floor and delivered/cancelled → none. Plus a permission test that a client cannot set overrides.

## Verification and publication order
1. Implement in the mandated order: (a) DeepSeek brief helper and Seedance writer (section 1), (b) inline player (section 2, verify only), (c) 30 s policy (section 3), (d) delivery gap fixes with email on hold (section 4), (e) ETA (section 5).
   - Hard dependencies (no reordering): (a) is built and tested with a mocked provider and stays fail-closed until the human enters `DEEPSEEK_API_KEY`; the live DeepSeek check happens after the key is entered. (c)'s segment fields go into the intake payload that (d)'s staged release carries, so the Spoofer receiver-tolerance check (Stage 1) gates sending them.
2. After the build: open the secure Secrets form with name `DEEPSEEK_API_KEY` prefilled and the value blank, for human entry. Credentials are never invented, read or entered by us. Email and domain are not configured.
3. Independent source review of both projects together (Studio: migrations 0005–0008 plus new ones, delivery, 30 s, items a–e; Spoofer: sender, flag, receiver tolerance).
4. Tests: Studio unit suite; the rewritten fixture-only DB script pinned to JOB-000004 with claims scoped to it; Spoofer's suites; then Stage 2 compatibility proofs on both previews, using Spoofer fixture `dc823c96…`.
5. Real-client E2E on the preview (upload length handling, DeepSeek helper, player, delivery):
   - Use only the pinned synthetic fixtures.
   - A real signed-in client order would require an existing client session and would charge 1 credit, so it's reported as a dependency for captain decision. No accounts are created and no charge happens without review.
   - Record credits before and after.
   - No production Generate and no real mail.
6. PASS/FAIL/UNTESTED report, then captain release gate.
7. Coordinated publish following Stages 4→5→6, then signed-in live checks: admin playback of JOB-000002, invariant read-back (JOB-000002/JOB-000003, balance 49, ledger counts), legacy callback still working.

## Current status
- **PASS (reported):** Studio 75 unit / 24 DB; Spoofer 106 unit / 26 DB.
- **UNTESTED:** full endpoint E2E, owner-client playback, live email (blocked).

## Blocking dependencies
- `DEEPSEEK_API_KEY` entered by a human in the secure form, needed for the live part of (a).
- An owned email domain/provider for any email sending (on hold).
- Spoofer editor changes: sender, flag, receiver tolerance, caps and receipt verification.
- An existing client session, plus approval of a 1-credit charge, for any real-client order E2E.
- Roberto's own confirmation for owner-side playback.
