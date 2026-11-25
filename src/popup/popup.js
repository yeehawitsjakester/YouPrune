/* YouPrune — popup.js */
(function () {
  "use strict";
  const YP = self.YouPrune;

  const $ = (id) => document.getElementById(id);

  function sendToActiveTab(msg) {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !/youtube\.com/.test(tab.url || "")) {
          resolve(null);
          return;
        }
        chrome.tabs.sendMessage(tab.id, msg, (resp) => {
          void chrome.runtime.lastError;
          resolve(resp || null);
        });
      });
    });
  }

  async function render() {
    const data = await YP.getAll();
    $("enabled").checked = data.settings.enabled;
    $("reveal").checked = data.settings.reveal;
    $("bannedCount").textContent = Object.keys(data.banned).length;

    const stats = await sendToActiveTab({ type: "GET_PAGE_STATS" });
    $("hiddenCount").textContent = stats ? stats.hidden : "–";

    const canBan = stats && stats.channel && stats.channel.keys.length;
    $("banCurrent").disabled = !canBan;
    $("currentChannel").textContent = canBan
      ? "This video: " + (stats.channel.name || stats.channel.keys[0])
      : "Open a video to ban its channel.";
  }

  async function patchSettings(patch) {
    const data = await YP.getAll();
    await YP.set({ [YP.STORAGE_KEYS.settings]: Object.assign({}, data.settings, patch) });
  }

  $("enabled").addEventListener("change", (e) => patchSettings({ enabled: e.target.checked }));
  $("reveal").addEventListener("change", (e) => patchSettings({ reveal: e.target.checked }));

  $("banCurrent").addEventListener("click", async () => {
    const resp = await sendToActiveTab({ type: "BAN_CURRENT_CHANNEL" });
    if (resp && resp.ok) {
      $("currentChannel").textContent = "Banned: " + (resp.name || "channel");
      render();
    } else {
      $("currentChannel").textContent = "Couldn't resolve a channel here.";
    }
  });

  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  render();
})();
