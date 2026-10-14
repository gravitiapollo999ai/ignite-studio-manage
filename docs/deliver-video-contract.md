# POST /api/public/deliver-video (HMAC v1)

One call delivers a QA-approved final MP4 for a Studio job attempt. The legacy Bearer `/api/public/spoofer/status` callback is unchanged.

## Signature
Secret: existing `SPOOFER_SYNC_SECRET` (server-only, both sides).

Headers (all required):
- `X-Studio-Timestamp`: unix seconds; accepted within ±300 s.
- `X-Studio-Nonce`: 16–128 chars `[A-Za-z0-9_-]`, unique per request (single-use, kept 24 h).
- `X-Studio-Content-SHA256`: lowercase hex SHA-256 of the exact raw request body bytes.
- `X-Studio-Signature`: `v1=` + lowercase hex HMAC-SHA256(secret, canonical).
- Optional `X-Studio-Actor`: stored as *unverified* claim only.

Canonical string (joined with `\n`, no trailing newline):
```
v1
POST
/api/public/deliver-video
<timestamp>
<nonce>
<body_sha256>
```

## Bodies
Header envelope (presence, format, ±300 s) is checked BEFORE any body byte is read; body reads have a 30 s deadline.

A) Preferred — `application/json` (≤16 KB):
`{ job_id, try_number, video_url, video_sha256, video_size_bytes, file_name? }`
`video_url` must be exactly `https://lcvqhteqxwbelvqdafni.supabase.co/storage/v1/object/sign/studio-inputs/finals/<receiver_job_id>/final.mp4?token=<signed token>`
where `<receiver_job_id>` equals the Spoofer job id Studio stored from the intake response for this job. Only the `token` query key is allowed; no fragments, ports, credentials, encoded separators. Redirects are refused, 60 s timeout, max 40 MB; downloaded byte count must equal `video_size_bytes` and SHA-256 must equal `video_sha256`.

B) Fallback — `multipart/form-data`: `job_id`, `try_number`, optional `file_name`, `file` (MP4), max 20 MB.

Memory: everything is buffered in Worker memory, not streamed (multipart ≈3× file size peak, signed URL ≈1× + upload). Limits are set well under the 128 MB Worker cap; larger finals are refused with 413.

## Responses (JSON receipt, signed by `X-Studio-Receipt-Signature: v1=HMAC(secret, raw response body)`)
| HTTP | outcome |
|---|---|
| 200 | `completed` / `already_completed` (idempotent retry of same bytes) |
| 202 | `in_progress` (concurrent identical request; `Retry-After: 30`) |
| 401 | missing / malformed / stale / body_hash / bad_signature |
| 503 | `lease_expired` / `lease_lost` (retry with same bytes) |
| 408 | body read timeout |
| 409 | `replay`, `conflict_terminal`, `conflict_different_bytes`, `conflict_older_attempt`, `conflict_already_delivered`, `conflict_cancelled`, `attempt_mismatch` |
| 413/415/422 | too large / not MP4 / sha mismatch |
| 5xx | retry with the same bytes and a NEW nonce/timestamp (lease resumes after ≤5 min) |

Receipt: `{ ok, outcome, job_id, try_number, sha256, delivery_id, received_at, size_bytes?, status?, email? }`. No URLs or secrets.

## curl (multipart)
```bash
SECRET=...   # from your secret store; never echo
TS=$(date +%s); NONCE=$(openssl rand -hex 16)
curl -s -o /dev/null -w '' # build body first:
BOUNDARY=studio$NONCE
{ printf -- "--$BOUNDARY\r\nContent-Disposition: form-data; name=\"job_id\"\r\n\r\n$JOB\r\n";
  printf -- "--$BOUNDARY\r\nContent-Disposition: form-data; name=\"try_number\"\r\n\r\n1\r\n";
  printf -- "--$BOUNDARY\r\nContent-Disposition: form-data; name=\"file\"; filename=\"final.mp4\"\r\nContent-Type: video/mp4\r\n\r\n";
  cat final.mp4; printf -- "\r\n--$BOUNDARY--\r\n"; } > body.bin
SHA=$(sha256sum body.bin | cut -d' ' -f1)
SIG=$(printf 'v1\nPOST\n/api/public/deliver-video\n%s\n%s\n%s' "$TS" "$NONCE" "$SHA" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
curl -X POST https://ignite-studio-manage.lovable.app/api/public/deliver-video \
  -H "Content-Type: multipart/form-data; boundary=$BOUNDARY" \
  -H "X-Studio-Timestamp: $TS" -H "X-Studio-Nonce: $NONCE" \
  -H "X-Studio-Content-SHA256: $SHA" -H "X-Studio-Signature: v1=$SIG" \
  --data-binary @body.bin
```
Sign the exact bytes sent; do not let the HTTP client re-encode the multipart body.

## Semantics
- Lock order is always job row → delivery request row. Reservation per (job, try) with content SHA + size returns a single-use `lease_token`; completion requires that token and an unexpired lease, so an expired worker cannot finalize a reclaimed lease. Delivered is set only after the file is durably stored and the deliverable row is written, in one transaction that also writes one `video-ready` email outbox row.
- Jobs already Delivered without a deliver-video record (e.g. legacy callback deliveries) return `conflict_already_delivered` and are never modified.
- Studio never calls Spoofer back from this route (no echo loop); Spoofer audits from the signed receipt.
