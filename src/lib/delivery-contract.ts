// Pure, runtime-neutral helpers for POST /api/public/deliver-video (tested in delivery-contract.test.ts).
// Uses Web Crypto only, so it runs on Cloudflare Workers and in vitest.

export const DELIVER_PATH = "/api/public/deliver-video";
export const SIGNATURE_VERSION = "v1";
export const MAX_CLOCK_SKEW_SECONDS = 300;
/** Request body and MP4 are fully buffered in Worker memory (not streamed) — keep well under the 128 MB isolate limit. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_JSON_BYTES = 16 * 1024;
export const URL_FETCH_TIMEOUT_MS = 60_000;

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

/** Canonical string: v1\nMETHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256 */
export function canonicalString(method: string, path: string, timestamp: string, nonce: string, bodySha: string): string {
  return [SIGNATURE_VERSION, method.toUpperCase(), path, timestamp, nonce, bodySha.toLowerCase()].join("\n");
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export type SigHeaders = { timestamp: string | null; nonce: string | null; contentSha: string | null; signature: string | null };
export type SigCheck = { ok: true; nonce: string; bodySha: string } | { ok: false; reason: "missing" | "malformed" | "stale" | "body_hash" | "bad_signature" | "no_secret" };

/** Verifies headers + raw body. Does NOT check nonce reuse (that is the DB's job). */
export async function verifySignature(opts: {
  secret: string | undefined; method: string; path: string; headers: SigHeaders; body: Uint8Array; nowSeconds: number;
}): Promise<SigCheck> {
  const { secret, headers: h } = opts;
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!h.timestamp || !h.nonce || !h.contentSha || !h.signature) return { ok: false, reason: "missing" };
  if (!/^\d{9,11}$/.test(h.timestamp) || !/^[A-Za-z0-9_-]{16,128}$/.test(h.nonce) || !/^[0-9a-f]{64}$/.test(h.contentSha)) return { ok: false, reason: "malformed" };
  const m = /^v1=([0-9a-f]{64})$/.exec(h.signature);
  if (!m) return { ok: false, reason: "malformed" };
  if (Math.abs(opts.nowSeconds - Number(h.timestamp)) > MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: "stale" };
  const bodySha = await sha256Hex(opts.body);
  if (!constantTimeEqual(bodySha, h.contentSha)) return { ok: false, reason: "body_hash" };
  const expected = await hmacHex(secret, canonicalString(opts.method, opts.path, h.timestamp, h.nonce, bodySha));
  if (!constantTimeEqual(expected, m[1])) return { ok: false, reason: "bad_signature" };
  return { ok: true, nonce: h.nonce, bodySha };
}

/** Exact host + path-prefix allowlist for signed-URL mode; https only, no IP literals, no credentials, no custom port. */
export function isAllowedStorageUrl(url: string, allowedHost: string | undefined, pathPrefix = "/storage/v1/object/sign/"): boolean {
  if (!allowedHost) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  if (u.hostname.toLowerCase() !== allowedHost.toLowerCase()) return false;
  if (/^[\d.]+$/.test(u.hostname) || u.hostname.includes(":")) return false;
  return u.pathname.startsWith(pathPrefix) && !u.pathname.includes("..");
}

/** Minimal MP4/ISO-BMFF check: first box is ftyp. */
export function looksLikeMp4(b: Uint8Array): boolean {
  return b.length >= 1024 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
}

export function safeFileName(name: string | undefined): string {
  const n = (name ?? "final.mp4").replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return /\.mp4$/i.test(n) ? n : `${n}.mp4`;
}

/** Deterministic storage path: retries with the same bytes land on the same object (recoverable, no duplicates). */
export function deliveryPath(jobId: string, tryNumber: number, sha: string): string {
  return `${jobId}/delivery-try${tryNumber}-${sha.slice(0, 32)}.mp4`;
}

export type ReserveResult =
  | "reserved" | "already_completed" | "in_progress" | "not_found" | "attempt_mismatch"
  | "conflict_older_attempt" | "conflict_different_bytes" | "conflict_already_delivered" | "conflict_cancelled";

/** Pure mirror of SQL reserve_delivery (the DB function is the atomic authority). */
export function decideReservation(job: { status: string; try_number: number } | null, tryNumber: number, sha: string,
  existing: { sha: string; state: "reserved" | "completed"; leaseActive: boolean } | null): ReserveResult {
  if (!job) return "not_found";
  if (tryNumber < job.try_number) return "conflict_older_attempt";
  if (tryNumber > job.try_number) return "attempt_mismatch";
  if (existing) {
    if (existing.sha !== sha) return "conflict_different_bytes";
    if (existing.state === "completed") return "already_completed";
    return existing.leaseActive ? "in_progress" : "reserved";
  }
  if (job.status === "cancelled") return "conflict_cancelled";
  if (job.status === "delivered") return "conflict_already_delivered";
  return "reserved";
}

export function httpStatusFor(r: ReserveResult | "completed"): number {
  if (r === "reserved" || r === "completed" || r === "already_completed") return 200;
  if (r === "in_progress") return 202;
  if (r === "not_found") return 404;
  return 409;
}
