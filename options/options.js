const TS = globalThis.TrackerStripper;
const TOGGLES = ['copyIntercept', 'contextMenu', 'toolbarButton', 'navigation'];
const statusEl = document.getElementById('status');
const extrasEl = document.getElementById('extraParams');
const testInput = document.getElementById('testInput');
const testOutput = document.getElementById('testOutput');
let settings = Object.assign({}, TS.DEFAULT_SETTINGS);
let statusTimer;

function showStatus(msg) {
  statusEl.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 2000);
}

async function save(patch, msg) {
  settings = Object.assign({}, settings, patch);
  await chrome.storage.sync.set({ settings });
  showStatus(msg || 'Saved');
  updateTest();
}

function updateTest() {
  const value = testInput.value.trim();
  if (!value) { testOutput.textContent = ''; testOutput.className = ''; return; }
  if (!TS.isSingleUrl(value)) {
    testOutput.textContent = 'That doesn’t look like a web link.';
    testOutput.className = 'same';
    return;
  }
  const cleaned = TS.cleanUrl(value, TS.parseExtraParams(settings.extraParams));
  testOutput.textContent = cleaned === value ? 'Nothing to remove. This link is already clean.' : cleaned;
  testOutput.className = cleaned === value ? 'same' : '';
}

async function init() {
  const data = await chrome.storage.sync.get('settings');
  settings = Object.assign({}, TS.DEFAULT_SETTINGS, data.settings);

  for (const key of TOGGLES) {
    const el = document.getElementById(key);
    el.checked = !!settings[key];
    el.addEventListener('change', () => save({ [key]: el.checked }, el.checked ? 'Turned on' : 'Turned off'));
  }

  extrasEl.value = settings.extraParams || '';
  document.getElementById('saveExtras').addEventListener('click', () => save({ extraParams: extrasEl.value }));
  testInput.addEventListener('input', updateTest);
}

init();
