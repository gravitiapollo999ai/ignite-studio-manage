import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Called by the client right after submitting a job. Only the job owner may trigger its push. */
export const dispatchJobSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("jobs").select("id,user_id").eq("id", data.jobId).maybeSingle();
    if (!job || job.user_id !== context.userId) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pushOne, pushDue } = await import("./spoofer-sync.server");
    const r = await pushOne(supabaseAdmin, data.jobId);
    await pushDue(supabaseAdmin, 3);
    return { ok: r.ok }; // never return error detail to clients
  });

/** Admin-only: queue (or re-queue) a job and push now. Used for manual retries and pre-existing jobs. */
export const adminSyncJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), force: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_queue_spoofer_sync", { _job_id: data.jobId });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.force) {
      await supabaseAdmin.from("spoofer_sync").update({ state: "pending", attempts: 0, next_attempt_at: new Date().toISOString() }).eq("job_id", data.jobId).eq("state", "failed");
    }
    const { pushOne } = await import("./spoofer-sync.server");
    return pushOne(supabaseAdmin, data.jobId);
  });
