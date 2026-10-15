# Spoofer work package (apply in the Spoofer editor; Studio cannot edit it)

Read-only inspection of Spoofer snapshot 729c77de found these real paths and gaps:
- Inputs are copied by `copyPendingFiles` (src/lib/studio-core.ts) to `studio-inputs/<studio_jobs.id>/<kind>/<file_name>` (Spoofer receiver UUID, NOT the Studio job id). Size is recorded; **no content SHA-256 is recorded**.
- Finals are uploaded manually by an admin in `src/routes/_authenticated/studio.$id.tsx` to `studio-inputs/finals/<studio_jobs.id>/final.mp4` with `upsert: true`.
- `studio_jobs.trim_evidence` / `source_trim_confirmed` exist (migration 0016) but **nothing writes them**; there is no trim step in the pipeline. `trimStatus` (src/lib/studio-deliver.ts) only checks interval tolerance + an arbitrary string.
- `upsertJob` (src/lib/studio.server.ts) uses `ignoreDuplicates`, so a repeat intake only bumps try_number; brief/segment never reconcile.

Consequence: segment-restricted jobs (explicit or first-30) **cannot be proven trimmed today** and must stay HELD. Studio enforces this: they are not pushed while `SPOOFER_SEGMENT_FIELDS` is off, the legacy status callback can no longer mark them Delivered, and deliver-video refuses them without bound evidence.

## Required changes
1. On copy, stream SHA-256 of each source and store `studio_job_files.content_sha256`; compare with Studio's `source_sha256` when supplied (additive brief field; mismatch → `source_mismatch`, no production).
2. Real trim writer: only a completed production trim step (ffmpeg/worker job that actually cuts `[segment_start, segment_end]` from the stored source object) may write `studio_trim_evidence(studio_job_id, receiver_job_id, try_number, source_object_path, source_sha256, segment_start, segment_end, final_sha256, final_size_bytes, final_duration_seconds, created_at)`. If no such step exists, keep restricted jobs held and report it — do not hand-enter evidence or infer it from duration. No Generate/provider calls to produce proof.
3. `trimStatus` → confirmed only when evidence matches stored source hash, file, attempt, segment and the current final's SHA/size.
4. `deliverFinal`: include `trim_evidence` `{segment_start, segment_end, source_sha256, try_number, final_sha256, final_size_bytes}` in the HMAC-signed body (JSON) or as a `trim_evidence` form field (multipart). Always send `video_size_bytes`. Caps: URL ≤40 MiB, multipart ≤20 MiB, JSON ≤16 KiB.
5. Legacy `setStatus(delivered)` must pass the same segment/duration gate (Studio now ignores it for restricted jobs with `ignored: "evidence_required"`).
6. `upsertJob`: same try_number + different brief/segment → log `intake_conflict`, no overwrite; higher try updates brief/segment; Delivered jobs never mutated.
7. MP4 parser: safe-u64, ≤64 top-level boxes, ≤2 MiB read budget.
8. Keep `STUDIO_DELIVER_VIDEO_ENABLED` off + allowlist checked before claim/read/HMAC; strict receipt verify for completed AND already_completed on canonical fields (job, try, delivery_id, sha256, size_bytes, status, email, completed_at — outcome/received_at excluded); verify HMAC of each raw response.

## Release matrix
| Case | Expected |
|---|---|
| old Bearer status → new Studio | non-restricted accepted; restricted delivered → ignored evidence_required |
| new HMAC deliver, non-restricted | completed / already_completed canonical-equal |
| new HMAC deliver, restricted, no evidence | 409 segment_evidence_required |
| old intake → new Spoofer / new intake → old Spoofer | accepted; Studio flag OFF ⇒ restricted jobs held, never sent |
| flags OFF | zero HMAC sends; held jobs show reason |
Publish order: Spoofer (flags OFF) → Studio (SPOOFER_SEGMENT_FIELDS off) → admin then owner live checks → flags ON only for allowlisted fixture after captain OK.

## Batch 1792032883 additions (Studio side done)
- Payload now always carries `source_sha256` (top-level, `brief.source_sha256`, and `files[source_video].sha256`); `null` for links/legacy — never treat as verified.
- Canonical reasons: `contracts/segment-reasons.json` (paste verbatim into Spoofer contract test).
- Flags ON: restricted link jobs stay `held_segment` / `link_needs_upload` until a verified MP4 is attached.
