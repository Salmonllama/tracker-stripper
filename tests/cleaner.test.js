const test = require('node:test');
const assert = require('node:assert');
require('../lib/cleaner.js');

const { cleanUrl, isSingleUrl } = globalThis.TrackerStripper;

const cases = [
  ['strips utm_* and keeps other params', 'https://example.com/a?utm_source=x&id=42&utm_medium=y#top', 'https://example.com/a?id=42#top'],
  ['strips fbclid', 'https://example.com/?fbclid=abc', 'https://example.com/'],
  ['strips YouTube si (short link)', 'https://youtu.be/dQw4w9WgXcQ?si=abc123', 'https://youtu.be/dQw4w9WgXcQ'],
  ['keeps YouTube timestamp', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc&t=42', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42'],
  ['strips Spotify si', 'https://open.spotify.com/track/123?si=abcdef', 'https://open.spotify.com/track/123'],
  ['strips Instagram igsh', 'https://www.instagram.com/p/XYZ/?igsh=MWQ1ZGUxMzBkMA==', 'https://www.instagram.com/p/XYZ/'],
  ['strips Amazon ref path and query junk',
    'https://www.amazon.com/Some-Product/dp/B0ABC12345/ref=sr_1_3?crid=2X&keywords=foo&qid=1&sr=8-3',
    'https://www.amazon.com/Some-Product/dp/B0ABC12345?keywords=foo'],
  ['unwraps Google redirect links', 'https://www.google.com/url?q=https://example.com/x%3Futm_source%3Dg&sa=D', 'https://example.com/x'],
  ['keeps encoding of other params', 'https://example.com/s?q=a%20b+c&gclid=1', 'https://example.com/s?q=a%20b+c'],
  ['leaves site-specific names alone elsewhere', 'https://example.com/?si=keep', 'https://example.com/?si=keep'],
  ['strips X share params', 'https://x.com/user/status/1?s=20&t=abc', 'https://x.com/user/status/1'],
  ['strips tracking in the fragment', 'https://example.com/#utm_source=x', 'https://example.com/'],
  ['keeps normal fragments', 'https://example.com/#section', 'https://example.com/#section'],
  ['is case-insensitive', 'https://example.com/?UTM_Source=x&a=1', 'https://example.com/?a=1'],
  ['ignores non-URLs', 'not a url', 'not a url']
];

for (const [name, input, expected] of cases) {
  test(name, () => assert.strictEqual(cleanUrl(input), expected));
}

test('strips user-supplied extra params', () => {
  assert.strictEqual(cleanUrl('https://example.com/?foo=1&bar=2', ['foo']), 'https://example.com/?bar=2');
});

test('isSingleUrl only accepts one http(s) URL', () => {
  assert.ok(isSingleUrl(' https://example.com/x '));
  assert.ok(!isSingleUrl('see https://example.com/x'));
  assert.ok(!isSingleUrl('javascript:alert(1)'));
});
