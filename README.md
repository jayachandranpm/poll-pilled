# Poll Pilled

A multimodal polling app with a Flask backend and a responsive web interface. Participants answer polls, see results after answering, react, and earn reward points. Publishers create polls, choose an audience and budget, and review responses.

## Features

- Classic choices, image comparisons, A/B tests, audio, video, sliders, rankings, head-to-head choices, allocation and image-region interactions.
- Interest-based discovery, followed publishers, notifications, saved polls and anonymous public identities.
- Poll creation with Meta-assisted drafting, rephrasing, image generation, visual understanding and transcription. Generated media carries provenance labels.
- Cloudflare Workers AI voices and Turnstile protection for normal authentication and selected sensitive operations.
- Email verification, password sign-in, account creation, password recovery and a separately protected email-code fallback for managed browsers.
- Rewards, quality review, appeals, follow-ups, publisher delivery controls and wallets. **Purchases and cash-outs remain simulated.**
- Admin-only encrypted provider credentials and AI usage limits.
- Catalyst deployment using Data Store and Stratus; local development uses SQLite.

## Run locally

Requires Python 3.11+ and a current Node.js LTS release. FFmpeg is used for audio conversion.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm --prefix prototype ci
npm --prefix prototype run build
PORT=5070 python app.py
```

Open **http://127.0.0.1:5070/poll-deck.html** for the current interface. The root URL in local mode serves the preserved legacy interface. Local state is created under `instance/` and is never tracked.

For frontend development, run Flask with `PORT=5058 python app.py`, then run `npm --prefix prototype run dev -- --port 5070` in another terminal and open `/poll-deck.html`. Vite proxies API requests to Flask on port 5058.

Local mode is for development only. Production account enforcement requires the platform configuration described below.

## Configuration and secrets

`.env.example` lists environment variable names with empty credential values. The app reads process environment variables; it does **not** automatically load a `.env` file.

- Generate independent `SECRET_KEY` and Fernet `AI_VAULT_KEY` values for deployment and store them in a secret manager.
- Configure Meta, Cloudflare and email credentials privately. Provider settings are encrypted server-side and restricted to the administrator.
- Keep the existing vault/signing keys when redeploying an existing installation; replacing them can invalidate sessions or make stored credentials unreadable.
- The email-code fallback is available at `/sign-in?method=email` once custom authentication and its sender are configured. Set `PP_EMAIL_AUTH_FALLBACK_ENABLED=false` to disable the alternative. Normal authentication retains Turnstile.

Never commit real `.env` files, deployment configuration, encrypted credential blobs, local databases, uploads, cookies or logs. `.gitignore` excludes them. The example configuration intentionally contains no usable credentials.

## Git secret protection

Install [Gitleaks](https://github.com/gitleaks/gitleaks), then enable the repository hooks in each checkout:

```bash
git config core.hooksPath .githooks
```

The pre-commit hook checks staged content and rejects private/runtime files, including forced additions. The pre-push hook scans commit history. Hooks fail closed if Gitleaks is missing. These checks supplement `.gitignore`; they do not replace reviewing changes before sharing them.

## Catalyst deployment

The existing app uses Catalyst AppSail, Data Store revisions and Stratus objects. It does not use an external database. The MVP storage adapter serializes encrypted snapshots and detects revision conflicts; it is not designed as a high-throughput database.

1. Initialize/link your Catalyst project using your own account and resources.
2. Copy `deployment/app-config.example.json` to the ignored `deployment/app-config.json` and configure your real values privately. Existing deployments must retain their current configuration.
3. Review the project-specific resource IDs in `scripts/build_catalyst.py` before deploying to a different project. Provision the required storage resources, mail sender and Turnstile widget.
4. Build the frontend and run `python scripts/build_catalyst.py`.
5. Deploy the linked AppSail service using the Catalyst CLI with your own project and organization IDs.

The actual deployment configuration, local Catalyst project association and generated release package are deliberately absent from this repository. Do not deploy the empty example configuration directly.

## Tests

Build the frontend first, because some backend and packaging tests read the built assets.

```bash
npm --prefix prototype run test:ui
npm --prefix prototype run test:sites
python -m unittest discover -s tests
```

Provider calls in automated tests use fixtures. Passing those tests does not verify real provider credentials, email delivery, CAPTCHA assessment or payment transfers.

## Source map

- `app.py`: Flask application and routes.
- `custom_auth.py`, `security.py`: authentication, email fallback, request protection and quotas.
- `community*.py`, `poll_rules.py`: polls, responses, interests, rewards and publisher workflows.
- `meta_ai.py`, `creator_studio.py`, `ai_runtime.py`: provider operations, provenance, caching and budgets.
- `cloudflare_integration.py`, `cloudflare_store.py`: Turnstile and generated voices.
- `catalyst_storage.py`, `catalyst_cache.py`: durable cloud storage and caching.
- `prototype/src/deck-prototype/`: current interface; see [frontend notes](prototype/README.md).
- `prototype/public/assets/`: public illustrations, sample media, fonts and icons. Attribution and license files are retained with these assets.
- `tests/`, `prototype/tests/`: backend and DOM-based regression tests.
- `static/`, `templates/`, other prototype source files: preserved earlier interfaces and shared assets.
