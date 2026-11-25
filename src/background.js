/*
 * YouPrune — background.js (MV3 service worker, classic script)
 * - Seeds defaults on install.
 * - Owns the right-click context menu (Trigger 3).
 * - Placeholder home for the future network module.
 */
importScripts("common.js");
const YP = self.YouPrune;

const MENU_ID_HIDE = "youprune-hide-channel";

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID_HIDE,
      title: "YouPrune: Hide this channel",
      contexts: ["link", "image", "page"],
      documentUrlPatterns: ["*://*.youtube.com/*"],
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  // Seed defaults without clobbering anything already stored.
  const data = await YP.getAll();
  await YP.set({
    [YP.STORAGE_KEYS.settings]: data.settings,
    [YP.STORAGE_KEYS.banned]: data.banned,
    [YP.STORAGE_KEYS.counts]: data.counts,
  });
  createMenus();
});

chrome.runtime.onStartup.addListener(createMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID_HIDE || !tab || tab.id == null) return;
  // The content script already recorded the right-clicked channel on contextmenu.
  chrome.tabs.sendMessage(tab.id, { type: "CONTEXT_HIDE_CHANNEL" }, (resp) => {
    // Swallow "no receiving end" errors on non-YouTube pages.
    void chrome.runtime.lastError;
    void resp;
  });
});

/* -------------------------------------------------------------------------
 * Future: network module. When settings.apiEnabled is on, this is where we'll
 * fetch low-rated channels from settings.apiBaseUrl and merge them into the
 * ban list with reason "remote". Left inert in v0.1.
 * ---------------------------------------------------------------------- */
