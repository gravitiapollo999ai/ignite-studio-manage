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
