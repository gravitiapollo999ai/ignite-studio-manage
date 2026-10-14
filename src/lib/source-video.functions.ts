import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RANGE_TIMEOUT_MS, exactRange, isSourceTooLong, readMp4Duration } from "./mp4-duration";

/** Measures an uploaded source video's container duration from its header and records the trusted result. */
export const verifySourceVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(3).max(300).regex(/^[0-9a-f-]{36}\/[\w-]+\.mp4$/) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) return { ok: false as const, reason: "invalid" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage.from("source-videos").createSignedUrl(data.path, 300);
    if (!signed.data?.signedUrl) return { ok: false as const, reason: "missing" as const };
    const url = signed.data.signedUrl;
    let seconds: number | null = null;
    try {
      const head = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(RANGE_TIMEOUT_MS) });
      const m = head.status === 206 ? /^bytes 0-0\/(\d+)$/.exec(head.headers.get("content-range") ?? "") : null;
      await head.body?.cancel();
      const total = m ? Number(m[1]) : 0;
      if (Number.isSafeInteger(total) && total > 0) seconds = await readMp4Duration((o, l) => exactRange(url, o, l, total), total);
    } catch { seconds = null; }
    const ok = seconds != null && !isSourceTooLong(seconds);
    const { error } = await supabaseAdmin.from("source_video_checks").upsert({
      file_path: data.path, user_id: context.userId, ok,
      duration_ms: seconds == null ? null : Math.round(seconds * 1000), checked_at: new Date().toISOString(),
    });
    if (error) return { ok: false as const, reason: "unreadable" as const }; // fail closed: no trusted record written
    if (seconds == null) return { ok: false as const, reason: "unreadable" as const };
    return ok ? { ok: true as const, seconds } : { ok: false as const, reason: "too_long" as const, seconds };
  });
