import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSourceTooLong, readMp4Duration } from "./mp4-duration";

/** Measures an uploaded source video's real length from its file header and records the trusted result. */
export const verifySourceVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(3).max(300).regex(/^[0-9a-f-]{36}\/[\w-]+\.mp4$/) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) return { ok: false as const, reason: "invalid" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage.from("source-videos").createSignedUrl(data.path, 300);
    if (!signed.data?.signedUrl) return { ok: false as const, reason: "missing" as const };
    const url = signed.data.signedUrl;
    const head = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const total = Number(/\/(\d+)$/.exec(head.headers.get("content-range") ?? "")?.[1] ?? 0);
    await head.body?.cancel();
    let seconds: number | null = null;
    if (total > 0) {
      seconds = await readMp4Duration(async (offset, length) => {
        const end = Math.min(total - 1, offset + length - 1);
        const r = await fetch(url, { headers: { Range: `bytes=${offset}-${end}` } });
        return new Uint8Array(await r.arrayBuffer());
      }, total).catch(() => null);
    }
    const ok = seconds != null && !isSourceTooLong(seconds);
    await supabaseAdmin.from("source_video_checks").upsert({
      file_path: data.path, user_id: context.userId, ok,
      duration_ms: seconds == null ? null : Math.round(seconds * 1000), checked_at: new Date().toISOString(),
    });
    if (seconds == null) return { ok: false as const, reason: "unreadable" as const };
    return ok ? { ok: true as const, seconds } : { ok: false as const, reason: "too_long" as const, seconds };
  });
