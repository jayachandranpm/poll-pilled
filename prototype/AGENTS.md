# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Selected visual direction
- Main app uses fourth image of the latest set (conversation workspace): narrow icon rail, lavender circles sidebar, central poll, right perspectives. Source exec-760b17cf-61f6-431c-9f28-87cad34d642a.png.
- Poll editor uses fifth image (question canvas): floating left format toolbar, center editable poll, right inspector, bottom publish bar. Source exec-ab4078ea-d6ea-4b1b-8301-e70f880685b8.png.
- Use local Solar SVGs and customized unDraw assets. No blur. Bigger readable type, minimal copy, light surfaces.
- All data and payment/AI interactions are simulated. Keep the existing Flask app separate. Native Codex browser only for verification.

## Current design system (user direction, 2026-10-29)
- Use sky blue consistently across the entire app and editor. This supersedes the original purple main app / teal editor palettes.
- Keep the selected page layouts, but prioritize readable text, predictable control behavior, and mobile usability.
- `src/tokens.css` owns the palette, type scale, radii, spacing, and control sizes. Do not add page-specific palette overrides or arbitrary font sizes.
- `src/components.css` owns reusable component treatments. `src/ui.jsx` supplies Button, IconButton, Select, Segmented and Toggle. Reuse these throughout.
- Keep Solar icons, sky-customized unDraw illustrations, light surfaces and no background blur.

## Navigation and interaction polish (2026-10-29)
- Sidebar destinations use `NavButton` with visible custom hover/focus labels, Escape dismissal, and `aria-current`; do not restore native title-only tooltips.
- Use `Breadcrumbs` for nested settings, poll sections, the editor, and polls opened from lists. Parent links must return to the correct source/section. Top-level screens do not need artificial breadcrumbs.
- Keep section, circle, selected poll, and search context in `navigation.js` URLs so browser Back/Forward remains meaningful.
- Mobile settings must show every section without a hidden horizontal tab strip. Use `SectionNav` and the shared responsive treatment.
- Keep touch targets at least 44px for primary controls and switches. Preserve readable wrapping, aligned card actions, and viewport-safe dialogs.
- Drawers use `usePanelFocus`; only the topmost dialog traps focus or handles Escape. Restore focus to the opener when closing.
- Review all main views and relevant narrow-screen states in the native Codex browser after shared component changes.

## Contextual circles (2026-10-29)
- Render the circles sidebar and mobile circles drawer only in Discover. Do not put community navigation on Wallet, Settings, Saved polls, or My polls.
- Keep the slim app rail on those pages; expose creation and the points balance there when the circles panel is absent.
- Reclaim the sidebar column, while retaining the shared maximum content width and readable line lengths. The standalone editor keeps its own canvas/tools/settings layout.

## Functional marketplace (2026-10-29)
- The user's request to implement all agreed features supersedes the earlier simulation-only requirement. Connect this interface to Flask while preserving legacy routes and data.
- Persist product state on the server. Financial values, eligibility, provenance, review status and authorization must be enforced server-side.
- Keep external payment execution explicitly simulated until a payment provider is configured; show disconnected AI honestly.
- User confirmed that credit purchases and participant cash-outs should remain simulated; payment-provider integration is deferred intentionally.

## Complete UI demonstration (latest user direction, 2026-10-29)
- Prioritize a complete, interactive UI for all eight agreed features using clearly labeled placeholder data. Real integrations are deferred.
- Default the preview to an isolated demo data adapter; preserve existing Flask records and live adapters for later. Demo actions must not send API/model/payment requests or require credentials.
- Populate participant and publisher flows so insights, follow-ups, reviews, appeals, replacements and outcomes can be explored immediately.
- Use the same controls for interactive previews and actual answering. Preserve sky-blue tokens, contextual circles, Solar icons, customized unDraw assets and mobile accessibility.

## Discover and Perspectives repair (2026-10-29)
- Format selection and circle changes preserve the chosen Question/Feed view. Layout, format, circle, query and detail context belong in URL state and must survive Back/Forward and reload.
- Keep one aligned Discover toolbar; provide clear filter recovery. Do not force Feed from a format choice or force Question from circle navigation.
- Perspectives uses a compact conversation layout with readable comments, contextual replies, response notes, evidence-linked insights and a small composer. On phones it fills the screen; tablet overlays trap focus and close with Escape.
- Verify these flows at desktop, tablet, 390px and 320px before reporting them fixed.

## Product maturity pass (2026-10-29)
- The wallet is a concise balance overview and action inbox. Open follow-up and appeal forms in focused dialogs; keep demo transition controls inside disclosure sections.
- Publisher detail opened from My polls shows the management workspace first, with a collapsed respondent preview below. Do not add the circles sidebar to this management context.
- Use shared compact poll rows, sky-blue audio controls, and grouped settings. Show the Interests save bar only while preferences differ semantically; selection order is not a preference change.
- Keep mobile headers free of competing labels, visible text alternatives, and touch targets of at least 44px. Editor option textareas must grow to show their full text.

## Discover participation flow (2026-10-30)
- Start new choice, visual, audio and rating responses without a preselected answer. Require an explicit choice before reserving a place.
- Keep optional Text / Voice explanation controls visible. Preserve both attachments through reservation and mode changes; never silently publish private audio.
- Show response progress, a status-aware reward receipt, evidence-linked results, and a public conversation preview. Surface paid follow-ups only when an open invitation exists.
- Use brief selection, result and reward animations; respect reduced motion. Expired reservations must let people reserve again without losing their draft.
- State refresh must not reset the participant's scroll position. On completion, bring the receipt into view and move keyboard focus to it.

## Wrenly reference preference (2026-10-30)
- User likes the supplied Wrenly employee-insights screenshot for its simple, elegant presentation. They asked to identify its assets and design system; this does not yet select a wholesale restyle.
- Reference characteristics: warm neutral sidebar with visible navigation labels, white surfaces, fine borders, generous card padding, dark readable text, rounded cards, and restrained pastel data colors.
- Outfit is confirmed in Wrenly's public app and marketing CSS. Tabler outline components are present in its public app bundle; a Phosphor Regular support icon was also matched exactly. Individual screenshot icons and unpublished layout tokens remain inferred.
- Poll Pilled's sky-blue preference and prior Solar requirement remain in effect until the user chooses a change. Do not mistake a component library (Mantine was observed in Wrenly) for a complete brand design system.

## Wrenly implementation (latest user direction, 2026-10-30)
- Restyle every non-editor page to the supplied Wrenly screenshot: Outfit, official Tabler outline SVGs, warm neutral labeled sidebar, white canvas/cards, very light borders, generous spacing and green accents. This supersedes the old sky/Solar direction outside the editor.
- Preserve the create/edit poll page visual design exactly: Inter, Solar and sky blue. Keep reference theme tokens, CSS and icon context isolated from the editor including its dialogs.
- Preserve existing interactive placeholder flows. Circles appear only in participant Discover, never in Wallet, Settings, Saved or the publisher workspace.
- Use `src/reference.css` for scoped reference treatments and `src/tokens.css` for its tokens. Shared controls inherit their route appearance.

