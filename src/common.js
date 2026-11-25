/*
 * YouPrune — common.js
 * Shared constants + pure helpers, loaded in every context:
 *   - content script  (listed first in manifest content_scripts)
 *   - service worker  (via importScripts in background.js)
 *   - popup / options (via <script> tag)
 *
 * Everything hangs off globalThis.YouPrune so there is a single source of truth.
 */
(function (root) {
  "use strict";

  const STORAGE_KEYS = {
    settings: "settings",
    banned: "bannedChannels",
    counts: "notInterestedCounts",
  };

  const DEFAULT_SETTINGS = {
    enabled: true,

    // Trigger 1: how many distinct "Not interested" clicks on a channel before
    // we auto-ban it client-side.
    notInterestedThreshold: 2,

    // Clutter filters (the stuff YouTube injects that isn't a video you asked for)
    hideShelves: true, // "Breaking news", "For you", games, "People also watched", posts…
    hideShorts: true, // Shorts shelves + individual /shorts/ items
    hideAds: true, // in-feed ad slots / promoted / display ads
    hideMixes: false, // "Mix" / radio playlist cards

    // Reveal mode: instead of hiding, dim pruned items with an outline (audit mode).
    reveal: false,

    // Localisation: menu-item label matching is text based. Override here for
    // non-English YouTube UIs. Matching is case-insensitive "contains".
    notInterestedLabels: ["not interested"],
    dontRecommendLabels: ["don't recommend channel", "dont recommend channel"],

    // ---- Future network module (inert in v0.1) -------------------------------
    apiEnabled: false,
    apiBaseUrl: "",
    apiKey: "",
    remoteThreshold: 0, // e.g. hide channels whose remote score is <= this
  };

  // Reasons a channel ends up on the ban list (stored on each entry).
  const REASON = {
    manual: "manual", // right-click hide
    dontRecommend: "dont-recommend",
    threshold: "threshold", // hit notInterestedThreshold
    remote: "remote", // future API
  };

  /**
   * Turn a channel href (absolute or relative) into a stable match key.
   * Returns a string like "id:UCxxxx", "handle:somehandle", "legacy:name",
   * or null if the href isn't a channel link.
   */
  function channelKeyFromHref(href) {
    if (!href) return null;
    let path = href;
    try {
      path = new URL(href, "https://www.youtube.com").pathname;
    } catch (_) {
      /* already a path */
    }
    let m;
    if ((m = path.match(/^\/channel\/(UC[0-9A-Za-z_-]{20,})/))) return "id:" + m[1];
    if ((m = path.match(/^\/@([^/]+)/))) return "handle:" + decodeURIComponent(m[1]).toLowerCase();
    if ((m = path.match(/^\/(?:c|user)\/([^/]+)/))) return "legacy:" + decodeURIComponent(m[1]).toLowerCase();
    return null;
  }

  // --- Promise wrappers over chrome.storage.local ---------------------------
  function getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [STORAGE_KEYS.settings, STORAGE_KEYS.banned, STORAGE_KEYS.counts],
        (data) => {
          resolve({
            settings: Object.assign({}, DEFAULT_SETTINGS, data[STORAGE_KEYS.settings] || {}),
            banned: data[STORAGE_KEYS.banned] || {},
            counts: data[STORAGE_KEYS.counts] || {},
          });
        }
      );
    });
  }

  function set(partial) {
    return new Promise((resolve) => chrome.storage.local.set(partial, resolve));
  }

  /**
   * Flatten the banned map into a Set of every match key, so a renderer that
   * exposes either the channel ID or the handle will be caught.
   */
  function bannedKeySet(banned) {
    const s = new Set();
    for (const primary of Object.keys(banned || {})) {
      s.add(primary);
      const keys = banned[primary] && banned[primary].keys;
      if (Array.isArray(keys)) keys.forEach((k) => s.add(k));
    }
    return s;
  }

  root.YouPrune = {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    REASON,
    channelKeyFromHref,
    getAll,
    set,
    bannedKeySet,
  };
})(typeof self !== "undefined" ? self : this);
