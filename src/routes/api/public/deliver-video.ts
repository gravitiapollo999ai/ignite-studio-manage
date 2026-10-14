import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  DELIVER_PATH, MAX_JSON_BYTES, MAX_VIDEO_BYTES, URL_FETCH_TIMEOUT_MS, deliveryPath, hmacHex, httpStatusFor,
  isAllowedStorageUrl, looksLikeMp4, safeFileName, sha256Hex, verifySignature, type ReserveResult,
} from "@/lib/delivery-contract";

// Authenticated by HMAC-SHA256 (see docs/deliver-video-contract.md). Legacy Bearer status callback is untouched.
const meta = z.object({
  job_id: z.string().uuid(),
  try_number: z.coerce.number().int().min(1).max(100),
  file_name: z.string().min(1).max(200).optional(),
});
const urlBody = meta.extend({ video_url: z.string().url().max(4000), video_sha256: z.string().regex(/^[0-9a-f]{64}$/) });

const json = (d: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json", ...extra } });

/** Reads at most `max` bytes from a stream; returns null when exceeded (aborts the read). */
async function readBounded(stream: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader(); const parts: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}

export const Route = createFileRoute("/api/public/deliver-video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SPOOFER_SYNC_SECRET"];
        const ctype = request.headers.get("content-type") ?? "";
        const isMultipart = ctype.startsWith("multipart/form-data");
        const limit = isMultipart ? MAX_VIDEO_BYTES + 64 * 1024 : MAX_JSON_BYTES;
        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared > limit) return json({ error: "payload_too_large", max_bytes: limit }, 413);
        const raw = await readBounded(request.body, limit);
        if (!raw) return json({ error: "payload_too_large", max_bytes: limit }, 413);

        const sig = await verifySignature({
          secret, method: "POST", path: DELIVER_PATH, body: raw, nowSeconds: Math.floor(Date.now() / 1000),
          headers: {
            timestamp: request.headers.get("x-studio-timestamp"), nonce: request.headers.get("x-studio-nonce"),
            contentSha: request.headers.get("x-studio-content-sha256"), signature: request.headers.get("x-studio-signature"),
          },
        });
        if (!sig.ok) return json({ error: "unauthorized", reason: sig.reason === "no_secret" ? "not_configured" : sig.reason }, sig.reason === "no_secret" ? 503 : 401);

        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const actor = "spoofer:hmac-v1"; // the only authenticated identity: holder of the shared secret
        const claimed = request.headers.get("x-studio-actor")?.slice(0, 120) ?? null; // recorded as unverified only
        const log = (o: { job_id?: string; try_number?: number; sha?: string; size?: number | undefined; source: string; outcome: string; http: number }) =>
          admin.from("delivery_log").insert({ job_id: o.job_id ?? null, try_number: o.try_number ?? null, content_sha256: o.sha ?? null, size_bytes: o.size ?? null, actor, source: o.source, outcome: o.outcome, http_status: o.http });

        const { data: fresh } = await admin.rpc("claim_delivery_nonce", { _nonce: sig.nonce });
        if (fresh !== true) { await log({ source: "unknown", outcome: "replay", http: 409 }); return json({ error: "replay" }, 409); }

        // Parse the already-verified body.
        let m: z.infer<typeof meta>; let video: Uint8Array | null = null; let source: "multipart" | "signed_url";
        let urlInfo: z.infer<typeof urlBody> | null = null;
        try {
          if (isMultipart) {
            source = "multipart";
            const form = await new Response(raw as BodyInit, { headers: { "content-type": ctype } }).formData();
            const p = meta.safeParse({ job_id: form.get("job_id"), try_number: form.get("try_number"), file_name: form.get("file_name") ?? undefined });
            if (!p.success) return json({ error: "invalid_fields" }, 400);
            m = p.data;
            const f = form.get("file");
            if (!(f instanceof File)) return json({ error: "file_required" }, 400);
            if (f.size > MAX_VIDEO_BYTES) return json({ error: "payload_too_large" }, 413);
            video = new Uint8Array(await f.arrayBuffer());
            m.file_name ??= f.name;
          } else {
            source = "signed_url";
            const p = urlBody.safeParse(JSON.parse(new TextDecoder().decode(raw)));
            if (!p.success) return json({ error: "invalid_fields" }, 400);
            urlInfo = p.data; m = p.data;
            if (!isAllowedStorageUrl(urlInfo.video_url, process.env["SPOOFER_STORAGE_HOST"])) {
              return json({ error: process.env["SPOOFER_STORAGE_HOST"] ? "url_not_allowed" : "url_mode_not_configured" }, 400);
            }
          }
        } catch { return json({ error: "invalid_body" }, 400); }

        // Reserve BEFORE downloading so conflicts never fetch anything. URL mode reserves on the declared hash, then verifies it.
        const preSha = video ? await sha256Hex(video) : urlInfo!.video_sha256;
        if (video && !looksLikeMp4(video)) { await log({ job_id: m.job_id, try_number: m.try_number, sha: preSha, size: video.byteLength, source, outcome: "not_mp4", http: 415 }); return json({ error: "not_mp4" }, 415); }
        const preSize = video?.byteLength ?? 1;
        const { data: res, error: resErr } = await admin.rpc("reserve_delivery", { _job_id: m.job_id, _try_number: m.try_number, _sha: preSha, _size: preSize, _actor: actor, _source: source, _claimed_actor: claimed as string });
        if (resErr || !res) { await log({ job_id: m.job_id, try_number: m.try_number, sha: preSha, source, outcome: "reserve_error", http: 500 }); return json({ error: "retry" }, 500); }
        const r = res as { result: ReserveResult; request_id?: string };
        const receipt = async (outcome: string, status: number, extra: Record<string, unknown> = {}) => {
          const body = { ok: status < 300, outcome, job_id: m.job_id, try_number: m.try_number, sha256: preSha, delivery_id: r.request_id ?? null, received_at: new Date().toISOString(), ...extra };
          const text = JSON.stringify(body);
          await log({ job_id: m.job_id, try_number: m.try_number, sha: preSha, size: video?.byteLength, source, outcome, http: status });
          return new Response(text, { status, headers: { "content-type": "application/json", "x-studio-receipt-signature": `v1=${await hmacHex(secret!, text)}`, ...(status === 202 ? { "retry-after": "30" } : {}) } });
        };
        if (r.result !== "reserved") return receipt(r.result, httpStatusFor(r.result));

        try {
          if (urlInfo) {
            const resp = await fetch(urlInfo.video_url, { redirect: "manual", signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS) });
            if (resp.status !== 200) return receipt("source_fetch_failed", 502, { upstream_status: resp.status });
            if (Number(resp.headers.get("content-length") ?? 0) > MAX_VIDEO_BYTES) return receipt("payload_too_large", 413);
            video = await readBounded(resp.body, MAX_VIDEO_BYTES);
            if (!video) return receipt("payload_too_large", 413);
            if ((await sha256Hex(video)) !== preSha) return receipt("sha_mismatch", 422);
            if (!looksLikeMp4(video)) return receipt("not_mp4", 415);
          }
          const path = deliveryPath(m.job_id, m.try_number, preSha);
          const up = await admin.storage.from("deliverables").upload(path, video!, { contentType: "video/mp4", upsert: false });
          if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error("storage");
          const emailStatus = process.env["EMAIL_SENDING_READY"] === "true" ? "queued" : "blocked";
          const { data: done, error } = await admin.rpc("complete_delivery", { _request_id: r.request_id!, _file_path: path, _file_name: safeFileName(m.file_name), _email_status: emailStatus });
          if (error) throw new Error("complete");
          if (done === "completed" || done === "already_completed") return receipt(done, 200, { size_bytes: video!.byteLength, status: "delivered", email: emailStatus });
          return receipt(String(done), 409);
        } catch (e) {
          // Lease expires in 5 minutes; a retry with the same bytes resumes on the same storage path.
          const msg = e instanceof Error && e.name === "TimeoutError" ? "source_fetch_timeout" : "processing_failed";
          return receipt(msg, msg === "source_fetch_timeout" ? 504 : 500);
        }
      },
    },
  },
});