## Editor included (latest steering, 2026-10-30)
- User explicitly expanded the Wrenly/global restyle to the create/edit poll page too. Apply Outfit, Tabler SVGs, warm neutrals, green actions and shared components there as well.
- Retain the editor canvas, format toolbar, inspector and bottom action bar layout. The earlier instruction to preserve its sky-blue visual design is superseded.

## Live Meta integration (latest user direction, 2026-10-30)
- AI now uses Meta Model API through Flask even while the marketplace uses local demo data. Do not restore fake AI responses or collect keys in localStorage.
- Connections settings saves an encrypted per-session key on the server. `ai_runtime.py` owns the separate vault key, encrypted 24-hour result cache, usage ledger, duplicate guards and estimated daily budget (default $1).
- Keep payments/reward balances simulated and separate from Meta usage. Use standard Muse Spark, not Contributor mode or automatic expensive-model fallback.
- Only explicit AI actions send prompts/media. Text-to-speech is unavailable through the Meta Model API key; preserve recording/upload alternatives and be clear about that limit.
- Run Python tests and frontend bridge tests when changing these boundaries. Never paste a real credential into tests, source, screenshots, logs or chat.

## Poll Pool / Ant Trial design (latest user direction, 2026-10-30)
- The user explicitly selected the local Ant Trial / Poll Pool design for Poll Pilled. This supersedes the Wrenly palette, Outfit typography, wide sidebar and identity strip on every route, including the editor.
- Source: `/Users/jaya-20646/Projects/Ant Trial/pollpool/`, inspected at port 8770. Follow its 640px content column, system font, pale blue canvas, white continuous feed, compact headers, blue #0A66C2 controls and floating pill navigation.
- Use the exact exported Central icon subset for shared navigation/menu controls, with the existing Solar outline catalog for poll-specific controls absent from that subset. Keep locally customized sky-blue unDraw illustrations and existing poll imagery.
- Circles belong in the Discover header selector. The mobile pill navigation stays visible at the bottom, with safe scroll space. Retain breadcrumbs and custom keyboard-accessible dropdowns with one selected check.
- Keep Poll Pilled's earning points and publishing credits separate, and retain its richer publisher/quality/appeal/insight flows. The editor uses Poll Pool’s single-column studio, format tiles, live preview and collapsible audience settings.
- Meta credential security, live AI routing, budget/cache controls and simulated payment boundaries remain unchanged. No AI calls should occur for visual QA alone.

## Exact Poll Pool controls (latest steering, 2026-10-30)
- User explicitly said to follow Poll Pool as it is, throughout the app, without overriding its design. Do not introduce a new interpretation or return to earlier Wrenly/editor designs.
- `src/pollpool-controls.css` is the single control treatment mapped from the local source’s `app.css`, `theme.css` and `studio.css`. Preserve its system font, 36px buttons, 44px dropdown triggers, 46px fields, 22px selection marks, 2px underline tabs and 4/2-column studio format tiles.
- Dropdown menus use the source geometry, viewport positioning, a single exported Central check, and existing keyboard semantics. Consent and follow-up checkboxes use the source 22px square control, including keyboard focus.
- Poll Pilled-only features (Meta tools, separate reward/credit balances, five settings sections, quality review) reuse these primitives. Keep all business handlers and secure Meta boundaries intact.

## Direct creation and Poll Pool Discover (latest steering, 2026-10-30)
- Create, Ask a poll, the composer and empty-draft CTA open the editor directly. Do not reintroduce the template-selection popup or another gate before editing.
- Discover is a single feed, as in Poll Pool. Do not restore the Question/Feed toggle or the pre-answer conversation/“Join in” panel. Opening a feed card shows the focused poll; Browse polls returns to the feed.
- Use Poll Pool’s For you / Top rewards / Quick polls sorting and compact format/minimum-reward filters with one poll count. Keep the marketplace’s reward unit as points, separate from publishing credits. Preserve these filters in URL/back navigation.

## Bluesky reference (latest user direction, 2026-10-31)
- User explicitly replaced Poll Pool with the live Bluesky design across the entire app, including editor, dialogs, settings and mobile navigation. Match the captured source rather than mixing earlier visual systems.
- Light is the default; user requested a dark-mode option. Use the locally bundled InterVariable font and official MIT-licensed Bluesky icon exports, with license and font notices preserved.
- Source evidence lives in `qa/bluesky/source/`: 600px center column, desktop navigation on the left, 300px discovery rail on the right, flat surfaces, fine borders, pill actions, 8px dialogs and menus, mobile bottom bar plus drawer.
- Preserve Poll Pilled's anonymous identities, multimodal polls, participant points, publisher credits, Meta boundaries and functional marketplace flows. Create still opens editing directly; no template gate. Do not copy third-party account content into demo fixtures.

## Poll-first product (latest user direction, 2026-10-31)
- This is a polling workspace, not a social network. Participant flow is answer → unlock results → react or report. Remove comments and pre-answer results, including API leaks. Keep explanations private to the publisher.
- Use the desktop width for poll cards and a spacious creation canvas. Retain consistent Inter, sky blue, light/dark themes, accessible controls and reduced-motion support.
- Support classic, image, A/B, audio, video and interactive polls (scale, ranking, this-or-that and allocation). Share working controls between editor preview and answering.
- Followed topics match publisher tags. Respect format, language and AI-content preferences. Rephrased human questions stay human; generated questions, images, audio/video are labelled.
- Generated voice uses Cloudflare Workers AI (user confirmed), with server-encrypted credentials, explicit generation and an AI voice label. Meta handles existing AI tasks. No paid calls for QA.
- Cloudflare Turnstile requires server verification. Keep security state honest until configured; do not imply local demo storage is production fraud-proof.

## Search and creation controls (latest steering, 2026-10-31)
- Use one permanent Discover search field, aligned with format/reward filters and the poll-card edges. No duplicate right-rail search or nested input backgrounds/borders.
- Keep the page focused on polls; avoid a marketing intro that pushes answers below the fold. Mobile uses a full-width search field and an aligned second filter row.
- New poll / Create uses the shared poll-choice icon (official Bluesky BulletList), including desktop, mobile and drawer entry points. Do not restore the pencil icon for poll creation.
- Meta TTS was rechecked: Wit.ai / Voice SDK supports synthesis with a separate token; the user's dev.meta.ai Model API key currently supports transcription only. Keep the explicitly chosen Cloudflare voice connection unless the user requests a provider switch.

