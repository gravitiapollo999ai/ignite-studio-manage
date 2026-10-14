// REAL database race/idempotency checks pinned to the existing synthetic fixture JOB-000004.
// Never inserts jobs, never touches other jobs' queues, never sends email, never writes the credit ledger.
// Run: bun scripts/delivery-db-race.ts   (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; prints no secrets)
import { createClient } from "@supabase/supabase-js";

const FIXTURE = "92372d5b-bb4f-4633-8e18-b3d5a862857b"; // JOB-000004, labelled synthetic
if (FIXTURE !== "92372d5b-bb4f-4633-8e18-b3d5a862857b") throw new Error("refusing to run: fixture is not the pinned JOB-000004");
const JOB2 = "c0376b39-d2a8-4021-a802-9f03af337e22";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${c ? "" : " " + JSON.stringify(d)}`); };
const rpc = async (fn: string, a: Record<string, unknown>) => { const r = await admin.rpc(fn as never, a as never); if (r.error) throw new Error(`${fn}: ${r.error.message}`); return r.data as any; };

// Guard: abort unless the pinned fixture is the labelled synthetic job and is blocked from sync.
const { data: fx } = await admin.from("jobs").select("id,code,notes,status,try_number").eq("id", FIXTURE).single();
const { data: sync } = await admin.from("spoofer_sync").select("state").eq("job_id", FIXTURE).single();
if (!fx?.notes?.startsWith("[SYNTHETIC TEST FIXTURE]") || sync?.state !== "failed") { console.error("ABORT: fixture guard failed"); process.exit(2); }
const { data: req } = await admin.from("delivery_requests").select("content_sha256,size_bytes").eq("job_id", FIXTURE).eq("try_number", 1).single();
const sha = req!.content_sha256, size = req!.size_bytes;

const before = {
  job2: (await admin.from("jobs").select("status,try_number,updated_at").eq("id", JOB2).single()).data,
  job2Files: (await admin.from("deliverables").select("id", { count: "exact", head: true }).eq("job_id", JOB2)).count,
  ledger: (await admin.from("credit_ledger").select("id", { count: "exact", head: true })).count,
  fxFiles: (await admin.from("deliverables").select("id", { count: "exact", head: true }).eq("job_id", FIXTURE)).count,
  outbox: (await admin.from("email_outbox").select("id", { count: "exact", head: true })).count,
};
const args = (s = sha, z = size, job = FIXTURE) => ({ _job_id: job, _try_number: 1, _sha: s, _size: z, _actor: "test:db-race", _source: "test", _claimed_actor: null });

const many = await Promise.all(Array.from({ length: 8 }, () => rpc("reserve_delivery", args())));
check("8 concurrent identical → all already_completed", many.every((r) => r.result === "already_completed"), many);
const receipts = await Promise.all(many.map((r) => rpc("get_delivery_receipt", { _request_id: r.request_id })));
check("receipts identical and from persisted state", receipts.every((x) => JSON.stringify(x) === JSON.stringify(receipts[0])) && receipts[0].status === "delivered" && receipts[0].email === "blocked", receipts[0]);
check("different bytes → conflict", (await rpc("reserve_delivery", args("1".repeat(64)))).result === "conflict_different_bytes");
check("different size → conflict", (await rpc("reserve_delivery", args(sha, size + 1))).result === "conflict_different_bytes");
check("newer attempt → attempt_mismatch", (await rpc("reserve_delivery", { ...args(), _try_number: 2 })).result === "attempt_mismatch");

// Email claims scoped to the fixture only; its row is blocked so nothing is claimable.
const claims = await Promise.all(Array.from({ length: 4 }, () => rpc("claim_email_outbox", { _limit: 20, _job_id: FIXTURE })));
check("scoped claim finds nothing (blocked stays blocked)", claims.flat().length === 0, claims);

check("JOB-000002 targeted → conflict_already_delivered", (await rpc("reserve_delivery", args(sha, size, JOB2))).result === "conflict_already_delivered");
const after = {
  job2: (await admin.from("jobs").select("status,try_number,updated_at").eq("id", JOB2).single()).data,
  job2Files: (await admin.from("deliverables").select("id", { count: "exact", head: true }).eq("job_id", JOB2)).count,
  ledger: (await admin.from("credit_ledger").select("id", { count: "exact", head: true })).count,
  fxFiles: (await admin.from("deliverables").select("id", { count: "exact", head: true }).eq("job_id", FIXTURE)).count,
  outbox: (await admin.from("email_outbox").select("id", { count: "exact", head: true })).count,
};
check("JOB-000002 unchanged", JSON.stringify(after.job2) === JSON.stringify(before.job2) && after.job2Files === before.job2Files);
check("no ledger / deliverable / outbox rows added", after.ledger === before.ledger && after.fxFiles === before.fxFiles && after.outbox === before.outbox, { before, after });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
