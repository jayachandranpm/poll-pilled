# Community marketplace implementation

Current scope: connect the selected sky-blue interface to Flask/SQLite and implement the agreed participant and publisher workflows. Earlier prototype-only/session-only constraints are superseded by the user's request to implement all features robustly. Existing legacy APIs remain compatible.

Sequence:
1. Persistent accounts, preferences, drafts, polls, funded response slots and transaction ledger.
2. Matched discovery and actual classic, visual, audio, slider and ranking responses.
3. Response review, transparent pending/available rewards, appeals and funding-safe closure.
4. Publisher insights with response evidence, paid follow-ups and decision updates.
5. Templates, media/Meta connections, share/referral paths and responsive UI integration.
6. Integration/security/accounting tests and native-browser verification.

External dependencies: payment checkout/payouts stay explicitly simulated until a payment provider is configured; Meta requires user credentials; Cloudflare identity/bot services require deployed service configuration. No provider credentials or fabricated AI output will be inserted.

Completed in this implementation:
- [x] Persistent domain, finite pool reservations, immutable prices and idempotent ledger mutations.
- [x] Matched discovery, all five response formats, reviewed voice uploads, transcripts and generated-content labels.
- [x] Pending rewards, acceptance/rejection, independent appeals, automatic deadlines and unused-budget refunds.
- [x] Evidence-linked Meta briefs, paid consent-based follow-ups, campaign boosting and decision updates.
- [x] Decision templates, persistent drafts/preferences, encrypted AI settings, share/referral paths, own-data export.
- [x] Native desktop and 390/320px mobile checks; corrected scroll restoration, response pinning, image controls and textarea resizing.
- [x] 74 Python tests, four Sites packaging tests, and the production frontend build pass.

User confirmed payment integration should stay simulated. Live Meta/Cloudflare activation requires configured credentials/services; no claim of live-provider verification. Independent review has audited server-console commands and a separately protected endpoint. The operating guide is COMMUNITY_FEATURES.md.
