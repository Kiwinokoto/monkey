# RER Reader — Firefox extension

This folder contains the browser-extension packaging of **RER Reader**.

The canonical source remains `../RER-Reader.user.js`. The extension's
`content.js` is generated from it, so the userscript and extension do not
need to be maintained as two separate implementations.

## Why an extension?

For end users, a published extension removes the extra userscript-manager step:
install RER Reader once, then use it directly on supported reading sites.

For development, the userscript remains the fastest way to iterate.

## Architecture

- `manifest.json` — Manifest V3 extension metadata.
- `content.js` — generated content script; **do not edit by hand**.
- `build_extension.py` — rebuilds `content.js` and synchronizes the
  extension version with the userscript `@version`.

The extension adapter maps the userscript's synchronous
`GM_getValue` / `GM_setValue` calls to `browser.storage.local`.
The page/chapter cache still uses the Reader's IndexedDB logic.

## Build

From the repository root:

```bash
python extension/build_extension.py
```

No npm dependencies are required.

## Test on Firefox desktop

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `extension/manifest.json`.
4. Open a supported comic or novel site.

Temporary extensions disappear when Firefox is restarted.

## Firefox Android

Firefox for Android supports extensions, but a normal user-facing installation
should be distributed as a signed add-on, ideally through Mozilla Add-ons
(AMO). Until RER Reader is published there, the userscript + Violentmonkey
route remains the simplest Android installation.

## Chromium desktop

The manifest and storage adapter are intentionally close to standard Manifest
V3 and may also work in Chromium-based desktop browsers through **Load
unpacked**, but Firefox is the primary target for this prototype.

## Development rule

Do not edit `content.js` directly. Change `RER-Reader.user.js`, bump its
`@version`, then rebuild the extension.
