import { describe, expect, it } from "vitest";
import { SEGMENT_REASONS, SEGMENT_REASON_TABLE, isRestrictedReason, parseSegmentReason } from "./segment-reasons";
import { isSegmentRestricted, linkHoldReason } from "./spoofer-contract";

describe("canonical segment reasons", () => {
  it("shared fixture lists exactly the canonical reasons", () =>
    expect(SEGMENT_REASON_TABLE.reasons.map((r) => r.reason).sort()).toEqual([...SEGMENT_REASONS].sort()));
  it("fixture restriction flags match the code rule", () => {
    for (const r of SEGMENT_REASON_TABLE.reasons) expect(isRestrictedReason(r.reason)).toBe(r.restricted);
  });
  it("measured_short is unrestricted; first-30 and explicit are restricted", () => {
    expect(isSegmentRestricted("measured_short")).toBe(false);
    expect(isSegmentRestricted("auto_first_30_unknown_length")).toBe(true);
    expect(isSegmentRestricted("auto_first_30")).toBe(true);
    expect(isSegmentRestricted("explicit")).toBe(true);
  });
  it("unknown values are invalid, never measured, and fail closed", () => {
    expect(parseSegmentReason("measured")).toBe("invalid");
    expect(isRestrictedReason("whatever")).toBe(true);
    expect(parseSegmentReason(null)).toBe("none");
  });
});

describe("link hold (trusted server flag)", () => {
  const link = { segment_reason: "auto_first_30", source_type: "tiktok", source_sha256: null };
  it("flag off holds every restricted job", () => expect(linkHoldReason(link, false)).toBe("segment_transport_off"));
  it("flag on holds a link without uploaded bytes", () => expect(linkHoldReason(link, true)).toBe("link_needs_upload"));
  it("flag on releases once a verified source is attached", () => expect(linkHoldReason({ ...link, source_sha256: "a".repeat(64) }, true)).toBeNull());
  it("measured_short is never held", () => expect(linkHoldReason({ ...link, segment_reason: "measured_short" }, false)).toBeNull());
});

describe("invalid reason hold", () => {
  it("holds unknown reasons regardless of the flag", () => {
    expect(linkHoldReason({ segment_reason: "bogus", source_type: "upload", source_sha256: "a".repeat(64) }, true)).toBe("invalid_segment_reason");
  });
});
