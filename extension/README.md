# RER Reader — browser extension

This folder packages **RER Reader** as a Firefox/Chrome WebExtension.

The canonical implementation remains `../RER-Reader.user.js`. The browser
packages are generated from it; the Reader is not maintained as separate
Firefox, Chrome, and userscript codebases.

## Architecture

```text
../RER-Reader.user.js         canonical Reader logic
          │
          ▼
build_extension.py
          │
          ├── manifest.base.json
          ├── manifest.firefox.json
          └── manifest.chrome.json
          │
          ├── manifest.json            Firefox dev convenience build
          ├── content.js               generated adapter + Reader
          ├── dist/firefox/            generated Firefox package tree
          ├── dist/chrome/             generated Chrome package tree
          └── packages/*.zip           generated store/test archives
```

`manifest.base.json` contains the cross-browser settings. Browser-specific
files are small overlays, so Firefox and Chrome cannot silently drift apart.

## Build

From the repository root:

```bash
python extension/build_extension.py
```

No Python or npm package is required for the build itself.

The build creates:

- `extension/packages/rer-reader-firefox-<version>.zip`
- `extension/packages/rer-reader-chrome-<version>.zip`

The package directories and ZIPs are generated artifacts and are ignored by Git.

## Firefox desktop development

1. Download/clone the repository and run the build if needed.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select `extension/manifest.json`.
5. Open a supported comic or novel site.

Temporary add-ons are removed when Firefox restarts. A signed Firefox package
is required for a normal persistent installation.

## Firefox Android / AMO

The Firefox manifest explicitly declares Android support with
`gecko_android: {}`.

For Mozilla Add-ons (AMO), it also declares:

```json
"data_collection_permissions": {
  "required": ["none"]
}
```

RER Reader does not collect or transmit analytics, telemetry, browsing
history, or personal data to the developer. See `../PRIVACY.md`.

Before public release, the Firefox ZIP can be linted with:

```bash
npx web-ext@10 lint --source-dir extension/dist/firefox --warnings-as-errors
```

The CI runs this check automatically.

## Chrome / Chromium desktop

After building:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `extension/dist/chrome/`.

Chrome Android does not provide the normal desktop extension installation
model; the Chrome package is intended for desktop Chromium-based browsers.

## Privacy and permissions

The extension currently injects on HTTP/HTTPS pages and immediately no-ops on
pages that do not look like supported readers. This keeps the same universal
reader detection as the userscript, at the cost of a broad site-access
permission at installation.

Settings stay in `browser.storage.local`. Chapter/page cache data stays in
browser-local storage. There is no remote extension backend and no analytics.

## Development rule

Do not edit generated `content.js`, `manifest.json`, `dist/`, or package
ZIPs by hand.

Change the canonical userscript or manifest source files, then run:

```bash
python extension/build_extension.py
```
