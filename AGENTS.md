<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Credit balance is always SUM(credit_ledger.delta); never store an editable balance — keeps credits auditable.
- Credit and job state changes go through security-definer SQL functions (create_job, approve_credit_request, set_job_status, request_revision, refund_job, admin_adjust_credits) — keeps them atomic and admin-checked.
- job_internal is admin-only; never select or join it in client-facing code — internal prompts must never leak.
- Admin checks use user_roles + has_role/is_admin, never profile fields — prevents privilege escalation.
- Production feed lives at /api/public/jobs-feed (+ /status), authenticated by x-api-key vs JOBS_FEED_API_KEY — external pull-only handoff, no outbound calls to production.
- Credit purchases go through the PaymentProvider abstraction in src/lib/payments.ts — a Stripe provider can be swapped in without UI changes.
- All storage buckets are private; files are served via signed URLs (logo uses a long-lived signed URL) — workspace blocks public buckets.
- Apply supabase/seed.sql after migrations for current pricing; historical migration files are immutable and contain the original seed.
- UI text is bilingual via `useI18n().t(en, es)` from src/lib/i18n.tsx (no key dictionary); theme is a `.dark` class on <html> set by THEME_SCRIPT — keeps every new string translatable inline and avoids theme flash.
- Staff = admin or manager (user_roles, is_staff()); roles change only via set_user_role (admin-only, keeps ≥1 admin) — managers get read + credit grants only.
- credit_transactions is a read-only view over credit_ledger, never a second ledger — avoids double charging.
- Social OAuth tokens live in social_tokens (service_role only); clients only see social_connections status.
- Spoofer sync: new jobs enqueue in spoofer_sync (trigger), pushed server-side by src/lib/spoofer-sync.server.ts with Bearer SPOOFER_SYNC_SECRET; status/video come back via /api/public/spoofer/status; contract in docs/spoofer-receiver-contract.md — sync tables are admin-read only, inbound never pushes outbound (no echo loops); callbacks are applied only through apply_spoofer_callback (row lock, event-id claim, monotonic per try_number, Delivered terminal) — prevents stale/concurrent regressions.