## Layout consistency (latest steering, 2026-10-31)
- Discover uses measured masonry rows: the next poll fills space beneath a shorter card. Preserve poll DOM order, focus and answers as media or responses change height. Mobile remains one column.
- My polls has one title and compact, aligned Live/Drafts tabs. Remove redundant breadcrumb/title stacks; use a single back button for details.
- Reserve the topic rail for the participant Discover feed. Other pages reclaim that width; do not add generic help rails or repeated balances.
- Use `workspace-layout.css` for shared page geometry and responsive corrections. Compact settings headers, sensible form widths, and consistent list/card insets take precedence over legacy layout overrides.
- Show preference Save actions only when values changed. Do not fill empty space with fake records, marketing copy, or duplicate controls.


## App-wide consistency review (latest steering, 2026-10-31)
- Profile belongs only under Settings. Do not restore a separate sidebar or drawer Profile entry; Settings must remain active on all its subpages.
- Keep one persistent creation entry per navigation surface. Avoid repeating My polls header Create or footer/drawer Privacy/Security links already in Settings.
- Multi-select topics/formats use square checkmarks. Exclusive answer choices keep radio marks; dropdown lists show exactly one selected check.
- Use SectionNav for publisher subpages and My polls. Horizontally scrolling navigation must reveal the active item without moving the page vertically.
- Mobile navigation highlights only the current destination. Keep labels on one line, safe-area padding, and an explicit drawer close button.
- Shared Modal owns its fixed header, scrolling body and optional persistent footer. Keep dialog receipts inset and disabled actions readable in light/dark modes.
- Keep compact wallet clear states, responsive audience fields, aligned editor gutters and useful empty states. Preserve real records and draft content; never manufacture data to fill blank space.


## UX audit fixes (2026-10-31)
- Preserve unfinished respondent choices, explanations, recordings and interactive progress per poll across feed/detail navigation; keep this temporary private data in memory, not new browser storage. Clear it only after a confirmed submission or incompatible poll change. Restore feed scroll on return.
- Discover keeps compact topic/format/provenance metadata, inline answer controls, expandable topic filters and a predictable Saved shortcut. Name empty-state recovery after the active constraint without resetting personal interests.
- Keep one private explanation composer with Text, Record and AI voice modes. Check voice readiness before generation; retain text/media after failure. Report reasons must start unselected. Results and reward status are separate, with feedback/appeal links.
- Use percentages for allocation exercises, precise numeric inputs with rebalancing, reversible pairwise rounds and predictable focus. Shared controls, 150ms state / 200ms panel motion and reduced-motion rules apply throughout.
- The editor keeps an accessible question field, section jumps, respondent preview and a persistent action dock. Serialize autosaves, show saving/error/retry states, and make AI rephrasing reviewable before applying it. Show remaining estimated allowance without automatic paid calls.
- Publishing review distinguishes community funding limits from delivery guarantees and explains reuse, rewards and fees before consent. Wallet uses the same actionable-count definition as navigation, separates passive review status, links to receipts and shows gross/fee/net redemption values.
- Publisher tools prioritize review cases, retain evidence beside findings, offer contextual follow-up recipient selection with a review step, preview decision updates and separate campaign health from ending/refunding controls. Keep moderator examples inside explicitly labeled demo controls.
- Settings groups short account preferences, uses a section list on desktop and drill-in pages on mobile, previews interest matching and typography, and separates Meta, voice and bot setup from personal preferences. Capability diagnostics hold only session-local status/timestamps; a saved key is not proof that a model works.
- Focused mobile answering and editing use contextual action placement instead of competing global bottom navigation. Keep a clear exit. Test meaningful changes at desktop, tablet, 390px and 320px with the native Codex browser.
- Completion evidence for the 38-item review is in qa/ux-fixes/index.html and completion.json. This pass does not certify physical-phone behavior, screen-reader compliance or live provider access. Keep real money simulated and never spend API quota solely for QA.


## Bluesky spacing only (latest user direction, 2026-10-31)
- The user specifically limited this pass to component and element spacing. Do not treat it as authorization to replace layouts, fonts, icons, colors, radii, content or behavior.
- `src/bluesky-spacing.css` is the final spacing layer; named `--bsky-space-*` tokens in `tokens.css` mirror the captured ALF scale. Keep spacing declarations isolated from visual and functional changes.
- Measured shared values: 52px page headers, 20px desktop content insets, 16px mobile content insets, 48px navigation rows, 8px icon/label gaps, and 4/8/12/16px internal intervals. Preserve 44px touch targets and safe-area spacing.
- Maintain the existing wider poll workspace and task docks. Do not restore social-feed structure just to copy the reference's page width.
- The full-screen mobile answer preview must keep width 100% and zero horizontal margin; its old negative margin clipped the intended dialog inset.
- Source measurements, screenshots and comparison evidence: `qa/bluesky-spacing/`; scoped validation: `design-qa.md`.


## Bluesky component fidelity (latest user direction, 2026-10-31)
- The latest request expands the previous spacing-only pass to shared elements and components. Use `bluesky-components.css` as the final component contract; avoid adding competing route-specific control skins. The existing `bluesky-spacing.css` still owns shared spacing.
- Discover topics are visible, horizontally scrollable direct filters. Do not restore a Topics popup, disclosure or expanding chip cloud inside the utility row. Keep the active topic in view; editing followed interests is a separate labelled control.
- Audio transcripts use explicit expanded state with `aria-expanded`, `aria-controls` and a padded text region. Playback, answer updates and responsive resizing must not collapse it. Keep the play/pause label on one line. ResizeObserver must continue resizing masonry rows when transcript height changes.
- All Select menus render into the app theme root, above dialog content; preserve outside-click dismissal, Escape focus return, Home/End/arrows, type-ahead and Tab behavior. Match the source's single 20px radio selection indicator, 13.1px/600 labels, 36px desktop rows, 8px panel corners, 4px item corners and 8px/10px item insets. Touch rows remain at least 44px.
- Match shared 44px pill actions, 48px segmented groups with 40px inner controls, 20px page titles and 52px headers. My polls and Saved use continuous divider-separated list rows. Poll-only media, wallet cards and creation canvases adapt these controls while preserving the wider polling workspace and user-requested theme previews.
- Current source captures, exact metrics, comparisons and interaction checks are in `qa/bluesky-components/`. Preserve light/dark support, poll-first features, draft data and credential/payment boundaries.

