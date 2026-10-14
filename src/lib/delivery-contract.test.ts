import { describe, it, expect } from "vitest";
import { canonicalString, decideReservation, deliveryPath, hmacHex, httpStatusFor, isAllowedFinalUrl, looksLikeMp4, precheckEnvelope, readBounded, SPOOFER_STORAGE_HOST, sha256Hex, verifySignature, DELIVER_PATH } from "./delivery-contract";

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

describe("signed final URL allowlist", () => {
  const rid = "38376d36-4631-4b0e-901d-6e61ae40754c";
  const ok = `https://${SPOOFER_STORAGE_HOST}/storage/v1/object/sign/studio-inputs/finals/${rid}/final.mp4?token=abc`;
  it("allows only the exact host/path for the mapped receiver id", () => expect(isAllowedFinalUrl(ok, rid)).toBe(true));
  it("rejects wrong receiver, missing mapping, other files, hosts, ports, query/path tricks", () => {
    expect(isAllowedFinalUrl(ok, "30049250-d75d-42bc-a48a-06e405f6e014")).toBe(false);
    expect(isAllowedFinalUrl(ok, null)).toBe(false);
    expect(isAllowedFinalUrl(ok.replace("final.mp4", "other.mp4"), rid)).toBe(false);
    expect(isAllowedFinalUrl(ok.replace(SPOOFER_STORAGE_HOST, "evil.supabase.co"), rid)).toBe(false);
    expect(isAllowedFinalUrl(ok.replace(".supabase.co", ".supabase.co.evil.com"), rid)).toBe(false);
    expect(isAllowedFinalUrl(ok.replace("https://", "http://"), rid)).toBe(false);
    expect(isAllowedFinalUrl(ok.replace(".co/", ".co:443/x/"), rid)).toBe(false);
    expect(isAllowedFinalUrl(ok + "&redirect=https://evil.com", rid)).toBe(false);
    expect(isAllowedFinalUrl(ok + "#x", rid)).toBe(false);
    expect(isAllowedFinalUrl(ok.replace("finals/", "finals/../x/"), rid)).toBe(false);
    expect(isAllowedFinalUrl(ok.replace("finals/", "finals%2F"), rid)).toBe(false);
    expect(isAllowedFinalUrl(ok.replace("/sign/", "/public/"), rid)).toBe(false);
    expect(isAllowedFinalUrl(`https://user@${SPOOFER_STORAGE_HOST}/storage/v1/object/sign/studio-inputs/finals/${rid}/final.mp4?token=a`, rid)).toBe(false);
  });
});

describe("envelope precheck before body read", () => {
  it("rejects missing/malformed/stale without needing the body", async () => {
    const h = await signed(body);
    expect(precheckEnvelope(h, now)).toBeNull();
    expect(precheckEnvelope({ ...h, nonce: null }, now)).toBe("missing");
    expect(precheckEnvelope({ ...h, signature: "v1=zz" }, now)).toBe("malformed");
    expect(precheckEnvelope(h, now + 400)).toBe("stale");
  });
});

describe("bounded body reads", () => {
  const stream = (chunks: number[], delayMs = 0) => new ReadableStream<Uint8Array>({
    async start(c) { for (const n of chunks) { if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); c.enqueue(new Uint8Array(n)); } c.close(); },
  });
  it("stops and cancels once over the limit", async () => expect(await readBounded(stream([600, 600]), 1000, 1000)).toEqual({ ok: false, reason: "too_large" }));
  it("times out a slow body", async () => expect(await readBounded(stream([10, 10], 80), 1000, 50)).toEqual({ ok: false, reason: "timeout" }));
  it("reads exact expected length into one buffer", async () => {
    const r = await readBounded(stream([300, 700]), 2000, 1000, 1000);
    expect(r.ok && r.bytes.byteLength).toBe(1000);
  });
  it("rejects length mismatch vs declared size", async () => expect(await readBounded(stream([300]), 2000, 1000, 1000)).toEqual({ ok: false, reason: "length_mismatch" }));
});

describe("idempotency per job+try+sha", () => {
  const job = { status: "qa", try_number: 1 };
  it("reserves fresh", () => expect(decideReservation(job, 1, "a", null)).toBe("reserved"));
  it("concurrent identical request waits", () => expect(decideReservation(job, 1, "a", { sha: "a", state: "reserved", leaseActive: true })).toBe("in_progress"));
  it("identical retry after completion is idempotent", () => expect(decideReservation({ ...job, status: "delivered" }, 1, "a", { sha: "a", state: "completed", leaseActive: false })).toBe("already_completed"));
  it("same try different bytes conflicts", () => expect(decideReservation(job, 1, "b", { sha: "a", state: "completed", leaseActive: false })).toBe("conflict_different_bytes"));
  it("older attempt conflicts", () => expect(decideReservation({ ...job, try_number: 2 }, 1, "a", null)).toBe("conflict_older_attempt"));
  it("reserved request but job became terminal elsewhere conflicts", () => expect(decideReservation({ status: "delivered", try_number: 1 }, 1, "a", { sha: "a", state: "reserved", leaseActive: false })).toBe("conflict_terminal"));
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
