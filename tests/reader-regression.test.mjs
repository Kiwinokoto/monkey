import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../RER-Reader.user.js", import.meta.url),
  "utf8"
);

test("current Reader preferences are scoped by site, not by mode", () => {
  for (const line of [
    "const READER_COLOR_KEY = readerSiteKey('rerReaderAccentColor');",
    "const READER_IDLE_OPACITY_KEY = readerSiteKey('rerReaderIdleOpacity');",
    "const READER_SIZE_KEY = readerSiteKey('rerReaderControlSize');",
    "const READER_POSITION_KEY = readerSiteKey('rerReaderControlPosition');",
    "const SCROLL_ENABLED_KEY = readerSiteKey('rerReaderScrollEnabled');",
    "const READER_RAILS_KEY = readerSiteKey('rerReaderSideRailsLevel');",
    "const SCROLL_SPEED_KEY = readerSiteKey('rerReaderScrollSpeedPxPerSecond');",
    'const SPEED_STORAGE_KEY = siteStorageKey("rerReaderScrollSpeedPxPerSecond");',
    'const ENABLED_STORAGE_KEY = siteStorageKey("rerReaderScrollEnabled");',
  ]) {
    assert.ok(source.includes(line), "missing site-scoped preference: " + line);
  }

  assert.ok(!source.includes(
    "const SCROLL_ENABLED_KEY = `rerReaderScrollEnabled:${location.origin}:${READER_MODE}`;"
  ));
  assert.ok(!source.includes(
    'const ENABLED_STORAGE_KEY = `rerReaderScrollEnabled:${location.origin}:${MODE}`;'
  ));
});

test("legacy preferences migrate into the new site-scoped keys", () => {
  assert.ok(source.includes("function readMigratedPreference("));
  assert.ok(source.includes("function readMigratedScrollPreference("));

  const migrationWrites =
    source.split("GM_setValue(key, legacyValue);").length - 1;
  assert.equal(migrationWrites, 2);

  for (const legacy of [
    "LEGACY_READER_COLOR_KEY",
    "LEGACY_READER_IDLE_OPACITY_KEY",
    "LEGACY_READER_SIZE_KEY",
    "LEGACY_MODE_READER_POSITION_KEY",
    "LEGACY_SCROLL_ENABLED_KEY",
    "LEGACY_READER_RAILS_KEY",
    "LEGACY_SCROLL_SPEED_KEY",
    "LEGACY_ENABLED_STORAGE_KEY",
    "LEGACY_SPEED_STORAGE_KEY",
  ]) {
    assert.ok(source.includes(legacy), "missing migration source: " + legacy);
  }
});

test("zero scroll speed survives persistence and missing localStorage is not read as zero", () => {
  assert.ok(source.includes("Number.isFinite(INITIAL_SCROLL_SPEED)"));
  assert.ok(source.includes("legacyLocalSpeedRaw === null"));
  assert.ok(source.includes("? Number.NaN"));
  assert.ok(source.includes("Number.isFinite(storedSpeed)"));
});

test("clicking the Reader button closes an open panel instead of exempting it", () => {
  assert.ok(source.includes("panelClosedByControlPointerId = event.pointerId;"));
  assert.ok(source.includes("!state.panelWasClosedOnPointerDown"));
  assert.ok(!source.includes(
    "panel.contains(event.target) || control?.contains(event.target)"
  ));
});

test("smooth-scroll regressions stay guarded", () => {
  assert.ok(source.includes('behavior: "instant"'));
  assert.ok(source.includes("new ResizeObserver(invalidateMaximumScrollY)"));

  const scrollHeightReads =
    source.split("scrollingElement.scrollHeight").length - 1;
  assert.equal(scrollHeightReads, 1);
});
