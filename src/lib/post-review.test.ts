import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyProbe, probeMp4, probeMoov, PROBE_MAX_TOP_BOXES, type RangeReader } from "./mp4-duration";
import { streamSha256 } from "./stream-hash";
import { shouldHoldForSegment, isSegmentRestricted } from "./spoofer-contract";
import { checkTrimEvidence, finalWithinSegment, canonicalReceipt, type EvidenceJob } from "./delivery-contract";
import { durationFitsSegment } from "./ai-segment";
import { draftSeedancePrompt, readCapped, MAX_RESPONSE_BYTES } from "./ai-helper.server";
import { computeEta } from "./eta";

const fx = (n: string) => new Uint8Array(readFileSync(join(__dirname, "../test/fixtures", n)));
const reader = (b: Uint8Array): RangeReader => async (o, l) => b.slice(o, o + l);
const be32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const box = (t: string, body: number[]) => [...be32(8 + body.length), ...[...t].map((c) => c.charCodeAt(0)), ...body];
const ftyp = (brand = "isom") => box("ftyp", [...[...brand].map((c) => c.charCodeAt(0)), 0, 0, 2, 0, ...[..."isom"].map((c) => c.charCodeAt(0))]);
const mvhd0 = (ts: number, dur: number, ver = 0) => box("mvhd", [ver, 0, 0, 0, ...be32(0), ...be32(0), ...be32(ts), ...be32(dur), ...new Array(80).fill(0)]);
const file = (...boxes: number[][]) => new Uint8Array(boxes.flat());
const probe = (b: Uint8Array) => probeMp4(reader(b), b.length);

describe("typed MP4 probe (malformed ≠ unknown ≠ io)", () => {
  it("real fixtures measure 10 s / 30 s and block 31 s", async () => {
    expect(classifyProbe(await probe(fx("clip-10s.mp4")))).toBe("measured_ok");
    expect(classifyProbe(await probe(fx("clip-30s.mp4")))).toBe("measured_ok");
    expect(classifyProbe(await probe(fx("clip-31s.mp4")))).toBe("measured_too_long");
    expect(classifyProbe(await probe(fx("clip-31s-faststart.mp4")))).toBe("measured_too_long");
  });
  it("30.00 / 30.05 accepted, 30.10 blocked", async () => {
    expect(classifyProbe(await probe(file(ftyp(), box("moov", mvhd0(1000, 30000)))))).toBe("measured_ok");
    expect(classifyProbe(await probe(file(ftyp(), box("moov", mvhd0(1000, 30050)))))).toBe("measured_ok");
    expect(classifyProbe(await probe(file(ftyp(), box("moov", mvhd0(1000, 30100)))))).toBe("measured_too_long");
  });
  it("genuine unknown declared duration → unknown_duration (never a fabricated pass)", async () => {
    expect(classifyProbe(await probe(file(ftyp(), box("moov", mvhd0(1000, 0xffffffff)))))).toBe("unknown_duration");
    expect(classifyProbe(await probe(file(ftyp(), box("moov", mvhd0(1000, 0)))))).toBe("unknown_duration");
  });
  it("ftyp-only, truncated moov, overrun, bad version, timescale 0, brand → rejected_media", async () => {
    const pad = new Array(64).fill(0);
    expect(classifyProbe(await probe(file(ftyp(), box("free", pad))))).toBe("rejected_media");
    const m = file(ftyp(), box("moov", mvhd0(1000, 10000)));
    expect(classifyProbe(await probe(m.slice(0, m.length - 30)))).toBe("rejected_media");
    expect(classifyProbe(await probe(file(ftyp(), [...be32(9999), ...[..."moov"].map((c) => c.charCodeAt(0)), ...pad])))).toBe("rejected_media");
    expect(classifyProbe(await probe(file(ftyp(), box("moov", mvhd0(1000, 10000, 2)))))).toBe("rejected_media");
    expect(classifyProbe(await probe(file(ftyp(), box("moov", mvhd0(0, 10000)))))).toBe("rejected_media");
    expect(classifyProbe(await probe(file(ftyp("abcd").map((x, i) => (i >= 16 ? 0 : x)), box("moov", mvhd0(1000, 10000)))))).toBe("rejected_media");
  });
  it("u64 overflow in a box size → malformed", async () => {
    const big = [0, 0, 0, 1, ...[..."moov"].map((c) => c.charCodeAt(0)), 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...new Array(32).fill(0)];
    expect((await probe(file(ftyp(), big))).kind).toBe("malformed");
  });
  it("box budget exceeded → malformed", async () => {
    const many = Array.from({ length: PROBE_MAX_TOP_BOXES + 2 }, () => box("free", []));
    expect((await probe(file(ftyp(), ...many, box("moov", mvhd0(1000, 10000))))).kind).toBe("malformed");
  });
  it("range failure after a valid header → io_error → nothing recorded (retry)", async () => {
    const b = file(ftyp(), box("moov", mvhd0(1000, 10000)));
    let n = 0;
    const flaky: RangeReader = async (o, l) => { if (n++ > 0) throw new Error("range_mismatch"); return b.slice(o, o + l); };
    const p = await probeMp4(flaky, b.length);
    expect(p.kind).toBe("io_error");
    expect(classifyProbe(p)).toBeNull();
  });
  it("partial moov prefix without mvhd is a budget failure, not unknown", () => {
    expect(probeMoov(new Uint8Array(box("trak", new Array(20).fill(0))), false).kind).toBe("malformed");
  });
});