## Bluesky composition and themed illustrations (latest user direction, 2026-10-31)
- The user again requested the full Bluesky design and explicitly rejected the prior result. This supersedes the earlier wide-workspace, masonry and spacing-only constraints. Use a 600px content column (602px including borders), 208px desktop navigation, and a 300px contextual rail. At 1280px the navigation collapses to icons; tablet and mobile retain a single content column.
- Discover is a continuous divider-separated list, not masonry or floating outer cards. Keep inline multimodal answering and locked results; do not add comments, social posting, or source-account content. The brand row is 45px, feed tabs 47px, other page headers 52px. Source captures and normalized comparisons are in `qa/bluesky-layout/`.
- Settings is one directory with full-width drill-in pages on every screen size. Do not reintroduce a second settings sidebar. Keep theme preview cards, anonymous identity, and the separate operator setup section. The optional topic rail belongs only to Discover; the editor rail contains the respondent preview.
- Shared geometry is in the final composition section of `workspace-layout.css`; shared spacing and controls remain in `bluesky-spacing.css` and `bluesky-components.css`. Preserve the exact InterVariable font and bundled Bluesky icons/licenses.
- All three customized unDraw illustrations live in `src/assets/illustrations/`, retaining the original vector geometry. `Illustration` renders only these trusted local assets inline, namespaces SVG pattern IDs and applies decorative semantics. Use shared `--art-*` tokens from `tokens.css`, including dark-mode variants. Do not use the older hardcoded-color public SVG images in app components.
- Keep dropdown keyboard behavior, direct topic filters, persistent transcript expansion, answer drafts and all existing money/provider boundaries. Visual QA must not submit polls, publish, redeem, or spend provider quota. The current build and 49 existing tests pass; see `design-qa.md` for scope and evidence.

## Wallet attention badge (2026-10-31)
- Navigation badges belong inside the shared 24px `NavigationIcon` wrapper on desktop, mobile and drawer surfaces. Never position them relative to the whole menu button.
- Keep the 18px badge, 14px line height, 11px tabular numerals and theme-colored outline. Hide zero, cap the visible label at `99+`, and retain the full actionable count in the button description. Do not inherit the navigation label's line height.
- The badge shows actionable wallet items, not points. Keep `actionableCount` unchanged unless the business rule changes.

## Settings refinement (2026-11-01)
- Settings layout is owned by `src/settings.css`, loaded after shared Bluesky controls. Use `SettingsHeading`, `SettingsLink` and `PreferencesFooter` from `SettingsControls.jsx`; avoid adding another unrelated settings skin to legacy stylesheets.
- Keep the compact actionable anonymous identity, preference summaries, direct Platform setup row and single-column drill-in structure. Provider Back actions return to Setup; other sections return to Menu.
- Interests uses compact selections with one mark; no duplicate selected-topic chips. Preserve custom AI question/media preferences and selection validation. Save/discard actions remain reachable above mobile navigation.
- Settings mobile scroll padding matches the 64px bottom navigation; the sticky preferences footer uses bottom:0. Do not add a second navigation-height offset. At <=360px, theme labels/indicators stack and preference options use one column to accommodate larger text.
- Appearance remains automatic and local; other personal preferences use explicit save/discard. Provider capability details are disclosures and must never trigger automatic paid checks.

## Isolated visual prototype and latest reference (2026-11-01)
- The user requested an HTML prototype first. `poll-deck.html` and `src/deck-prototype/` are an isolated, interactive, in-memory prototype. Do not connect its sample answers, publishing, AI or payments to the existing app's adapters.
- Latest selected visual supersedes the pill-sidebar mock: final dashboard from https://x.com/heydamir/status/2115063463063998736, with exact screenshot saved at `qa/ember-reference/source.png`. Use the final restrained charcoal state, not the purple/glowing before-state.
- Reference tokens: Inter-like typography (local InterVariable is the closest available match), mono supporting labels, full-height dark sidebar, inset search, fine neutral borders, soft inset selected navigation, restrained colorful chart lines. Keep Poll Pilled branding and poll-first product semantics. Retain a working light option.
- `src/deck-prototype/ember.css` owns this prototype's reference treatment; existing application source styles and data remain separate. Dashboard chart data, balances, creator actions and results are clearly sample data.
- Responsive changes are adaptations because the supplied reference is a cropped desktop view. Mobile uses a compact bottom navigation and a focus-managed menu; focused poll answering hides global navigation.
- Preserve custom unDraw source geometry; recolored assets for dark prototype are under `public/assets/ember/`. Use local Solar icons and real generated photo/card assets. No background blur.


## Threads HTML prototype (latest user direction, 2026-11-01)
- The user selected the live Threads page as the latest visual source, superseding Ember and the earlier Poll Deck mock. The final wording requested Threads colors; follow its monochrome dark reference, with working light/automatic modes.
- Continue the requested isolated HTML prototype at `poll-deck.html`, `src/deck-prototype/`. Keep the existing main application, Flask adapters, credentials, model calls, payments, and records separate. Prototype answers, drafts, reports and publishing are in-memory samples.
- `threads.css` is the prototype's only loaded stylesheet. Do not import the archived `styles.css` or `ember.css` into this entry. Shared views are in `threadViews.js`; behavior and sample-state orchestration are in `main.js`.
- Source evidence: `qa/threads-reference/`. At 1135×853: 420px columns at x169.5 and x601.5, 12px gap, 72px headers, 24px panel corners, #101010 canvas, #2d2d2d borders, platform system font, 15px/21px post copy. Single pages use a 640px centered column. Poll editor fields are 47px tall, 12px corners and padding, 15px/600 text.
- Use exported Threads navigation/control SVGs in `public/assets/threads/` and existing Solar icons for poll-specific functions. Keep Poll Pilled's own capsule logo, anonymous identities, generated poll images, and recolored original unDraw geometry. Never copy source-account posts, profile data or legal text into product fixtures.
- Keep the product poll-first: answer, unlock results, react/save/report; no comments, follower counts or social posting. Both image choices remain visible. The second desktop column is a polling workspace and can be hidden.
- Mobile: 58px header, 51px For you/Following tabs, 12px outer/60px content insets, 50px bottom navigation plus safe area. Settings uses a compact directory and back navigation; no duplicate mobile title on its root directory.
- Inline polls own their answer state independently. Preserve expanded transcripts through choice updates. Menu Escape returns focus. Report reasons start unselected. Newly published samples start at zero responses, not fabricated sample findings. Narrow dialogs stack actions before they can clip.
- QA evidence and limits are in `design-qa.md` and `qa/threads-build/`. Use the native Codex browser, not screen recording or a Playwright CLI. Theme colors, typography and controls were measured against captured source; poll content, wallets, insights and creation flows are intentional Poll Pilled adaptations.

## Single desktop creation shortcut (2026-11-01)
- Remove the bottom-right floating Create button throughout the HTML prototype. Keep the + button in the left rail as the desktop shortcut; preserve mobile bottom-navigation Create. Do not restore the redundant desktop FAB when matching the Threads reference.

## Workspace controls placement (2026-11-01)
- Do not show the floating column-toggle icon halfway down Discover’s right edge. Put labeled Show workspace / Hide workspace actions in the desktop Feed preferences menu. The workspace header menu may also hide its own column. Keep a way to restore the column after hiding it.

