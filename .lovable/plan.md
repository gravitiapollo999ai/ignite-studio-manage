# White-label AI Video Service Portal (client intake for CaboEnt production)

## What gets built
A branded client portal where businesses buy video credits (approved manually), submit source videos plus a subject reference image, follow progress, and download finished 1080p videos. An admin panel runs production handoff, and an authenticated feed lets the CaboEnt team pull jobs.

## Pricing rules (final)
- 1 credit = 1 finished video, up to 30 s, 1080p. Shorter videos still cost 1 credit.
- Packages: Starter 10 videos / 10 credits, Growth 25 / 25, Scale 50 / 50.
- Up to 2 tries per video. Cost preview reads "1 credit per video (up to 30s, 1080p)".
- Settings: credits_per_video (1), max_video_seconds (30), min_package_videos (10), default_turnaround_hours (72), max_tries_per_video (2).

## Public pages
- Landing: hero, How it works (send link/video → adapted to your business with your subject → receive finished 1080p videos), Use cases (rewritten from the reference site, no agency branding), Packages from the database, Compare the cost, Sign up CTA.
- Compare the cost table (landing + Credits page): DIY on Higgsfield vs us. Per-video DIY cost computed from settings (hf_credits_per_30s 330, Plus $59/1,200, Ultra $129/3,000 → about $16 / $14 per try), "you write prompts and redo failed tries". Our column uses each package's price_label ÷ videos. Labeled "Estimates based on configured Higgsfield credit pricing — not how our production is billed."
- Sign up, log in, forgot/reset password.

## Client area
Dashboard, Credits (packages, request modal, request history, ledger), New video stepper (Source → Subject → Review), Jobs list (status filter, code search), Job detail (timeline, messages, downloads, revision request on try 1), Account (profile, password).

## Admin panel (/admin, admin role only)
Overview, Jobs table + detail (status + client message, internal prompt/notes marked "Internal – never shown to client", deliverable upload by try, refund, **Production handoff** card with job ID, specs, source link/file and reference image signed downloads + "Download handoff JSON"), Credit requests (approve/reject), Clients (balance, notes, manual adjustment, jobs), Packages CRUD, Settings (branding, logo upload, pricing, Higgsfield estimate figures), API page with copyable curl.

## Production pipeline boundaries
- Feed is pull-only and authenticated; no live CaboEnt connection is claimed. API page shows "Not verified" until a successful call is logged.
- No Higgsfield calls, no pay-per-generation, no payments. Client credits are service credits separate from Higgsfield (Unlimited stays ON, existing gates/serial execution/QA/attempt limits untouched — the portal only records status).

## Technical details
- Lovable Cloud: auth (email/password), Postgres with RLS, Storage. Per the stack, the "Edge Function" is implemented as a server route `/api/public/jobs-feed` (GET with status/since, 24h signed URLs for source file + reference image; POST `/api/public/jobs-feed/status`), checked against secret `JOBS_FEED_API_KEY` (generated). Also logs last successful call for the API page.
- Tables: settings (single row, incl. hf_* fields), profiles (+ signup trigger), user_roles table + `has_role()` for admin checks (role not stored on profiles to avoid privilege escalation; profile exposes role read-only via join), packages (seeded), credit_ledger + `credit_balances` view, credit_requests, jobs (code JOB-000123 via sequence), job_internal (admin-only RLS), job_events (status-change trigger), deliverables, client_notes, feed_access_log.
- Functions (security definer): `approve_credit_request`, `reject_credit_request`, `create_job` (validates balance, inserts job + −1 ledger row atomically), `request_revision`, `refund_job`, `admin_adjust_credits`.
- View `jobs_feed` (no email/billing), admin + service only.
- Buckets: source-videos (private, mp4, 500 MB), reference-images (private, jpg/png/webp, 20 MB), deliverables (private), branding (public). Owner-folder storage policies.
- Payment abstraction `PaymentProvider` with `manual` implementation.
- zod validation, sonner toasts, loading/empty states, light/dark with accent color from settings, per-route head() using brand_name, neutral default "Studio". No model/creator wording — always "subject".
- Tests for URL platform detection and credit cost rules.
- First admin: SQL snippet documented for inserting an admin role.
