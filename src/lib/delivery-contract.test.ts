import { describe, it, expect } from "vitest";
import { canonicalString, decideReservation, deliveryPath, hmacHex, httpStatusFor, isAllowedStorageUrl, looksLikeMp4, sha256Hex, verifySignature, DELIVER_PATH } from "./delivery-contract";

const SECRET = "test-secret-not-real";
const now = 1_800_000_000;
async function signed(body: Uint8Array, ts = now, nonce = "nonce_abcdefghijklmnop") {
  const sha = await sha256Hex(body);
  const sig = await hmacHex(SECRET, canonicalString("POST", DELIVER_PATH, String(ts), nonce, sha));
  return { timestamp: String(ts), nonce, contentSha: sha, signature: `v1=${sig}` };
}
const body = new TextEncoder().encode('{"job_id":"x"}');
const v = (headers: Parameters<typeof verifySignature>[0]["headers"], b = body, secret: string | undefined = SECRET) =>
  verifySignature({ secret, method: "POST", path: DELIVER_PATH, headers, body: b, nowSeconds: now });

describe("deliver-video HMAC", () => {
  it("accepts a valid signature", async () => { expect((await v(await signed(body))).ok).toBe(true); });
  it("rejects missing headers", async () => { expect(await v({ timestamp: null, nonce: null, contentSha: null, signature: null })).toEqual({ ok: false, reason: "missing" }); });
  it("rejects malformed signature", async () => { const h = await signed(body); expect(await v({ ...h, signature: "abc" })).toEqual({ ok: false, reason: "malformed" }); });
  it("rejects stale timestamp beyond 300s", async () => { expect(await v(await signed(body, now - 301))).toEqual({ ok: false, reason: "stale" }); });
  it("rejects tampered body", async () => { const h = await signed(body); expect(await v(h, new TextEncoder().encode('{"job_id":"y"}'))).toEqual({ ok: false, reason: "body_hash" }); });
  it("rejects wrong secret", async () => { expect(await v(await signed(body), body, "other")).toEqual({ ok: false, reason: "bad_signature" }); });
  it("fails closed without a configured secret", async () => { expect(await v(await signed(body), body, "")).toEqual({ ok: false, reason: "no_secret" }); });
});

describe("signed URL allowlist", () => {
  const host = "abc.supabase.co";
  it("allows exact host + signed path", () => expect(isAllowedStorageUrl(`https://${host}/storage/v1/object/sign/finals/a.mp4?token=t`, host)).toBe(true));
  it("blocks other hosts, http, ports, ip, traversal, unconfigured", () => {
    expect(isAllowedStorageUrl(`https://evil.com/storage/v1/object/sign/a`, host)).toBe(false);
    expect(isAllowedStorageUrl(`https://${host}.evil.com/storage/v1/object/sign/a`, host)).toBe(false);
    expect(isAllowedStorageUrl(`http://${host}/storage/v1/object/sign/a`, host)).toBe(false);
    expect(isAllowedStorageUrl(`https://${host}:8443/storage/v1/object/sign/a`, host)).toBe(false);
    expect(isAllowedStorageUrl(`https://169.254.169.254/storage/v1/object/sign/a`, "169.254.169.254")).toBe(false);
    expect(isAllowedStorageUrl(`https://${host}/storage/v1/object/public/a`, host)).toBe(false);
    expect(isAllowedStorageUrl(`https://${host}/storage/v1/object/sign/a`, undefined)).toBe(false);
  });
});

describe("idempotency per job+try+sha", () => {
  const job = { status: "qa", try_number: 1 };
  it("reserves fresh", () => expect(decideReservation(job, 1, "a", null)).toBe("reserved"));
  it("concurrent identical request waits", () => expect(decideReservation(job, 1, "a", { sha: "a", state: "reserved", leaseActive: true })).toBe("in_progress"));
  it("identical retry after completion is idempotent", () => expect(decideReservation({ ...job, status: "delivered" }, 1, "a", { sha: "a", state: "completed", leaseActive: false })).toBe("already_completed"));
  it("same try different bytes conflicts", () => expect(decideReservation(job, 1, "b", { sha: "a", state: "completed", leaseActive: false })).toBe("conflict_different_bytes"));
  it("older attempt conflicts", () => expect(decideReservation({ ...job, try_number: 2 }, 1, "a", null)).toBe("conflict_older_attempt"));
  it("already Delivered via legacy final (e.g. JOB-000002) is never touched", () => {
    expect(decideReservation({ status: "delivered", try_number: 1 }, 1, "a", null)).toBe("conflict_already_delivered");
    expect(httpStatusFor("conflict_already_delivered")).toBe(409);
  });
  it("expired lease can be resumed by the same bytes", () => expect(decideReservation(job, 1, "a", { sha: "a", state: "reserved", leaseActive: false })).toBe("reserved"));
  it("storage path is deterministic per job/try/sha", () => expect(deliveryPath("j", 1, "f".repeat(64))).toBe(deliveryPath("j", 1, "f".repeat(64))));
});

describe("mp4 check", () => {
  it("requires ftyp box", () => {
    const b = new Uint8Array(2048); b.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
    expect(looksLikeMp4(b)).toBe(true);
    expect(looksLikeMp4(new Uint8Array(2048))).toBe(false);
  });
});