## Catalyst deployment (latest user direction, 2026-11-01)
- Connect the approved Threads-style HTML interface to Flask and deploy it on Catalyst. This supersedes the isolated in-memory prototype requirement above.
- Keep all durable storage inside Catalyst. Preserve server-enforced authorization, balances, eligibility, provenance, idempotency and result locking. Never deploy local credentials or user records as build assets.
- Only jayachandranpm2001@gmail.com may access provider credentials and AI administration after verified Catalyst authentication. Encrypt provider secrets server-side; never return them to clients.
- Keep payments in test mode until configured. Remove text-to-speech. Preserve real voice uploads and Meta transcription.
- Use Catalyst's default email/password login for now. The user explicitly deferred custom authentication and Google, Zoho and Facebook social-login setup.

## Editor control polish (2026-11-01)
- Use `selectControl` from `src/deck-prototype/controls.js` for distribution and language in the editor and settings. Keep one selection check, keyboard navigation/type-ahead, Escape focus return, and viewport-safe top-layer positioning. Do not reintroduce native select styling.
- A/B testing uses the Solar layers icon; Head to head uses transfer-horizontal. Meta draft and rephrase actions use compact neutral pill controls, a Solar sparkle, and the local Meta mark.

## Asset delivery and protected authentication (2026-11-01)
- Bundle trusted SVG icons inline through deck-prototype/icons.js; no per-icon network masks. Public fingerprinted assets use immutable caching and gzip. Never cache authenticated APIs or private uploads publicly.
- User now requires server-enforced Turnstile for authentication and explicitly authorizes custom authentication. The staged custom flow uses email codes, encrypted Catalyst storage, single-use browser-bound challenges, attempt and resend limits, and revocable sessions. Hosted Catalyst identity must not bypass it once activated.
- Activate custom authentication only after a real email-code round trip and Turnstile verification. Sender credentials stay in Catalyst Mail; the user must create/enter Google app passwords directly.

## Custom authentication activation (2026-11-01)
- The administrator completed a real Gmail SMTP email-code sign-in. Custom authentication is now enabled in encrypted Catalyst storage. AppSail must use `catalyst_auth: false` so visitors reach `/sign-in`; keep `PP_CATALYST_AUTH_ENABLED=true` for secure cookies and the application guard. Never re-enable the hosted-login wrapper during packaging.
- Sign-in must show progress during both Turnstile and server verification. Bound network waits, preserve entered codes on errors, and never retry code verification automatically.

## Poll disclosures and Catalyst media delivery (2026-11-01)
- Deck transcripts and optional reasons use the shared native `details` control in `deck-prototype/controls.js`, styled with inline Solar icons and a single rotating chevron. Suppress browser markers, retain keyboard semantics and 44px summary targets, and preserve expansion and unsent text across card renders. Mobile voice/upload actions also have 44px targets.
- Shipped public image/audio/video assets are allowlisted by the generated `catalog/manifest.json` and served from the private Catalyst Stratus bucket through short-lived signed URLs. Optimize images to WebP in the Catalyst build. Private participant uploads must never enter this public catalog path.
- Catalyst Cache stores short-lived catalog signatures and immutable encrypted snapshots using fixed-length hashed keys. Always read the authoritative Data Store revision before using a cached snapshot, and verify its digest. Cache failures must fall back safely; never cache the latest balance/auth decision.
- Preserve the 180-second public cache header on catalog redirects; ordinary HTML and API responses remain no-store. Published user media requires authorized revalidation; drafts and response audio remain private/no-store. Require successful bucket acknowledgement before accepting uploads.
- Tests: `tests/test_media_delivery.py`; live bucket/range evidence: `qa/catalyst/media-delivery.json`; mobile and light-mode screenshots: `qa/catalyst/disclosures-*.png`. Hardware microphone permissions and live paid AI/payment operations are outside this QA pass.

## Brand and form spacing (2026-11-01)
- The user requested a Poll Pilled brand mark of rounded bar-chart columns with sparks above them. `deck-prototype/brand.js` and `brand.css` own the mark; the accepted generated source and delivery derivatives are in `deck-prototype/brand/poll-pilled-spark-*`. The earlier capsule/chart concept is superseded. Keep the mark bundled inline, theme-aware, and shared across desktop, mobile, sign-in and favicon surfaces.
- `deck-prototype/forms.css` owns consistent form spacing. Use `settings-flow` for settings pages, `form-stack` for connected form dialogs, and `action-row` around related buttons. Preserve 24px field-to-save spacing in Identity, 10px between actions, 44px action targets, and stacking at narrow widths. Never return to adjoining inline action buttons in Privacy or administration.
- The current feature inventory is `qa/placeholder-audit/index.html` with machine-readable `inventory.json`. It distinguishes demo content, actual incomplete features, unconfigured providers and connected functionality. Do not count inactive legacy prototype handlers as live placeholders. User requested the inventory; implementing every remaining finding was not part of this pass.

- Long dialogs keep their Cancel/title header sticky while scrolling; use the shared `.dialog-header` treatment in `forms.css`.


## Complete non-payment workflows (2026-11-02)
- Payment purchase and cash-out remain explicit simulations/placeholders. Do not initiate payment-provider onboarding or charge users.
- Complete connected non-payment workflows in the current Threads-style deck; retain server authorization, provenance, result locking and private Catalyst media.
- `featureFlows.js` and `featureFlows.css` extend the existing shared controls for draft lifecycle, interactive formats, preferences, notifications and moderator operations. Use their existing spacing tokens, not a new page skin.
- New capability claims must be supported by backend tests and native browser checks. Provider-dependent AI must report configuration/errors honestly; never substitute a canned answer.
- The user explicitly prohibits screen recording and desktop computer control. Use only the built-in Codex browser runtime for browser verification; do not use `cua_repl`, desktop AX, or native OS automation.
- Turnstile challenges are serialized in the frontend; every protected write still receives a separate server-verified, single-use token. Never share challenge tokens between autosave and explicit actions.
- Region suggestions take a short object label, independent of the poll question. A single detection updates the first region and preserves other editable regions.


## Muse creation and voice studio (2026-11-03)
- User reintroduced AI voices: allow typed text or a recording transcribed by Muse and synthesized with a preset Cloudflare Workers AI voice. This supersedes the earlier removal of TTS. Do not pretend Muse Model API provides synthesis or clone the speaker.
- Original voice stays human. Meta-rephrased human text stays human; generated questions and known generated media retain server-enforced provenance even after rephrasing. Always label synthesized audio AI voice.
- Use creatorStudio.js and existing Threads controls, with explicit proposal review, voice playback and apply steps. Never auto-publish or auto-submit. Provider errors preserve work.
- The user now prohibits ALL screen capture as well as recording and computer control. Browser verification must use native Codex DOM controls only; no screenshots, AX, CUA or external browser automation.

