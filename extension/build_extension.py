#!/usr/bin/env python3
"""Build extension/content.js from the canonical RER-Reader.user.js."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "RER-Reader.user.js"
EXTENSION_DIR = ROOT / "extension"
MANIFEST = EXTENSION_DIR / "manifest.json"
CONTENT = EXTENSION_DIR / "content.js"

source = SOURCE.read_text(encoding="utf-8")

version_match = re.search(r"^// @version\s+([^\s]+)\s*$", source, re.MULTILINE)
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

''' + core + "\n})();\n"

CONTENT.write_text(bootstrap, encoding="utf-8")

manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
manifest["version"] = version
MANIFEST.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(f"Built RER Reader extension {version}")
