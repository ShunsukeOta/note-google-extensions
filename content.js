const PANEL_ID = "__note_tools_panel__";
const DEFAULT_X_MARGIN = 16;
const DEFAULT_Y_MARGIN = 16;
const SUMMARY_POLL_MS = 1500;
const PROGRESS_POLL_MS = 300;

const state = {
  tabId: null,
  open: false,
  x: null,
  y: null,
  collapsed: false,
  autoRunEnabled: true,
  intervalPreset: "small",
};

let root;
let shadow;
let progressPolling = null;
let summaryPolling = null;
let stopIndicatorTimer = null;
let stoppingUntil = 0;
let activityState = "idle";
let initialized = false;

function createPanel() {
  root = document.createElement("div");
  root.id = PANEL_ID;
  root.style.position = "fixed";
  root.style.inset = "0 auto auto 0";
  root.style.zIndex = "2147483647";
  root.style.display = "none";

  shadow = root.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .panel {
        width: 250px;
        border: 1px solid #d9d9d9;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
        color: #111;
        font: 11px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
        backdrop-filter: blur(10px);
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 11px 7px;
        border-bottom: 1px solid #ececec;
        cursor: move;
        user-select: none;
        background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
      }
      .title {
        font-size: 11px;
        font-weight: 700;
      }
      .close {
        border: 0;
        background: transparent;
        color: #666;
        cursor: pointer;
        font-size: 15px;
        line-height: 1;
        padding: 0;
        width: 18px;
        height: 18px;
      }
      .controls {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .icon-button {
        border: 0;
        background: transparent;
        color: #666;
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        padding: 0;
        width: 18px;
        height: 18px;
      }
      .body { padding: 9px 11px 11px; }
      .body.collapsed { display: none; }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 9px;
      }
      .row-label,
      .label {
        color: #555;
        font-size: 9px;
      }
      .label {
        display: block;
        margin-bottom: 4px;
      }
      .switch {
        position: relative;
        width: 36px;
        height: 20px;
        display: inline-block;
      }
      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .slider {
        position: absolute;
        inset: 0;
        background: #d6d6d6;
        border-radius: 999px;
        transition: background 0.2s;
      }
      .slider::before {
        content: "";
        position: absolute;
        width: 14px;
        height: 14px;
        left: 3px;
        top: 3px;
        background: #fff;
        border-radius: 50%;
        transition: transform 0.2s;
      }
      .switch input:checked + .slider {
        background: #222;
      }
      .switch input:checked + .slider::before {
        transform: translateX(16px);
      }
      .nav {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 6px;
        margin-bottom: 9px;
      }
      .page {
        min-width: 52px;
        text-align: center;
        color: #666;
        font-size: 9px;
      }
      .summary {
        margin-bottom: 9px;
        padding: 7px;
        border: 1px solid #ececec;
        border-radius: 10px;
        background: #fafafa;
      }
      .summary-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: #555;
        font-size: 9px;
      }
      .summary-row + .summary-row {
        margin-top: 4px;
      }
      .summary-value {
        color: #111;
        font-weight: 700;
      }
      .count-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 9px;
      }
      .count {
        width: 56px;
        height: 26px;
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 0 8px;
        font-size: 11px;
        outline: none;
      }
      .count:focus {
        border-color: #888;
      }
      .unit {
        color: #888;
        font-size: 9px;
      }
      .intervals {
        display: flex;
        gap: 6px;
        margin-bottom: 9px;
      }
      .chip {
        flex: 1;
        border: 1px solid #ccc;
        border-radius: 999px;
        background: #fff;
        color: #555;
        cursor: pointer;
        font-size: 9px;
        padding: 5px 0;
        text-align: center;
      }
      .chip input {
        display: none;
      }
      .chip.active {
        border-color: #222;
        background: #222;
        color: #fff;
      }
      .actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 28px;
        border: 1px solid #ccc;
        border-radius: 8px;
        background: #fff;
        color: #111;
        font-size: 10px;
        cursor: pointer;
      }
      .btn:hover { background: #f6f6f6; }
      .btn:disabled {
        background: #f7f7f7;
        color: #aaa;
        cursor: not-allowed;
      }
      .danger {
        border-color: #e2b4b4;
        color: #8f2d2d;
      }
      .danger:hover { background: #fff4f4; }
      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 9px;
      }
      .activity {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        color: #666;
        font-size: 9px;
      }
      .activity.visible {
        display: flex;
      }
      .activity-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #bbb;
      }
      .activity.loading .activity-dot {
        background: #f59e0b;
      }
      .activity.stopping .activity-dot {
        background: #ef4444;
      }
      .activity.running .activity-dot {
        background: #22c55e;
      }
      .stop {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: auto;
        min-width: 72px;
        padding: 0 10px;
        margin-left: auto;
        background: #f6f6f6;
      }
      .stop-icon {
        font-size: 9px;
        line-height: 1;
      }
      .status {
        display: none;
      }
    </style>
    <div class="panel">
      <div class="header" id="dragHandle">
        <div class="title">note tools</div>
        <div class="controls">
          <button class="icon-button" id="collapseButton" type="button" aria-label="Collapse">−</button>
          <button class="close" id="closeButton" type="button" aria-label="Close">×</button>
        </div>
      </div>
      <div class="body" id="panelBody">
        <div class="row">
          <div class="row-label">自動実行</div>
          <label class="switch">
            <input type="checkbox" id="autoRun" checked />
            <span class="slider"></span>
          </label>
        </div>
        <div class="nav" id="navActions" hidden>
          <button class="btn" id="prevPage" type="button">前</button>
          <div class="page" id="pageIndicator">-</div>
          <button class="btn" id="nextPage" type="button">次</button>
        </div>
        <div class="summary">
          <div class="summary-row"><span>スキ可能数</span><span class="summary-value" id="likeCount">-</span></div>
          <div class="summary-row"><span>フォロー可能数</span><span class="summary-value" id="followCount">-</span></div>
          <div class="summary-row"><span>フォロー解除推薦数</span><span class="summary-value" id="unfollowCount">-</span></div>
        </div>
        <label class="label" for="countInput">実行件数</label>
        <div class="count-row">
          <input class="count" type="number" id="countInput" value="15" min="1" max="100" />
          <span class="unit">件まで</span>
        </div>
        <label class="label">実行スパン</label>
        <div class="intervals">
          <label class="chip" id="chip-small"><input type="radio" name="intervalPreset" value="small" checked />小</label>
          <label class="chip" id="chip-medium"><input type="radio" name="intervalPreset" value="medium" />中</label>
          <label class="chip" id="chip-large"><input type="radio" name="intervalPreset" value="large" />大</label>
        </div>
        <div class="actions">
          <button class="btn" id="likeButton" type="button">スキを実行</button>
          <button class="btn" id="followButton" type="button">フォローを実行</button>
          <button class="btn danger" id="unfollowButton" type="button">フォロー外しを実行</button>
        </div>
        <div class="footer">
          <div class="activity" id="activityIndicator">
            <span class="activity-dot"></span>
            <span id="activityText"></span>
          </div>
          <button class="btn stop" id="stopButton" type="button">
            <span class="stop-icon" aria-hidden="true">■</span>
            <span>停止</span>
          </button>
        </div>
        <div class="status" id="status">待機中...</div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(root);
}

