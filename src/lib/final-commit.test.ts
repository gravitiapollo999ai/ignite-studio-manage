import { describe, expect, it, vi } from "vitest";
import { runFinalCommit, type CommitDeps } from "./final-commit";
import { attachAdmissionError, commitOutcome } from "./final-upload";

const ID = { etag: "e", updated_at: "t", size: 1000 };
function deps(over: Record<string, (a: Record<string, unknown>) => { data: unknown; error: unknown }> = {}) {
  const removed: string[] = [];
  const calls: string[] = [];
  const base: Record<string, (a: Record<string, unknown>) => { data: unknown; error: unknown }> = {
    claim_final_commit: () => ({ data: { ok: true, path: "j/try1/r/final.mp4" }, error: null }),
    final_object_identity: () => ({ data: ID, error: null }),
    commit_final_upload: () => ({ data: "ok", error: null }),
    reject_final_reservation: () => ({ data: null, error: null }),
    cleanup_rejected_final: () => ({ data: "j/try1/r/final.mp4", error: null }),
    ...over,
  };
  const db: CommitDeps = {
    rpc: async (fn, a) => { calls.push(fn); return base[fn](a); },
    storage: { from: () => ({ remove: async (p: string[]) => { removed.push(...p); }, createSignedUrl: async () => ({ data: { signedUrl: "https://x" } }) }) },
  };
  return { db, removed, calls };
}
const io = { probe: async () => null, hash: async () => "a".repeat(64) };
const input = { reservationId: "00000000-0000-0000-0000-000000000001", token: "t", fileName: "f.mp4", userId: "u" };

describe("final commit cleanup safety", () => {
  it("DB commit succeeded but response failed → unknown outcome, bytes preserved", async () => {
    const d = deps({ commit_final_upload: () => ({ data: null, error: new Error("network") }) });
    const r = await runFinalCommit(d.db, input, io);
    expect(r).toEqual({ ok: false, reason: "unknown_outcome" });
    expect(d.removed).toEqual([]);
    expect(d.calls).not.toContain("cleanup_rejected_final");
  });
  it("retry after a lost response is idempotent success without deleting", async () => {
    const d = deps({ claim_final_commit: () => ({ data: { ok: true, already: true, path: "p", sha256: "a".repeat(64), size: 1000 }, error: null }) });
    const r = await runFinalCommit(d.db, input, io);
    expect(r.ok).toBe(true);
    expect(d.removed).toEqual([]);
  });
  it("concurrent retry while another commit is in flight never deletes", async () => {
    const d = deps({ claim_final_commit: () => ({ data: { ok: false, reason: "already_committing" }, error: null }) });
    expect((await runFinalCommit(d.db, input, io)).ok).toBe(false);
    expect(d.removed).toEqual([]);
  });
  it("commit after lease expiry is rejected and only the DB-permitted orphan is cleaned", async () => {
    const d = deps({ commit_final_upload: () => ({ data: "expired", error: null }) });
    expect(await runFinalCommit(d.db, input, io)).toEqual({ ok: false, reason: "expired" });
    expect(d.removed).toEqual(["j/try1/r/final.mp4"]);
  });
  it("cleanup refused by DB (committed/legacy) deletes nothing", async () => {
    const d = deps({ commit_final_upload: () => ({ data: "object_changed", error: null }), cleanup_rejected_final: () => ({ data: null, error: null }) });
    await runFinalCommit(d.db, input, io);
    expect(d.removed).toEqual([]);
  });
  it("unmeasured length is rejected before commit", async () => {
    const d = deps();
    const r = await runFinalCommit(d.db, input, { ...io, probe: async () => "unmeasured_length" as const });
    expect(r).toEqual({ ok: false, reason: "unmeasured_length" });
    expect(d.calls).not.toContain("commit_final_upload");
  });
  it("unexpected RPC value is treated as unknown", () => expect(commitOutcome({ data: "weird" })).toBe("unknown"));
});

describe("link source attach admission", () => {
  const j = { status: "in_review", try_number: 2, source_type: "tiktok", source_sha256: null, source_file_path: null, reference_image_path: "r.png" };
  it("stale in-flight attach for an old try is refused", () => expect(attachAdmissionError(j, 1)).toBe("stale_attempt"));
  it("current try before production is allowed", () => expect(attachAdmissionError(j, 2)).toBeNull());
  it("refused once production started", () => expect(attachAdmissionError({ ...j, status: "generating" }, 2)).toBe("wrong_status"));
  it("refused when a source is already attached", () => expect(attachAdmissionError({ ...j, source_sha256: "a".repeat(64) }, 2)).toBe("already_attached"));
  it("refused on terminal jobs", () => expect(attachAdmissionError({ ...j, status: "delivered" }, 2)).toBe("terminal"));
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
describe("buildPayload segment reason transport", () => {
  async function build(reason: string | null, flag: "on" | "off") {
    process.env["SPOOFER_SEGMENT_FIELDS"] = flag;
    const { buildPayload } = await import("./spoofer-sync.server");
    const job = { id: "j", code: "JOB-X", user_id: "u", status: "submitted", try_number: 1, source_type: "upload", source_file_path: "u/a.mp4", source_sha256: "b".repeat(64), reference_image_path: null, segment_reason: reason, segment_start_seconds: 0, segment_end_seconds: 30 };
    const q = (row: unknown) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) });
    const admin = { from: (t: string) => q(t === "jobs" ? job : {}), storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://s" } }) }) } };
    return buildPayload(admin as never, "j");
  }
  it("unknown reason is refused, never sent as none", async () => { await expect(build("bogus", "on")).rejects.toThrow("invalid_segment_reason"); });
  it("valid reason is sent with the flag on", async () => expect((await build("auto_first_30", "on")).brief).toMatchObject({ segment_reason: "auto_first_30" }));
  it("source fingerprint always travels; segment fields absent with flag off", async () => {
    const p = await build("measured_short", "off");
    expect(p.source_sha256).toBe("b".repeat(64));
    expect(p.brief).not.toHaveProperty("segment_reason");
  });
});
