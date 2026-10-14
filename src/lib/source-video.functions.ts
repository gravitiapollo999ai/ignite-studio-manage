import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RANGE_TIMEOUT_MS, classifySource, exactRange, readMp4Duration } from "./mp4-duration";

/**
 * Measures an uploaded source video's container duration from its header and records the trusted result.
 * - measured ≤30.05 s → accepted; >30.05 s → blocked
 * - structurally valid MP4/MOV whose length can't be read → accepted as "unknown_duration" (production uses only 0–30 s)
 * - not MP4/MOV (no ftyp) → rejected_media
 * - storage/network failure → nothing recorded, client asked to retry (fail closed)
 */
export const verifySourceVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(3).max(300).regex(/^[0-9a-f-]{36}\/[\w-]+\.mp4$/) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) return { ok: false as const, reason: "invalid" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage.from("source-videos").createSignedUrl(data.path, 300);
    if (!signed.data?.signedUrl) return { ok: false as const, reason: "missing" as const };
    const url = signed.data.signedUrl;
    let total = 0; let head16: Uint8Array;
    try {
      const head = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(RANGE_TIMEOUT_MS) });
      const m = head.status === 206 ? /^bytes 0-0\/(\d+)$/.exec(head.headers.get("content-range") ?? "") : null;
      await head.body?.cancel();
      total = m ? Number(m[1]) : 0;
      if (!Number.isSafeInteger(total) || total <= 0) return { ok: false as const, reason: "retry" as const };
      head16 = total >= 16 ? await exactRange(url, 0, 16, total) : new Uint8Array();
    } catch { return { ok: false as const, reason: "retry" as const }; }
    let seconds: number | null = null;
    try { seconds = await readMp4Duration((o, l) => exactRange(url, o, l, total), total); } catch { seconds = null; }
    const c = classifySource(head16, seconds);
    const { error } = await supabaseAdmin.from("source_video_checks").upsert({
      file_path: data.path, user_id: context.userId, ok: c.status === "measured_ok", status: c.status,
      duration_ms: c.status === "measured_ok" || c.status === "measured_too_long" ? Math.round(seconds! * 1000) : null,
      checked_at: new Date().toISOString(),
    });
    if (error) return { ok: false as const, reason: "retry" as const }; // fail closed: no trusted record
    if (c.status === "measured_ok") return { ok: true as const, seconds, unknown: false };
    if (c.status === "unknown_duration") return { ok: true as const, seconds: null, unknown: true };
    if (c.status === "measured_too_long") return { ok: false as const, reason: "too_long" as const, seconds };
    return { ok: false as const, reason: "rejected_media" as const };
  });
