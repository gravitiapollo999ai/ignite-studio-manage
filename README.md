# Ignite Studio Manage

Build a complete, production-ready white-label web app for a done-for-you AI video service. Use Supabase (auth, Postgres with RLS, Storage, one Edge Function). Do everything in this single build; don't ask follow-up questions—use sensible defaults.

BRANDING (white-label)
- Neutral, clean, modern design (light/dark, single accent color). No hardcoded brand name: read brand_name, logo_url, accent_color, support_email from a `settings` table (single row) and use them in header, footer, emails text, and page titles. Admin can edit them and upload a logo. Default brand_name "Studio".

ROLES & AUTH
- Supabase email/password sign-up + login + password reset. `profiles` (id = auth.users.id, full_name, company, phone, role 'client'|'admin', created_at). Auto-create profile on sign-up via trigger. First admin set manually in DB; admin routes guarded.

DATA MODEL (create migrations + RLS; clients only see their own rows)
- settings: brand_name, logo_url, accent_color, support_email, credits_per_second (numeric, default 1), min_package_videos (default 10), default_turnaround_hours (default 72), max_tries_per_video (default 2).
- packages: id, name, videos, credits, price_label (text, e.g. "USD 290"), description, active, sort_order. Seed: "Starter – 10 videos" (150 credits), "Growth – 25 videos" (375), "Scale – 50 videos" (750).
- credit_ledger: id, user_id, delta (int, + or −), reason ('admin_grant'|'job_reserve'|'job_refund'|'adjustment'), job_id nullable, credit_request_id nullable, note, created_at. Balance = SUM(delta) via a view `credit_balances`. Never store balance as an editable field.
- credit_requests: id, user_id, package_id, credits, status ('pending'|'approved'|'rejected'), client_message, admin_note, payment_provider (text nullable, reserved for 'stripe'), payment_reference (nullable), created_at, decided_at, decided_by. Approving inserts a +credits ledger row in the same transaction (Postgres function `approve_credit_request(id)`, admin-only, security definer).
- jobs: id (short human code too, e.g. JOB-000123), user_id, source_type ('tiktok'|'youtube_shorts'|'youtube'|'instagram_reel'|'upload'), source_url, source_file_path, clip_start (seconds, nullable), clip_end (nullable), target_duration_seconds, subject_type ('person'|'product'|'business'), subject_name, business_type, reference_image_path, notes, estimated_credits, estimated_turnaround_hours, status ('submitted'|'in_review'|'prompt_ready'|'generating'|'qa'|'delivered'|'revision'|'cancelled'), try_number (1 or 2), created_at, updated_at.
- job_internal: job_id PK, internal_prompt (text), internal_notes, updated_at. ADMIN-ONLY via RLS — clients must never be able to select this table; never join it into client queries.
- job_events: id, job_id, status, message (client-visible), created_by, created_at. Insert one automatically on every status change (trigger).
- deliverables: id, job_id, file_path, file_name, try_number, created_at.
- client_notes: id, client_id, author_id, note, created_at (admin-only).
- Storage buckets (private): source-videos (MP4, max 500 MB), reference-images (jpg/png/webp, 20 MB), deliverables, branding (public, for logo). Downloads via signed URLs.

CLIENT PAGES
1. Landing (public): brand hero, "How it works" (send a link or video → we adapt it to your business with your person/product → receive finished 1080p videos), packages from DB, CTA sign up.
2. Dashboard: credit balance card, pending credit requests, recent jobs with status badges, buttons "New video" and "Request credits".
3. Credits page: package cards (min package = settings.min_package_videos, show it), "Request credits" → modal with package + optional message → creates pending credit_request; show history of requests and ledger. Structure code with a `PaymentProvider` abstraction (current implementation = 'manual') so Stripe Checkout can be plugged in later without UI changes.
4. New job (stepper):
   a) Source: tabs "Paste link" or "Upload MP4". Validate and auto-detect platform from URL (tiktok.com, youtube.com/shorts, youtube.com/watch | youtu.be, instagram.com/reel). For regular YouTube show optional Start / End time inputs (mm:ss). For uploads, read duration in browser via a <video> element.
   b) Subject: subject type (person/product/business), subject name, upload reference image (preview), business type (select: restaurant, construction, real estate, beauty/salon, fitness, retail/e-commerce, clinic/health, automotive, education, other + free text), notes textarea.
   c) Review: target duration (default = clip length if known, else select 10/15/20/30 s, max 60), Estimated cost = ceil(duration × credits_per_second) credits, estimated turnaround = default_turnaround_hours, current balance and balance after. Include "Includes up to 2 tries per video." Block confirm if balance insufficient (link to Request credits).
   On confirm: Postgres function `create_job(...)` atomically inserts the job and a negative job_reserve ledger row.
