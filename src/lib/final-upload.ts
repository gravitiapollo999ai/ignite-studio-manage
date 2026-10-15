// Pure rules for admin final-video replacement (mirrors SQL final_admission_error; DB is the atomic authority).
import type { Probe } from "./mp4-duration";
import { isRestrictedReason } from "./segment-reasons";

export const FINAL_MAX_BYTES = 40 * 1024 * 1024;
export const FINAL_MAX_SECONDS = 30.05;

export type AdmissionError = "terminal" | "wrong_status" | "stale_attempt" | "segment_restricted";

export function finalAdmissionError(job: { status: string; try_number: number; segment_reason: string | null }, tryNumber: number): AdmissionError | null {
  if (job.status === "delivered" || job.status === "cancelled") return "terminal";
  if (!["generating", "qa", "revision"].includes(job.status)) return "wrong_status";
  if (tryNumber !== job.try_number) return "stale_attempt";
  if (isRestrictedReason(job.segment_reason)) return "segment_restricted"; // no trim-evidence writer exists → stays HELD
  return null;
}

/** A final must be a measured MP4 ≤30.05 s. Unknown, malformed or unreadable lengths are never accepted. */
export function finalProbeError(p: Probe): "unmeasured_length" | "malformed" | "io_error" | "too_long" | null {
  if (p.kind === "io_error") return "io_error";
  if (p.kind === "malformed") return "malformed";
  if (p.kind !== "measured") return "unmeasured_length";
  return p.seconds > FINAL_MAX_SECONDS ? "too_long" : null;
}

export type ObjectIdentity = { etag: string | null; updated_at: string; size: number };
export const sameIdentity = (a: ObjectIdentity | null, b: ObjectIdentity | null) =>
  !!a && !!b && a.etag === b.etag && a.updated_at === b.updated_at && Number(a.size) === Number(b.size);

/** How to treat the commit RPC response. Only an explicit DB rejection permits cleanup; a transport error or
 *  unexpected value is an UNKNOWN outcome (the DB may have committed) and the bytes must be preserved. */
export function commitOutcome(r: { data?: unknown; error?: unknown }): "committed" | "rejected" | "unknown" {
  if (r.error) return "unknown";
  if (r.data === "ok") return "committed";
  const known = ["expired", "terminal", "wrong_status", "stale_attempt", "segment_restricted", "missing_object", "object_changed", "bad_hash", "job_not_found"];
  return typeof r.data === "string" && known.includes(r.data) ? "rejected" : "unknown";
}

/** Mirror of SQL attach_job_source admission (DB re-checks under the job lock). */
export function attachAdmissionError(job: { status: string; try_number: number; source_type: string; source_sha256: string | null; source_file_path: string | null; reference_image_path: string | null }, expectedTry: number) {
  if (job.status === "delivered" || job.status === "cancelled") return "terminal";
  if (job.try_number !== expectedTry) return "stale_attempt";
  if (!["submitted", "in_review", "prompt_ready"].includes(job.status)) return "wrong_status";
  if (job.source_type === "upload") return "not_link";
  if (job.source_sha256 || job.source_file_path) return "already_attached";
  if (!job.reference_image_path) return "missing_reference";
  return null;
}
