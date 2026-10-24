// Runs in the page's isolated world. Two jobs:
//  1. Clean URLs when the user (or the page) triggers a normal copy event,
//     e.g. Ctrl+C on a selected link or a "Copy link" button that uses
//     document.execCommand('copy').
//  2. Answer cleaning requests from page-hook.js, which runs in the page's
//     own world and wraps navigator.clipboard / navigator.share.
(function () {
  'use strict';
  if (window.__trackerStripperCopyGuard) return;
  window.__trackerStripperCopyGuard = true;

  const TS = globalThis.TrackerStripper;
  let enabled = TS.DEFAULT_SETTINGS.copyIntercept;
  let extras = [];

  function applySettings(s) {
    s = Object.assign({}, TS.DEFAULT_SETTINGS, s);
    enabled = !!s.copyIntercept;
    extras = TS.parseExtraParams(s.extraParams);
  }

  try {
    chrome.storage.sync.get('settings', (data) => applySettings(data && data.settings));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.settings) applySettings(changes.settings.newValue);
    });
  } catch (e) {
    // Extension context can disappear after an update; keep defaults.
  }

  function cleanText(text) {
    if (!enabled || !TS.isSingleUrl(text)) return text;
    const leading = text.match(/^\s*/)[0];
    const trailing = text.match(/\s*$/)[0];
    const cleaned = TS.cleanUrl(text.trim(), extras);
    return cleaned === text.trim() ? text : leading + cleaned + trailing;
  }

  function selectedText() {
    const el = document.activeElement;
    if (el && (el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' && /^(text|url|search)$/i.test(el.type || 'text')))) {
      try {
        if (el.selectionStart !== el.selectionEnd) {
          return el.value.substring(el.selectionStart, el.selectionEnd);
        }
      } catch (e) { /* some input types have no selection API */ }
    }
    const sel = window.getSelection();
    return sel ? sel.toString() : '';
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Bubble phase on window, so it runs after the page's own copy handlers
  // and can see whatever data they put on the clipboard.
  window.addEventListener('copy', (e) => {
    if (!enabled || !e.clipboardData) return;
    const dt = e.clipboardData;

    if (e.defaultPrevented) {
      // The page supplied its own clipboard data (typical for share buttons).
      const text = dt.getData('text/plain');
      const cleaned = cleanText(text);
      if (cleaned === text) return;
      const html = dt.getData('text/html');
      dt.setData('text/plain', cleaned);
      if (html) {
        const from = text.trim();
        const to = cleaned.trim();
        dt.setData('text/html', html.split(escapeHtml(from)).join(escapeHtml(to)).split(from).join(to));
      }
      return;
    }

    // Plain selection copy: only step in when the selection is just a URL.
    const text = selectedText();
    const cleaned = cleanText(text);
    if (cleaned === text) return;
    dt.setData('text/plain', cleaned);
    e.preventDefault();
  }, false);

  // Bridge for page-hook.js. Strings only: objects don't cross worlds.
  document.addEventListener('__tracker_stripper_request', (e) => {
    let req;
    try { req = JSON.parse(e.detail); } catch (err) { return; }
    if (!req || typeof req.id !== 'string') return;
    const reply = { id: req.id, text: typeof req.text === 'string' ? cleanText(req.text) : req.text };
    document.dispatchEvent(new CustomEvent('__tracker_stripper_response', { detail: JSON.stringify(reply) }));
  });
})();
