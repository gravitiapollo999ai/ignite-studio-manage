import { describe, it, expect } from "vitest";
import { computeEta, type EtaInputs } from "./eta";

const now = new Date("2026-10-14T12:00:00Z");
const base: EtaInputs = { status: "submitted", jobs_ahead: 0, stage_started_at: now.toISOString(), queue_minutes: 30, review_minutes: 15, generating_minutes: 30, qa_minutes: 15, ready_at_override: null };
const mins = (d: Date | null) => (d ? Math.round((d.getTime() - now.getTime()) / 60000) : null);
const ago = (m: number) => new Date(now.getTime() - m * 60000).toISOString();

describe("estimated ready time", () => {
  it("queued: jobsAhead*30 + 15 + 30 + 15", () => {
    expect(mins(computeEta(base, now))).toBe(60);
    expect(mins(computeEta({ ...base, jobs_ahead: 3 }, now))).toBe(150);
  });
  it("in review counts down the review stage", () => expect(mins(computeEta({ ...base, status: "in_review", stage_started_at: ago(10) }, now))).toBe(5 + 30 + 15));
  it("generating", () => expect(mins(computeEta({ ...base, status: "generating", stage_started_at: ago(10) }, now))).toBe(20 + 15));
  it("qa floors at 5 minutes when overdue", () => expect(mins(computeEta({ ...base, status: "qa", stage_started_at: ago(90) }, now))).toBe(5));
  it("per-stage override changes the total", () => expect(mins(computeEta({ ...base, generating_minutes: 60 }, now))).toBe(90));
  it("whole-job override wins", () => expect(computeEta({ ...base, ready_at_override: "2026-10-15T09:00:00Z" }, now)?.toISOString()).toBe("2026-10-15T09:00:00.000Z"));
  it("no estimate once delivered or cancelled", () => {
    expect(computeEta({ ...base, status: "delivered" }, now)).toBeNull();
    expect(computeEta({ ...base, status: "cancelled" }, now)).toBeNull();
  });
});
