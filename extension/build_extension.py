#!/usr/bin/env python3
"""Build Firefox/Chrome extension packages from the canonical userscript."""

from __future__ import annotations

import json
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "RER-Reader.user.js"
EXTENSION_DIR = ROOT / "extension"
BASE_MANIFEST = EXTENSION_DIR / "manifest.base.json"
FIREFOX_OVERLAY = EXTENSION_DIR / "manifest.firefox.json"
CHROME_OVERLAY = EXTENSION_DIR / "manifest.chrome.json"
ROOT_MANIFEST = EXTENSION_DIR / "manifest.json"
ROOT_CONTENT = EXTENSION_DIR / "content.js"
ICONS_DIR = EXTENSION_DIR / "icons"
DIST_DIR = EXTENSION_DIR / "dist"
PACKAGES_DIR = EXTENSION_DIR / "packages"

source = SOURCE.read_text(encoding="utf-8")

version_match = re.search(r"^// @version\\s+([^\\s]+)\\s*$", source, re.MULTILINE)
if not version_match:
    raise SystemExit("Could not find @version in RER-Reader.user.js")

version = version_match.group(1)
marker = "// ==/UserScript=="
if marker not in source:
    raise SystemExit("Could not find userscript metadata terminator")

core = source.split(marker, 1)[1].lstrip()

bootstrap = r'''// GENERATED FILE — source: ../RER-Reader.user.js
// Run: python extension/build_extension.py
//
// This adapter exposes the synchronous GM_getValue/GM_setValue interface used
// by the canonical userscript while persisting settings in browser.storage.local.

(async () => {
  "use strict";

  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const storageArea = extensionApi?.storage?.local;

  if (!storageArea) {
    console.warn("[RER Reader] Extension storage API unavailable.");
    return;
  }

  let extensionSettings = {};

  try {
    extensionSettings = (await storageArea.get(null)) || {};
  } catch (error) {
    console.warn("[RER Reader] Could not load extension settings.", error);
  }

  function GM_getValue(key, fallbackValue) {
    return Object.prototype.hasOwnProperty.call(extensionSettings, key)
      ? extensionSettings[key]
      : fallbackValue;
  }

  function GM_setValue(key, value) {
    extensionSettings[key] = value;

    try {
      const pending = storageArea.set({ [key]: value });
      if (pending && typeof pending.catch === "function") {
        pending.catch(error => {
          console.warn("[RER Reader] Could not persist setting.", key, error);
        });
      }
    } catch (error) {
      console.warn("[RER Reader] Could not persist setting.", key, error);
    }
  }

''' + core + "\\n})();\\n"


def deep_merge(base: dict, overlay: dict) -> dict:
    result = dict(base)
    for key, value in overlay.items():
        if isinstance(result.get(key), dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def build_manifest(overlay_path: Path) -> dict:
    manifest = deep_merge(load_json(BASE_MANIFEST), load_json(overlay_path))
    manifest["version"] = version
    return manifest


def write_json(path: Path, data: dict) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\\n",
        encoding="utf-8",
    )


def write_browser_build(browser: str, manifest: dict) -> Path:
    target = DIST_DIR / browser
    if target.exists():
        shutil.rmtree(target)

    target.mkdir(parents=True, exist_ok=True)
    (target / "content.js").write_text(bootstrap, encoding="utf-8")
    write_json(target / "manifest.json", manifest)
    shutil.copytree(ICONS_DIR, target / "icons")
    return target


def make_zip(browser: str, source_dir: Path) -> Path:
    PACKAGES_DIR.mkdir(parents=True, exist_ok=True)
    destination = PACKAGES_DIR / f"rer-reader-{browser}-{version}.zip"

    if destination.exists():
        destination.unlink()

    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source_dir.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(source_dir))

    return destination


firefox_manifest = build_manifest(FIREFOX_OVERLAY)
chrome_manifest = build_manifest(CHROME_OVERLAY)

# Convenience Firefox development build at extension/manifest.json.
ROOT_CONTENT.write_text(bootstrap, encoding="utf-8")
write_json(ROOT_MANIFEST, firefox_manifest)

firefox_dir = write_browser_build("firefox", firefox_manifest)
chrome_dir = write_browser_build("chrome", chrome_manifest)

firefox_zip = make_zip("firefox", firefox_dir)
chrome_zip = make_zip("chrome", chrome_dir)

print(f"Built RER Reader {version}")
print(f"  Firefox: {firefox_zip.relative_to(ROOT)}")
print(f"  Chrome:  {chrome_zip.relative_to(ROOT)}")
