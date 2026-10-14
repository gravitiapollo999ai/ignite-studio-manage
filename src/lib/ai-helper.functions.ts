import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Whether the AI helper is configured (never reveals the key). */
export const aiHelperStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ configured: !!process.env["DEEPSEEK_API_KEY"] }));

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Client: polish a draft brief into EN + ES. Nothing is saved or submitted. */
export const aiImproveBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    draft: z.string().trim().min(5).max(2000),
    business_type: z.string().max(100).nullable().optional(),
    subject_type: z.string().max(50).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { improveBrief, DAILY_LIMITS, DEEPSEEK_MODEL } = await import("./ai-helper.server");
    if (!process.env["DEEPSEEK_API_KEY"]) return { ok: false as const, reason: "not_configured" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed } = await supabaseAdmin.rpc("consume_ai_quota", { _user_id: context.userId, _kind: "brief", _limit: DAILY_LIMITS.brief });
    if (allowed !== true) return { ok: false as const, reason: "quota" as const };
    const t0 = Date.now();
    const r = await improveBrief(data);
    await supabaseAdmin.from("ai_helper_log").insert({
      user_id: context.userId, kind: "brief", model: DEEPSEEK_MODEL, outcome: r.ok ? "ok" : r.reason,
      input_chars: data.draft.length, output_chars: r.ok ? r.data.brief_en.length + r.data.brief_es.length : null,
      input_sha256: await sha(data.draft), latency_ms: Date.now() - t0,
    });
    return r.ok ? { ok: true as const, ...r.data } : { ok: false as const, reason: r.reason };
  });

/** Staff only: draft a Seedance prompt into admin-only job_internal. No production send, no Generate. */
export const aiDraftPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff");
    if (staff !== true) return { ok: false as const, reason: "forbidden" as const };
    const { draftSeedancePrompt, DAILY_LIMITS, DEEPSEEK_MODEL } = await import("./ai-helper.server");
    if (!process.env["DEEPSEEK_API_KEY"]) return { ok: false as const, reason: "not_configured" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: j } = await supabaseAdmin.from("jobs").select("*").eq("id", data.jobId).maybeSingle();
    if (!j) return { ok: false as const, reason: "not_found" as const };
    const { data: allowed } = await supabaseAdmin.rpc("consume_ai_quota", { _user_id: context.userId, _kind: "prompt", _limit: DAILY_LIMITS.prompt });
    if (allowed !== true) return { ok: false as const, reason: "quota" as const };
    const seg = j as unknown as { segment_start_seconds?: number | null; segment_end_seconds?: number | null };
    const input = {
      brief: j.notes ?? "", subject_name: j.subject_name, subject_type: j.subject_type, business_type: j.business_type,
      segment_start: seg.segment_start_seconds ?? j.clip_start, segment_end: seg.segment_end_seconds ?? j.clip_end,
      source_type: j.source_type, has_source: !!(j.source_file_path || j.source_url), has_reference: !!j.reference_image_path,
    };
    const t0 = Date.now();
    const r = await draftSeedancePrompt(input);
    await supabaseAdmin.from("ai_helper_log").insert({
      user_id: context.userId, job_id: j.id, kind: "prompt", model: DEEPSEEK_MODEL, outcome: r.ok ? "ok" : r.reason,
      input_chars: input.brief.length, output_chars: r.ok ? r.data.prompt.length : null, input_sha256: await sha(input.brief), latency_ms: Date.now() - t0,
    });
    if (!r.ok) return { ok: false as const, reason: r.reason };
    const text = `[DRAFT — needs captain gate · ${DEEPSEEK_MODEL}]\n${r.data.prompt}\n\nNegative: ${r.data.negative_prompt}\nShots:\n${r.data.shot_notes.map((s) => `- ${s}`).join("\n")}\nDuration: ${r.data.duration_seconds}s\nInputs: source video + subject reference image (paired).`;
    return { ok: true as const, draft: text };
  });
