# Tracker Stripper

A Chrome extension that removes tracking junk from links: `utm_source`, `fbclid`, `gclid`, `msclkid`, YouTube and Spotify `si`, Instagram `igsh`, Amazon `ref=` paths, and many more.

## What it does

All four features are on by default. You can switch each one off on the settings page.

| Feature | How you use it |
| --- | --- |
| **Clean links when copying** | Copy a link the way you normally do (Ctrl+C, or a site's own "Copy link" / "Share" button) and the clean version lands on your clipboard. |
| **Right-click "Copy clean link"** | Right-click any link and choose **Copy clean link**. Right-click empty space on a page for **Copy clean page link**. |
| **Toolbar button** | Click the extension's icon to copy a clean link to the page you're on. A green ✓ flashes on the icon when it worked. |
| **Clean links as you open them** | When you open a link that has tracking tags, they're removed before the page loads, so the address bar shows the clean link. |

The settings page also lets you add your own parameter names to strip, and has a **Try it** box where you can paste a link to preview the cleaned result.

## Install it (load unpacked)

Chrome only installs extensions from the Chrome Web Store unless you turn on Developer mode. That's normal for an extension you build yourself, and it takes about a minute:

1. **Download** the latest `tracker-stripper-<version>.zip` from this repo's [Releases page](https://github.com/Salmonllama/tracker-stripper/releases/latest), then **unzip** it somewhere you'll keep it, such as your Documents folder. Chrome loads the extension from that folder, so don't delete it afterwards.
2. Open Chrome and go to **`chrome://extensions`** (type it in the address bar).
3. Turn on **Developer mode** with the switch in the top-right corner.
4. Click **Load unpacked** and select the unzipped `tracker-stripper` folder (the one containing `manifest.json`).
5. The settings page opens automatically. To get back to it later, right-click the extension's icon and choose **Options**.
6. Optional but handy: click the puzzle-piece icon in Chrome's toolbar and **pin** Tracker Stripper so the button is always visible.

Chrome will warn that the extension can "read and change all your data on all websites". It needs that to clean links on any site you copy from or visit. It doesn't collect or send anything anywhere: there is no network code in it at all.

### Updating after you change the files

Go to `chrome://extensions` and click the circular **reload** arrow on the Tracker Stripper card. Reload any tabs that were open, so they pick up the new version.

## Good to know

- **Tabs that were open before you installed** get the copy feature added automatically. If a site's copy button still doesn't clean, reload that tab once.
- **Copying from the address bar** can't be intercepted by any extension (Chrome doesn't allow it). With "Clean links as you open them" on, the address bar is usually already clean. Otherwise, use the toolbar button.
- **Only links get changed.** If you copy a paragraph of text, it's left alone. The copy feature only steps in when what you copied is a single web address.
- **Site-specific rules:** short names like `si`, `t`, or `ref` mean tracking on some sites but something real on others, so those are only stripped on the sites listed in `lib/cleaner.js` (YouTube, Spotify, Instagram, X, Amazon, and so on).
- **Redirect links** like Google's `google.com/url?q=...` or Facebook's `l.facebook.com/l.php?u=...` are unwrapped to the real destination when you copy them.
- If a site ever breaks because a parameter was removed, turn off "Clean links as you open them" for a moment, or edit the lists in `lib/cleaner.js` and reload the extension.

## Making a release

GitHub Actions (`.github/workflows/release.yml`) runs the tests and builds the zip on every push and pull request. Each pull request's zip is attached to its workflow run under **Artifacts**, so you can try a change before merging it.

To publish a new release, bump `"version"` in `manifest.json` (for example `1.0.0` → `1.0.1`) and merge to `main`. The workflow then creates a release named `v1.0.1` with the zip attached. Pushes that don't change the version don't create a release.

To build or test locally (needs Node.js):

```
npm test        # run the link-cleaning tests
npm run build   # writes dist/tracker-stripper-<version>.zip
```

## Files

```
manifest.json          Extension definition and permissions
background.js          Context menu, toolbar button, navigation rules
lib/cleaner.js         The list of tracking parameters and the cleaning logic (edit this to change rules)
content/copy-guard.js  Cleans links during copy events on web pages
content/page-hook.js   Wraps the page's clipboard/share functions so "Copy link" buttons get cleaned
offscreen/             Hidden page that writes to the clipboard for the menu and toolbar button
options/               The settings page
icons/                 Extension icons
tests/                 Tests for the cleaning rules
scripts/build.sh       Builds the release zip
```

Requires Chrome 116 or newer.
