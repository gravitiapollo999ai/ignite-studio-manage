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
