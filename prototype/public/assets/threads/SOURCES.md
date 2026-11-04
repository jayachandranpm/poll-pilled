# Threads prototype asset provenance

Source: https://www.threads.com/ — live browser capture on 2026-11-01. Evidence and exported SVG snapshots are in `qa/threads-reference/`.

- `home.svg`, `home-outline.svg`, `search.svg`, `profile.svg`, `insights.svg`, `heart.svg`, `more.svg`, `create.svg`, `back.svg`, `more-circle.svg`: exported source DOM geometry. Classes and account-specific styles were removed; computed back-icon stroke properties were preserved. The notification badge was removed from the heart to avoid implying unread activity.
- `post-more.svg`: the three source dot paths from `more-circle.svg`, without its outer circle, matching the feed overflow affordance.
- `empty-polls.svg`, `no-results.svg`, `voice-lounge.svg`, and their `-light.svg` variants: existing locally customized unDraw SVG geometry, recolored to neutral Threads tokens. Original geometry is unchanged. No new illustration paths were drawn.
- Poll-specific controls use the existing local Solar SVG catalog in `../icons/`.
- The Poll Pilled capsule and poll photography remain the project's generated assets under `../deck/`; source-account photos and post content were not copied into the app.
- Typography uses the source's platform font stack: system-ui, -apple-system, "system-ui", Roboto, Helvetica, Arial, sans-serif. No external font downloads or hotlinked media.

These exports document provenance; they do not assert an open-source license for Threads assets. This directory serves the user's local visual prototype.