function el(id) {
  return shadow.getElementById(id);
}

function stopProgressPolling() {
  if (progressPolling) {
    clearInterval(progressPolling);
    progressPolling = null;
  }
}

function stopSummaryPolling() {
  if (summaryPolling) {
    clearInterval(summaryPolling);
    summaryPolling = null;
  }
}

function clearStopIndicatorTimer() {
  if (stopIndicatorTimer) {
    clearTimeout(stopIndicatorTimer);
    stopIndicatorTimer = null;
  }
}

function isFollowersPage() {
  return /^\/[^/]+\/(followers|followings)$/.test(location.pathname);
}

function getCurrentPage() {
  const page = new URL(location.href).searchParams.get("page");
  return Math.max(parseInt(page || "1", 10) || 1, 1);
}

function buildFollowersPageUrl(direction) {
  const url = new URL(location.href);
  const currentPage = getCurrentPage();
  const nextPage = direction === "next" ? currentPage + 1 : Math.max(currentPage - 1, 1);

  if (nextPage === 1) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", String(nextPage));
  }

  return url.toString();
}

function clampPosition(x, y) {
  const panel = shadow.querySelector(".panel");
  const maxX = Math.max(window.innerWidth - panel.offsetWidth - 8, 0);
  const maxY = Math.max(window.innerHeight - panel.offsetHeight - 8, 0);

  return {
    x: Math.min(Math.max(x, 0), maxX),
    y: Math.min(Math.max(y, 0), maxY),
  };
}

