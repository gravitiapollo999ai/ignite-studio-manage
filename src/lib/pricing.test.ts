import { describe, expect, it } from "vitest";
import { defaultDuration, detectPlatform, hfCostPerTry, jobCost, parseMmSs, perVideoPrice } from "./pricing";

describe("detectPlatform", () => {
  it("detects TikTok", () => expect(detectPlatform("https://www.tiktok.com/@a/video/1")).toBe("tiktok"));
  it("detects Shorts", () => expect(detectPlatform("https://youtube.com/shorts/abc")).toBe("youtube_shorts"));
  it("detects YouTube watch", () => expect(detectPlatform("https://www.youtube.com/watch?v=abc")).toBe("youtube"));
  it("detects youtu.be", () => expect(detectPlatform("https://youtu.be/abc")).toBe("youtube"));
  it("detects Instagram reel", () => expect(detectPlatform("https://instagram.com/reel/xyz/")).toBe("instagram_reel"));
  it("rejects other sites", () => expect(detectPlatform("https://vimeo.com/1")).toBeNull());
});

describe("pricing", () => {
  it("charges 1 credit per video regardless of length", () => {
    expect(jobCost(1, 10, 30)).toBe(1);
    expect(jobCost(1, 30, 30)).toBe(1);
  });
  it("rejects videos over 30 seconds", () => expect(() => jobCost(1, 31, 30)).toThrow());
  it("default duration clamps clip length to 30s", () => {
    expect(defaultDuration(45, 30)).toBe(30);
    expect(defaultDuration(null, 30)).toBe(15);
  });
  it("parses mm:ss", () => expect(parseMmSs("1:05")).toBe(65));
  it("Higgsfield estimates: ~$16 Plus, ~$14 Ultra per 30s try", () => {
    const r = hfCostPerTry({ hf_credits_per_30s: 330, hf_plus_price: 59, hf_plus_credits: 1200, hf_ultra_price: 129, hf_ultra_credits: 3000 });
    expect(Math.round(r.plus)).toBe(16);
    expect(Math.round(r.ultra)).toBe(14);
  });
  it("per video price from label", () => expect(perVideoPrice("USD 290", 10)).toBe("USD 29"));
});
