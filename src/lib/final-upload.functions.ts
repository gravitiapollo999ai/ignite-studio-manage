import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exactRange, probeMp4 } from "./mp4-duration";
import { streamSha256 } from "./stream-hash";
import { FINAL_MAX_BYTES, finalProbeError, sameIdentity, type ObjectIdentity } from "./final-upload";

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
    const { data: claim } = await supabaseAdmin.rpc("claim_final_commit", { _reservation_id: data.reservationId, _token: data.token, _uploader: context.userId });
    const c = claim as { ok: boolean; reason?: string; path?: string } | null;
    if (!c?.ok || !c.path) {
      if (c?.reason === "expired" && c.path) await supabaseAdmin.storage.from("deliverables").remove([c.path]);
      return { ok: false as const, reason: c?.reason ?? "claim_failed" };
    }
    const path = c.path;
    const reject = async (reason: string) => {
      const { data: p } = await supabaseAdmin.rpc("reject_final_reservation", { _reservation_id: data.reservationId, _reason: reason });
      if (p === path) await supabaseAdmin.storage.from("deliverables").remove([path]); // reservation-owned, uncommitted orphan only
      return { ok: false as const, reason };
    };
    const ident = async () => (await supabaseAdmin.rpc("final_object_identity", { _path: path })).data as ObjectIdentity | null;
    const before = await ident();
    if (!before) return reject("missing_object");
    const total = Number(before.size);
    if (!Number.isSafeInteger(total) || total <= 0 || total > FINAL_MAX_BYTES) return reject("bad_size");
    const signed = await supabaseAdmin.storage.from("deliverables").createSignedUrl(path, 600);
    const url = signed.data?.signedUrl;
    if (!url) return reject("io_error");
    const probeErr = finalProbeError(await probeMp4((o, l) => exactRange(url, o, l, total), total));
    if (probeErr) return reject(probeErr);
    let sha: string;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (res.status !== 200 || !res.body) { await res.body?.cancel(); return reject("io_error"); }
      const h = await streamSha256(res.body, total);
      if (!h.ok) return reject("io_error");
      sha = h.hex;
    } catch { return reject("io_error"); }
    const after = await ident();
    if (!sameIdentity(before, after)) return reject("object_changed"); // TOCTOU: replaced between hash and commit
    const { data: res, error } = await supabaseAdmin.rpc("commit_final_upload", {
      _reservation_id: data.reservationId, _sha: sha, _size: total, _etag: before.etag as string, _updated_at: before.updated_at, _file_name: data.fileName,
    });
    if (error || res !== "ok") {
      await supabaseAdmin.storage.from("deliverables").remove([path]);
      return { ok: false as const, reason: (res as string) || "commit_failed" };
    }
    return { ok: true as const, sha256: sha, size: total };
  });

/** Link jobs: attach an uploaded, verified MP4 (already checked by verifySourceVideo) to the job. */
export const attachLinkSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), path: z.string().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("attach_job_source", { _job_id: data.jobId, _path: data.path });
    if (error) return { ok: false as const, reason: "not_allowed" };
    return r === "ok" ? { ok: true as const } : { ok: false as const, reason: String(r) };
  });
