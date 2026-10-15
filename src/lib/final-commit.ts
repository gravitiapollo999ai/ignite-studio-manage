// Final commit orchestration with injectable deps (testable). Server-only callers pass the service client.
import { exactRange, probeMp4 } from "./mp4-duration";
import { streamSha256 } from "./stream-hash";
import { FINAL_MAX_BYTES, commitOutcome, finalProbeError, sameIdentity, type ObjectIdentity } from "./final-upload";

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export type CommitDeps = {
  rpc: Rpc;
  storage: { from(b: string): { remove(p: string[]): PromiseLike<unknown>; createSignedUrl(p: string, s: number): PromiseLike<{ data: { signedUrl: string } | null }> } };
};
export type CommitIo = {
  probe?: (url: string, total: number) => Promise<ReturnType<typeof finalProbeError>>;
  hash?: (url: string, total: number) => Promise<string | null>;
};

const defaultProbe = async (url: string, total: number) => finalProbeError(await probeMp4((o, l) => exactRange(url, o, l, total), total));
const defaultHash = async (url: string, total: number) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (res.status !== 200 || !res.body) { await res.body?.cancel(); return null; }
    const h = await streamSha256(res.body, total);
    return h.ok ? h.hex : null;
  } catch { return null; }
};

export async function runFinalCommit(db: CommitDeps, data: { reservationId: string; token: string; fileName: string; userId: string }, io: CommitIo = {}) {
  const probe = io.probe ?? defaultProbe, hash = io.hash ?? defaultHash;
  const id = data.reservationId;
  // Cleanup permitted only when the DB atomically proves this reservation is rejected (terminal) and uncommitted.
  const cleanup = async () => {
    const { data: p, error } = await db.rpc("cleanup_rejected_final", { _reservation_id: id });
    if (!error && typeof p === "string" && p) await db.storage.from("deliverables").remove([p]);
  };
  const reject = async (reason: string) => {
    const r = await db.rpc("reject_final_reservation", { _reservation_id: id, _reason: reason });
    if (!r.error) await cleanup();
    return { ok: false as const, reason };
  };

  const { data: claim, error: claimErr } = await db.rpc("claim_final_commit", { _reservation_id: id, _token: data.token, _uploader: data.userId });
  if (claimErr) return { ok: false as const, reason: "unknown_outcome" };
  const c = claim as { ok: boolean; already?: boolean; reason?: string; path?: string; sha256?: string; size?: number } | null;
  if (c?.ok && c.already) return { ok: true as const, sha256: c.sha256 ?? "", size: Number(c.size ?? 0), already: true };
  if (!c?.ok || !c.path) {
    if (c?.reason === "expired") await cleanup();
    return { ok: false as const, reason: c?.reason ?? "claim_failed" };
  }
  const path = c.path;
  const ident = async () => (await db.rpc("final_object_identity", { _path: path })).data as ObjectIdentity | null;
  const before = await ident();
  if (!before) return reject("missing_object");
  const total = Number(before.size);
  if (!Number.isSafeInteger(total) || total <= 0 || total > FINAL_MAX_BYTES) return reject("bad_size");
  const signed = await db.storage.from("deliverables").createSignedUrl(path, 600);
  const url = signed.data?.signedUrl;
  if (!url) return reject("io_error");
  const pe = await probe(url, total);
  if (pe) return reject(pe);
  const sha = await hash(url, total);
  if (!sha) return reject("io_error");
  if (!sameIdentity(before, await ident())) return reject("object_changed");

  const res = await db.rpc("commit_final_upload", {
    _reservation_id: id, _sha: sha, _size: total, _etag: before.etag as string, _updated_at: before.updated_at, _file_name: data.fileName,
  });
  const outcome = commitOutcome(res);
  if (outcome === "committed") return { ok: true as const, sha256: sha, size: total };
  if (outcome === "rejected") { await cleanup(); return { ok: false as const, reason: String(res.data) }; }
  return { ok: false as const, reason: "unknown_outcome" }; // DB may have committed: never delete; retry is idempotent
}
