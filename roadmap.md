# Language, theme, email, signup
- [x] Spanish/English toggle on every page (remembered, browser default)
- [x] Light/dark toggle (remembered)
- [x] Buy buttons show "Coming soon" / "Próximamente"
- [x] Signup → confirm → login → dashboard → order video → admin view, tested end to end
- [ ] Welcome email + branded auth emails — blocked: needs the owner's email domain

# Admin roles, business profile, social
- [x] Admin/manager roles (Team & roles page), managers grant/remove free credits with note
- [x] Live balance, 0-credit orders blocked
- [x] Business profile (onboarding prompt + edit, shown in admin)
- [x] Connections page + Post buttons (Coming soon)
- [ ] Make Apollo first admin — blocked: needs Apollo's exact account email confirmed
- [ ] Live TikTok/Instagram posting — blocked: developer app keys + platform review

# Spoofer sync
- [x] Studio side: queue, push, retries, inbound status + final video, logs, admin flags
- [ ] Live sync — blocked: SPOOFER_SYNC_SECRET not set + Spoofer receiver not built (contract in docs)

# Captain plan 1791955207 (consolidated)
- [x] (a) DeepSeek brief helper + Seedance prompt writer (fail-closed)
- [ ] (a) live DeepSeek check — blocked: DEEPSEEK_API_KEY human entry
- [x] (b) inline player (verify only, after publish)
- [x] (c) 30s policy: unknown length → first 30 s segment; segment through feed/intake
- [x] (d) delivery receipt/email bounds; fixture-only DB script
- [x] (e) ETA label + admin overrides
- [ ] Spoofer sender/flag/receiver changes — blocked: applied in Spoofer editor
- [ ] Coordinated publish + live checks — blocked: captain release gate
- [ ] Email sending — on hold: owned email domain

## Publish request (captain, 2026-10-15)
- [ ] Retry live DeepSeek key check (first attempt timed out)
- [ ] Security scan before publish
- [ ] Publish Studio with SPOOFER_SEGMENT_FIELDS off
- [ ] Spoofer work package still pending in Spoofer editor (blocker: flags ON + live segment tests)

# Seven-item fix batch (captain 1792032883, approved)
- [ ] 1 source_sha256 in payload
- [ ] 2 canonical segment reasons + shared fixture
- [ ] 3 link jobs need uploaded source (flag ON gate)
- [ ] 5 fixed reason list in UI/validators
- [ ] 6 Stage A reserve/commit final upload (Stage B written, NOT applied)
- [ ] 7 tests; publish only after captain OK (Spoofer first)
- [ ] 4 + thumbnail: Spoofer editor only
