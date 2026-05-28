let polling = null;
let summaryPolling = null;

function stopPolling() {
  if (polling) {
    clearInterval(polling);
    polling = null;
  }
}

function stopSummaryPolling() {
  if (summaryPolling) {
    clearInterval(summaryPolling);
    summaryPolling = null;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getAutoRunEnabled() {
  const { autoRunEnabled } = await chrome.storage.local.get('autoRunEnabled');
  return autoRunEnabled !== false;
}

function isFollowersPage(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return parsed.pathname.includes('/followers') || parsed.pathname.includes('/followings');
  } catch {
    return false;
  }
}

function buildFollowersPageUrl(url, direction) {
  const parsed = new URL(url);
  const currentPage = Math.max(parseInt(parsed.searchParams.get('page') || '1', 10) || 1, 1);
  const nextPage = direction === 'next' ? currentPage + 1 : Math.max(currentPage - 1, 1);

  if (nextPage === 1) {
    parsed.searchParams.delete('page');
  } else {
    parsed.searchParams.set('page', String(nextPage));
  }

  return parsed.toString();
}

function getCurrentPage(url) {
  try {
    const parsed = new URL(url);
    return Math.max(parseInt(parsed.searchParams.get('page') || '1', 10) || 1, 1);
  } catch {
    return 1;
  }
}

async function refreshFollowerNavState() {
  const navActions = document.getElementById('navActions');
  const prevButton = document.getElementById('prevPage');
  const nextButton = document.getElementById('nextPage');
  const pageIndicator = document.getElementById('pageIndicator');
  const tab = await getActiveTab();
  const enabled = isFollowersPage(tab?.url);
  const currentPage = getCurrentPage(tab?.url);

  navActions.hidden = !enabled;
  prevButton.disabled = !enabled || currentPage <= 1;
  nextButton.disabled = !enabled;
  pageIndicator.textContent = enabled ? `Page ${currentPage}` : '-';
}

async function fetchActionCount(tabId, actionType) {
  const response = await chrome.runtime.sendMessage({ type: 'count', tabId, actionType });
  if (!response?.ok) throw new Error(response?.error || 'count failed');
  return response.count;
}

async function refreshActionSummary() {
  const likeCount = document.getElementById('likeCount');
  const followCount = document.getElementById('followCount');
  const unfollowCount = document.getElementById('unfollowCount');
  const tab = await getActiveTab();

  if (!tab?.id) {
    likeCount.textContent = '-';
    followCount.textContent = '-';
    unfollowCount.textContent = '-';
    return;
  }

  try {
    const [like, follow, unfollow] = await Promise.all([
      fetchActionCount(tab.id, 'like'),
      fetchActionCount(tab.id, 'follow'),
      fetchActionCount(tab.id, 'unfollow'),
    ]);

    likeCount.textContent = String(like);
    followCount.textContent = String(follow);
    unfollowCount.textContent = String(unfollow);
  } catch {
    likeCount.textContent = '-';
    followCount.textContent = '-';
    unfollowCount.textContent = '-';
  }
}

async function startSummaryPolling() {
  stopSummaryPolling();
  await refreshActionSummary();
  summaryPolling = setInterval(() => {
    refreshActionSummary();
    refreshFollowerNavState();
  }, 1500);
}

async function moveFollowersPage(direction) {
  const status = document.getElementById('status');
  const tab = await getActiveTab();

  if (!isFollowersPage(tab?.url)) {
    status.textContent = 'followers / followings ページでのみ移動できます';
    return;
  }

  const nextUrl = buildFollowersPageUrl(tab.url, direction);
  await chrome.tabs.update(tab.id, { url: nextUrl });
  window.close();
}

async function startPolling(total) {
  const status = document.getElementById('status');

  stopPolling();
  polling = setInterval(async () => {
    const { progress } = await chrome.storage.session.get('progress');
    if (!progress) return;

    if (progress.error) {
      status.textContent = `エラー: ${progress.error}`;
      stopPolling();
      return;
    }

    if (progress.stopped) {
      status.textContent = `停止しました: ${progress.current} / ${progress.total}`;
      stopPolling();
      return;
    }

    const currentTotal = progress.total ?? total;
    status.textContent = currentTotal === 0
      ? '対象要素は 0 件です'
      : `${progress.current} / ${currentTotal} 実行中...`;

    if (progress.done) {
      status.textContent = currentTotal === 0
        ? '対象要素は 0 件です'
        : `完了: ${progress.current} / ${currentTotal}`;
      stopPolling();
    }
  }, 300);
}

async function run(actionType) {
  stopPolling();

  const limit = parseInt(document.getElementById('count').value, 10) || 15;
  const status = document.getElementById('status');
  const autoRunEnabled = await getAutoRunEnabled();
  const tab = await getActiveTab();

  if (!autoRunEnabled) {
    status.textContent = '件数を確認中...';
    const response = await chrome.runtime.sendMessage({ type: 'count', tabId: tab.id, actionType });
    status.textContent = response.ok
      ? `対象要素は ${Math.min(response.count, limit)} / ${response.count} 件です`
      : `エラー: ${response.error}`;
    return;
  }

  status.textContent = '開始中...';
  await chrome.runtime.sendMessage({ type: 'start', tabId: tab.id, actionType, limit });
  await startPolling(limit);
}

async function stopRun() {
  stopPolling();

  const status = document.getElementById('status');
  const tab = await getActiveTab();
  status.textContent = '停止中...';
  await chrome.runtime.sendMessage({ type: 'stop', tabId: tab.id });
  await startPolling(0);
}

async function initAutoRunToggle() {
  const toggle = document.getElementById('autoRun');
  const enabled = await getAutoRunEnabled();
  toggle.checked = enabled;

  toggle.addEventListener('change', async (event) => {
    await chrome.storage.local.set({ autoRunEnabled: event.target.checked });
  });
}

document.getElementById('prevPage').addEventListener('click', () => moveFollowersPage('prev'));
document.getElementById('nextPage').addEventListener('click', () => moveFollowersPage('next'));
document.getElementById('like').addEventListener('click', () => run('like'));
document.getElementById('follow').addEventListener('click', () => run('follow'));
document.getElementById('unfollow').addEventListener('click', () => run('unfollow'));
document.getElementById('stop').addEventListener('click', () => stopRun());

initAutoRunToggle();
refreshFollowerNavState();
startSummaryPolling();
