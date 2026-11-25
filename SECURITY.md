# YouPrune — Security & Supply-Chain

YouPrune is built so you never have to *trust* it — you can *verify* it. This
document is the threat model and the verification steps.

## Threat model

The main threat to browser extensions is **not** a bug in the code shipped today.
It is a **malicious future update**:

- the extension is **sold** to a new owner who poisons it, or
- the developer account is **compromised** and an attacker pushes an update,
- which then **auto-installs silently** in everyone's browser.

Important: **Chrome Web Store signing does not protect against this.** Store
signing only proves an update came from the same developer *account* — which is
exactly what the attacker now controls after a sale or takeover. So we do not
rely on it.

## Defenses

### 1. Least privilege (enforced)

The extension requests only:

| Capability | Why it is needed |
|---|---|
| `storage` | Save your ban list, tallies, and settings locally |
| `contextMenus` | The right-click "Hide this channel" item |
| host `*://*.youtube.com/*` | Run the content script on YouTube only |

It does **not** request: `tabs`, `scripting`, `webRequest`,
`declarativeNetRequest`, `cookies`, `history`, `downloads`, `<all_urls>`, or any
optional permissions. It makes **no network requests** and loads **no remote
code**. (The popup reads the active tab's URL only because the youtube.com host
permission already covers that tab — no `tabs` permission is used.)

`scripts/audit.sh` enforces all of the above and **fails the build** if a new
permission or a dangerous API (`eval`, `innerHTML`, `fetch`, `chrome.scripting`,
remote script loading, …) ever appears. Granting a new capability requires
editing the allowlist in that script — which is a visible, reviewable diff.

### 2. No silent update channel (your strongest option)

If you **load the extension unpacked from this git repo** and update it with
`git pull`, there is **no third party in the update path at all**. You are the
only one who can change what runs. This completely removes the "sold to a shady
dev" threat for your own install. This is the recommended way to run YouPrune.

### 3. Verifiable artifacts (for installs you didn't build yourself)

There is **no build step** — the shipped files are the source files. So you can
verify a copy byte-for-byte.

**Verify a release zip matches its checksum:**

```sh
# Download youprune-<ver>.zip and youprune-<ver>.sha256 from the GitHub release
sha256sum -c youprune-<ver>.sha256
```

**Verify the zip matches the source at its git tag:**

```sh
git checkout v<ver>
./scripts/pack.sh
sha256sum dist/youprune-<ver>.zip   # compare to the published .sha256
```

**Verify an installed (unpacked) copy hasn't been altered:**

```sh
# From your profile's extension folder vs. a clean checkout of the same tag
diff -r <clean-checkout>/src <installed>/src
diff <clean-checkout>/manifest.json <installed>/manifest.json
```

### 4. Build provenance (optional, for public distribution)

When distributing to other people, releases can be built in GitHub Actions with a
signed [SLSA build-provenance attestation](https://docs.github.com/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds).
Anyone can then confirm an artifact was built by this repo's CI from a specific
commit:

```sh
gh attestation verify youprune-<ver>.zip --repo yeehawitsjakester/YouPrune
```

This is stronger than a checksum because the signature is tied to the repo and
commit, not just to a hash the publisher also controls. (Not yet wired up — see
the roadmap.)

## The one future risk: the network module

The planned "hide low-rated channels from our API" module is the only feature
that will introduce network access. Design rules, non-negotiable:

- It fetches **data only** (a JSON list of channels) — **never code**. MV3's CSP
  already forbids remote code; we keep it that way.
- It talks to **exactly one** configured origin, which must be added to the
  `host_permissions` allowlist in `audit.sh` in the same commit that adds the
  fetch.
- Fetched data is treated as **untrusted input**: validated and schema-checked
  before it touches storage, never `eval`'d, never rendered as HTML.

## Reporting

Found something? Open a GitHub issue, or for anything sensitive, contact the
maintainer privately before disclosing.
