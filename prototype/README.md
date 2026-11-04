# Poll Pilled frontend

The active app is `poll-deck.html`, implemented in `src/deck-prototype/`. Sign-in, onboarding and the read-only security diagnostic have separate entry pages. The earlier React prototype remains available at `index.html` for reference.

The design uses white surfaces and sky blue (`#8BCBFA`), optional dark mode, bundled SVG icons, custom Poll Pilled illustrations, responsive controls and shared loading states. The active polling flow shows results only after answering and supports reactions/reporting rather than comments.

## Development

```bash
npm ci
npm run dev -- --port 5070
```

Run Flask on port 5058 for the development proxy, then open `http://127.0.0.1:5070/poll-deck.html`.

## Build and checks

```bash
npm run build
npm run test:ui
npm run test:sites
```

Build output goes to `dist/client/`; Flask serves the current interface at `/poll-deck.html`. The packaging script also creates the Sites worker output from the checked-in worker and service-free hosting manifest. Generated output and dependencies are ignored by Git.

## Main files

- `src/deck-prototype/main.js`: application navigation and interaction wiring.
- `src/deck-prototype/threads.css`, `forms.css`: shared layout and controls.
- `src/deck-prototype/signin.js`: normal and explicitly selected email-fallback authentication.
- `src/deck-prototype/onboarding.js`: initial preferences and identity setup.
- `src/deck-prototype/loading.js`, `loading.css`: skeletons and busy states.
- `src/turnstile.js`: bounded challenge lifecycle and recovery controls.
- `src/security-diagnostic.js`: client-only widget diagnostic; never grants a session.
- `public/assets/`: public illustrations, sample media, fonts and icons.
- `tests/`: DOM-based regression tests; no real credentials or CAPTCHA solving.

See the [root README](../README.md) for backend configuration, deployment and secret-handling requirements. Production provider credentials belong on the server, never in Vite variables or frontend source.
