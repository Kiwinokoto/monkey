import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const readerBufferSource = fs.readFileSync(new URL("../src/reader-buffer.ts", import.meta.url), "utf8");
const autoScrollSource = fs.readFileSync(new URL("../src/auto-scroll.ts", import.meta.url), "utf8");
const source = [readerBufferSource, autoScrollSource].join("\n");

test("current Reader preferences are scoped by site, not by mode", () => {
  for (const line of [
    "const READER_COLOR_KEY = readerSiteKey('rerReaderAccentColor');",
    "const READER_IDLE_OPACITY_KEY = readerSiteKey('rerReaderIdleOpacity');",
    "const READER_SIZE_KEY = readerSiteKey('rerReaderControlSize');",
    "const READER_POSITION_KEY = readerSiteKey('rerReaderControlPosition');",
    "const SCROLL_ENABLED_KEY = readerSiteKey('rerReaderScrollEnabled');",
    "const READER_RAILS_KEY = readerSiteKey('rerReaderSideRailsLevel');",
    "const FOCUS_MODE_KEY = readerSiteKey('rerReaderFocusMode');",
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

test("play and pause use dedicated inline SVG icons, not font glyphs", () => {
  assert.ok(source.includes("function createMediaIcon(kind)"));
  assert.ok(source.includes("rr-media-icon-play"));
  assert.ok(source.includes("rr-media-icon-pause"));
  assert.ok(source.includes("setControlContent(scrollState.scrolling ? 'pause' : 'play'"));
  assert.ok(!source.includes("scrollState.scrolling ? '❚❚' : '▶'"));
  assert.ok(source.includes("leftBar.setAttribute('rx', '1.15')"));
  assert.ok(source.includes("rightBar.setAttribute('rx', '1.15')"));
});

test("smooth-scroll regressions stay guarded", () => {
  assert.ok(source.includes('behavior: "instant"'));
  assert.ok(source.includes("new ResizeObserver(invalidateMaximumScrollY)"));

  const scrollHeightReads =
    autoScrollSource.split("scrollingElement.scrollHeight").length - 1;
  assert.equal(scrollHeightReads, 1);
});
  
test("compact panel keeps Buffer and Auto-scroll on single rows", () => {
  assert.ok(source.includes("title.textContent = 'Buffer';"));
  assert.ok(source.includes("scrollRow.className = 'rer-setting-row rer-scroll-row';"));
  assert.ok(source.includes("scrollRow.append(scrollLabel, scrollMeta, switchLabel);"));
  assert.ok(source.includes("scrollMeta.textContent = scrollState.available"));
  assert.ok(source.includes("${scrollState.speed} px/s"));
  assert.ok(!source.includes("readingTitle.textContent = 'Lecture';"));
  assert.ok(!source.includes("Profil novel"));
  assert.ok(!source.includes("Profil comics"));
  assert.ok(!source.includes("rer-reading-buffer-close"));
});

test("size and opacity also shape the lateral rails", () => {
  assert.ok(source.includes("const railScale = 0.78 + 0.44 * sizeT;"));
  assert.ok(source.includes("const railAlpha = 0.36 * appearance.opacity;"));
  assert.ok(source.includes("'Largeur des repères latéraux'"));
  assert.ok(source.includes("'Opacité du bouton et des repères latéraux'"));
  assert.ok(source.includes("'Taille du bouton et échelle maximale des repères latéraux'"));

  const panelStart = source.indexOf("panel.append(");
  const panelBlock = source.slice(panelStart, panelStart + 260);
  assert.ok(panelBlock.indexOf("sizeRow") < panelBlock.indexOf("opacityRow"));
  assert.ok(panelBlock.indexOf("opacityRow") < panelBlock.indexOf("railsRow"));
});



test("Focus Mode hides distractions reversibly and follows dynamic page chrome", () => {
  assert.ok(readerBufferSource.includes("const FOCUS_MODE_KEY = readerSiteKey('rerReaderFocusMode');"));
  assert.ok(readerBufferSource.includes("focusToggle.id = 'rer-reader-focus-toggle';"));
  assert.ok(readerBufferSource.includes("GM_setValue(FOCUS_MODE_KEY, focusModeEnabled);"));
  assert.ok(readerBufferSource.includes("function syncFocusMode()"));
  assert.ok(readerBufferSource.includes("element.classList.add('rer-focus-hidden');"));
  assert.ok(readerBufferSource.includes("element.classList.remove('rer-focus-hidden');"));
  assert.ok(readerBufferSource.includes("new MutationObserver(mutations => {"));
  assert.ok(readerBufferSource.includes("FOCUS_READER_UI_SELECTOR"));
  assert.ok(readerBufferSource.includes("main, article, [role=\"main\"]"));
  assert.ok(readerBufferSource.includes(".rer-focus-hidden {"));
  assert.ok(readerBufferSource.includes("display: none !important;"));
  assert.ok(readerBufferSource.includes("syncFocusMode();\n    updateUI();\n    restoreSavedReadingProgress();"));
});

test("reading progress persists URL, semantic anchor and ratio fallback", () => {
  assert.ok(source.includes("const READING_PROGRESS_KEY = readerSiteKey('rerReaderReadingProgress');"));
  assert.ok(source.includes("function captureReadingAnchor()"));
  assert.ok(source.includes("text: anchorText(best)"));
  assert.ok(source.includes("ratio: maximum > 0 ? Math.min(1, scrollY / maximum) : 0"));
  assert.ok(source.includes("progress.url !== canonicalProgressUrl()"));
  assert.ok(source.includes("resolveReadingAnchor(progress.anchor)"));
  assert.ok(source.includes("const ratioY = maximum * Math.max(0, Math.min(1, progress.ratio));"));
});

test("reading progress is restored before persistence listeners start", () => {
  const restoreIndex = source.indexOf("restoreSavedReadingProgress();");
  const installIndex = source.indexOf("installReadingProgressPersistence();");
  assert.ok(restoreIndex > 0);
  assert.ok(installIndex > restoreIndex);
  assert.ok(source.includes("window.addEventListener('pagehide', saveReadingProgressNow);"));
  assert.ok(source.includes("document.visibilityState === 'hidden'"));
});

test("screen Wake Lock follows active non-zero auto-scroll", () => {
  assert.ok(autoScrollSource.includes('return scrolling && speed !== 0 && document.visibilityState === "visible";'));
  assert.ok(autoScrollSource.includes('navigator.wakeLock.request("screen")'));
  assert.ok(autoScrollSource.includes('void syncWakeLock();'));
  assert.ok(autoScrollSource.includes('document.addEventListener("visibilitychange"'));
  assert.ok(autoScrollSource.includes('window.addEventListener("pagehide"'));
  assert.ok(autoScrollSource.includes('await currentWakeLock.release();'));
});

test("page boundaries stop auto-scroll and therefore release Wake Lock", () => {
  assert.ok(autoScrollSource.includes("if (reachedBottom || reachedTop)"));
  const boundaryBlock = autoScrollSource.slice(
    autoScrollSource.indexOf("if (reachedBottom || reachedTop)"),
    autoScrollSource.indexOf("if (reachedBottom || reachedTop)") + 120
  );
  assert.ok(boundaryBlock.includes("stopScroll();"));

  const stopStart = autoScrollSource.indexOf("function stopScroll()");
  const stopBlock = autoScrollSource.slice(stopStart, stopStart + 650);
  assert.ok(stopBlock.includes("void syncWakeLock();"));
});


test("adaptive buffer uses observed bytes, hard byte budgets and storage quota guards", () => {
  assert.ok(readerBufferSource.includes("const BUFFER_POLICIES = {"));
  assert.ok(readerBufferSource.includes("novel: { targetChapters: 10, maxChapters: 20, byteBudget: 50 * 1024 * 1024 }"));
  assert.ok(readerBufferSource.includes("comic: { targetChapters: 4, maxChapters: 8, byteBudget: 300 * 1024 * 1024 }"));
  assert.ok(readerBufferSource.includes("function adaptiveChapterTarget(observedBytesPerChapter: number | null)"));
  assert.ok(readerBufferSource.includes("async function observedChapterBytes(origin: string)"));
  assert.ok(readerBufferSource.includes("navigator.storage?.estimate"));
  assert.ok(readerBufferSource.includes("STORAGE_USAGE_CEILING"));
  assert.ok(readerBufferSource.includes("STORAGE_FREE_FLOOR_BYTES"));
  assert.ok(readerBufferSource.includes("status.cacheBytes >= bufferPolicy.byteBudget"));
  assert.ok(readerBufferSource.includes("blob.size > remainingBytes"));
  assert.ok(!readerBufferSource.includes("navigator.connection"));
  assert.ok(!readerBufferSource.includes("effectiveType"));
});


test("homepage/catalogue pages cannot start the reading buffer from loose chapter links", () => {
  assert.ok(readerBufferSource.includes("const READING_PATH_RE ="));
  assert.ok(readerBufferSource.includes("const READING_ROOT_SELECTOR ="));
  assert.ok(readerBufferSource.includes("if (!isLikelyReaderPage()) return;"));
  assert.ok(readerBufferSource.includes("Hors page de lecture — buffer inactif"));
  assert.ok(!readerBufferSource.includes("STRONG_READER_URL_RE"));
  assert.ok(!readerBufferSource.includes("if (nextUrl && prevUrl) return true;"));
  assert.ok(readerBufferSource.includes("return hasReaderRoot && READING_PATH_RE.test(pathname);"));
});


test("origin pruning is tab-safe and does not evict another manga's valid buffer", () => {
  assert.ok(readerBufferSource.includes("const staleChapterUrls = new Set();"));
  assert.ok(readerBufferSource.includes("if (chapter.origin !== origin || keepUrls.has(chapter.url)) continue;"));
  assert.ok(readerBufferSource.includes("if (chapter.savedAt < expiry) {"));
  assert.ok(readerBufferSource.includes("if (resource.origin !== origin || keepUrls.has(resource.chapterUrl)) continue;"));
  assert.ok(readerBufferSource.includes("resource.savedAt < expiry || staleChapterUrls.has(resource.chapterUrl)"));
  assert.ok(!readerBufferSource.includes("const outsideWindow = !keepUrls.has(chapter.url)"));
  assert.ok(!readerBufferSource.includes("stale || outsideWindow"));
});


test("Reader control uses CSS edge anchoring and an internal label morph", () => {
  assert.ok(readerBufferSource.includes("let controlAnchor: 'left' | 'right' = 'right';"));
  assert.ok(readerBufferSource.includes("let desiredControlPosition:"));
  assert.ok(readerBufferSource.includes("function applyAnchoredControlPosition(anchor, offset, top, save = false)"));
  assert.ok(readerBufferSource.includes("horizontalAnchor: controlAnchor"));
  assert.ok(readerBufferSource.includes("JSON.stringify(desiredControlPosition)"));
  assert.ok(readerBufferSource.includes("control.style[controlAnchor]"));
  assert.ok(readerBufferSource.includes("desiredControlPosition.horizontalAnchor"));
  assert.ok(readerBufferSource.includes("requestAnimationFrame(() => clampControlToViewport());"));
  assert.ok(!readerBufferSource.includes("clampControlToViewport({ persist: true })"));
  assert.ok(readerBufferSource.includes("anchorControlToNearestEdge(true);"));
  assert.ok(readerBufferSource.includes("max-width: 112px;"));
  assert.ok(readerBufferSource.includes("max-width 220ms ease"));
  assert.ok(!readerBufferSource.includes("preserveControlAnchorDuringResize"));
  assert.ok(!readerBufferSource.includes("rr-compact .rr-label {\n        display: none;"));
});
