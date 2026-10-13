// Pure, browser-safe helpers for the Studio ⇄ Spoofer sync contract (tested in spoofer-contract.test.ts).

export const SPOOFER_DEFAULT_BASE_URL = "https://spoofer-suite.lovable.app";
export const SPOOFER_CREATE_PATH = "/api/public/studio/jobs";
export const MAX_SYNC_ATTEMPTS = 6;

/** Spoofer statuses accepted inbound → Studio job status. */
export const INBOUND_STATUS_MAP: Record<string, string> = {
  in_review: "in_review",
  generating: "generating",
  qa: "qa",
  delivered: "delivered",
};

export function mapInboundStatus(s: string): string | null {
  const k = s.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return INBOUND_STATUS_MAP[k] ?? null;
}

/** Minutes to wait before the next attempt after `attempts` failures (1,2,4,8,16 … capped at 60). */
export function backoffMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1));
}

export function isFinalFailure(attempts: number): boolean {
  return attempts >= MAX_SYNC_ATTEMPTS;
}

/** Constant-time string compare (no early exit). */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  const m = /^Bearer (\S+)$/.exec(header ?? "");
  return !!secret && !!m && safeEqual(m[1], secret);
}

/** Final-video URLs must be https (no internal/plain-http fetches). */
export function isAllowedVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname);
  } catch {
    return false;
  }
}

/** Never let a secret value reach a log line. */
export function redact(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("[redacted]");
  return out.slice(0, 1000);
}