function defaultPosition() {
  const panel = shadow.querySelector(".panel");
  const x = Math.max(window.innerWidth - panel.offsetWidth - DEFAULT_X_MARGIN, 0);
  return { x, y: DEFAULT_Y_MARGIN };
}

function applyPosition() {
  const position =
    state.x == null || state.y == null
      ? defaultPosition()
      : clampPosition(state.x, state.y);

  state.x = position.x;
  state.y = position.y;
  root.style.left = `${position.x}px`;
  root.style.top = `${position.y}px`;
}

async function persistPanelState() {
  if (!state.tabId) return;
  await chrome.runtime.sendMessage({
    type: "set-panel-state",
    state: { open: state.open, x: state.x, y: state.y, collapsed: state.collapsed },
  });
}

function applyCollapsedState() {
  el("panelBody").classList.toggle("collapsed", state.collapsed);
  const collapseButton = el("collapseButton");
  collapseButton.textContent = state.collapsed ? "+" : "−";
  collapseButton.setAttribute("aria-label", state.collapsed ? "Expand" : "Collapse");
}

async function refreshFollowerNavState() {
  const enabled = isFollowersPage();
  const currentPage = getCurrentPage();
  const nav = el("navActions");

  nav.hidden = !enabled;
  nav.style.display = enabled ? "grid" : "none";
  el("prevPage").disabled = !enabled || currentPage <= 1;
  el("nextPage").disabled = !enabled;
  el("pageIndicator").textContent = enabled ? `Page ${currentPage}` : "-";
}

async function fetchActionCount(actionType) {
  const response = await chrome.runtime.sendMessage({ type: "count", actionType });
  if (!response?.ok) throw new Error(response?.error || "count failed");
  return response.count;
}

async function refreshActionSummary() {
  try {
    const [like, follow, unfollow] = await Promise.all([
      fetchActionCount("like"),
      fetchActionCount("follow"),
      fetchActionCount("unfollow"),
    ]);

    el("likeCount").textContent = String(like);
    el("followCount").textContent = String(follow);
    el("unfollowCount").textContent = String(unfollow);
  } catch {
    el("likeCount").textContent = "-";
    el("followCount").textContent = "-";
    el("unfollowCount").textContent = "-";
  }
}

async function startSummaryPolling() {
  stopSummaryPolling();
  await refreshActionSummary();
  await refreshFollowerNavState();
  summaryPolling = setInterval(() => {
    refreshActionSummary();
    refreshFollowerNavState();
  }, SUMMARY_POLL_MS);
}

function setStatus(_text) {}