## Publisher following and reactions (2026-11-03)
- The user now explicitly wants people to follow other people and receive new-poll alerts. This supersedes the earlier topic-only Following tab. Keep the product focused on polls; comments and social posting remain absent.
- Anonymous names and opaque public IDs are assigned once, stored with uniqueness constraints, and preserved across reloads. Never expose internal viewer IDs or account emails through publisher profiles or following.
- Publish one event atomically with the poll, inside its existing idempotency transaction. Join publication events to current follows at inbox read time; never fan out one write per follower. No historical alerts when following, re-following, or unmuting.
- In-app alerts respect per-publisher mute, global notifications, language, format, AI preferences, audience eligibility, moderation and completion state. Following is chronological by default; For you prioritizes unanswered, eligible, matching-topic polls, then followed publishers and recency.
- `following.js`, `following.css`, and `pollFeed.js` own the new controls. Notification polling updates badges only, at most once per 30 seconds while visible; preserve drafts, answers and scroll. Direct poll links retain the Following feed context.
- Keep Love it, Interesting and Surprising. Use the custom transparent reaction artwork with accessible labels, counts, pressed states and reduced-motion handling; reactions/results remain locked until answering.


## Account creation and onboarding (2026-11-03)
- Public visitors get explicit Create account and email/password Sign in screens. Keep verified email-code sign-in for existing users and email-verified password recovery. Public registration never accepts an administrator role; the existing owner allowlist remains private.
- All auth mutations require Turnstile, CSRF and bounded attempts. Store salted scrypt password hashes inside encrypted Catalyst storage; never retain raw passwords in browser storage, logs or databases. Signup codes verify email before creating any account.
- `/welcome` is a four-step, resumable introduction: starting intent, topics/language, formats/AI preferences, and anonymous identity/avatar/tagline. Answering and publishing are capabilities for every user, not account roles.
- Reuse the current Threads palette, typography, icons, brand and controls. Save on every Continue; support Back, skip, retry and mobile wrapping. Allow later personalization from Settings. Never reset existing polls, balances or public identities.


## Turnstile recovery (2026-11-03)
- Keep the shared security check alive through recoverable Cloudflare widget failures. Retry the widget at most twice automatically, then show an explicit retry control; never auto-repeat the application request. Every write still needs a fresh server-verified token.
- Surface sanitized Cloudflare error codes and specific hostname, widget-configuration, network, clock and browser guidance. Never collapse every failure into a generic message or log tokens, passwords or email addresses.
- Retain entered forms after failures. Guard duplicate callbacks, cleanup widgets even on synchronous callbacks, and keep challenge dialogs serialized. Public security configuration may include the expected hostname, never the widget secret.

- Never call `turnstile.ready()` on an async/defer-loaded script. Cloudflare throws error 3857 for that combination; resolve the shared loader from the script onload event after checking `turnstile.render` exists. Keep the provider-contract regression test.

## Custom welcome artwork (2026-11-03)
- Use the original Poll Pilled illustrations in `public/assets/welcome/` for sign-in/account creation and the four onboarding steps. Their sky-blue, ivory, charcoal and small yellow sparks echo the bar-chart brand; preserve transparency across light and dark surfaces.
- `welcomeArtwork.js` supplies decorative images with reserved dimensions. Desktop shows the larger illustration alongside the form; mobile uses a compact image without squeezing headings or controls. Verification and recovery forms retain their concise status icons.
- Preserve form actions, focus, progress, saved preferences and error recovery. Deliver the artwork through the existing public Catalyst media catalog; keep originals and generation prompts in the workspace (`qa/welcome-illustrations/artwork.json`).

## Reliable sign-in and startup (2026-11-03)
- Password login, registration/code delivery and resend require fresh server-verified Turnstile tokens. OTP verification and password recovery continue the same short-lived server-verified flow: proof is encrypted, browser-bound, expires in ten minutes, and cannot be supplied by the client. Retain CSRF, OTP attempt limits, single-use codes/grants and session revocation. Legacy codes without proof still require a fresh check. This supersedes the earlier separate CAPTCHA on every step of email authentication; ordinary application writes still require individual tokens.
- Preload the provider script on sign-in. Give silent widgets a 15-second attempt watchdog, one automatic fresh attempt, explicit retry/cancel controls, and a 60-second overall deadline. Interactive checks receive up to 45 seconds within that bound. Ignore callbacks from abandoned widget instances; never repeat the application mutation automatically.
- Use `/api/session` for lightweight authenticated bootstrap. Read-only app requests must not first call the AI-status endpoint. Preserve specific service/auth errors; do not claim a key was lost during unrelated app startup.
- Missing FFmpeg disables media conversion rather than crashing app/AI status. `scripts/bundle_ffmpeg.py` packages the checksum-pinned Linux executable for Catalyst even when building on macOS. Public health reports audio-conversion availability without credentials or user information.

## One security check for onboarding (2026-11-03)
- The user confirmed sign-in works and objected to CAPTCHA on every onboarding step. Carry verified sign-in through unfinished onboarding for 30 minutes, bound to the active server-stored authentication session. Only the exact onboarding POST route qualifies; retain authentication, CSRF, rate limits and the strict preference allowlist.
- After expiry, one verified check plus a successful onboarding save renews this narrow window. Never extend it merely by loading a page. Complete/Skip ends the window; publishing, voting, AI, payment and ordinary preference routes keep their own verification. Frontend clearance is a UI hint only; the server decides independently.

## Routine actions without CAPTCHA (2026-11-03, supersedes blanket write checks)
- The user explicitly rejected security prompts on appearance and other everyday actions. `security.py:ROUTINE_POST_ROUTES` is the single source of truth for authenticated CAPTCHA-free POST routes. Onboarding, preferences, private draft saves/deletion, quotes/audience previews, bookmarks, reactions, follows/alerts, notification reads, reports/appeals, session revocation, bounded uploads and poll reservations do not open a widget. Remove the earlier 30-minute onboarding-only clearance; a valid authenticated session suffices for these routes.
- Match the exact Flask route and HTTP method after verified identity, CSRF and rate-limit middleware. Never trust submitted exemption flags. The public `captcha_policy` only tells the frontend when it can omit the widget; it never grants permissions. Unknown writes, publishing/submissions, paid AI, credit mutations, destructive account actions and administrator changes keep server-side verification. Preserve the separate verified email-code continuation.
- Keep media validation/size limits, private ownership, 10 upload requests/minute, 20 reservation requests/minute, the three-reservation cap and existing report/follow limits. Reservations must not trigger CAPTCHA on focus, and a valid reservation is reused at submission. Every protected operation still uses its own single-use token.
- Appearance updates immediately and persists through an ordered queue without a full state reload. Rapid selections must not repaint an older theme. On failure restore the latest confirmed preference, preserve other work, and surface feedback. Verify with the connected DOM and API/security tests; no screenshots or desktop/computer automation.

