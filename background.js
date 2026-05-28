const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sleepRandom = (min, max) => sleep(Math.random() * (max - min) + min);
const stopRequests = new Map();
const INTERVAL_PRESETS = {
  small: { min: 100, max: 1000 },
  medium: { min: 1000, max: 3000 },
  large: { min: 8000, max: 10000 },
};

function panelStateKey(tabId) {
  return `panelState:${tabId}`;
}

async function getPanelState(tabId) {
  const key = panelStateKey(tabId);
  const result = await chrome.storage.session.get(key);
  return result[key] ?? { open: false, x: null, y: null, collapsed: false };
}

async function setPanelState(tabId, state) {
  const key = panelStateKey(tabId);
  await chrome.storage.session.set({ [key]: state });
}

function countTargetsScript() {
  return (actionType) => {
    function isVisible(el) {
      if (!(el instanceof HTMLElement)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none") return false;
      if (style.visibility === "hidden") return false;
      if (style.pointerEvents === "none") return false;
      return true;
    }

    function hasReciprocalFollow(button) {
      const item = button.closest("li");
      return item?.textContent?.includes("フォローされています") ?? false;
    }

    function getButtons(type) {
      if (type === "like") {
        return [
          ...document.querySelectorAll(
            'button[data-id="ButtonIcon"][aria-pressed="false"]:has([data-name="reaction-overlay"]):has(svg[aria-label="スキ"]), button.o-noteLikeV3__iconButton[aria-pressed="false"][aria-label="スキ"]'
          ),
        ];
      }

      if (type === "follow") {
        return [
          ...document.querySelectorAll(
            'button[data-name="ToggleButton"][aria-pressed="false"]:has([data-name="reaction-overlay"])'
          ),
        ].filter((el) => el.textContent.trim() === "フォロー");
      }

      if (type === "unfollow") {
        return [
          ...document.querySelectorAll(
            'button[data-name="ToggleButton"][aria-pressed="true"]:has([data-name="reaction-overlay"])'
          ),
        ]
          .filter((el) => el.textContent.trim() === "フォロー中")
          .filter((el) => !hasReciprocalFollow(el));
      }

      return [];
    }

    return getButtons(actionType)
      .filter((el) => el instanceof HTMLButtonElement)
      .filter((el) => !el.disabled)
      .filter(isVisible)
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.top - rb.top || ra.left - rb.left;
      }).length;
  };
}

function clickFirstScript() {
  return async (actionType) => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function isVisible(el) {
      if (!(el instanceof HTMLElement)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none") return false;
      if (style.visibility === "hidden") return false;
      if (style.pointerEvents === "none") return false;
      return true;
    }

    function hasReciprocalFollow(button) {
      const item = button.closest("li");
      return item?.textContent?.includes("フォローされています") ?? false;
    }

    function isActionableButton(button, type) {
      if (!(button instanceof HTMLButtonElement)) return false;
      if (button.disabled) return false;
      if (!isVisible(button)) return false;

      if (type === "like") {
        return button.matches(
          'button[data-id="ButtonIcon"][aria-pressed="false"]:has([data-name="reaction-overlay"]):has(svg[aria-label="スキ"]), button.o-noteLikeV3__iconButton[aria-pressed="false"][aria-label="スキ"]'
        );
      }

      if (type === "follow") {
        return button.matches(
          'button[data-name="ToggleButton"][aria-pressed="false"]:has([data-name="reaction-overlay"])'
        ) && button.textContent.trim() === "フォロー";
      }

      if (type === "unfollow") {
        return button.matches(
          'button[data-name="ToggleButton"][aria-pressed="true"]:has([data-name="reaction-overlay"])'
        ) && button.textContent.trim() === "フォロー中" && !hasReciprocalFollow(button);
      }

      return false;
    }

    function getButtons(type) {
      if (type === "like") {
        return [
          ...document.querySelectorAll(
            'button[data-id="ButtonIcon"][aria-pressed="false"]:has([data-name="reaction-overlay"]):has(svg[aria-label="スキ"]), button.o-noteLikeV3__iconButton[aria-pressed="false"][aria-label="スキ"]'
          ),
        ];
      }

      if (type === "follow") {
        return [
          ...document.querySelectorAll(
            'button[data-name="ToggleButton"][aria-pressed="false"]:has([data-name="reaction-overlay"])'
          ),
        ].filter((el) => el.textContent.trim() === "フォロー");
      }

      if (type === "unfollow") {
        return [
          ...document.querySelectorAll(
            'button[data-name="ToggleButton"][aria-pressed="true"]:has([data-name="reaction-overlay"])'
          ),
        ]
          .filter((el) => el.textContent.trim() === "フォロー中")
          .filter((el) => !hasReciprocalFollow(el));
      }

      return [];
    }

    const button = getButtons(actionType)
      .filter((el) => el instanceof HTMLButtonElement)
      .filter((el) => !el.disabled)
      .filter(isVisible)
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.top - rb.top || ra.left - rb.left;
      })[0];

    if (!button) return { ok: false, reason: "not_found" };
    button.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    button.click();

    for (let attempt = 0; attempt < 25; attempt += 1) {
      await wait(200);
      if (!button.isConnected || !isActionableButton(button, actionType)) {
        return { ok: true };
      }
    }

    return { ok: false, reason: "state_not_changed" };
  };
}