function setActivityIndicator(nextState) {
  const indicator = el("activityIndicator");
  const text = el("activityText");

  clearStopIndicatorTimer();
  activityState = nextState;
  indicator.className = "activity";

  if (nextState === "idle") {
    indicator.classList.add("visible", "loading");
    text.textContent = "待機中";
    return;
  }

  indicator.classList.add("visible", nextState);

  if (nextState === "loading") {
    text.textContent = "更新中";
    return;
  }

  if (nextState === "running") {
    text.textContent = "実行中";
    return;
  }

  if (nextState === "stopping") {
    text.textContent = "停止中";
    stoppingUntil = Date.now() + 1000;
    stopIndicatorTimer = setTimeout(() => {
      if (activityState === "stopping" && Date.now() >= stoppingUntil) {
        setActivityIndicator("idle");
      }
    }, 1000);
  }
}

function canOverrideStopIndicator() {
  return Date.now() >= stoppingUntil;
}

function setActionButtonsDisabled(disabled) {
  el("likeButton").disabled = disabled;
  el("followButton").disabled = disabled;
  el("unfollowButton").disabled = disabled;
}

function updateIntervalPresetUI() {
  ["small", "medium", "large"].forEach((preset) => {
    const chip = el(`chip-${preset}`);
    const input = shadow.querySelector(`input[name="intervalPreset"][value="${preset}"]`);
    const active = state.intervalPreset === preset;
    chip.classList.toggle("active", active);
    input.checked = active;
  });
}

function startProgressPolling(total) {
  stopProgressPolling();
  progressPolling = setInterval(async () => {
    const response = await chrome.runtime.sendMessage({ type: "get-progress" });
    if (!response?.ok) return;
    const progress = response.progress;
    if (!progress) return;

    if (progress.error) {
      setStatus(`エラー: ${progress.error}`);
      if (canOverrideStopIndicator()) setActivityIndicator("idle");
      setActionButtonsDisabled(false);
      stopProgressPolling();
      return;
    }

    if (progress.stopped) {
      setStatus(`停止しました: ${progress.current} / ${progress.total}`);
      setActionButtonsDisabled(false);
      stopProgressPolling();
      refreshActionSummary();
      return;
    }

    const currentTotal = progress.total ?? total;
    if (canOverrideStopIndicator()) {
      setActivityIndicator("running");
      el("activityText").textContent = `実行中 (${progress.current}/${currentTotal})`;
    }
    setStatus(
      currentTotal === 0
        ? "対象要素は 0 件です"
        : `${progress.current} / ${currentTotal} 実行中...`
    );

    if (progress.done) {
      setStatus(
        currentTotal === 0
          ? "対象要素は 0 件です"
          : `完了: ${progress.current} / ${currentTotal}`
      );
      if (canOverrideStopIndicator()) setActivityIndicator("idle");
      setActionButtonsDisabled(false);
      stopProgressPolling();
      refreshActionSummary();
    }
  }, PROGRESS_POLL_MS);
}

async function run(actionType) {
  stopProgressPolling();

  const limit = parseInt(el("countInput").value, 10) || 15;
  if (!state.autoRunEnabled) {
    setStatus("件数を確認中...");
    try {
      const count = await fetchActionCount(actionType);
      setStatus(`対象要素は ${Math.min(count, limit)} / ${count} 件です`);
    } catch (err) {
      setStatus(`エラー: ${err.message}`);
    }
    return;
  }

  setActionButtonsDisabled(true);
  setStatus("開始中...");
  const response = await chrome.runtime.sendMessage({
    type: "start",
    actionType,
    limit,
    intervalPreset: state.intervalPreset,
  });

  if (!response?.ok) {
    setStatus(`エラー: ${response?.error || "start failed"}`);
    setActivityIndicator("idle");
    setActionButtonsDisabled(false);
    return;
  }

  setActivityIndicator("running");
  startProgressPolling(limit);
}

async function stopRun() {
  stopProgressPolling();
  setActivityIndicator("stopping");
  setStatus("停止中...");
  await chrome.runtime.sendMessage({ type: "stop" });
  startProgressPolling(0);
}

