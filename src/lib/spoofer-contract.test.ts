import { describe, it, expect } from "vitest";
import { backoffMinutes, bearerMatches, isAllowedVideoUrl, isFinalFailure, mapInboundStatus, redact } from "./spoofer-contract";

describe("spoofer sync contract", () => {
  it("maps the four Spoofer statuses back to Studio", () => {
    expect(mapInboundStatus("In review")).toBe("in_review");
    expect(mapInboundStatus("generating")).toBe("generating");
    expect(mapInboundStatus("QA")).toBe("qa");
    expect(mapInboundStatus("Delivered")).toBe("delivered");
  });
  it("rejects other inbound statuses (no cancel/submit from Spoofer)", () => {
    expect(mapInboundStatus("cancelled")).toBeNull();
    expect(mapInboundStatus("submitted")).toBeNull();
  });
  it("backs off 1,2,4… minutes capped at 60 and flags after 6 attempts", () => {
    expect([1, 2, 3, 8].map(backoffMinutes)).toEqual([1, 2, 4, 60]);
    expect(isFinalFailure(5)).toBe(false);
    expect(isFinalFailure(6)).toBe(true);
  });
  it("requires the exact bearer secret", () => {
    expect(bearerMatches("Bearer abc123", "abc123")).toBe(true);
    expect(bearerMatches("Bearer abc124", "abc123")).toBe(false);
    expect(bearerMatches(null, "abc123")).toBe(false);
    expect(bearerMatches("Bearer abc123", undefined)).toBe(false);
  });
  it("only downloads final videos over public https", () => {
    expect(isAllowedVideoUrl("https://x.supabase.co/storage/v1/object/sign/a.mp4")).toBe(true);
    expect(isAllowedVideoUrl("http://x.com/a.mp4")).toBe(false);
    expect(isAllowedVideoUrl("https://127.0.0.1/a.mp4")).toBe(false);
  });
  it("redacts secrets from log text", () => {
    expect(redact("failed with key s3cr3t", ["s3cr3t"])).toBe("failed with key [redacted]");
  });
});
