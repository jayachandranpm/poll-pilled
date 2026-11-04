# Connected community marketplace

The selected sky-blue interface now uses Flask and SQLite through `/api/community/*`.
The older Flask interface and APIs remain available. New marketplace records use
`pp_` tables so old polls, ledgers and uploads are not rewritten or silently merged.
There is no import of the prototype's fabricated balances or response totals.

## Participant experience

- Interest-ordered discovery, language/format filters and separate generated-question
  and generated-media preferences; direct saved/owned polls stay reachable.
- Reward, estimated time, eligibility and remaining funded places shown before entry.
- A server-issued 15-minute reservation prevents another respondent taking the last
  reward place while someone answers. Reservations survive reloads; at most three
  active reservations per account. Expired places return automatically.
- Classic/image/audio/slider answers and full ranking arrays persist. Optional text
  or recorded/uploaded voice explanations; playback and question transcripts.
- Voice recording is explicit, stops at 60 seconds and previews locally before upload.
  Uploaded response audio is validated by ffprobe. A response's voice clip is exposed
  in the public response API only if its author opted in; the publisher can hear it.
- Reward states: pending, accepted, rejected for review, appealed, independently
  declined. Accepted earnings can be redeemed; pending/disputed amounts cannot.
- Paid, opt-in follow-up invitations appear in the wallet, with time/reward/deadline.
- Publisher decision updates appear on polls and in participant wallet activity.
- Saved polls, public anonymous identity/tagline, preference persistence, own-data export.

## Publisher experience

- Decision templates: choose a design, test an idea, understand why, set priorities.
- Persistent draft save, five formats, local image assets/uploads, audio upload/recording,
  text alternatives, preview, circle/language, campaign duration and audience controls.
- Server-calculated effort estimate and itemised reward/platform budget. Community
  publishing reserves a finite pool; paid publishing reserves purchased demo credits.
- Explicit collection/reuse acknowledgement and per-component generation provenance.
  Known generated content and bundled generated images retain labels on publication.
- Response review with reasons, participant appeal, independent resolution audit trail.
  Valid opinions must be accepted regardless of whether the publisher agrees.
- 48-hour automatic acceptance when the publisher does not review a pending response.
- Actual accepted counts, first-choice distributions and average ranking positions.
- Meta insight briefs use accepted explanations/transcripts, retain their source IDs,
  include sample size and generation time, and persist. Unknown citations are rejected.
  Grounding checks validate references, not the factual correctness of every model claim;
  users can inspect the evidence. No synthetic summaries appear when disconnected.
- Paid follow-ups require both account-level and response-level consent; reserve 2 credits
  per invite (100 participant points + 1 platform credit). Private replies earn once.
  Invitations close after seven days; unused invitations can be closed/refunded early.
- Pause/resume, end/refund unused places, boost a community poll into paid distribution,
  and publish decision updates. Accepted/pending/disputed places retain their funding.

## Meta and Cloudflare

The existing encrypted, server-side Meta Model API adapters are connected through
Settings → Connections. Rephrasing preserves authorship; generation is labelled.
The editor supports spoken-brief transcription, draft generation, rephrasing,
image generation/comparison, audio transcription and Wit.ai speech generation.
Publishers can transcribe response audio before generating insight briefs.
Live provider behavior still needs the user's credentials and entitlement checks.

Existing Cloudflare Access JWT and Turnstile server validation protects the new API
when configured. Browser writes obtain a fresh Turnstile token. Local mode remains
explicitly a cookie identity, not verified identity. Account-level write/publication/
AI limits and reservation caps supplement edge controls. They do not constitute
production fraud detection, independent identity verification or content moderation.

## Money and growth

Per the user's explicit decision, payments remain **simulated**:
100 points = ₹1 demo value; one purchased credit = ₹1 demo value. The wallet always
identifies simulated purchases/redemptions. Redemption minimum is 500 points,
with a disclosed 5% fee; integer accounting avoids floating-point rounding drift.
Pending rewards cannot be redeemed. Mutations and idempotency receipts commit in
one `BEGIN IMMEDIATE` transaction; duplicate requests cannot mint extra funds.

Share links open a specific poll. Referral codes link before the invitee's first
answer. A 200-point reward releases from the finite community pool only after three
accepted polls under a Cloudflare-verified account. Cookie-only accounts cannot
unlock referral rewards. This rule still requires real fraud review before paid launch.

## Running and serving

Development: Flask on 5058 (`PORT=5058 python3 app.py`); the existing Vite server on
5070 proxies `/api` and `/uploads`. The agent runs these for local preview.

After `npm --prefix prototype run build`, Flask also serves the connected app at
`/community`, with the compiled `/assets/*`. This can run under a normal production
WSGI server with persistent database/uploads and a stable secret. The legacy `/`
page stays intact. The old Sites Worker package still builds, but is frontend-only;
it must not be deployed as a standalone functional marketplace without the Flask API.

Settlement is lazy on marketplace reads/writes during local use. On a deployed
service, schedule `flask --app app settle-community` regularly to settle deadlines
without waiting for traffic. No recurring automation was created by this task.

Independent dispute operations are intentionally not available to ordinary accounts:

```
flask --app app community-reviews
flask --app app community-review RESPONSE_ID --decision accept --reason "Evidence confirms the response answers the question."
```

The server-console operator can accept or decline and an audit entry is recorded.
The optional HTTP moderation endpoint additionally requires
`COMMUNITY_MODERATOR_TOKEN` in its `X-Moderator-Token` header, plus normal session/CSRF
and configured Cloudflare checks. Never put this token in frontend code.

## Verification

`python3 -m unittest discover -s tests -q`
`npm --prefix prototype run build`
`npm --prefix prototype run test:sites`

New integration cases cover funded-slot concurrency, pending/accepted/review states,
48-hour settlement, campaign expiry/refunds, boost accounting, full rankings,
replay-safe purchases/redemptions, consent/ownership, transcript/media permissions,
AI source validation, rollback, data export and referral identity restrictions.
Native Codex browser checks cover answering, draft reload, publishing, decision
updates, wallet and settings at desktop and phone widths. No screen recording used.
