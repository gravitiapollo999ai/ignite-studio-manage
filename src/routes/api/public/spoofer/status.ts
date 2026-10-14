import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { bearerMatches, decideCallback, isAllowedVideoUrl, mapInboundStatus } from "@/lib/spoofer-contract";

const body = z.object({
  event_id: z.string().min(1).max(200),
  studio_job_id: z.string().uuid(),
  status: z.string().min(1).max(40),
  message: z.string().max(1000).optional(),
  spoofer_job_id: z.string().max(200).nullish(),
  // Optional attempt the callback belongs to (from the intake payload's try_number). Absent = current attempt.
  try_number: z.number().int().min(1).max(100).optional(),
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

        // Fast pre-check (non-authoritative) so stale/terminal callbacks never download a video.
        const pre = decideCallback(job.status, status, job.try_number, d.try_number);
        if (pre === "stale" || pre === "terminal" || pre === "attempt_mismatch") {
          const r = await admin.rpc("apply_spoofer_callback", { _job_id: job.id, _event_id: d.event_id, _status: status, _message: d.message ?? "", _try_number: d.try_number ?? null as unknown as number, _file_path: null as unknown as string, _file_name: null as unknown as string, _remote_job_id: d.spoofer_job_id ?? null as unknown as string });
          return json({ ok: true, ignored: r.data ?? pre });
        }

        let uploaded: string | null = null;
        try {
          let safeName: string | null = null;
          if (d.final_video) {
            if (!isAllowedVideoUrl(d.final_video.url)) return json({ error: "final_video.url must be https" }, 400);
            safeName = d.final_video.file_name.replace(/[^\w.\-]+/g, "_");
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
              uploaded = path;
            }
          }
          if (status === "delivered" && !d.final_video) {
            const { count } = await admin.from("deliverables").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("try_number", job.try_number);
            if (!count) return json({ error: "delivered requires final_video" }, 400);
          }
          // Authoritative, atomic step: row-locks the job, claims event_id, enforces same-attempt monotonic order,
          // inserts the deliverable idempotently. Inbound never triggers an outbound push (no echo loop).
          const { data: result, error } = await admin.rpc("apply_spoofer_callback", {
            _job_id: job.id, _event_id: d.event_id, _status: status, _message: d.message ?? "",
            _try_number: d.try_number ?? null as unknown as number,
            _file_path: uploaded as string, _file_name: (uploaded ? safeName : null) as string,
            _remote_job_id: d.spoofer_job_id ?? null as unknown as string,
          });
          if (error) throw new Error(error.message);
          if (result !== "applied" && result !== "noop" && uploaded) {
            await admin.storage.from("deliverables").remove([uploaded]); // lost the race: discard the unused copy
          }
          if (result === "duplicate") return json({ ok: true, duplicate: true });
          if (result === "applied" || result === "noop") {
            if (d.final_video && result === "applied") await logSync(admin, { job_id: job.id, direction: "inbound", event: "final_video_copied", ok: true });
            return json({ ok: true, result });
          }
          return json({ ok: true, ignored: result });
        } catch (e) {
          if (uploaded) await admin.storage.from("deliverables").remove([uploaded]);
          // Failed events are logged without event_id so Spoofer's retry of the same event is processed.
          await logSync(admin, { job_id: job.id, direction: "inbound", event: `status:${status}`, ok: false, message: e instanceof Error ? e.message : String(e) });
          return json({ error: "Processing failed, retry" }, 500);
        }
      },
    },
  },
});
