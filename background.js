// Service worker: context menu, toolbar button, navigation rules, and
// keeping all of them in sync with the settings page.
importScripts('lib/cleaner.js');

const TS = self.TrackerStripper;
const MENU_LINK = 'copy-clean-link';
const MENU_PAGE = 'copy-clean-page';

async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return Object.assign({}, TS.DEFAULT_SETTINGS, settings);
}

// ---------- Clipboard (via offscreen document) ----------

let creatingOffscreen = null;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Copy cleaned links to the clipboard'
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function copyToClipboard(text) {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'copy', text });
  if (!res || !res.ok) throw new Error((res && res.error) || 'copy failed');
}

async function flashBadge(tabId, ok) {
  const opts = tabId ? { tabId } : {};
  await chrome.action.setBadgeBackgroundColor({ ...opts, color: ok ? '#1a7f37' : '#cf222e' });
  await chrome.action.setBadgeText({ ...opts, text: ok ? '✓' : '!' });
  setTimeout(() => chrome.action.setBadgeText({ ...opts, text: '' }).catch(() => {}), 1500);
}

async function copyClean(url, tabId) {
  const { extraParams } = await getSettings();
  const cleaned = TS.cleanUrl(url, TS.parseExtraParams(extraParams));
  try {
    await copyToClipboard(cleaned);
    await flashBadge(tabId, true);
  } catch (e) {
    console.error('Tracker Stripper: copy failed', e);
    await flashBadge(tabId, false);
  }
}

// ---------- Context menu ----------

async function applyContextMenu(settings) {
  await chrome.contextMenus.removeAll();
  if (!settings.contextMenu) return;
  chrome.contextMenus.create({ id: MENU_LINK, title: 'Copy clean link', contexts: ['link'] });
  chrome.contextMenus.create({ id: MENU_PAGE, title: 'Copy clean page link', contexts: ['page', 'frame'] });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab && tab.id;
  if (info.menuItemId === MENU_LINK && info.linkUrl) copyClean(info.linkUrl, tabId);
  if (info.menuItemId === MENU_PAGE) copyClean(info.frameUrl || info.pageUrl || (tab && tab.url), tabId);
});

// ---------- Toolbar button ----------

async function applyToolbar(settings) {
  // With the feature off, clicking the icon opens settings instead.
  await chrome.action.setPopup({ popup: '' });
  await chrome.action.setTitle({
    title: settings.toolbarButton ? 'Copy clean link to this page' : 'Tracker Stripper settings'
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  const settings = await getSettings();
  if (!settings.toolbarButton || !tab || !tab.url) {
    chrome.runtime.openOptionsPage();
    return;
  }
  copyClean(tab.url, tab.id);
});

// ---------- Navigation cleaning (declarativeNetRequest) ----------

// Builds redirect rules that strip tracking parameters before a page loads.
// Each rule fires when one parameter appears and removes its whole group,
// so a URL usually needs only one redirect per group.
function buildNavigationRules(extraParams) {
  const rules = [];
  let id = 1;
  const groups = [{ params: TS.GLOBAL_PARAMS.concat(extraParams), domains: null }]
    .concat(TS.SITE_RULES.map((r) => ({ params: r.params, domains: r.domains })));

  for (const group of groups) {
    // removeParams is case-sensitive; include common capitalisations.
    const names = [...new Set(group.params.flatMap((p) => [p, p.toLowerCase()]))];
    for (const p of names) {
      for (const sep of ['?', '&']) {
        const condition = {
          urlFilter: sep + p + '=',
          resourceTypes: ['main_frame'],
          requestMethods: ['get'],
          isUrlFilterCaseSensitive: true
        };
        if (group.domains) condition.requestDomains = group.domains;
        rules.push({
          id: id++,
          priority: 1,
          action: { type: 'redirect', redirect: { transform: { queryTransform: { removeParams: names } } } },
          condition
        });
      }
    }
  }

  // Amazon path tracking: /dp/B000XXXX/ref=sr_1_1?... -> /dp/B000XXXX?...
  rules.push({
    id: id++,
    priority: 2,
    action: { type: 'redirect', redirect: { regexSubstitution: '\\1\\2' } },
    condition: {
      regexFilter: '^(https?://[^/]+/[^?#]*?)/ref=[^/?#]*(.*)$',
      requestDomains: TS.AMAZON_DOMAINS,
      resourceTypes: ['main_frame'],
      requestMethods: ['get']
    }
  });
  return rules;
}

async function applyNavigation(settings) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = settings.navigation
    ? buildNavigationRules(TS.parseExtraParams(settings.extraParams))
    : [];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules
  });
}

// ---------- Wiring ----------

async function applyAll() {
  const settings = await getSettings();
  await Promise.all([
    applyContextMenu(settings),
    applyToolbar(settings),
    applyNavigation(settings).catch((e) => console.error('Tracker Stripper: navigation rules failed', e))
  ]);
}

// Content scripts declared in the manifest only reach tabs opened after
// install, so add them to tabs that are already open.
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    const target = { tabId: tab.id, allFrames: true };
    chrome.scripting.executeScript({ target, files: ['lib/cleaner.js', 'content/copy-guard.js'] }).catch(() => {});
    chrome.scripting.executeScript({ target, files: ['content/page-hook.js'], world: 'MAIN' }).catch(() => {});
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await applyAll();
  injectIntoOpenTabs();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(applyAll);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) applyAll();
});
