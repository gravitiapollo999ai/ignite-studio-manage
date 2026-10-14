import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin-only: process due video-ready emails. Fails closed (marks blocked) while no email domain is configured. */
export const adminDispatchEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (isAdmin !== true) return { ok: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispatchEmails } = await import("./email-dispatch.server");
    const r = await dispatchEmails(supabaseAdmin, 10);
    return { ok: true as const, processed: r.length, results: r.map((x) => x.result) };
  });
