// Server-only dispatcher for email_outbox (video-ready). Lease-based, bounded retries (≤5, exponential backoff),
// provider idempotency key = outbox.idempotency_key. Fails closed: with no configured managed email sender every
// claimed row is marked "blocked" — nothing is sent and nothing is reported as sent.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;
export type SendResult = { sent: true } | { sent: false; reason: "blocked" | "suppressed" | "failed"; error?: string };
export type Sender = (msg: { to: string; idempotencyKey: string; lang: "en" | "es"; name?: string | undefined; jobCode: string; jobUrl: string; brand: string }) => Promise<SendResult>;

/**
 * Managed app-email sending needs a verified sender domain plus the scaffolded send helper.
 * Until that exists this returns null. An env flag alone is deliberately NOT enough.
 */
export function getSender(): Sender | null {
  return null;
}

export function emailSendingConfigured(): boolean {
  return getSender() !== null;
}

export async function dispatchEmails(admin: Admin, limit = 5, sender: Sender | null = getSender(), jobId?: string) {
  const { data: rows, error } = await admin.rpc("claim_email_outbox", { _limit: limit, ...(jobId ? { _job_id: jobId } : {}) });
  if (error) throw new Error("claim failed");
  const out: Array<{ id: string; result: string }> = [];
  for (const row of rows ?? []) {
    let result: SendResult;
    if (!sender) result = { sent: false, reason: "blocked", error: "email_domain_not_configured" };
    else {
      try {
        const [{ data: prof }, { data: job }, { data: st }] = await Promise.all([
          admin.from("profiles").select("email,full_name").eq("id", row.user_id).maybeSingle(),
          admin.from("jobs").select("code").eq("id", row.job_id).maybeSingle(),
          admin.from("settings").select("brand_name").eq("id", 1).maybeSingle(),
        ]);
        if (!prof?.email) result = { sent: false, reason: "failed", error: "no_recipient" };
        else {
          const base = process.env["PUBLIC_APP_URL"] ?? "https://ignite-studio-manage.lovable.app";
          result = await sender({
            to: prof.email, idempotencyKey: row.idempotency_key, lang: row.lang === "es" ? "es" : "en",
            name: prof.full_name ?? undefined, jobCode: job?.code ?? "", jobUrl: `${base}/jobs/${row.job_id}`, brand: st?.brand_name ?? "Studio",
          });
        }
      } catch { result = { sent: false, reason: "failed", error: "send_error" }; }
    }
    const status = result.sent ? "sent" : result.reason;
    const fin = await admin.rpc("finish_email_outbox", { _id: row.id, _lease_token: row.lease_token, _result: status, _error: result.sent ? (null as unknown as string) : (result.error ?? status) });
    // A failed/lost finish is never reported as success.
    out.push({ id: row.id, result: fin.error || fin.data !== "ok" ? `finish_${fin.error ? "error" : String(fin.data)}` : status });
  }
  return out;
}
