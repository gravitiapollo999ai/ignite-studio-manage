// REAL database race/concurrency test for reserve_delivery / complete_delivery / email outbox.
// Uses one clearly labelled synthetic job owned by an existing admin (no credit ledger rows, no Spoofer push, no email).
// Run: bun scripts/delivery-db-race.ts   (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env; prints no secrets)
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const JOB2 = "c0376b39-d2a8-4021-a802-9f03af337e22";
let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : " " + JSON.stringify(detail)}`); };
const rpc = async (fn: string, args: Record<string, unknown>) => { const r = await admin.rpc(fn as never, args as never); if (r.error) throw new Error(`${fn}: ${r.error.message}`); return r.data as any; };

const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "admin").limit(1);
const owner = roles?.[0]?.user_id; if (!owner) throw new Error("no admin");
const job2Before = await admin.from("jobs").select("status,try_number,updated_at").eq("id", JOB2).single();
const job2Files = await admin.from("deliverables").select("id", { count: "exact", head: true }).eq("job_id", JOB2);
const ledgerBefore = await admin.from("credit_ledger").select("id", { count: "exact", head: true });

const { data: job, error } = await admin.from("jobs").insert({
  user_id: owner, source_type: "tiktok", source_url: "https://synthetic.invalid/delivery-race-test", target_duration_seconds: 30,
  subject_type: "person", subject_name: "SYNTHETIC delivery race test", estimated_credits: 0, estimated_turnaround_hours: 0,
  reference_image_path: "synthetic/none", notes: "[SYNTHETIC TEST FIXTURE] deliver-video race test — not a real client job; never sync/send.", status: "qa",
}).select("id,code").single();
if (error) throw error;
// Make sure the fixture is never pushed to Spoofer.
await admin.from("spoofer_sync").update({ state: "failed", last_error: "synthetic fixture: never push", next_attempt_at: "2999-01-01" }).eq("job_id", job.id);
console.log("fixture", job.code, job.id);

const bytes = new Uint8Array(2048); bytes.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]); bytes.set(new TextEncoder().encode("SYNTHETIC"), 64);
const sha = createHash("sha256").update(bytes).digest("hex");
const args = (s = sha, size = bytes.length) => ({ _job_id: job.id, _try_number: 1, _sha: s, _size: size, _actor: "test:db-race", _source: "test", _claimed_actor: null });

// 1) 8 concurrent identical reserves → exactly one lease
const res = await Promise.all(Array.from({ length: 8 }, () => rpc("reserve_delivery", args())));
const reserved = res.filter((r) => r.result === "reserved");
check("concurrent reserve: exactly one reserved", reserved.length === 1, res.map((r) => r.result));
check("concurrent reserve: others in_progress", res.filter((r) => r.result === "in_progress").length === 7);
const first = reserved[0];

// 2) different bytes / size → conflict
check("same try different bytes → conflict", (await rpc("reserve_delivery", args("0".repeat(64)))).result === "conflict_different_bytes");
check("same sha different size → conflict", (await rpc("reserve_delivery", args(sha, 4096))).result === "conflict_different_bytes");
check("older/newer attempt rejected", (await rpc("reserve_delivery", { ...args(), _try_number: 2 })).result === "attempt_mismatch");

// 3) expire lease → reclaim rotates token; stale worker cannot finalize
await admin.from("delivery_requests").update({ lease_until: new Date(Date.now() - 1000).toISOString() }).eq("id", first.request_id);
const path = `${job.id}/delivery-try1-${sha.slice(0, 32)}.mp4`;
check("expired lease: stale token cannot complete", (await rpc("complete_delivery", { _request_id: first.request_id, _lease_token: first.lease_token, _sha: sha, _size: bytes.length, _file_path: path, _file_name: "final.mp4", _email_status: "blocked" })) === "lease_expired");
const re = await rpc("reserve_delivery", args());
check("reclaim issues a new lease token", re.result === "reserved" && re.lease_token !== first.lease_token, re);
check("old token after reclaim → lease_lost", (await rpc("complete_delivery", { _request_id: first.request_id, _lease_token: first.lease_token, _sha: sha, _size: bytes.length, _file_path: path, _file_name: "final.mp4", _email_status: "blocked" })) === "lease_lost");
check("completion with wrong size refused", (await rpc("complete_delivery", { _request_id: re.request_id, _lease_token: re.lease_token, _sha: sha, _size: 999, _file_path: path, _file_name: "final.mp4", _email_status: "blocked" })) === "conflict_different_bytes");

// 4) durable file first, then concurrent completes + concurrent reserves (mixed lock paths; deadlock check)
const up = await admin.storage.from("deliverables").upload(path, bytes, { contentType: "video/mp4", upsert: false });
check("fixture final stored privately", !up.error || /exists|duplicate/i.test(up.error.message), up.error?.message);
const mixed = await Promise.all([
  ...Array.from({ length: 4 }, () => rpc("complete_delivery", { _request_id: re.request_id, _lease_token: re.lease_token, _sha: sha, _size: bytes.length, _file_path: path, _file_name: "final.mp4", _email_status: "blocked" })),
  ...Array.from({ length: 4 }, () => rpc("reserve_delivery", args()).then((r) => r.result)),
]);
check("concurrent completes: exactly one completed, no deadlock", mixed.slice(0, 4).filter((x) => x === "completed").length === 1, mixed);
check("concurrent reserves during completion never re-lease", mixed.slice(4).every((x) => x === "in_progress" || x === "already_completed"), mixed);

const [jAfter, files, logs, mails] = await Promise.all([
  admin.from("jobs").select("status").eq("id", job.id).single(),
  admin.from("deliverables").select("id").eq("job_id", job.id),
  admin.from("spoofer_sync_log").select("id").eq("job_id", job.id).like("event", "delivery:%"),
  admin.from("email_outbox").select("id,status,idempotency_key").eq("job_id", job.id),
]);
check("job Delivered only after durable file", jAfter.data?.status === "delivered");
check("exactly one deliverable", files.data?.length === 1, files.data?.length);
check("exactly one delivery event", logs.data?.length === 1, logs.data?.length);
check("exactly one email row, blocked (no domain)", mails.data?.length === 1 && mails.data[0].status === "blocked", mails.data);
check("idempotent retry after completion", (await rpc("reserve_delivery", args())).result === "already_completed");
check("different bytes after Delivered → conflict", (await rpc("reserve_delivery", args("1".repeat(64)))).result === "conflict_different_bytes");

// 5) email dispatcher lease: only one concurrent claimer gets the row; fail-closed finish keeps it unsent
await admin.from("email_outbox").update({ status: "queued", next_attempt_at: new Date().toISOString() }).eq("job_id", job.id);
const claims = await Promise.all(Array.from({ length: 4 }, () => rpc("claim_email_outbox", { _limit: 20 })));
const mine = claims.flat().filter((r: any) => r.job_id === job.id);
check("concurrent email claim: one lease", mine.length === 1, mine.length);
check("stale email lease token refused", (await rpc("finish_email_outbox", { _id: mine[0].id, _lease_token: "00000000-0000-0000-0000-000000000000", _result: "sent", _error: null })) === "lease_lost");
await rpc("finish_email_outbox", { _id: mine[0].id, _lease_token: mine[0].lease_token, _result: "blocked", _error: "email_domain_not_configured" });
const m2 = await admin.from("email_outbox").select("status,sent_at").eq("job_id", job.id).single();
check("email remains blocked, never sent", m2.data?.status === "blocked" && m2.data.sent_at == null, m2.data);

// 6) JOB-000002 accidentally targeted → refused, unchanged
check("JOB-000002 targeted → conflict_already_delivered", (await rpc("reserve_delivery", { ...args(), _job_id: JOB2 })).result === "conflict_already_delivered");
const job2After = await admin.from("jobs").select("status,try_number,updated_at").eq("id", JOB2).single();
const job2FilesAfter = await admin.from("deliverables").select("id", { count: "exact", head: true }).eq("job_id", JOB2);
const job2Req = await admin.from("delivery_requests").select("id", { count: "exact", head: true }).eq("job_id", JOB2);
check("JOB-000002 unchanged", JSON.stringify(job2After.data) === JSON.stringify(job2Before.data) && job2FilesAfter.count === job2Files.count && job2Req.count === 0);
const ledgerAfter = await admin.from("credit_ledger").select("id", { count: "exact", head: true });
check("no credit ledger rows created", ledgerAfter.count === ledgerBefore.count);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