## Sky-blue brand and original empty states (2026-11-03)
- The user requested the exact sky-blue accent specified for the sign-in artwork: `#8BCBFA`. `deck-prototype/sky-tokens.css` is the shared palette for the app, authentication and onboarding. This supersedes the earlier monochrome Threads palette. Use dark ink on sky-blue buttons and accessible deeper-blue text/borders on light surfaces; preserve light/dark/system choices. New accounts default to light; existing saved choices remain intact.
- Desktop sidebar targets are 44px high with 12px gaps, without negative margins. Keep topic shortcuts hidden below 900px viewport height, and make the rail scrollable on very short windows so primary navigation remains reachable. Preserve mobile 44px targets and tooltips on desktop.
- Replace active unDraw empty-state references with `deck-prototype/emptyStates.js`. Eight original transparent companion illustrations live in `public/assets/empty-states/`, matching the sign-in characters, sky blue, ivory, charcoal outlines, texture and small yellow sparks. Scenes cover discover/search, drafts, saved polls, rewards, insights, following, notifications and responses; use compact variants in workspace panels and dialogs. Do not recolor or grayscale these images between themes.
- Keep empty-state actions functional, reserve image dimensions, use empty alt text for decorative art, and avoid a caught-up footer when no polls match. Public illustration delivery uses the existing Catalyst Stratus catalog and WebP optimization. Prompts and source provenance: `qa/sky-theme/artwork.json` and `generated-sources.json`.

## Cloud write reliability and pervasive sky blue (2026-11-03)
- The user's sky-blue correction applies beyond accents: use exact `#8BCBFA` for the app frame, navigation and section headers in both themes, with blue-tinted reading surfaces and dark ink on sky. Dark mode keeps dark blue reading panes. Preserve the original illustrations.
- Test live-style workflows through `SnapshotConnection`, including middleware, not only ordinary SQLite. The cloud adapter must support every database operation used by request middleware, including transactional `executemany`. Cloud startup builds an isolated in-memory schema template; do not race migrations in a shared local file.
- Answer, reaction and publish receipts include the affected poll (and wallet where needed). Apply confirmed receipts immediately; a secondary feed read must never turn a committed action into a displayed failure or hide unlocked reactions. Keep operation IDs across malformed/empty responses and preserve unsent work.
- Only explicitly replay-safe snapshot transactions may retry a known revision conflict. Never repeat CAPTCHA verification, paid AI calls or external transfers as part of that retry. Preserve authentication, CSRF, rate limits and post-vote result locking.
- Discover's For you/Following switch belongs inside the feed panel. Both desktop columns have exactly one equal-height external header, so their panel tops align. Hide the workspace below 1001px and collapse the grid when the user hides it; never leave an empty second grid track. Keep mobile tabs inside the feed with height accounting for the header and bottom navigation.

## AI creation without repeated CAPTCHA (2026-11-03)
- The user explicitly rejected security dialogs while creating images and using Meta-powered poll tools. Signed-in users can draft, rephrase, generate images/voices, transcribe, review, analyze visuals, suggest regions and generate insights without a new CAPTCHA. `security.py:AI_TOOL_POST_ROUTES` is the exact route allowlist included in the server's authenticated routine-action policy; this supersedes the earlier requirement to challenge every paid AI call.
- Retain verified identity, CSRF, file ownership, ordinary request limits, AI burst limits, daily per-feature quotas, per-user/platform budgets, encrypted caching and duplicate guards. Authentication, publishing/submitting, credit changes, account deletion, administrator/credential changes and unknown routes retain their existing protections. Do not disable Turnstile globally or exempt a broad `/api/ai/*` prefix.

## Fast static delivery (2026-11-03)
- Public release artwork is served directly from the optimized allowlisted release catalog, with browser caching and validators. This replaces temporary Stratus redirects, whose final responses were no-store. Private uploads and generated/user media retain their authenticated Catalyst Stratus storage path; never cache private app data as public assets.
- Package appropriately sized WebP avatars/illustrations and precompressed Brotli/gzip scripts, styles and SVGs. Preserve original artwork, transparency, dimensions and the sky-blue theme. Keep icons bundled inline and system typography independent of network fonts.
- Load the chart library only when a chart is mounted. Prioritize the first poll's images; lazy-load later images and avoid preloading every audio/video in the feed. Preserve accessible controls and draft/answer state.
- Validate cache negotiation, conditional requests, ranges, cloud-service independence and media privacy. Measure live public asset delivery without screen capture or browser automation outside native Codex tools.


## Concise poll UI and predictable exits (2026-11-03)
- Omit the historical default taglines and repeated human-origin/format copy from poll cards. Keep genuine custom taglines, estimated time, points and explicit generated-content labels. Replace the long sample disclaimer with a compact Demo disclosure explaining that demo points cannot be cashed out. Wallet/payment screens retain their explicit simulation notice.
- Taglines are optional in onboarding and settings. Stage avatar and tagline edits together; Save changes commits both, and Cancel restores the saved identity. Interests follow the same Save/Cancel model. Appearance continues to apply immediately.
- Keep the optional reason input compact: a labelled plus disclosure, concise text input, accessible Record/AI voice/Audio file actions, and publisher-only privacy context. Discarding a recording stops tracks and never uploads it.
- Workspace Notifications and Invite friends share an equal-width, aligned action grid. Format choices in the editor have persistent labels and selected states; question prompts describe the selected format. Use shared button, dialog and input sizing across pages.
- Settings sections and My polls tabs belong in URL history. App navigation out of the editor saves the draft first and remains in the editor on failure. Close returns to the source route. Dialogs have one clear close control, restore launcher focus, and ignore late AI/notification results after dismissal. Destructive confirmations include an explicit Cancel action.
- Verify behavior through connected DOM tests and backend tests. The user prohibits screen capture, recording and computer use; only native Codex browser tools may be used for browser inspection.

## Compact reactions (2026-11-04)
- Results reactions use small 36px artwork with counts in a compact horizontal row. Remove card borders and filled tile backgrounds, including selected states. Keep at least 44px hit targets, accessible labels, hover labels, selected checks, keyboard focus and reduced-motion support.

## Seamless participant submissions (2026-11-04)
- Signed-in poll answers and invited follow-up answers use the authenticated routine-action policy without another Turnstile challenge. Keep exact-route matching, CSRF, eligibility, reservations, unique responses, invitation ownership, transactional reward accounting and a shared 20-submissions/minute limit. Sign-in, publishing, cash/credit changes, administrator changes and unknown writes retain their protections.
- Remove Demo labels/disclosures from poll cards. Keep explicit simulated-payment information in Wallet and purchase/redemption flows. Preserve AI provenance labels.
- Renew near-expiry reservations and discard a conflicting cached reservation so manual retry can recover without losing an answer. Temporary GET failures may retry once; do not automatically replay writes, timed-out requests or paid model calls. Invalid response shapes and sign-in redirects must produce specific recoverable errors rather than JavaScript exceptions.
- AI budget/cache reservation uses the same replay-safe local transaction boundary as result storage. Recheck limits on a known cloud revision conflict; never include the provider call in a retry.