describe("streamed content hash", () => {
  const stream = (chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({ start(c) { chunks.forEach((x) => c.enqueue(x)); c.close(); } });
  it("hashes chunked bytes exactly (sha256 of 'abc')", async () => {
    const r = await streamSha256(stream([new TextEncoder().encode("a"), new TextEncoder().encode("bc")]), 3);
    expect(r).toEqual({ ok: true, hex: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" });
  });
  it("fails closed on short or long streams", async () => {
    expect((await streamSha256(stream([new Uint8Array(2)]), 3)).ok).toBe(false);
    expect((await streamSha256(stream([new Uint8Array(4)]), 3)).ok).toBe(false);
  });
});

describe("held_segment gate", () => {
  it("holds every restricted job (explicit and auto) while transport is off", () => {
    for (const r of ["explicit", "auto_first_30", "auto_first_30_unknown_length"]) expect(shouldHoldForSegment(r, false)).toBe(true);
  });
  it("never holds measured-short / legacy jobs, and releases when transport is on", () => {
    expect(shouldHoldForSegment("measured_short", false)).toBe(false);
    expect(shouldHoldForSegment(null, false)).toBe(false);
    expect(shouldHoldForSegment("explicit", true)).toBe(false);
    expect(isSegmentRestricted("explicit")).toBe(true);
  });
});

describe("trim evidence gate", () => {
  const S = "a".repeat(64), F = "b".repeat(64);
  const job: EvidenceJob = { segment_reason: "auto_first_30_unknown_length", segment_start_seconds: 0, segment_end_seconds: 30, source_sha256: S, try_number: 1 };
  const ev = { segment_start: 0, segment_end: 30, source_sha256: S, try_number: 1, final_sha256: F, final_size_bytes: 5000 };
  const fin = { sha256: F, size: 5000, tryNumber: 1 };
  it("measured-short jobs need no evidence (legacy senders keep working)", () => expect(checkTrimEvidence({ ...job, segment_reason: "measured_short" }, null, fin)).toBe("not_required"));
  it("restricted job without evidence is refused", () => expect(checkTrimEvidence(job, null, fin)).toBe("evidence_required"));
  it("exact binding passes", () => expect(checkTrimEvidence(job, ev, fin)).toBe("ok"));
  it("wrong source hash, segment, attempt or final bytes is a mismatch", () => {
    expect(checkTrimEvidence(job, { ...ev, source_sha256: "c".repeat(64) }, fin)).toBe("evidence_mismatch");
    expect(checkTrimEvidence(job, { ...ev, segment_end: 25 }, fin)).toBe("evidence_mismatch");
    expect(checkTrimEvidence(job, { ...ev, try_number: 2 }, fin)).toBe("evidence_mismatch");
    expect(checkTrimEvidence(job, ev, { ...fin, size: 5001 })).toBe("evidence_mismatch");
  });
  it("links with no Studio-held source bytes stay unverifiable (held for review)", () => expect(checkTrimEvidence({ ...job, segment_reason: "auto_first_30", source_sha256: null }, ev, fin)).toBe("source_unverifiable"));
  it("final must fit the segment span", () => {
    expect(finalWithinSegment(30.05, job)).toBe(true);
    expect(finalWithinSegment(30.1, job)).toBe(false);
    expect(finalWithinSegment(12, { ...job, segment_start_seconds: 5, segment_end_seconds: 15 })).toBe(false);
  });
  it("receipts compare canonically (outcome/received_at excluded)", () => {
    const a = { ok: true, outcome: "completed", received_at: "1", job_id: "j", try_number: 1, sha256: F, size_bytes: 5, delivery_id: "d", status: "delivered", email: "blocked", completed_at: "t" };
    expect(canonicalReceipt(a)).toEqual(canonicalReceipt({ ...a, outcome: "already_completed", received_at: "2" }));
    expect(canonicalReceipt(a)).not.toEqual(canonicalReceipt({ ...a, size_bytes: 6 }));
  });
});

describe("AI helper bounds", () => {
  it("draft duration must fit the segment and 30 s", () => {
    expect(durationFitsSegment(30, 0, 30)).toBe(true);
    expect(durationFitsSegment(30.1, 0, 30)).toBe(false);
    expect(durationFitsSegment(11, 5, 15)).toBe(false);
  });
  it("caps provider response bytes", async () => {
    expect(await readCapped(new Response("x".repeat(MAX_RESPONSE_BYTES + 1)))).toBeNull();
    expect(await readCapped(new Response("ok"))).toBe("ok");
  });
  it("oversized provider body → invalid_output", async () => {
    const f = vi.fn(async () => new Response("x".repeat(MAX_RESPONSE_BYTES + 10), { status: 200 }));
    const r = await draftSeedancePrompt({ brief: "b", subject_name: "s", subject_type: "person", source_type: "upload", has_source: true, has_reference: true, segment_start: 0, segment_end: 30 }, f as never, "k");
    expect(r).toEqual({ ok: false, reason: "invalid_output" });
  });
});

describe("ETA", () => {
  const base = { jobs_ahead: 2, stage_started_at: "2026-01-01T00:00:00Z", queue_minutes: 30, review_minutes: 15, generating_minutes: 30, qa_minutes: 15, ready_at_override: null };
  const now = new Date("2026-01-01T00:00:00Z");
  it("queued = jobsAhead×30 + 15 + 30 + 15", () => expect(computeEta({ ...base, status: "submitted" }, now)!.getTime() - now.getTime()).toBe((60 + 60) * 60000));
  it("terminal states show no estimate, even with an override", () => {
    expect(computeEta({ ...base, status: "delivered", ready_at_override: "2026-01-02T00:00:00Z" }, now)).toBeNull();
    expect(computeEta({ ...base, status: "cancelled" }, now)).toBeNull();
  });
});
