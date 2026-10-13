import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { bearerMatches, isAllowedVideoUrl, mapInboundStatus } from "@/lib/spoofer-contract";

const body = z.object({
  event_id: z.string().min(1).max(200),
  studio_job_id: z.string().uuid(),
  status: z.string().min(1).max(40),
  message: z.string().max(1000).optional(),
  spoofer_job_id: z.string().max(200).optional(),
  final_video: z.object({ url: z.string().url().max(4000), file_name: z.string().min(1).max(200) }).optional(),
});
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
const MAX_BYTES = 300 * 1024 * 1024;

export const Route = createFileRoute("/api/public/spoofer/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!bearerMatches(request.headers.get("authorization"), process.env["SPOOFER_SYNC_SECRET"])) return json({ error: "Unauthorized" }, 401);
        let p;
        try { p = body.safeParse(await request.json()); } catch { return json({ error: "Invalid JSON" }, 400); }
        if (!p.success) return json({ error: p.error.issues[0].message }, 400);
        const d = p.data;
        const status = mapInboundStatus(d.status);
        if (!status) return json({ error: "Unsupported status" }, 400);

        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const { logSync } = await import("@/lib/spoofer-sync.server");
        const { data: seen } = await admin.from("spoofer_sync_log").select("id").eq("event_id", d.event_id).maybeSingle();
        if (seen) return json({ ok: true, duplicate: true });
        const { data: job } = await admin.from("jobs").select("id,status,try_number").eq("id", d.studio_job_id).maybeSingle();
        if (!job) return json({ error: "Job not found" }, 404);

        try {
          if (d.final_video) {
            if (!isAllowedVideoUrl(d.final_video.url)) return json({ error: "final_video.url must be https" }, 400);
            const safeName = d.final_video.file_name.replace(/[^\w.\-]+/g, "_");
            const { data: dup } = await admin.from("deliverables").select("id").eq("job_id", job.id).eq("file_name", safeName).eq("try_number", job.try_number).maybeSingle();
            if (!dup) {
              const res = await fetch(d.final_video.url);
              if (!res.ok) throw new Error(`Video download HTTP ${res.status}`);
              const len = Number(res.headers.get("content-length") ?? 0);
              if (len > MAX_BYTES) throw new Error("Video too large");
              const buf = await res.arrayBuffer();
              if (buf.byteLength > MAX_BYTES) throw new Error("Video too large");
              const path = `${job.id}/spoofer-${crypto.randomUUID()}-${safeName}`;
              const up = await admin.storage.from("deliverables").upload(path, buf, { contentType: res.headers.get("content-type") ?? "video/mp4" });
              if (up.error) throw new Error(up.error.message);
              const ins = await admin.from("deliverables").insert({ job_id: job.id, file_path: path, file_name: safeName, try_number: job.try_number });
              if (ins.error) throw new Error(ins.error.message);
            }
          }
          if (status === "delivered" && !d.final_video) {
            const { count } = await admin.from("deliverables").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("try_number", job.try_number);
            if (!count) return json({ error: "delivered requires final_video" }, 400);
          }
          // Echo-loop guard: inbound status changes never trigger an outbound push, and same-status updates are no-ops.
          if (job.status !== status) {
            const { error } = await admin.rpc("set_job_status", { _job_id: job.id, _status: status, _message: d.message ?? "" });
            if (error) throw new Error(error.message);
          }
          await admin.from("spoofer_sync").update({ remote_status: status, ...(d.spoofer_job_id ? { remote_job_id: d.spoofer_job_id } : {}), updated_at: new Date().toISOString() }).eq("job_id", job.id);
          await logSync(admin, { job_id: job.id, direction: "inbound", event: `status:${status}${d.final_video ? "+video" : ""}`, ok: true, event_id: d.event_id });
          return json({ ok: true });
        } catch (e) {
          // Failed events are logged without event_id so Spoofer's retry of the same event is processed.
          await logSync(admin, { job_id: job.id, direction: "inbound", event: `status:${status}`, ok: false, message: e instanceof Error ? e.message : String(e) });
          return json({ error: "Processing failed, retry" }, 500);
        }
      },
    },
  },
});