## Async and narrow-screen regression fixes (2026-11-04)
- Reserve answer places only for explicit answering input, never for focus, transcripts, audio playback or opening a reason disclosure. Freeze a submitted answer while its reservation finishes.
- Scope asynchronous UI callbacks to their originating navigation/dialog epoch. A closed dialog, stale quote, upload or audience estimate must not reopen a screen, update another draft or change navigation. Committed writes still update receipts; publishing must preserve edits made after closing review.
- Keep unsaved settings through unrelated state refreshes, and unsaved later onboarding choices when navigating Back. Explicit Save/Cancel controls remain authoritative.
- Preserve editor Audience, Content authorship and Audience profile disclosures through rerenders. Wrap all topic buttons within the canvas. Keep narrow-screen draft actions grouped, 44px dismiss/answer controls, and one Back control per settings navigation surface.
- Tab lists support Arrow keys/Home/End with roving focus and labelled panels. Custom dropdown Tab exits to the next field. Answer completeness checks must survive rerenders for allocation, ranking and head-to-head formats.
- Sign-in startup offers a retry control that retains typed credentials after a failed or malformed service response. Never store credentials in browser storage.

## Uniform loading states (2026-11-04)
- Every entry page renders an immediate sky-blue skeleton before JavaScript loads. The deck uses route-specific skeletons inside the real navigation shell; no fabricated records or balances while booting. Authentication, onboarding and asynchronous dialogs reuse `deck-prototype/loading.js` and `loading.css`.
- Keep loaded content and edits visible during background requests. Explicit actions use stable-size busy buttons and a thin, delayed indeterminate activity bar, with no artificial wait or fake progress percentages. Dialog loaders remain dismissible and cannot reopen after cancellation. Failures replace loaders with a clear retry.
- Reserve media space; end image skeletons for cached, loaded and failed images. Respect dark/light palettes, the user's motion setting and OS reduced motion. Cache only non-sensitive theme/motion preferences to prevent a theme flash, never private app data or credentials.

## Product hierarchy and control polish (2026-11-04)
- The user wants a professional, coherent product experience. `deck-prototype/workspace.css` owns the deck's final layout geometry: primary poll column, compact supporting workspace, labelled desktop navigation at wide widths, and labelled mobile navigation. Preserve exact sky blue and both themes.
- The creator has distinct question, format, assistance, answer and audience sections, a character count, persistent save status, and reachable Preview/Review actions. Validation identifies the exact field and moves focus to it. Re-selecting the current format must preserve work; changing a populated format explicitly offers Keep editing before discarding answers/media.
- Settings groups Account, Personalization, Activity and More. Keep direct Settings navigation, existing administration authorization and all destinations. Toasts can be dismissed and pause while hovered/focused; page navigation moves keyboard focus to the heading.
- Verify mobile widths, light/dark controls, overflow, editor completion, dialog cancellation and loading-shell alignment using native DOM tools only. Do not use screen capture or desktop computer use.

## Restore the previous UI (latest user direction, 2026-11-04)
- The user explicitly rejected the latest redesign and confirmed restoring the layout immediately before that pass. This supersedes the Product hierarchy and control polish layout: use the original compact icon rail with More menu, equal Discover columns, original page widths, flat settings directory and original editor with all format choices visible.
- Keep white reading panels and exact #8BCBFA sky blue. The previous optional dark appearance remains available; do not force a theme change or overwrite saved preferences.
- `threads.css` and `forms.css` own the restored geometry. Do not reintroduce `workspace.css`, a labelled wide rail, narrow supporting workspace or reorganized editor/settings sections.
- Preserve the loading system, security/reliability fixes, inline error feedback, safe format changes and focus/cancel behavior. `interaction-feedback.css` contains only error/toast accessibility feedback, not a new layout.

## Turnstile assessment recovery (2026-11-04)
- The user prohibits browser tools, computer control and screen capture for this task. Validate with code tests and direct HTTP/provider API diagnostics only.
- 300xxx/600xxx are provider assessment failures, not proof of a specific extension or app defect. Preserve the failed iframe and its Cloudflare feedback/Ray ID controls. Offer manual Retry/Cancel immediately; do not rapidly replace these checks automatically.
- Clear the active deadline while waiting for user recovery. Each manual retry gets a fresh bounded deadline; stale callbacks never resolve a newer attempt. Give interactive checks their own full time budget, without an earlier passive deadline interrupting them.
- Passive checks get 30 seconds before the watchdog; one network/stall retry waits 8 seconds, bounded by a 90-second active deadline. Interactive completion gets 120 seconds. Do not bypass Siteverify, hostname/action checks, CSRF or authentication on provider failure.
- Never claim mocked recovery tests prove that Cloudflare will accept a real person's browser. A persistent assessment rejection needs the widget's Ray ID/provider diagnosis, not just its generic reference code.
- User confirmed Managed widget mode. `/security-check` is a public, read-only diagnostic page using the live public site key and a standalone Cloudflare widget. It has no app dialogs/styles, custom widget watchdogs or automatic retries. It discards tokens, grants no login/clearance, and prints only hostname, public site key, stage, sanitized code and timestamp. A client completion is explicitly not server verification. Do not weaken login or share/reuse diagnostic tokens to work around rejection.


## Managed-browser email fallback (2026-11-04)
- The user explicitly approved a protected email-code fallback because a mandatory company extension causes Cloudflare 600010. Keep Turnstile on all normal authentication routes and existing protected app operations. This supersedes the blanket requirement that every email delivery must pass Turnstile, only for the exact `/api/auth/email-fallback/*` route allowlist.
- Offer “Security check blocked? Use email instead” on sign-in, signup and recovery. `/sign-in?method=email` opens the explicit fallback directly without loading the widget. Preserve the email and pending registration password when switching; never send a request automatically after a challenge fails. Show accurate “Verified email · Single-use codes” copy on this path.
- Fallback requires CSRF, same-origin checks, verified email ownership, browser-bound six-digit codes (10-minute expiry, five attempts, single use), durable browser/email/global/peer quotas and a 60-second resend cooldown. Different methods cannot redeem each other's codes or reset grants. The server chooses the method from the route; never accept client skip-CAPTCHA flags or fabricate bot-verification timestamps.
- Re-read code/grant state and consume it in a replay-safe storage transaction. SMTP is outside transaction retries. Keep password hashes encrypted, registration non-admin, current owner identity unchanged, and password-reset session revocation intact. Clean expired auth secrets/quota state without removing valid sessions or accounts.
- `PP_EMAIL_AUTH_FALLBACK_ENABLED=false` disables the alternative while preserving normal authentication. The peer quota uses `remote_addr` only; do not trust forwarding headers without a verified gateway contract. Behind a proxy this may be a shared gateway limit, not a per-user IP limit.
- Continue to honor the user's ban on all browser tools, screen capture, recording and computer use. Tests use HTTP, Flask and a DOM test harness only. Do not claim test doubles prove real inbox delivery or browser completion.
