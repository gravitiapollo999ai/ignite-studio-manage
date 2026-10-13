import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, isPlaceholderEmail } from "./data";

// Regression: the public footer must never show a placeholder support address.
describe("isPlaceholderEmail", () => {
  it("treats the default settings support email as a placeholder", () => {
    expect(isPlaceholderEmail(DEFAULT_SETTINGS.support_email)).toBe(true);
  });

  it("treats example domains and missing values as placeholders", () => {
    expect(isPlaceholderEmail("support@example.com")).toBe(true);
    expect(isPlaceholderEmail("Help@Example.ORG")).toBe(true);
    expect(isPlaceholderEmail("team@example.net")).toBe(true);
    expect(isPlaceholderEmail("a@b.test")).toBe(true);
    expect(isPlaceholderEmail("")).toBe(true);
    expect(isPlaceholderEmail(null)).toBe(true);
    expect(isPlaceholderEmail(undefined)).toBe(true);
  });

  it("allows a real configured support email", () => {
    expect(isPlaceholderEmail("soporte@cubic.cl")).toBe(false);
    expect(isPlaceholderEmail("hello@studio.com")).toBe(false);
  });
});
