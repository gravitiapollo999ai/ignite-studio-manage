import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkFeedKey, json } from "@/lib/feed-auth.server";

const body = z.object({
  job_id: z.string().uuid(),
  status: z.enum(["submitted", "in_review", "prompt_ready", "generating", "qa", "delivered", "revision", "cancelled"]),
  message: z.string().max(1000).optional(),
});

export const Route = createFileRoute("/api/public/jobs-feed/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!checkFeedKey(request)) return json({ error: "Unauthorized" }, 401);
        let parsed;
        try { parsed = body.safeParse(await request.json()); } catch { return json({ error: "Invalid JSON" }, 400); }
        if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.rpc("set_job_status", { _job_id: parsed.data.job_id, _status: parsed.data.status, _message: parsed.data.message ?? "" });
        if (error) return json({ error: error.message }, 400);
        await supabaseAdmin.from("settings").update({ feed_last_success_at: new Date().toISOString() }).eq("id", 1);
        return json({ ok: true });
      },
    },
  },
});
