import { describe, it, expect } from "vitest";
import { friendlyError } from "./data";
describe("friendlyError", () => {
  it("translates insufficient credits", () => {
    expect(friendlyError("Insufficient credits", "es")).toBe("No tienes créditos suficientes.");
  });
  it("hides unknown raw errors", () => {
    expect(friendlyError('duplicate key value violates unique constraint "x"', "en")).toBe("Something went wrong. Please try again.");
  });
  it("requires note message", () => {
    expect(friendlyError("Note required", "en")).toBe("A note is required.");
  });
});
