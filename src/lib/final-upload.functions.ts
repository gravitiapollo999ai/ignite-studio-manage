import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runFinalCommit, type CommitDeps } from "./final-commit";

/** Step 1: server reservation (admin). Rejects terminal/stale/wrong-status/restricted jobs; returns a fenced unique path. */
export const reserveFinalUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), tryNumber: z.number().int().min(1).max(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("reserve_final_upload", { _job_id: data.jobId, _try_number: data.tryNumber });
    if (error) return { ok: false as const, reason: "not_allowed" };
    return r as { ok: true; reservation_id: string; path: string; token: string } | { ok: false; reason: string };
  });

/** Step 3: commit. Hash/size/length are computed here from the exact stored object; browser values are ignored. */
export const commitFinalUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reservationId: z.string().uuid(), token: z.string().uuid(), fileName: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (isAdmin !== true) return { ok: false as const, reason: "not_allowed" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return runFinalCommit(supabaseAdmin as unknown as CommitDeps, { ...data, userId: context.userId });
  });

/** Link jobs: attach an uploaded, verified MP4 (already checked by verifySourceVideo) to the job. */
export const attachLinkSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), path: z.string().min(3).max(300), expectedTry: z.number().int().min(1).max(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("attach_job_source", { _job_id: data.jobId, _path: data.path, _expected_try: data.expectedTry });
    if (error) return { ok: false as const, reason: "not_allowed" };
    return r === "ok" ? { ok: true as const } : { ok: false as const, reason: String(r) };
  });
