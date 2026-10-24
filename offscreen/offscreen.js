// Service workers can't touch the clipboard, so the background asks this
// hidden page to do the copy.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'copy') return;
  try {
    const buffer = document.getElementById('buffer');
    buffer.value = msg.text;
    buffer.select();
    const ok = document.execCommand('copy');
    sendResponse({ ok });
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
  }
});
