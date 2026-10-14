import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RANGE_TIMEOUT_MS, classifyProbe, exactRange, probeMp4 } from "./mp4-duration";
import { streamSha256 } from "./stream-hash";

export const HASH_TIMEOUT_MS = 120_000;

/**
 * Verifies an uploaded source video and records the trusted result bound to its exact bytes.
 * - measured ≤30.05 s → accepted; >30.05 s → blocked
 * - structurally valid MP4/MOV declaring an unknown length → accepted as "unknown_duration" (production uses only 0–30 s)
 * - malformed/unsupported (bad boxes, brand, overflow, budget) → rejected_media
 * - any storage/range/hash/persistence failure, or the file changing mid-check → retry, NOTHING recorded (fail closed)
 * The content SHA-256 is streamed in chunks (no size cap beyond the bucket's own, no full buffering).
 */
export const verifySourceVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(3).max(300).regex(/^[0-9a-f-]{36}\/[\w-]+\.mp4$/) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) return { ok: false as const, reason: "invalid" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: idt } = await supabaseAdmin.rpc("source_object_identity", { _path: data.path });
    const ident = idt as { etag: string | null; updated_at: string; size: number } | null;
    if (!ident) return { ok: false as const, reason: "missing" as const };
    const signed = await supabaseAdmin.storage.from("source-videos").createSignedUrl(data.path, 600);
    if (!signed.data?.signedUrl) return { ok: false as const, reason: "retry" as const };
    const url = signed.data.signedUrl;
    const total = Number(ident.size);
    if (!Number.isSafeInteger(total) || total <= 0) return { ok: false as const, reason: "retry" as const };

    const probe = await probeMp4((o, l) => exactRange(url, o, l, total), total);
    const status = classifyProbe(probe);
    if (status == null) return { ok: false as const, reason: "retry" as const };

    let sha: string;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(HASH_TIMEOUT_MS) });
      if (res.status !== 200 || !res.body) { await res.body?.cancel(); return { ok: false as const, reason: "retry" as const }; }
      const h = await streamSha256(res.body, total);
      if (!h.ok) return { ok: false as const, reason: "retry" as const };
      sha = h.hex;
    } catch { return { ok: false as const, reason: "retry" as const }; }

    const seconds = probe.kind === "measured" ? probe.seconds : null;
    const { data: rec, error } = await supabaseAdmin.rpc("record_source_check", {
      _path: data.path, _user_id: context.userId, _status: status,
      _duration_ms: (status === "measured_ok" || status === "measured_too_long") ? Math.round(seconds! * 1000) : (null as unknown as number),
      _sha: sha, _size: total, _etag: ident.etag as string, _updated_at: ident.updated_at,
    });
    if (error || rec !== "ok") return { ok: false as const, reason: "retry" as const };
    if (status === "measured_ok") return { ok: true as const, seconds, unknown: false };
    if (status === "unknown_duration") return { ok: true as const, seconds: null, unknown: true };
    if (status === "measured_too_long") return { ok: false as const, reason: "too_long" as const, seconds };
    return { ok: false as const, reason: "rejected_media" as const };
  });
