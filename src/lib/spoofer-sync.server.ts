// Server-only: pushes Studio jobs to Spoofer. Never import from client code.
import { backoffMinutes, isFinalFailure, redact, SPOOFER_CREATE_PATH, SPOOFER_DEFAULT_BASE_URL } from "./spoofer-contract";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export function spooferConfig() {
  const secret = process.env["SPOOFER_SYNC_SECRET"];
  const base = (process.env["SPOOFER_BASE_URL"] || SPOOFER_DEFAULT_BASE_URL).replace(/\/$/, "");
  return { secret, base };
}

async function log(admin: Admin, row: { job_id: string | null; direction: "outbound" | "inbound"; event: string; ok: boolean; http_status?: number | null; message?: string; event_id?: string | null }) {
  await admin.from("spoofer_sync_log").insert({ ...row, message: row.message ? redact(row.message, [spooferConfig().secret]) : null });
}
export { log as logSync };

async function sign(admin: Admin, bucket: string, path: string | null) {
  if (!path) return null;
  const r = await admin.storage.from(bucket).createSignedUrl(path, 86400);
  return r.data?.signedUrl ?? null;
}

export async function buildPayload(admin: Admin, jobId: string) {
  const { data: j } = await admin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!j) throw new Error("Job not found");
  const { data: p } = await admin.from("profiles").select("full_name,email,company").eq("id", j.user_id).maybeSingle();
  const files = [
    j.source_file_path && { kind: "source_video", file_name: j.source_file_path.split("/").pop(), url: await sign(admin, "source-videos", j.source_file_path) },
    j.reference_image_path && { kind: "reference_image", file_name: j.reference_image_path.split("/").pop(), url: await sign(admin, "reference-images", j.reference_image_path) },
  ].filter(Boolean);
  return {
    studio_job_id: j.id,
    studio_job_code: j.code,
    status: j.status,
    try_number: j.try_number,
    client: { name: p?.full_name ?? null, email: p?.email ?? null, company: p?.company ?? null },
    brief: {
      source_type: j.source_type, source_url: j.source_url, clip_start: j.clip_start, clip_end: j.clip_end,
      target_duration_seconds: j.target_duration_seconds, resolution: "1080p",
      subject_type: j.subject_type, subject_name: j.subject_name, business_type: j.business_type, notes: j.notes,
      // Enforced production segment (additive; receivers that ignore unknown fields are unaffected). Only sent when the
      // Spoofer receiver is confirmed tolerant: SPOOFER_SEGMENT_FIELDS=on (non-secret config).
      ...(process.env["SPOOFER_SEGMENT_FIELDS"] === "on" ? { segment_start_seconds: j.segment_start_seconds, segment_end_seconds: j.segment_end_seconds, segment_reason: j.segment_reason } : {}),
    },
    files, // 24h signed URLs — receiver copies them into Spoofer storage
    created_at: j.created_at,
  };
}

/** Attempt one push. Claims the row first so concurrent callers never double-send. */
export async function pushOne(admin: Admin, jobId: string): Promise<{ ok: boolean; error?: string }> {
  const { secret, base } = spooferConfig();
  if (!secret) {
    await admin.from("spoofer_sync").update({ last_error: "Missing secret SPOOFER_SYNC_SECRET", updated_at: new Date().toISOString() }).eq("job_id", jobId);
    return { ok: false, error: "Missing secret SPOOFER_SYNC_SECRET" };
  }
  const { data: claimed } = await admin.from("spoofer_sync").update({ state: "sending", updated_at: new Date().toISOString() })
    .eq("job_id", jobId).eq("state", "pending").lte("next_attempt_at", new Date().toISOString()).select("attempts").maybeSingle();
  if (!claimed) return { ok: false, error: "Not due or already sending/synced" };
  const attempts = claimed.attempts + 1;
  let status: number | null = null;
  try {
    const payload = await buildPayload(admin, jobId);
    const res = await fetch(base + SPOOFER_CREATE_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}`, "idempotency-key": jobId },
      body: JSON.stringify(payload),
    });
    status = res.status;
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    let remote: string | null = null;
    try { remote = (JSON.parse(text) as { spoofer_job_id?: string }).spoofer_job_id ?? null; } catch { /* non-JSON ok */ }
    await admin.from("spoofer_sync").update({ state: "synced", attempts, remote_job_id: remote, last_error: null, updated_at: new Date().toISOString() }).eq("job_id", jobId);
    await log(admin, { job_id: jobId, direction: "outbound", event: "create_job", ok: true, http_status: status, message: remote ? `Spoofer job ${remote}` : "accepted" });
    return { ok: true };
  } catch (e) {
    const msg = redact(e instanceof Error ? e.message : String(e), [secret]);
    const final = isFinalFailure(attempts);
    await admin.from("spoofer_sync").update({
      state: final ? "failed" : "pending", attempts, last_error: msg,
      next_attempt_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(), updated_at: new Date().toISOString(),
    }).eq("job_id", jobId);
    await log(admin, { job_id: jobId, direction: "outbound", event: final ? "create_job_failed_final" : "create_job_retry", ok: false, http_status: status, message: msg });
    return { ok: false, error: msg };
  }
}

/** Push due retries (opportunistic; called on every submit and from admin). */
export async function pushDue(admin: Admin, limit = 5) {
  const { data } = await admin.from("spoofer_sync").select("job_id").eq("state", "pending").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  const out = [];
  for (const r of data ?? []) out.push({ job_id: r.job_id, ...(await pushOne(admin, r.job_id)) });
  return out;
}
