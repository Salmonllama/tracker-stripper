// Runs in the page's own JavaScript world (not the extension's isolated
// world), because that's the only place we can wrap the clipboard and share
// APIs that sites' "Copy link" / "Share" buttons call. It has no access to
// extension APIs, so it asks copy-guard.js to do the actual cleaning.
(function () {
  'use strict';
  const FLAG = Symbol.for('tracker-stripper.page-hook');
  if (window[FLAG]) return;
  Object.defineProperty(window, FLAG, { value: true });

  const pending = new Map();
  let counter = 0;
  const prefix = Math.random().toString(36).slice(2);

  document.addEventListener('__tracker_stripper_response', (e) => {
    let res;
    try { res = JSON.parse(e.detail); } catch (err) { return; }
    const resolve = res && pending.get(res.id);
    if (resolve) { pending.delete(res.id); resolve(res.text); }
  });

  // Ask the isolated world to clean `text`. Falls back to the original text
  // if no answer arrives quickly (e.g. the extension was just reloaded).
  function requestClean(text) {
    if (typeof text !== 'string' || !/https?:\/\//i.test(text)) return Promise.resolve(text);
    return new Promise((resolve) => {
      const id = prefix + ':' + (++counter);
      const timer = setTimeout(() => { pending.delete(id); resolve(text); }, 300);
      pending.set(id, (cleaned) => { clearTimeout(timer); resolve(cleaned); });
      document.dispatchEvent(new CustomEvent('__tracker_stripper_request', {
        detail: JSON.stringify({ id, text })
      }));
    });
  }

  function wrap(obj, name, makeWrapper) {
    if (!obj || typeof obj[name] !== 'function') return;
    const original = obj[name];
    const wrapper = makeWrapper(original);
    try {
      Object.defineProperty(wrapper, 'name', { value: name });
      Object.defineProperty(wrapper, 'length', { value: original.length });
      wrapper.toString = () => original.toString();
    } catch (e) { /* cosmetic only */ }
    obj[name] = wrapper;
  }

  // navigator.clipboard.writeText(url)
  if (window.Clipboard) {
    wrap(Clipboard.prototype, 'writeText', (original) => function (text) {
      const self = this;
      return requestClean(String(text)).then((cleaned) => original.call(self, cleaned));
    });

    // navigator.clipboard.write([new ClipboardItem({'text/plain': ...})])
    wrap(Clipboard.prototype, 'write', (original) => function (items) {
      const self = this;
      if (!Array.isArray(items) || typeof ClipboardItem === 'undefined') {
        return original.apply(self, arguments);
      }
      return Promise.all(items.map(cleanClipboardItem))
        .catch(() => items)
        .then((cleanedItems) => original.call(self, cleanedItems));
    });
  }

  async function cleanClipboardItem(item) {
    if (!(item instanceof ClipboardItem) || !item.types.includes('text/plain')) return item;
    const textBlob = await item.getType('text/plain');
    const text = await textBlob.text();
    const cleaned = await requestClean(text);
    if (cleaned === text) return item;
    const parts = {};
    for (const type of item.types) {
      if (type === 'text/plain') {
        parts[type] = new Blob([cleaned], { type });
      } else if (type === 'text/html') {
        const html = await (await item.getType(type)).text();
        parts[type] = new Blob([html.split(text.trim()).join(cleaned.trim())
          .split(text.trim().replace(/&/g, '&amp;')).join(cleaned.trim().replace(/&/g, '&amp;'))], { type });
      } else {
        parts[type] = await item.getType(type);
      }
    }
    return new ClipboardItem(parts);
  }

  // navigator.share({url, text}) - used by "Share" buttons where supported.
  if (typeof Navigator !== 'undefined') {
    wrap(Navigator.prototype, 'share', (original) => function (data) {
      const self = this;
      if (!data || typeof data !== 'object') return original.apply(self, arguments);
      return Promise.all([requestClean(data.url), requestClean(data.text)]).then(([url, text]) => {
        const copy = Object.assign({}, data);
        if (data.url !== undefined) copy.url = url;
        if (data.text !== undefined) copy.text = text;
        return original.call(self, copy);
      });
    });
  }
})();
