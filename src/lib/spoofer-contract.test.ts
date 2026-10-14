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

import { decideCallback } from "./spoofer-contract";
describe("monotonic callbacks (same attempt)", () => {
  it("advances forward in order", () => {
    expect(decideCallback("submitted", "in_review", 1)).toBe("applied");
    expect(decideCallback("in_review", "generating", 1)).toBe("applied");
    expect(decideCallback("generating", "qa", 1)).toBe("applied");
    expect(decideCallback("qa", "delivered", 1)).toBe("applied");
  });
  it("allows skipping ahead (out-of-order arrival of a later status)", () => {
    expect(decideCallback("submitted", "qa", 1)).toBe("applied");
  });
  it("ignores stale/out-of-order older statuses", () => {
    expect(decideCallback("qa", "in_review", 1)).toBe("stale");
    expect(decideCallback("generating", "in_review", 1)).toBe("stale");
  });
  it("same status is a no-op", () => {
    expect(decideCallback("generating", "generating", 1)).toBe("noop");
  });
  it("Delivered is terminal for the attempt", () => {
    expect(decideCallback("delivered", "in_review", 1)).toBe("terminal");
    expect(decideCallback("delivered", "delivered", 1)).toBe("terminal");
  });
  it("cancelled jobs accept nothing", () => {
    expect(decideCallback("cancelled", "qa", 1)).toBe("terminal");
  });
  it("never infers a retry from an old or unknown attempt", () => {
    expect(decideCallback("revision", "in_review", 2, 1)).toBe("attempt_mismatch");
    expect(decideCallback("delivered", "in_review", 1, 2)).toBe("attempt_mismatch");
  });
  it("a Studio-established revision (try 2) restarts the ladder", () => {
    expect(decideCallback("revision", "in_review", 2, 2)).toBe("applied");
  });
});

describe("unversioned callbacks", () => {
  it("are accepted for attempt 1 (legacy compatibility)", () => {
    expect(decideCallback("qa", "delivered", 1)).toBe("applied");
  });
  it("cannot advance a revised attempt 2 — an old delayed callback must not mark it delivered", () => {
    expect(decideCallback("revision", "delivered", 2)).toBe("attempt_mismatch");
    expect(decideCallback("revision", "in_review", 2)).toBe("attempt_mismatch");
    expect(decideCallback("generating", "qa", 2)).toBe("attempt_mismatch");
  });
});
