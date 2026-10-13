import { createFileRoute } from "@tanstack/react-router";
import { checkFeedKey, json } from "@/lib/feed-auth.server";

const STATUSES = ["submitted", "in_review", "prompt_ready", "generating", "qa", "delivered", "revision", "cancelled"];

export const Route = createFileRoute("/api/public/jobs-feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!checkFeedKey(request)) return json({ error: "Unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const since = url.searchParams.get("since");
        let q = supabaseAdmin.from("jobs_feed").select("*").order("created_at", { ascending: true }).limit(500);
        if (status) {
          if (!STATUSES.includes(status)) return json({ error: "Invalid status" }, 400);
          q = q.eq("status", status);
        }
        if (since) {
          const d = new Date(since);
          if (isNaN(d.getTime())) return json({ error: "Invalid since" }, 400);
          q = q.gte("updated_at", d.toISOString());
        }
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 500);
        const sign = async (bucket: string, path: string | null) => {
          if (!path) return null;
          const r = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 86400);
          return r.data?.signedUrl ?? null;
        };
        const jobs = await Promise.all((data ?? []).map(async (j) => ({
          ...j,
          resolution: "1080p",
          source_file_url: await sign("source-videos", j.source_file_path),
          reference_image_url: await sign("reference-images", j.reference_image_path),
        })));
        await supabaseAdmin.from("settings").update({ feed_last_success_at: new Date().toISOString() }).eq("id", 1);
        return json({ jobs, count: jobs.length, signed_url_ttl_seconds: 86400 });
      },
    },
  },
});
