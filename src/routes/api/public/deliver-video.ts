import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  BODY_READ_TIMEOUT_MS, DELIVER_PATH, MAX_JSON_BYTES, MAX_MULTIPART_VIDEO_BYTES, MAX_URL_VIDEO_BYTES, URL_FETCH_TIMEOUT_MS,
  deliveryPath, hmacHex, httpStatusFor, isAllowedFinalUrl, looksLikeMp4, precheckEnvelope, readBounded, safeFileName,
  sha256Hex, verifySignature, type ReserveResult, type SigHeaders,
} from "@/lib/delivery-contract";

// Authenticated by HMAC-SHA256 (docs/deliver-video-contract.md). Legacy Bearer status callback is untouched.
const meta = z.object({
  job_id: z.string().uuid(),
  try_number: z.coerce.number().int().min(1).max(100),
  file_name: z.string().min(1).max(200).optional(),
});
const urlBody = meta.extend({
  video_url: z.string().url().max(4000),
  video_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  video_size_bytes: z.number().int().min(1024).max(MAX_URL_VIDEO_BYTES),
});
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/deliver-video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SPOOFER_SYNC_SECRET"];
        if (!secret) return json({ error: "not_configured" }, 503);
        const h: SigHeaders = {
          timestamp: request.headers.get("x-studio-timestamp"), nonce: request.headers.get("x-studio-nonce"),
          contentSha: request.headers.get("x-studio-content-sha256"), signature: request.headers.get("x-studio-signature"),
        };
        const now = Math.floor(Date.now() / 1000);
        // Reject a bad envelope before reading a single body byte.
        const env = precheckEnvelope(h, now);
        if (env) { await request.body?.cancel(); return json({ error: "unauthorized", reason: env }, 401); }
        const ctype = request.headers.get("content-type") ?? "";
        const isMultipart = ctype.startsWith("multipart/form-data");
        if (!isMultipart && !ctype.startsWith("application/json")) { await request.body?.cancel(); return json({ error: "unsupported_media_type" }, 415); }
        const limit = isMultipart ? MAX_MULTIPART_VIDEO_BYTES + 16 * 1024 : MAX_JSON_BYTES;
        if (Number(request.headers.get("content-length") ?? 0) > limit) { await request.body?.cancel(); return json({ error: "payload_too_large", max_bytes: limit }, 413); }
        const read = await readBounded(request.body, limit, BODY_READ_TIMEOUT_MS);
        if (!read.ok) return json({ error: read.reason === "timeout" ? "body_timeout" : "payload_too_large", max_bytes: limit }, read.reason === "timeout" ? 408 : 413);
        const raw = read.bytes;

        const sig = await verifySignature({ secret, method: "POST", path: DELIVER_PATH, body: raw, nowSeconds: now, headers: h });
        if (!sig.ok) return json({ error: "unauthorized", reason: sig.reason }, 401);

        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const actor = "spoofer:hmac-v1"; // only authenticated identity: holder of the shared secret
        const claimed = request.headers.get("x-studio-actor")?.slice(0, 120) ?? null; // stored as unverified claim
        const log = (o: { job_id?: string; try_number?: number; sha?: string; size?: number | undefined; source: string; outcome: string; http: number }) =>
          admin.from("delivery_log").insert({ job_id: o.job_id ?? null, try_number: o.try_number ?? null, content_sha256: o.sha ?? null, size_bytes: o.size ?? null, actor, source: o.source, outcome: o.outcome, http_status: o.http });

        const { data: fresh } = await admin.rpc("claim_delivery_nonce", { _nonce: sig.nonce });
        if (fresh !== true) { await log({ source: "unknown", outcome: "replay", http: 409 }); return json({ error: "replay" }, 409); }

        let m: z.infer<typeof meta>; let video: Uint8Array | null = null; let urlInfo: z.infer<typeof urlBody> | null = null;
        const source = isMultipart ? "multipart" : "signed_url";
        try {
          if (isMultipart) {
            const form = await new Response(raw as BodyInit, { headers: { "content-type": ctype } }).formData();
            const p = meta.safeParse({ job_id: form.get("job_id"), try_number: form.get("try_number"), file_name: form.get("file_name") ?? undefined });
            if (!p.success) return json({ error: "invalid_fields" }, 400);
            m = p.data;
            const f = form.get("file");
            if (!(f instanceof File)) return json({ error: "file_required" }, 400);
            if (f.size > MAX_MULTIPART_VIDEO_BYTES) return json({ error: "payload_too_large" }, 413);
            video = new Uint8Array(await f.arrayBuffer());
            m.file_name ??= f.name;
          } else {
            const p = urlBody.safeParse(JSON.parse(new TextDecoder().decode(raw)));
            if (!p.success) return json({ error: "invalid_fields" }, 400);
            urlInfo = p.data; m = p.data;
            // Receiver id comes from Studio's own trusted mapping, never from the request.
            const { data: map } = await admin.from("spoofer_sync").select("remote_job_id").eq("job_id", m.job_id).maybeSingle();
            if (!isAllowedFinalUrl(urlInfo.video_url, map?.remote_job_id)) {
              await log({ job_id: m.job_id, try_number: m.try_number, sha: urlInfo.video_sha256, source, outcome: "url_not_allowed", http: 400 });
              return json({ error: "url_not_allowed" }, 400);
            }
          }
        } catch { return json({ error: "invalid_body" }, 400); }

        const preSha = video ? await sha256Hex(video) : urlInfo!.video_sha256;
        const preSize = video ? video.byteLength : urlInfo!.video_size_bytes;
        if (video && !looksLikeMp4(video)) { await log({ job_id: m.job_id, try_number: m.try_number, sha: preSha, size: preSize, source, outcome: "not_mp4", http: 415 }); return json({ error: "not_mp4" }, 415); }

        // Reserve BEFORE downloading so conflicts never fetch anything.
        const { data: res, error: resErr } = await admin.rpc("reserve_delivery", { _job_id: m.job_id, _try_number: m.try_number, _sha: preSha, _size: preSize, _actor: actor, _source: source, _claimed_actor: claimed as string });
        if (resErr || !res) { await log({ job_id: m.job_id, try_number: m.try_number, sha: preSha, size: preSize, source, outcome: "reserve_error", http: 500 }); return json({ error: "retry" }, 500); }
        const r = res as { result: ReserveResult; request_id?: string; lease_token?: string };
        const receipt = async (outcome: string, status: number, extra: Record<string, unknown> = {}) => {
          const text = JSON.stringify({ ok: status < 300, outcome, job_id: m.job_id, try_number: m.try_number, sha256: preSha, size_bytes: preSize, delivery_id: r.request_id ?? null, received_at: new Date().toISOString(), ...extra });
          await log({ job_id: m.job_id, try_number: m.try_number, sha: preSha, size: preSize, source, outcome, http: status });
          return new Response(text, { status, headers: { "content-type": "application/json", "x-studio-receipt-signature": `v1=${await hmacHex(secret, text)}`, ...(status === 202 ? { "retry-after": "30" } : {}) } });
        };
        // Completed deliveries always return the same receipt, rebuilt from persisted state.
        const persisted = async () => {
          const { data } = await admin.rpc("get_delivery_receipt", { _request_id: r.request_id! });
          const d = (data ?? {}) as { status?: string; email?: string | null; completed_at?: string | null; size_bytes?: number };
          return { status: d.status ?? null, email: d.email ?? null, completed_at: d.completed_at ?? null };
        };
        if (r.result === "already_completed") return receipt("already_completed", 200, await persisted());
        if (r.result !== "reserved") return receipt(r.result, httpStatusFor(r.result));

        try {
          if (urlInfo) {
            const resp = await fetch(urlInfo.video_url, { redirect: "manual", signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS) });
            if (resp.status !== 200) { await resp.body?.cancel(); return receipt("source_fetch_failed", 502, { upstream_status: resp.status }); }
            const got = await readBounded(resp.body, MAX_URL_VIDEO_BYTES, URL_FETCH_TIMEOUT_MS, urlInfo.video_size_bytes);
            if (!got.ok) return receipt(got.reason === "timeout" ? "source_fetch_timeout" : "size_mismatch", got.reason === "timeout" ? 504 : 422);
            video = got.bytes;
            if ((await sha256Hex(video)) !== preSha) return receipt("sha_mismatch", 422);
            if (!looksLikeMp4(video)) return receipt("not_mp4", 415);
          }
          const path = deliveryPath(m.job_id, m.try_number, preSha);
          const up = await admin.storage.from("deliverables").upload(path, video!, { contentType: "video/mp4", upsert: false });
          if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error("storage");
          const { emailSendingConfigured, dispatchEmails } = await import("@/lib/email-dispatch.server");
          const emailStatus = emailSendingConfigured() ? "queued" : "blocked";
          const { data: done, error } = await admin.rpc("complete_delivery", {
            _request_id: r.request_id!, _lease_token: r.lease_token!, _sha: preSha, _size: video!.byteLength,
            _file_path: path, _file_name: safeFileName(m.file_name), _email_status: emailStatus,
          });
          if (error) throw new Error("complete");
          if (done === "completed" || done === "already_completed") {
            if (emailStatus === "queued") await dispatchEmails(admin, 3).catch(() => undefined);
            return receipt(done, 200, await persisted());
          }
          return receipt(String(done), done === "lease_expired" || done === "lease_lost" ? 503 : 409);
        } catch (e) {
          const msg = e instanceof Error && e.name === "TimeoutError" ? "source_fetch_timeout" : "processing_failed";
          return receipt(msg, msg === "source_fetch_timeout" ? 504 : 500);
        }
      },
    },
  },
});
