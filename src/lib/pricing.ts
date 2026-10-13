// Pure business rules shared by UI and tests.

export type SourceType = "tiktok" | "youtube_shorts" | "youtube" | "instagram_reel" | "upload";

export const SOURCE_LABELS: Record<SourceType, string> = {
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  youtube: "YouTube",
  instagram_reel: "Instagram Reel",
  upload: "Uploaded MP4",
};

/** Detects the platform from a pasted link. Returns null if unsupported. */
export function detectPlatform(raw: string): Exclude<SourceType, "upload"> | null {
  let url: URL;
  try {
    url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  const path = url.pathname.toLowerCase();
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "youtube.com" || host === "music.youtube.com") {
    if (path.startsWith("/shorts/")) return "youtube_shorts";
    if (path === "/watch" && url.searchParams.get("v")) return "youtube";
    return null;
  }
  if (host === "youtu.be" && path.length > 1) return "youtube";
  if (host === "instagram.com" && (path.startsWith("/reel/") || path.startsWith("/reels/"))) return "instagram_reel";
  return null;
}

/** Parses "mm:ss" (or plain seconds) into seconds. Returns null when invalid. */
export function parseMmSs(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatMmSs(sec: number | null | undefined): string {
  if (sec == null) return "";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Per-video pricing: every finished video costs credits_per_video, regardless of length. */
export function jobCost(creditsPerVideo: number, durationSeconds: number, maxSeconds: number): number {
  if (durationSeconds < 1 || durationSeconds > maxSeconds) {
    throw new Error(`Duration must be between 1 and ${maxSeconds} seconds`);
  }
  return creditsPerVideo;
}

/** Default target duration: clip length clamped to the max, else 15s. */
export function defaultDuration(clipLength: number | null, maxSeconds: number): number {
  if (clipLength && clipLength > 0) return Math.min(Math.round(clipLength), maxSeconds);
  return Math.min(15, maxSeconds);
}

export type HfSettings = {
  hf_credits_per_30s: number;
  hf_plus_price: number;
  hf_plus_credits: number;
  hf_ultra_price: number;
  hf_ultra_credits: number;
};

/** Estimated DIY cost of one 30s try on each Higgsfield plan, in USD. */
export function hfCostPerTry(s: HfSettings) {
  const plus = (Number(s.hf_plus_price) / Number(s.hf_plus_credits)) * Number(s.hf_credits_per_30s);
  const ultra = (Number(s.hf_ultra_price) / Number(s.hf_ultra_credits)) * Number(s.hf_credits_per_30s);
  return { plus, ultra };
}

/** Parses a price label like "USD 90" and returns the per-video price string. */
export function perVideoPrice(priceLabel: string, videos: number): string | null {
  const m = /([A-Za-z$€£]*)\s*([\d.,]+)/.exec(priceLabel ?? "");
  if (!m || !videos) return null;
  const amount = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const per = amount / videos;
  const cur = m[1] || "";
  return `${cur}${cur && cur.length > 1 ? " " : ""}${per.toFixed(per % 1 === 0 ? 0 : 2)}`;
}

export const JOB_STEPS = ["submitted", "in_review", "prompt_ready", "generating", "qa", "delivered"] as const;
export type JobStatus = (typeof JOB_STEPS)[number] | "revision" | "cancelled";
export const STATUS_LABELS: Record<JobStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  prompt_ready: "Prompt ready",
  generating: "Generating",
  qa: "QA",
  delivered: "Delivered",
  revision: "Revision",
  cancelled: "Cancelled",
};
export const ALL_STATUSES = Object.keys(STATUS_LABELS) as JobStatus[];

export const BUSINESS_TYPES = [
  "Restaurant",
  "Construction",
  "Real estate",
  "Beauty / salon",
  "Fitness",
  "Retail / e-commerce",
  "Clinic / health",
  "Automotive",
  "Education",
  "Other",
];
