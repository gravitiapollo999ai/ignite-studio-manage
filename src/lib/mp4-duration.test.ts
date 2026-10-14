import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { isSourceTooLong, readMp4Duration } from "./mp4-duration";
import { friendlyError } from "./data";

const fx = (n: string) => new Uint8Array(readFileSync(join(__dirname, "../test/fixtures", n)));
const reader = (b: Uint8Array) => async (o: number, l: number) => b.slice(o, o + l);
const dur = async (n: string) => { const b = fx(n); return readMp4Duration(reader(b), b.length); };

describe("trusted upload duration (file header)", () => {
  it("reads 10 s and 30 s fixtures and accepts them", async () => {
    expect(await dur("clip-10s.mp4")).toBeCloseTo(10, 1);
    expect(await dur("clip-30s.mp4")).toBeCloseTo(30, 1);
    expect(isSourceTooLong((await dur("clip-30s.mp4"))!)).toBe(false);
  });
  it("rejects a 31 s fixture (moov at end and faststart)", async () => {
    expect(isSourceTooLong((await dur("clip-31s.mp4"))!)).toBe(true);
    expect(isSourceTooLong((await dur("clip-31s-faststart.mp4"))!)).toBe(true);
  });
  it("30.05 s boundary: 30.05 allowed, 30.1 rejected", () => {
    expect(isSourceTooLong(30.05)).toBe(false);
    expect(isSourceTooLong(30.1)).toBe(true);
  });
  it("non-MP4 bytes are unreadable (fail closed)", async () => {
    const junk = new TextEncoder().encode("not a video at all, just text bytes");
    expect(await readMp4Duration(reader(junk), junk.length)).toBeNull();
  });
  it("shows the exact limit message in English and Spanish", () => {
    expect(friendlyError("Source video longer than 30 seconds", "en")).toBe("For now, videos are limited to 30 seconds. Longer videos are coming soon. Please submit a reel or clip of 30s or less.");
    expect(friendlyError("Source video longer than 30 seconds", "es")).toBe("Por ahora, los videos tienen un límite de 30 segundos. Pronto aceptaremos videos más largos. Envía un reel o clip de 30 s o menos.");
  });
});

import { durationFromMoov as dfm, readMp4Duration as rmd } from "./mp4-duration";
describe("mp4 header hardening", () => {
  const mvhd = (version: number, timescale: number, duration: number | bigint) => {
    const b = new Uint8Array(version === 1 ? 8 + 32 : 8 + 20); const v = new DataView(b.buffer);
    v.setUint32(0, b.length); b.set([0x6d, 0x76, 0x68, 0x64], 4); b[8] = version;
    if (version === 1) { v.setUint32(8 + 20, timescale); v.setBigUint64(8 + 24, BigInt(duration)); }
    else { v.setUint32(8 + 12, timescale); v.setUint32(8 + 16, Number(duration)); }
    return b;
  };
  it("reads valid v0/v1", () => { expect(dfm(mvhd(0, 1000, 30000))).toBe(30); expect(dfm(mvhd(1, 1000, 10000))).toBe(10); });
  it("rejects zero timescale, zero/unknown duration, unsupported version", () => {
    expect(dfm(mvhd(0, 0, 100))).toBeNull();
    expect(dfm(mvhd(0, 1000, 0))).toBeNull();
    expect(dfm(mvhd(0, 1000, 0xffffffff))).toBeNull();
    const b = mvhd(0, 1000, 30000); b[8] = 2; expect(dfm(b)).toBeNull();
  });
  it("rejects unsafe 64-bit / implausible values", () => {
    expect(dfm(mvhd(1, 1, 2n ** 60n))).toBeNull();
    expect(dfm(mvhd(1, 1, 10n ** 6n))).toBeNull();
  });
  it("rejects truncated mvhd and box overrun", () => {
    expect(dfm(mvhd(0, 1000, 30000).slice(0, 20))).toBeNull();
    const b = mvhd(0, 1000, 30000); new DataView(b.buffer).setUint32(0, 9999); expect(dfm(b)).toBeNull();
  });
  it("returns null when the reader returns short data", async () => {
    const moov = new Uint8Array(8 + 28); new DataView(moov.buffer).setUint32(0, moov.length); moov.set([0x6d, 0x6f, 0x6f, 0x76], 4); moov.set(mvhd(0, 1000, 30000), 8);
    expect(await rmd(async (o, l) => moov.slice(o, o + l), moov.length)).toBe(30);
    expect(await rmd(async (o, l) => moov.slice(o, o + Math.max(0, l - 1)), moov.length)).toBeNull();
  });
});

import { exactRange } from "./mp4-duration";
describe("exact ranged reads", () => {
  const f = (status: number, range: string, n: number) => (async () => new Response(new Uint8Array(n), { status, headers: { "content-range": range } })) as unknown as typeof fetch;
  it("accepts exact 206 + matching content-range + byte count", async () => expect((await exactRange("u", 0, 16, 100, f(206, "bytes 0-15/100", 16))).length).toBe(16));
  it("rejects 200 full-body responses", async () => { await expect(exactRange("u", 0, 16, 100, f(200, "", 100))).rejects.toThrow(); });
  it("rejects mismatched content-range", async () => { await expect(exactRange("u", 0, 16, 100, f(206, "bytes 0-15/999", 16))).rejects.toThrow(); });
  it("rejects short bodies", async () => { await expect(exactRange("u", 0, 16, 100, f(206, "bytes 0-15/100", 10))).rejects.toThrow(); });
});

import { classifySource, isSourceTooLong as tooLong } from "./mp4-duration";
describe("30s source policy", () => {
  const ftyp = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0, 0, 0, 0, 0]);
  it("accepts 30.00 and 30.05, blocks 30.06 and 31", () => {
    expect(classifySource(ftyp, 30).status).toBe("measured_ok");
    expect(classifySource(ftyp, 30.05).status).toBe("measured_ok");
    expect(classifySource(ftyp, 30.06).status).toBe("measured_too_long");
    expect(classifySource(ftyp, 31).status).toBe("measured_too_long");
    expect(tooLong(30.05)).toBe(false);
  });
  it("valid container with unreadable length is unknown_duration, never a fabricated pass", () => {
    expect(classifySource(ftyp, null).status).toBe("unknown_duration");
    expect(classifySource(ftyp, Number.NaN).status).toBe("unknown_duration");
  });
  it("non-MP4/MOV media is rejected", () => {
    expect(classifySource(new Uint8Array(16), 10).status).toBe("rejected_media");
    expect(classifySource(new Uint8Array(4), null).status).toBe("rejected_media");
  });
});
