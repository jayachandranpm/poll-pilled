# Complete marketplace UI demo

Latest scope: all eight features are interactive using placeholder data. Real integrations are deferred. Open http://127.0.0.1:5070/ and choose **Preview** in a page header for direct links.

| Feature | Where to try it | Demonstrated behavior |
| --- | --- | --- |
| Personal earning feed | Discover → For you; Settings → Interests | Interest ordering, format/language/AI preferences, rewards, estimated time and eligibility before starting. |
| Multimodal answering | Discover or editor preview | Image comparisons, classic choices, audio playback with transcript, optional text/sample voice, rating sliders and complete reorderable rankings. |
| Decision-based builder | Create poll → a decision template → Content → Generate from a brief | Typed or sample spoken brief, explained format recommendation, format override, editable sample generation, authorship labels and interactive answering preview. |
| Audience and budget planner | Editor → Audience | Community/Boost, interests, language, response count, closing window, matching-audience example, reward/fee breakdown and total credit estimate. |
| AI insight brief | My polls → the bag campaign → Insights | Illustrative themes and disagreements, explanation sample size and buttons opening the original supporting response. |
| Paid follow-ups | Campaign → Follow-ups; Wallet | Consenting respondent selection, per-person cost, sample reply arrival, refund of unanswered invitations, participant text/voice response and added demo points. |
| Rewards and quality | Wallet; Campaign → Responses / Quality | Pending/available/simulated paid amounts, review reasons, participant appeals, staff-view moderation example, decision history and replacement arrival without another credit charge. |
| You helped decide | Campaign → Decision; Wallet | Publish a local sample outcome, display it on the poll and show the participant update with a return link. |

## Boundaries

- Default `DEMO_MODE` uses `src/demo.js`. No backend, model, payment, authentication or bot-check calls are made by the demo actions.
- All rewards, credits, fees, payouts, audience forecasts and AI outputs are examples, not real transactions or predictions.
- Changes persist under `pollpilled-ui-demo-v1` in this browser. Settings → Data → Reset example data restores the fixtures without touching Flask records.
- Voice sample buttons require no permission. Optional real microphone input uses browser permission; media stays local. Demo uploads are limited to 2 MB per file, with a storage-full message and rollback.
- No credentials are collected in demo Connections. Existing Flask code and the live adapter remain preserved for later implementation. `VITE_DATA_MODE=live` is the explicit developer switch for the previous connected adapter, not a claim of production readiness.
- Shared Solar icons, custom sky-blue unDraw illustrations, type/spacing tokens and navigation components remain in use. Circles appear only in Discover.

## Verification

Run `npm run test:demo` for local fixture-state transitions, `npm run build` for the production bundle, and `npm run test:sites` for existing packaging checks. Native Codex browser walkthrough results are recorded in `qa/ui-demo/verification.md`.
