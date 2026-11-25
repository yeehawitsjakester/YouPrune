# YouPrune

A client-side YouTube feed pruner for Chrome / Brave (Manifest V3). It *enforces*
the "Not interested" and "Don't recommend channel" signals that YouTube quietly
ignores, lets you hard-hide channels by right-clicking, and strips feed slop
(games, polls, surveys, Shorts shelves, in-feed ads).

Everything runs locally. No account, no network calls (yet — see Roadmap).

## Install (unpacked)

1. Open `brave://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder (`YouPrune/`).
4. Open YouTube and reload any open tabs.

## The three ban triggers

1. **Repeated "Not interested"** — each time you use YouTube's 3-dot →
   *Not interested* on a video, YouPrune tallies it against that channel. At the
   threshold (default **2**, configurable) the channel is auto-banned and all its
   future cards are hidden.
2. **"Don't recommend channel"** — using that menu item bans the channel
   immediately, client-side, regardless of whether YouTube honours it.
3. **Right-click → "YouPrune: Hide this channel"** — right-click a channel name,
   avatar, or anywhere on a video card to ban that channel.

You can also ban the current video's channel from the toolbar popup.

## Clutter filters (toggle in Settings)

- Feed shelves — games, polls, "For you", community posts, "Breaking news", etc.
- Shorts — both shelves and individual Shorts.
- In-feed ads / promoted / display ads.

## Audit mode

Flip **Reveal hidden** in the popup to show pruned items dimmed with a red outline
and a label of *why* they were hidden, instead of removing them. Handy for
confirming the filters aren't eating things you want.

## Backup

Settings → **Export / Import JSON** moves your ban list and tallies between
browsers or backs them up.

## How it works

- `src/content.js` runs a debounced `MutationObserver` over the YouTube SPA,
  resolves each card's channel (matching on **both** `/channel/UC…` IDs and
  `/@handle`s so renames/ID-only links still match), and toggles a
  `.youprune-hidden` class. Capture-phase listeners intercept the 3-dot menu
  clicks and the context-menu target.
- `src/background.js` owns the right-click menu and seeds defaults.
- `src/common.js` is the shared schema + helpers, loaded in every context.
- Hidden items are CSS-hidden, not removed, so they survive YouTube recycling
  DOM nodes during scroll.

### Non-English UIs

Menu interception matches menu-item text. If your YouTube UI isn't English, set
the matching strings in Settings → *Menu label matching*.

## Development & releases

**Day-to-day testing (fast loop):** don't package anything. Load the folder once
via *Load unpacked*, then after each edit hit the **reload ⟳** button on YouPrune
in `brave://extensions` and refresh the YouTube tab. Chromium blocks installing
self-signed `.crx` files, so unpacked is the way to iterate.

**Channel label:** `manifest.version` must be dotted integers, so the alpha label
lives in `manifest.version_name` (`0.1.0-alpha`), which is what Brave displays.

**Build a snapshot:** `./scripts/pack.sh` → `dist/youprune-<version_name>.zip`
(only shippable files). Use for archiving, sharing, or a Web Store upload.

**Cut an alpha release:** `./scripts/release.sh` tags `v<version_name>` and
publishes a GitHub release with the zip attached. Any `version_name` containing a
`-` (e.g. `-alpha`) is published as a **pre-release**. To cut the next one, bump
`version` and `version_name` in `manifest.json`, commit, push, then run it again.

## Roadmap — network module

The storage schema and Settings UI already reserve `apiEnabled`, `apiBaseUrl`,
`apiKey`, and `remoteThreshold`, and every ban entry carries a `reason`
(`manual` / `dont-recommend` / `threshold` / `remote`). The planned module in
`src/background.js` will fetch "low-rated" channels from your API and merge them
into the ban list with `reason: "remote"` — no storage migration needed.

## Known limitations

- Menu attribution relies on YouTube's current custom-element names; a YouTube
  redesign can require selector updates (see `RENDERERS` / `MENU_ITEMS` in
  `content.js`).
- Threshold counting is per distinct "Not interested" click; it does not yet
  dedupe the same video clicked twice.
