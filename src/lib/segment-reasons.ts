// Canonical segment-reason list shared with Spoofer via contracts/segment-reasons.json (mirrors SQL CHECK + is_segment_restricted).
import table from "../../contracts/segment-reasons.json";

export const SEGMENT_REASONS = ["measured_short", "explicit", "auto_first_30", "auto_first_30_unknown_length"] as const;
export type SegmentReason = (typeof SEGMENT_REASONS)[number];
export type ParsedReason = SegmentReason | "none" | "invalid";

/** null/undefined → "none"; anything outside the list → "invalid" (never coerced to measured_short). */
export function parseSegmentReason(v: unknown): ParsedReason {
  if (v == null) return "none";
  return (SEGMENT_REASONS as readonly string[]).includes(v as string) ? (v as SegmentReason) : "invalid";
}

/** Restricted = every known reason except measured_short; invalid values fail closed as restricted. */
export function isRestrictedReason(v: unknown): boolean {
  const p = parseSegmentReason(v);
  return p !== "none" && p !== "measured_short";
}

export function segmentReasonLabel(v: unknown, lang: "en" | "es"): string {
  const p = parseSegmentReason(v);
  if (p === "none") return lang === "es" ? "Sin segmento" : "No segment";
  if (p === "invalid") return lang === "es" ? "Motivo no válido" : "Invalid reason";
  const row = table.reasons.find((r) => r.reason === p)!;
  return row[lang];
}

export const SEGMENT_REASON_TABLE = table;
