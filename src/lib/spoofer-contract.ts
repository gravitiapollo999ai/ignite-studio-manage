import { isRestrictedReason } from "./segment-reasons";
// Pure, browser-safe helpers for the Studio ⇄ Spoofer sync contract (tested in spoofer-contract.test.ts).

export const SPOOFER_DEFAULT_BASE_URL = "https://spoofer-suite.lovable.app";
export const SPOOFER_CREATE_PATH = "/api/public/studio/jobs";
export const MAX_SYNC_ATTEMPTS = 6;

/** Spoofer statuses accepted inbound → Studio job status. */
export const INBOUND_STATUS_MAP: Record<string, string> = {
  in_review: "in_review",
  generating: "generating",
  qa: "qa",
  delivered: "delivered",
};

export function mapInboundStatus(s: string): string | null {
  const k = s.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return INBOUND_STATUS_MAP[k] ?? null;
}

/** Minutes to wait before the next attempt after `attempts` failures (1,2,4,8,16 … capped at 60). */
export function backoffMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1));
}

export function isFinalFailure(attempts: number): boolean {
  return attempts >= MAX_SYNC_ATTEMPTS;
}

/** Constant-time string compare (no early exit). */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  const m = /^Bearer (\S+)$/.exec(header ?? "");
  return !!secret && !!m && safeEqual(m[1], secret);
}

/** Final-video URLs must be https (no internal/plain-http fetches). */
export function isAllowedVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname);
  } catch {
    return false;
  }
}

/** Never let a secret value reach a log line. */
export function redact(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("[redacted]");
  return out.slice(0, 1000);
}

/** Same ranking as SQL public.spoofer_status_rank — keep in sync. */
export const STATUS_RANK: Record<string, number> = { submitted: 0, revision: 0, in_review: 1, prompt_ready: 2, generating: 3, qa: 4, delivered: 5, cancelled: 99 };

export type CallbackDecision = "applied" | "noop" | "stale" | "terminal" | "attempt_mismatch";

/** Pure mirror of apply_spoofer_callback's acceptance rule (the DB function is the atomic authority). */
export function decideCallback(current: string, next: string, jobTry: number, callbackTry?: number | null): CallbackDecision {
  // Unversioned callbacks are legacy-compatible only for attempt 1 (never assigned to a revised attempt).
  if (callbackTry == null ? jobTry > 1 : callbackTry !== jobTry) return "attempt_mismatch";
  const cur = STATUS_RANK[current] ?? 0, nxt = STATUS_RANK[next];
  if (cur >= 5) return "terminal";
  if (nxt < cur) return "stale";
  return nxt > cur ? "applied" : "noop";
}

/** Any segment other than a measured-short whole clip restricts production (mirrors SQL is_segment_restricted). */
export function isSegmentRestricted(reason: string | null | undefined): boolean {
  return isRestrictedReason(reason);
}

/** While segment transport is off, restricted jobs are held instead of pushed (no omission bypass). */
export function shouldHoldForSegment(reason: string | null | undefined, transportOn: boolean): boolean {
  return isSegmentRestricted(reason) && !transportOn;
}

/** Hold decision in trusted server code (flag read from env by the caller). Flag OFF: every restricted job held.
 *  Flag ON: restricted link jobs without verified uploaded source bytes stay held until a source is attached. */
export function linkHoldReason(job: { segment_reason: string | null; source_type: string | null; source_sha256: string | null } | null, transportOn: boolean): "segment_transport_off" | "link_needs_upload" | null {
  if (!job || !isSegmentRestricted(job.segment_reason)) return null;
  if (!transportOn) return "segment_transport_off";
  if (!job.source_sha256) return "link_needs_upload";
  return null;
}
