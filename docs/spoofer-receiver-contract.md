# Studio → Spoofer sync contract

Shared secret: `SPOOFER_SYNC_SECRET` (same value in both projects). Sent as `Authorization: Bearer <secret>`.

## 1. Spoofer must add: `POST https://spoofer-suite.lovable.app/api/public/studio/jobs`
Headers: `Authorization: Bearer <SPOOFER_SYNC_SECRET>`, `Idempotency-Key: <studio_job_id>`.
Body:
```json
{ "studio_job_id": "uuid", "studio_job_code": "JOB-000002", "status": "submitted", "try_number": 1,
  "client": { "name": "…", "email": "…", "company": "…" },
  "brief": { "source_type": "instagram_reel", "source_url": "…", "clip_start": null, "clip_end": null,
             "target_duration_seconds": 30, "resolution": "1080p", "subject_type": "person",
             "subject_name": "…", "business_type": "…", "notes": "…" },
  "files": [ { "kind": "reference_image" | "source_video", "file_name": "…", "url": "<24h signed URL>" } ],
  "created_at": "ISO" }
```
Receiver must: verify bearer (constant-time), upsert `studio_jobs` UNIQUE on `studio_job_id` (repeat = return the existing row, 200), download each `files[].url` into a PRIVATE Spoofer bucket (e.g. `studio-inputs/<studio_job_id>/<file_name>`), insert a `studio_sync_log` row, and reply `200 {"spoofer_job_id":"<id>"}`. Any non-2xx makes Studio retry (1,2,4,8,16 min; flagged after 6 attempts).

## 2. Spoofer calls back: `POST https://ignite-studio-manage.lovable.app/api/public/spoofer/status`
Headers: `Authorization: Bearer <SPOOFER_SYNC_SECRET>`.
```json
{ "event_id": "unique-per-change", "studio_job_id": "uuid", "spoofer_job_id": "…",
  "status": "in_review" | "generating" | "qa" | "delivered", "message": "client-visible, optional",
  "final_video": { "url": "https signed URL valid ≥10 min", "file_name": "final.mp4" } }
```
`final_video` is required with `delivered`. Optional `"try_number": <int>` = the intake payload's `try_number` this callback belongs to; Spoofer MUST send it (immutable per event). Absent is accepted only while the Studio job is on attempt 1 (legacy); on attempt ≥2 unversioned callbacks are ignored as `attempt_mismatch`. Acceptance is monotonic per attempt (in_review < generating < qa < delivered); Delivered is terminal for that attempt. Stale, terminal or other-attempt callbacks return `200 {"ok":true,"ignored":"stale"|"terminal"|"attempt_mismatch"}` — do not retry them. A new attempt exists only after Studio raises `try_number` (client revision) and re-sends intake. Studio dedupes by `event_id`; same status is a no-op; inbound updates never trigger an outbound push (no echo loop). Retry the same `event_id` on 5xx/network errors. Log every call in `studio_sync_log`; never log the secret or signed URLs' tokens.

## Enforced source segment (additive, staged)
When Studio config `SPOOFER_SEGMENT_FIELDS=on`, `brief` also carries:
- `segment_start_seconds`, `segment_end_seconds` (numbers, ≤30 s span, or null = whole clip measured ≤30.05 s)
- `segment_reason`: `explicit` | `auto_first_30` (link length unverifiable) | `auto_first_30_unknown_length` (upload length unreadable) | `measured_short`
Production must use only that segment. Studio never records a trim as done; production reports it. Receivers must ignore unknown fields; Studio only turns the flag on after the receiver is confirmed tolerant. The same fields are in `/api/public/jobs-feed`.
