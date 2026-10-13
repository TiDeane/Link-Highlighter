# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Opened Link Highlighter is a Manifest V3 browser extension, published on both Firefox and the Chrome Web Store. While it's toggled on, it records the links the user clicks and highlights every matching link on any page. The extension itself is plain JavaScript with no build step or dependencies. `package.json`, `node_modules/` and `tests/` exist only for the test suite and are not part of the published extension.

## Development

- **Chrome:** go to `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick the repo root.
- **Firefox:** go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on" and pick `manifest.json`.
- After you edit a file, reload the extension and refresh the tabs you're testing, because content scripts are only injected when a page loads.
- One `manifest.json` serves both browsers. The `browser_specific_settings.gecko` block holds the Firefox add-on ID and minimum version. Keep the code on the `chrome.*` promise-based APIs, which Firefox also supports.
- Bump `version` in `manifest.json` for each store submission. Permissions are kept to the minimum on purpose (only `storage`) to ease store review.

## Tests

- `npm install` once, then `npm test` runs everything (Node's built-in test runner, with jsdom as the only dependency).
- One file: `node --test tests/popup.test.js`. One test: `node --test --test-name-pattern="clears the list" tests/popup.test.js`.
- The tests run the real `content.js`, `popup.html` and `popup.js` unmodified inside jsdom. `tests/helpers.js` provides a fake `chrome.storage` that fake tabs and a fake popup share, and a controllable `IntersectionObserver`.
- `tests/upgrade.test.js` starts from storage as older versions left it and checks that no saved link is lost. Extend it whenever the storage format or a default changes.
- jsdom is not a browser: layout, real scrolling, the popup's look and store packaging are not covered and still need a manual check in Chrome and Firefox.

## Packaging for the stores

Run `npm run package` from the repo root. It builds `link-highlighter.zip` with only the files the extension needs, using this command:

```bash
rm -f link-highlighter.zip && zip -r link-highlighter.zip manifest.json shared.js content.js highlight.css popup.html popup.js popup.css icons
```

- Everything else stays out: `tests/`, `node_modules/`, `package.json`, `package-lock.json`, `images/` and `demos/` (README screenshots and GIFs), `LICENSE` and the Markdown files.
- If a new file is added to the extension (a script, stylesheet or icon), add it to the `package` script in `package.json` and to the command above. `tests/package.test.js` checks that the script's file list covers every file the manifest and popup reference; it does not open the zip itself.
- `*.zip` is in `.gitignore`. Bump `version` in `manifest.json` before building.

## Architecture

The popup and the content scripts never message each other directly. `chrome.storage.local` acts as the shared state and the event bus between them:

| Key | Written by | Meaning |
|---|---|---|
| `isActive` | popup | "Track Opened Links" toggle: whether clicks on links are saved (defaults to `false`). |
| `showHighlights` | popup | "Show Highlights" toggle: whether saved links are highlighted (defaults to `true`). |
| `highlightList` | content script, popup | Array of the links the user has opened, saved in full (query and hash kept). Entries saved by version 1.5 and earlier are in normalized form. The popup's "Clear Highlights" button resets it to `[]`. |
| `normalizeQueryParams` / `normalizeHashFragments` | popup | Whether `normalizeURL` strips `?search` / `#hash` (both default to `true`). |
| `highlightColor` / `highlightOpacity` / `outlineColor` / `outlineOpacity` | popup | Highlight appearance (defaults `#ffff00`, `0.7`, `#ffa500`, `1`). `content.js` passes non-default values to `highlight.css` as CSS variables on `<html>`. |

- **`shared.js`:** loaded before `content.js` (by the manifest) and before `popup.js` (by `popup.html`). It holds what both need: `DEFAULT_COLORS`, `toRgba()` and `cleanURL()`.
- **`popup.js` / `popup.html`:** only reads and writes those keys. The number shown in "Clear Highlights" is the saved links counted the way pages highlight them: passed through `cleanURL()` with the current normalization settings, so links that highlight as one count as one.
- **`content.js`** (injected into `<all_urls>`):
  - The script reads all the keys once on load into module-level state (`isActive`, `showHighlights`, `storedList`, `highlightSet`), and `chrome.storage.onChanged` keeps that state in sync. Code that needs this state awaits `stateLoaded` instead of reading storage again.
  - A `mousedown` listener (not `click`, so middle-clicks and ctrl-clicks count) takes the clicked `<a>`'s href in its full form and skips it if that is already in the in-memory copy of the stored list. Otherwise it adds the normalized form to the in-memory set and highlights matching links right away. It then saves by reading `highlightList` from storage, adding the link to that, writing it, and reading back to confirm (retrying up to three times). It never writes the in-memory copy back, because that copy can be behind (two tabs saving at once, or a tab that was frozen and missed changes).
  - `setupHighlighting()` does a full rebuild and marks matching links with the class `highlighted-link`. The marking is lazy: an `IntersectionObserver` checks each link once, when it scrolls near the viewport. A `MutationObserver` on `document.body` feeds dynamically added or removed links to that observer, which matters for SPAs like LinkedIn.
  - When `onChanged` sees URLs that were only added (a click in any tab), it calls `highlightMatchingLinks()` for just those URLs instead of rebuilding. Any other change (`showHighlights`, settings, list cleared) triggers a full `setupHighlighting()`. A change to `isActive` alone needs no rebuild, since it only gates the `mousedown` listener. That's how every open tab updates live.
  - `stopIfOrphaned()` handles the extension being disabled, removed, reloaded or updated under an open tab. The browser sends no event for that, so the check (`chrome.runtime.id` is gone) runs on `visibilitychange`, window `focus` and `mousedown`. When orphaned, the script removes its highlight classes and CSS variables and stops its observers.
- **Normalization is applied when comparing, never when saving.** `fullURL()` gives the form a link is saved in (only the trailing slash dropped). `normalizeURL()` gives the form links are compared in, following the two settings; `highlightSet` is the stored list passed through it. So the settings can be switched at any time without losing which exact links were opened, and saving a link never rewrites older entries.

## Gotchas

- In the `IntersectionObserver` callback, only write to a link's `class` when the highlight state has to change. Every write, even `classList.remove` of a class that isn't there, is reported to the mutation observer, which re-observes the link; an unconditional write re-checks every unsaved link forever. `tests/content.test.js` ("idle pages") guards this.
- The default colors are written in two places that must agree: `DEFAULT_COLORS` in `shared.js` (loaded before both `content.js` and `popup.js`) and the fallbacks in `highlight.css`.
- `highlight.css` is injected into every web page, so it must only contain the highlight classes. Popup styles go in `popup.css`.
- A link is skipped as already saved only when its full form is in the stored list. With normalization on, two links to the same page that differ by query or hash are both saved, although they highlight as one.
