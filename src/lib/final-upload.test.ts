import { describe, expect, it } from "vitest";
import { finalAdmissionError, finalProbeError, sameIdentity } from "./final-upload";

const job = { status: "qa", try_number: 1, segment_reason: "measured_short" };

describe("final replacement admission", () => {
  it("admits generating, qa and revision", () => {
    for (const s of ["generating", "qa", "revision"]) expect(finalAdmissionError({ ...job, status: s }, 1)).toBeNull();
  });
  it("refuses delivered and cancelled", () => {
    expect(finalAdmissionError({ ...job, status: "delivered" }, 1)).toBe("terminal");
    expect(finalAdmissionError({ ...job, status: "cancelled" }, 1)).toBe("terminal");
  });
  it("refuses other statuses", () => expect(finalAdmissionError({ ...job, status: "submitted" }, 1)).toBe("wrong_status"));
  it("refuses a stale attempt", () => expect(finalAdmissionError({ ...job, try_number: 2 }, 1)).toBe("stale_attempt"));
  it("refuses restricted jobs (no trim evidence)", () => expect(finalAdmissionError({ ...job, segment_reason: "auto_first_30_unknown_length" }, 1)).toBe("segment_restricted"));
});

describe("final length", () => {
  it("accepts measured ≤30.05 s", () => expect(finalProbeError({ kind: "measured", seconds: 30.05 } as never)).toBeNull());
  it("refuses >30.05 s", () => expect(finalProbeError({ kind: "measured", seconds: 30.1 } as never)).toBe("too_long"));
  it("refuses unknown length", () => expect(finalProbeError({ kind: "unknown_declared" } as never)).toBe("unmeasured_length"));
  it("refuses malformed", () => expect(finalProbeError({ kind: "malformed", reason: "x" } as never)).toBe("malformed"));
  it("refuses read errors", () => expect(finalProbeError({ kind: "io_error" } as never)).toBe("io_error"));
});

describe("object identity (TOCTOU)", () => {
  const a = { etag: "e1", updated_at: "t", size: 10 };
  it("same object passes", () => expect(sameIdentity(a, { ...a })).toBe(true));
  it("replaced object fails", () => expect(sameIdentity(a, { ...a, etag: "e2" })).toBe(false));
  it("missing object fails", () => expect(sameIdentity(a, null)).toBe(false));
});