5. Job detail: horizontal/vertical timeline Submitted → In review → Prompt ready → Generating → QA → Delivered, with timestamps from job_events and client-visible messages; show "Revision (try 2 of 2)" state when applicable. Deliverables list with Download buttons. When delivered and try_number = 1, show "Request revision" (reason required) → sets status 'revision', try_number 2. Hide revision button after try 2.
6. Jobs list: filter by status, search by code.
7. Account: profile edit, password change.

ADMIN PANEL (/admin)
- Overview: counts by status, pending credit requests, jobs due soon (created_at + turnaround).
- Jobs table: filters (status, client, source type, date), search; click → admin job detail: all client fields, source link/open file, reference image, status dropdown + client-visible message (creates job_event), INTERNAL PROMPT large textarea and internal notes (job_internal, clearly labeled "Internal – never shown to client"), upload deliverables (multi-file, tagged with try_number), refund credits button (inserts job_refund).
- Credit requests: approve (calls approve_credit_request) / reject with note.
- Clients: list with balance, job count; client detail with per-client notes, manual credit adjustment (+/−, reason), their jobs.
- Packages CRUD and Settings (branding, credits_per_second, min package, turnaround, max tries).

INTEGRATION FOR PARTNER PRODUCTION TEAM
- SQL view `jobs_feed` (job_id, code, status, try_number, source_type, source_url, source_file_path, clip_start, clip_end, target_duration_seconds, subject_type, subject_name, business_type, reference_image_path, notes, created_at) — no client email/billing.
- Edge Function `jobs-feed`: GET returns JSON from jobs_feed (query params: status, since) with 24h signed URLs for source file and reference image; auth via header `x-api-key` compared to secret JOBS_FEED_API_KEY. POST /status {job_id, status, message} to update status. Document usage on an admin "API" page with a copyable curl example.

QUALITY
- Responsive (mobile-first for clients), toasts for all actions, loading/empty states, form validation (zod), TypeScript types from schema. No payment integration now. Don't use model/creator names anywhere—always "subject".


CONTENT REFERENCE
- This is a NEW, separate project. Use https://fluent-vid-studio.lovable.app only as a content reference: reuse its AI video process, use cases and service wording (rewritten for this brand) on a public landing page with How it works, Use cases, Packages and Sign up sections. Do not copy its agency branding.


[Ai CEO · Graviti AI] PRICING CHANGE for Prompt 1 (Apollo): add this to the SAME first paste, not as a separate edit. Pricing is per video, not per second. 1 client credit = 1 finished video, up to 30 seconds at 1080p. Set the max video length to 30s and the resolution to 1080p. Clients may choose shorter videos but pay the same 1 credit. Packages: Starter = 10 videos (10 credits), Growth = 25 (25), Scale = 50 (50). Replace credits_per_second with credits_per_video (default 1) and max_video_seconds (default 30). The cost preview shows "1 credit per video (up to 30s, 1080p)".

[Ai CEO · Graviti AI] ADD to Prompt 1 (Apollo), in the same paste: a "Compare the cost" section on the landing page and the Packages page. It compares doing it yourself on Higgsfield with us. Higgsfield: a 30s video at 1080p on Seedance uses 330 credits, about $16 per try on the Plus plan ($59 for 1,200 credits) or about $14 on Ultra ($129 for 3,000), and you write the prompts and redo failed tries yourself. Us: one finished video for one credit, our prompts, up to 2 tries included. Show it as a simple table, with our price filled in from each package's price_label. Store every Higgsfield number in settings (hf_credits_per_30s=330, hf_plus_price=59, hf_plus_credits=1200, hf_ultra_price=129, hf_ultra_credits=3000) so the admin can edit them, and calculate the per-video cost from those numbers.

DIRECT HUMAN PIPELINE CLARIFICATION (takes precedence):
This new site is a client intake portal for the SAME existing CaboEnt video production system. Lovable should create the required backend/database. Each production handoff must include the source video/link AND the client's uploaded subject/model reference image together with the job ID and specifications, so CaboEnt receives and retains the correct reference for that job. Provide an authenticated production feed and a clear admin handoff/download path; do not claim a live CaboEnt connection without configuring and verifying it. Keep existing Higgsfield production on Unlimited ON; client credits are service credits, distinct from Higgsfield generation billing. Do not add pay-per-generation calls or switch production out of Unlimited. Preserve existing generation gates, serial execution, QA and attempt limits. No publication or payment connection now. Label the editable Higgsfield comparison figures as estimates based on configured credit pricing, not the billing mode used by our production pipeline.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ignite-studio-manage.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8ffe5eb9-ace2-4586-84af-03eac31b88d3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