async function countTargets(tabId, actionType) {
  const countResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: countTargetsScript(),
    args: [actionType],
  });

  return countResult[0]?.result ?? 0;
}

async function runLoop(tabId, actionType, limit, intervalPreset) {
  stopRequests.set(tabId, false);
  const preset = INTERVAL_PRESETS[intervalPreset] ?? INTERVAL_PRESETS.small;

  const count = await countTargets(tabId, actionType);
  const total = Math.min(count, limit);
  await chrome.storage.session.set({
    progress: { current: 0, total, done: false, stopped: false },
  });

  if (total === 0) {
    await chrome.storage.session.set({
      progress: { current: 0, total: 0, done: true, stopped: false },
    });
    stopRequests.delete(tabId);
    return;
  }

  for (let i = 0; i < total; i += 1) {
    if (stopRequests.get(tabId)) {
      await chrome.storage.session.set({
        progress: { current: i, total, done: true, stopped: true },
      });
      stopRequests.delete(tabId);
      return;
    }

    const beforeCount = await countTargets(tabId, actionType);
    const clickResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: clickFirstScript(),
      args: [actionType],
    });

    const result = clickResult[0]?.result;
    if (!result?.ok) {
      await chrome.storage.session.set({
        progress: {
          error:
            result?.reason === "state_not_changed"
              ? "操作結果が反映されませんでした。レート制限の可能性があります。"
              : "対象ボタンが見つかりませんでした。",
          done: true,
          stopped: false,
        },
      });
      stopRequests.delete(tabId);
      return;
    }

    let actionApplied = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(250);
      const afterCount = await countTargets(tabId, actionType);
      if (afterCount < beforeCount) {
        actionApplied = true;
        break;
      }
    }

    if (!actionApplied) {
      await chrome.storage.session.set({
        progress: {
          error: "操作結果が反映されませんでした。429 などのレート制限の可能性があります。",
          done: true,
          stopped: false,
        },
      });
      stopRequests.delete(tabId);
      return;
    }

    await chrome.storage.session.set({
      progress: { current: i + 1, total, done: false, stopped: false },
    });
    await sleepRandom(preset.min, preset.max);
  }

  await chrome.storage.session.set({
    progress: { current: total, total, done: true, stopped: false },
  });
  stopRequests.delete(tabId);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith("https://note.com/")) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle-panel", tabId: tab.id });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { type: "toggle-panel", tabId: tab.id });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get-panel-state") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "tab not found" });
      return true;
    }

    getPanelState(tabId)
      .then((state) => sendResponse({ ok: true, state, tabId }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "set-panel-state") {
    const tabId = sender.tab?.id ?? msg.tabId;
    if (!tabId) {
      sendResponse({ ok: false, error: "tab not found" });
      return true;
    }

    setPanelState(tabId, msg.state)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "start") {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "tab not found" });
      return true;
    }

    const { actionType, limit, intervalPreset } = msg;
    runLoop(tabId, actionType, limit, intervalPreset).catch((err) => {
      chrome.storage.session.set({
        progress: { error: err.message, done: true, stopped: false },
      });
      stopRequests.delete(tabId);
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "count") {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "tab not found" });
      return true;
    }

    countTargets(tabId, msg.actionType)
      .then((count) => sendResponse({ ok: true, count }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "get-progress") {
    chrome.storage.session
      .get("progress")
      .then(({ progress }) => sendResponse({ ok: true, progress: progress ?? null }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "stop") {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "tab not found" });
      return true;
    }

    stopRequests.set(tabId, true);
    sendResponse({ ok: true });
    return true;
  }
});
