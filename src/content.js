/*
 * YouPrune — content.js
 * Runs on youtube.com. Responsibilities:
 *   1. Hide videos from banned channels + optional clutter, continuously.
 *   2. Intercept "Not interested" / "Don't recommend channel" menu clicks and
 *      attribute them to the originating video's channel.
 *   3. Resolve the target channel for the right-click context-menu action.
 *
 * Depends on globalThis.YouPrune (src/common.js, loaded first).
 */
(function () {
  "use strict";

  const YP = self.YouPrune;

  // --- DOM selectors --------------------------------------------------------
  // Individual video cards across home / search / watch-sidebar / grids.
  const RENDERERS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-reel-item-renderer",
  ].join(",");

  // Whole shelves / sections of injected content.
  const SHELVES = [
    "ytd-rich-section-renderer",
    "ytd-reel-shelf-renderer",
    "ytd-shelf-renderer",
  ].join(",");

  const ADS = [
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-promoted-video-renderer",
    "ytd-display-ad-renderer",
    "ad-slot-renderer",
  ].join(",");

  // Links inside a card that point at the channel.
  const CHANNEL_LINKS =
    'a#avatar-link, ytd-channel-name a, #channel-name a, ' +
    'a.yt-simple-endpoint[href^="/@"], a.yt-simple-endpoint[href^="/channel/"], ' +
    'a.yt-simple-endpoint[href^="/c/"], a.yt-simple-endpoint[href^="/user/"]';

  // Menu items live in a detached popup.
  const MENU_ITEMS =
    "ytd-menu-service-item-renderer, tp-yt-paper-item, yt-list-item-view-model, " +
    "ytd-menu-navigation-item-renderer";

  const HIDE_CLASS = "youprune-hidden";

  // --- In-memory state (hydrated from storage) ------------------------------
  let settings = Object.assign({}, YP.DEFAULT_SETTINGS);
  let banned = {};
  let counts = {};
  let bannedKeys = new Set();

  // The card the user most recently opened a 3-dot menu on (for menu attribution)
  // and the channel they most recently right-clicked (for context menu).
  let lastMenuCtx = null; // { keys:[], name, ts }
  let lastContextChannel = null; // { key, keys:[], name }

  // ------------------------------------------------------------------------
  // Channel extraction
  // ------------------------------------------------------------------------
  function collectChannelKeys(card) {
    const keys = [];
    let name = "";
    if (!card) return { keys, name };
    const links = card.querySelectorAll(CHANNEL_LINKS);
    for (const a of links) {
      const k = YP.channelKeyFromHref(a.getAttribute("href"));
      if (k && !keys.includes(k)) keys.push(k);
      if (!name) {
        const t = (a.textContent || "").trim();
        if (t) name = t;
      }
    }
    if (!name) {
      const nameEl = card.querySelector("ytd-channel-name #text, #channel-name #text");
      if (nameEl) name = (nameEl.textContent || "").trim();
    }
    return { keys, name };
  }

  function isShortsCard(card) {
    if (card.matches && card.matches("ytd-reel-item-renderer")) return true;
    const a = card.querySelector('a[href^="/shorts/"]');
    return !!a;
  }

  // ------------------------------------------------------------------------
  // Hide / show decisions
  // ------------------------------------------------------------------------
  function markHidden(el, reason) {
    if (!el.classList.contains(HIDE_CLASS)) el.classList.add(HIDE_CLASS);
    el.setAttribute("data-youprune-reason", reason);
  }
  function markShown(el) {
    if (el.classList.contains(HIDE_CLASS)) {
      el.classList.remove(HIDE_CLASS);
      el.removeAttribute("data-youprune-reason");
    }
  }

  function scanCards() {
    const cards = document.querySelectorAll(RENDERERS);
    for (const card of cards) {
      if (!settings.enabled) {
        markShown(card);
        continue;
      }
      // Shorts
      if (settings.hideShorts && isShortsCard(card)) {
        markHidden(card, "shorts");
        continue;
      }
      // Banned channel
      const { keys } = collectChannelKeys(card);
      const hit = keys.find((k) => bannedKeys.has(k));
      if (hit) {
        markHidden(card, "channel");
        continue;
      }
      markShown(card);
    }
  }

  function scanShelves() {
    const shelves = document.querySelectorAll(SHELVES);
    for (const shelf of shelves) {
      // Never nuke the home grid container itself; these selectors are leaf shelves.
      if (!settings.enabled) {
        markShown(shelf);
        continue;
      }
      const isShortShelf =
        shelf.matches("ytd-reel-shelf-renderer") ||
        (shelf.matches("ytd-rich-section-renderer") && shelf.querySelector('[href^="/shorts/"]'));
      if (settings.hideShorts && isShortShelf) {
        markHidden(shelf, "shorts-shelf");
        continue;
      }
      if (settings.hideShelves) {
        markHidden(shelf, "shelf");
        continue;
      }
      markShown(shelf);
    }
  }

  function scanAds() {
    if (!settings.enabled || !settings.hideAds) return;
    document.querySelectorAll(ADS).forEach((el) => markHidden(el, "ad"));
  }

  let scanQueued = false;
  function scheduleScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      try {
        scanCards();
        scanShelves();
        scanAds();
      } catch (e) {
        console.warn("[YouPrune] scan error", e);
      }
    });
  }

  // ------------------------------------------------------------------------
  // Banning
  // ------------------------------------------------------------------------
  async function banChannel({ keys, name }, reason) {
    if (!keys || !keys.length) {
      console.warn("[YouPrune] no channel key resolved; cannot ban");
      return false;
    }
    const primary =
      keys.find((k) => k.startsWith("id:")) || keys.find((k) => k.startsWith("handle:")) || keys[0];
    banned[primary] = {
      name: name || banned[primary]?.name || "",
      keys: Array.from(new Set(keys)),
      reason,
      addedAt: Date.now(),
    };
    bannedKeys = YP.bannedKeySet(banned);
    await YP.set({ [YP.STORAGE_KEYS.banned]: banned });
    scheduleScan();
    return true;
  }

  async function recordNotInterested({ keys, name }) {
    if (!keys || !keys.length) return;
    const primary =
      keys.find((k) => k.startsWith("id:")) || keys.find((k) => k.startsWith("handle:")) || keys[0];
    const entry = counts[primary] || { count: 0, name: "", keys: [] };
    entry.count += 1;
    entry.name = name || entry.name;
    entry.keys = Array.from(new Set([...(entry.keys || []), ...keys]));
    entry.lastAt = Date.now();
    counts[primary] = entry;
    await YP.set({ [YP.STORAGE_KEYS.counts]: counts });

    if (entry.count >= settings.notInterestedThreshold) {
      await banChannel({ keys: entry.keys, name: entry.name }, YP.REASON.threshold);
    }
  }

  // ------------------------------------------------------------------------
  // Menu interception
  //   Phase A: when a 3-dot button inside a card is pressed, remember the card.
  //   Phase B: when a menu item is clicked, match its text and act.
  // ------------------------------------------------------------------------
  function onPointerDownCapture(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    for (const node of path) {
      if (node.nodeType !== 1 || !node.closest) continue;
      const card = node.closest(RENDERERS);
      if (card) {
        const { keys, name } = collectChannelKeys(card);
        if (keys.length) lastMenuCtx = { keys, name, ts: Date.now() };
        return;
      }
    }
  }

  function labelMatches(text, labels) {
    const t = text.toLowerCase();
    return labels.some((l) => t.includes(l.toLowerCase()));
  }

  function onClickCapture(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    let item = null;
    for (const node of path) {
      if (node.nodeType === 1 && node.matches && node.matches(MENU_ITEMS)) {
        item = node;
        break;
      }
    }
    if (!item) return;
    const text = (item.textContent || "").trim();
    if (!text) return;

    // Attribution context must be reasonably fresh.
    const ctx = lastMenuCtx && Date.now() - lastMenuCtx.ts < 120000 ? lastMenuCtx : null;
    if (!ctx) return;

    if (labelMatches(text, settings.dontRecommendLabels)) {
      banChannel(ctx, YP.REASON.dontRecommend);
    } else if (labelMatches(text, settings.notInterestedLabels)) {
      recordNotInterested(ctx);
    }
  }

  function onContextMenuCapture(e) {
    lastContextChannel = null;
    const path = e.composedPath ? e.composedPath() : [e.target];
    // Prefer a directly right-clicked channel link.
    for (const node of path) {
      if (node.nodeType === 1 && node.matches && node.matches("a[href]")) {
        const k = YP.channelKeyFromHref(node.getAttribute("href"));
        if (k) {
          lastContextChannel = { keys: [k], name: (node.textContent || "").trim() };
          return;
        }
      }
    }
    // Fallback: the enclosing card.
    for (const node of path) {
      if (node.nodeType === 1 && node.closest) {
        const card = node.closest(RENDERERS + ",ytd-watch-metadata,#owner");
        if (card) {
          const { keys, name } = collectChannelKeys(card);
          if (keys.length) lastContextChannel = { keys, name };
          return;
        }
      }
    }
  }

  // ------------------------------------------------------------------------
  // Messaging (from background context menu + popup)
  // ------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case "CONTEXT_HIDE_CHANNEL":
        if (lastContextChannel) {
          banChannel(lastContextChannel, YP.REASON.manual).then((ok) => sendResponse({ ok }));
        } else {
          sendResponse({ ok: false, error: "no-channel" });
        }
        return true; // async
      case "BAN_CURRENT_CHANNEL": {
        // Used by popup on a watch page.
        const card = document.querySelector("ytd-watch-metadata, #owner");
        const info = collectChannelKeys(card);
        banChannel(info, YP.REASON.manual).then((ok) => sendResponse({ ok, name: info.name }));
        return true;
      }
      case "GET_PAGE_STATS":
        sendResponse({
          hidden: document.querySelectorAll("." + HIDE_CLASS).length,
          channel: collectChannelKeys(document.querySelector("ytd-watch-metadata, #owner")),
        });
        return false;
      default:
        return false;
    }
  });

  // ------------------------------------------------------------------------
  // Reveal attribute
  // ------------------------------------------------------------------------
  function applyReveal() {
    const el = document.documentElement;
    if (settings.reveal) el.setAttribute("data-youprune-reveal", "1");
    else el.removeAttribute("data-youprune-reveal");
  }

  // ------------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------------
  async function hydrate() {
    const data = await YP.getAll();
    settings = data.settings;
    banned = data.banned;
    counts = data.counts;
    bannedKeys = YP.bannedKeySet(banned);
    applyReveal();
    scheduleScan();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[YP.STORAGE_KEYS.settings]) {
      settings = Object.assign({}, YP.DEFAULT_SETTINGS, changes[YP.STORAGE_KEYS.settings].newValue || {});
      applyReveal();
    }
    if (changes[YP.STORAGE_KEYS.banned]) {
      banned = changes[YP.STORAGE_KEYS.banned].newValue || {};
      bannedKeys = YP.bannedKeySet(banned);
    }
    if (changes[YP.STORAGE_KEYS.counts]) {
      counts = changes[YP.STORAGE_KEYS.counts].newValue || {};
    }
    scheduleScan();
  });

  // Capture-phase listeners so we see events before YouTube stops propagation.
  document.addEventListener("pointerdown", onPointerDownCapture, true);
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("contextmenu", onContextMenuCapture, true);

  // Observe the whole document; YouTube is an SPA that mutates constantly.
  const observer = new MutationObserver(scheduleScan);
  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      scheduleScan();
    } else {
      requestAnimationFrame(startObserver);
    }
  }

  hydrate();
  startObserver();
  // YouTube fires this on SPA navigations.
  window.addEventListener("yt-navigate-finish", scheduleScan);
})();