async function moveFollowersPage(direction) {
  if (!isFollowersPage()) {
    setStatus("followers / followings ページでのみ移動できます");
    return;
  }

  location.assign(buildFollowersPageUrl(direction));
}

function bindDrag() {
  const handle = el("dragHandle");
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;

    dragging = true;
    offsetX = event.clientX - state.x;
    offsetY = event.clientY - state.y;
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const next = clampPosition(event.clientX - offsetX, event.clientY - offsetY);
    state.x = next.x;
    state.y = next.y;
    applyPosition();
  });

  handle.addEventListener("pointerup", async (event) => {
    if (!dragging) return;
    dragging = false;
    handle.releasePointerCapture(event.pointerId);
    await persistPanelState();
  });
}

async function loadSettings() {
  const { autoRunEnabled, intervalPreset } = await chrome.storage.local.get([
    "autoRunEnabled",
    "intervalPreset",
  ]);

  state.autoRunEnabled = autoRunEnabled !== false;
  state.intervalPreset = intervalPreset ?? "small";
  el("autoRun").checked = state.autoRunEnabled;
  updateIntervalPresetUI();
}

async function openPanel() {
  state.open = true;
  root.style.display = "block";
  applyCollapsedState();
  applyPosition();
  await persistPanelState();
  await loadSettings();
  setActivityIndicator("loading");
  await startSummaryPolling();
  if (activityState === "loading") {
    setActivityIndicator("idle");
  }
}

async function closePanel() {
  state.open = false;
  root.style.display = "none";
  stopProgressPolling();
  stopSummaryPolling();
  setActionButtonsDisabled(false);
  setActivityIndicator("idle");
  await persistPanelState();
}

async function togglePanel(forceOpen) {
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !state.open;
  if (shouldOpen) {
    await openPanel();
  } else {
    await closePanel();
  }
}

function bindEvents() {
  bindDrag();

  el("collapseButton").addEventListener("click", async () => {
    state.collapsed = !state.collapsed;
    applyCollapsedState();
    applyPosition();
    await persistPanelState();
  });
  el("closeButton").addEventListener("click", () => closePanel());
  el("autoRun").addEventListener("change", async (event) => {
    state.autoRunEnabled = event.target.checked;
    await chrome.storage.local.set({ autoRunEnabled: state.autoRunEnabled });
  });

  shadow.querySelectorAll('input[name="intervalPreset"]').forEach((input) => {
    input.addEventListener("change", async (event) => {
      state.intervalPreset = event.target.value;
      updateIntervalPresetUI();
      await chrome.storage.local.set({ intervalPreset: state.intervalPreset });
    });
  });

  el("prevPage").addEventListener("click", () => moveFollowersPage("prev"));
  el("nextPage").addEventListener("click", () => moveFollowersPage("next"));
  el("likeButton").addEventListener("click", () => run("like"));
  el("followButton").addEventListener("click", () => run("follow"));
  el("unfollowButton").addEventListener("click", () => run("unfollow"));
  el("stopButton").addEventListener("click", () => stopRun());

  window.addEventListener("resize", () => {
    if (!state.open) return;
    applyPosition();
    persistPanelState();
  });
}

async function init() {
  if (initialized) return;
  initialized = true;

  createPanel();
  bindEvents();

  const response = await chrome.runtime.sendMessage({ type: "get-panel-state" });
  if (response?.ok) {
    state.tabId = response.tabId;
    state.open = response.state.open;
    state.x = response.state.x;
    state.y = response.state.y;
    state.collapsed = response.state.collapsed ?? false;
  }

  await loadSettings();
  applyCollapsedState();
  if (state.open) {
    await openPanel();
  } else {
    applyPosition();
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "toggle-panel") {
    if (msg.tabId) state.tabId = msg.tabId;
    togglePanel();
  }
});

init();
