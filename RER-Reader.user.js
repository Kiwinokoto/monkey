// ==UserScript==
// @name         RER Reader
// @namespace    kiwinokoto.rer-reader
// @version      1.6.1
// @description  Reader cache-first avec buffer adaptatif, reprise de lecture et auto-scroll comics/novels sur desktop et mobile.
// @author       Kevin + ChatGPT
// @homepageURL  https://github.com/Kiwinokoto/monkey
// @downloadURL  https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/RER-Reader.user.js
// @updateURL    https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/RER-Reader.user.js
// @match        *://*/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

// GENERATED FILE — do not edit directly.
// Sources: src/userscript.meta.js + src/reader-buffer.ts + src/auto-scroll.ts
// Build: npm run build

(() => {
  "use strict";
  const BUFFER_ACTIVE_ATTR = "data-rer-reading-buffer-active";
  if (document.documentElement.hasAttribute(BUFFER_ACTIVE_ATTR)) return;
  document.documentElement.setAttribute(BUFFER_ACTIVE_ATTR, "1");
  const BUFFER_POLICIES = {
    novel: { targetChapters: 10, maxChapters: 20, byteBudget: 50 * 1024 * 1024 },
    comic: { targetChapters: 4, maxChapters: 8, byteBudget: 300 * 1024 * 1024 },
    reader: { targetChapters: 5, maxChapters: 10, byteBudget: 100 * 1024 * 1024 }
  };
  const STORAGE_FREE_FLOOR_BYTES = 64 * 1024 * 1024;
  const STORAGE_USAGE_CEILING = 0.85;
  const FETCH_DELAY_MS = 2500;
  const IMAGE_DELAY_MS = 150;
  const MAX_IMAGES_PER_CHAPTER = 80;
  const CACHE_TTL_DAYS = 7;
  const MAX_RESOURCE_BYTES = 12 * 1024 * 1024;
  const DB_NAME = "rer-reading-buffer-v1";
  const DB_VERSION = 1;
  const READER_URL_RE = /(manga|manhwa|manhua|webtoon|comic|webcomic|scantrad|novel|webnovel|lightnovel|fiction|wuxia|chapter|chapitre|reader|read)/i;
  const READING_PATH_RE = /(?:^|[\/_-])(chapter|chapitre|episode|reader|read)(?:[\/_-]|\d|$)/i;
  const READING_ROOT_SELECTOR = "#chapter-content, .chapter-content, .chapter_content, #readerarea, #reader-area, .reader-area, .reading-content, .chapter-reading-content";
  const COMIC_READER_URL_RE = /(manga|manhua|manhwa|webtoon|comic|comics|webcomic|scantrad)/i;
  const NOVEL_READER_URL_RE = /(novel|webnovel|lightnovel|light-novel|fiction|wuxia|royalroad|scribblehub)/i;
  const NEXT_TEXT_RE = /^(?:next(?:\s+chapter)?|chapter\s+next|chapitre\s+suivant|suivant|next\s*[›»→]?|[›»→])$/i;
  const PREV_TEXT_RE = /^(?:prev(?:ious)?(?:\s+chapter)?|chapter\s+prev(?:ious)?|chapitre\s+pr[eé]c[eé]dent|pr[eé]c[eé]dent|[‹«←])$/i;
  let dbPromise;
  let prefetchRunning = false;
  let objectUrls = [];
  const READER_MODE = COMIC_READER_URL_RE.test(location.href) ? "comic" : NOVEL_READER_URL_RE.test(location.href) ? "novel" : "reader";
  const readerSiteKey = (base) => `${base}:${location.origin}`;
  const bufferPolicy = BUFFER_POLICIES[READER_MODE];
  function adaptiveChapterTarget(observedBytesPerChapter) {
    if (!observedBytesPerChapter || observedBytesPerChapter <= 0) return bufferPolicy.targetChapters;
    const budgetTarget = Math.floor(bufferPolicy.byteBudget / observedBytesPerChapter);
    return Math.max(1, Math.min(bufferPolicy.maxChapters, budgetTarget));
  }
  async function storageAllowsWrite(additionalBytes = 0) {
    if (!navigator.storage?.estimate) return true;
    try {
      const estimate = await navigator.storage.estimate();
      if (!estimate.quota || estimate.usage == null) return true;
      const projected = estimate.usage + Math.max(0, additionalBytes);
      return projected / estimate.quota <= STORAGE_USAGE_CEILING && estimate.quota - projected >= STORAGE_FREE_FLOOR_BYTES;
    } catch {
      return true;
    }
  }
  const MISSING_READER_PREFERENCE = "__rer_reader_preference_missing__";
  function readMigratedPreference(key, legacyKeys, fallbackValue) {
    const currentValue = GM_getValue(key, MISSING_READER_PREFERENCE);
    if (currentValue !== MISSING_READER_PREFERENCE) return currentValue;
    for (const legacyKey of legacyKeys) {
      if (!legacyKey) continue;
      const legacyValue = GM_getValue(legacyKey, MISSING_READER_PREFERENCE);
      if (legacyValue === MISSING_READER_PREFERENCE) continue;
      GM_setValue(key, legacyValue);
      return legacyValue;
    }
    return fallbackValue;
  }
  const READER_COLOR_KEY = readerSiteKey("rerReaderAccentColor");
  const READER_IDLE_OPACITY_KEY = readerSiteKey("rerReaderIdleOpacity");
  const READER_SIZE_KEY = readerSiteKey("rerReaderControlSize");
  const READER_POSITION_KEY = readerSiteKey("rerReaderControlPosition");
  const SCROLL_ENABLED_KEY = readerSiteKey("rerReaderScrollEnabled");
  const READER_RAILS_KEY = readerSiteKey("rerReaderSideRailsLevel");
  const SCROLL_SPEED_KEY = readerSiteKey("rerReaderScrollSpeedPxPerSecond");
  const READING_PROGRESS_KEY = readerSiteKey("rerReaderReadingProgress");
  const LEGACY_READER_COLOR_KEY = "rerReaderAccentColor";
  const LEGACY_READER_IDLE_OPACITY_KEY = "rerReaderIdleOpacity";
  const LEGACY_READER_SIZE_KEY = "rerReaderControlSize";
  const LEGACY_MODE_READER_POSITION_KEY = `rerReaderControlPosition:${location.origin}:${READER_MODE}`;
  const LEGACY_READER_POSITION_KEY = `rerReaderControlPosition:${location.origin}:reader`;
  const LEGACY_SCROLL_POSITION_KEY = "autoScrollReaderButtonPosition";
  const LEGACY_SCROLL_ENABLED_KEY = `rerReaderScrollEnabled:${location.origin}:${READER_MODE}`;
  const LEGACY_READER_RAILS_KEY = `rerReaderSideRailsLevel:${location.origin}:${READER_MODE}`;
  const LEGACY_SCROLL_SPEED_KEY = READER_MODE === "novel" ? "autoScrollNovelSpeedPxPerSecond" : "autoScrollReaderSpeedPxPerSecond";
  const LEGACY_READER_POSITION_KEYS = [
    LEGACY_MODE_READER_POSITION_KEY,
    LEGACY_READER_POSITION_KEY,
    ...READER_MODE === "comic" ? [LEGACY_SCROLL_POSITION_KEY] : []
  ];
  const SCROLL_DEFAULT_ENABLED = READER_MODE === "comic";
  const SCROLL_DEFAULT_SPEED = READER_MODE === "novel" ? 40 : 250;
  const INITIAL_SCROLL_SPEED = Number(
    readMigratedPreference(
      SCROLL_SPEED_KEY,
      [LEGACY_SCROLL_SPEED_KEY],
      SCROLL_DEFAULT_SPEED
    )
  );
  const CONTROL_LONG_PRESS_MS = 450;
  const CONTROL_SWIPE_THRESHOLD_PX = 12;
  const CONTROL_SPEED_PX_PER_STEP = 32;
  const BUFFER_MIN_VISIBLE_MS = 650;
  const BUFFER_FADE_DELAY_MS = 800;
  const SCROLL_GHOST_DELAY_MS = 900;
  const SPEED_LABEL_MS = 900;
  const PROGRESS_SAVE_THROTTLE_MS = 750;
  const PROGRESS_RESTORE_MAX_ATTEMPTS = 6;
  let control;
  let controlIcon;
  let controlLabel;
  let panel;
  let sideRails;
  let panelClosedByControlPointerId = null;
  let bufferFadeTimerId = null;
  let bufferShownAt = 0;
  let bufferVisible = true;
  let speedLabelTimerId = null;
  let ghostTimerId = null;
  let controlGesture = null;
  let hasCustomPosition = false;
  let controlAnchor = "right";
  let desiredControlPosition = null;
  let progressSaveTimerId = null;
  let restoringProgress = false;
  let scrollState = {
    available: READER_MODE === "comic" || READER_MODE === "novel",
    enabled: Boolean(
      readMigratedPreference(
        SCROLL_ENABLED_KEY,
        [LEGACY_SCROLL_ENABLED_KEY],
        SCROLL_DEFAULT_ENABLED
      )
    ),
    scrolling: false,
    speed: Number.isFinite(INITIAL_SCROLL_SPEED) ? INITIAL_SCROLL_SPEED : SCROLL_DEFAULT_SPEED,
    mode: READER_MODE,
    minSpeed: READER_MODE === "novel" ? -300 : -1e3,
    maxSpeed: READER_MODE === "novel" ? 300 : 1e3,
    speedStep: READER_MODE === "novel" ? 5 : 50,
    speedVisibleUntil: 0,
    ghosted: false
  };
  let status = {
    cachedAhead: 0,
    expectedAhead: bufferPolicy.targetChapters,
    imageCached: 0,
    imageTotal: 0,
    cacheBytes: 0,
    message: "Initialisation\u2026",
    problem: false
  };
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("chapters")) {
          const store = db.createObjectStore("chapters", { keyPath: "url" });
          store.createIndex("savedAt", "savedAt");
          store.createIndex("origin", "origin");
        }
        if (!db.objectStoreNames.contains("resources")) {
          const store = db.createObjectStore("resources", { keyPath: "url" });
          store.createIndex("savedAt", "savedAt");
          store.createIndex("chapterUrl", "chapterUrl");
          store.createIndex("origin", "origin");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function dbGet(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbPut(storeName, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function dbDelete(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function dbAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  function absoluteUrl(href, baseUrl) {
    try {
      const u = new URL(href, baseUrl);
      if (!/^https?:$/.test(u.protocol)) return null;
      u.hash = "";
      return u.href;
    } catch {
      return null;
    }
  }
  function visibleText(el) {
    return [
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("data-title")
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  function findDirectionalUrl(doc, baseUrl, direction) {
    const isNext = direction === "next";
    const rel = isNext ? "next" : "prev";
    const textRe = isNext ? NEXT_TEXT_RE : PREV_TEXT_RE;
    const currentUrl = absoluteUrl(baseUrl, baseUrl);
    const relLink = doc.querySelector(`a[rel~="${rel}"][href], link[rel~="${rel}"][href]`);
    if (relLink) {
      const url = absoluteUrl(relLink.getAttribute("href"), baseUrl);
      if (url && url !== currentUrl) return url;
    }
    const candidates = [...doc.querySelectorAll("a[href]")];
    let best = null;
    let bestScore = -Infinity;
    for (const a of candidates) {
      const url = absoluteUrl(a.getAttribute("href"), baseUrl);
      if (!url || url === currentUrl) continue;
      if (new URL(url).origin !== new URL(baseUrl).origin) continue;
      const text = visibleText(a);
      const cls = `${a.id || ""} ${a.className || ""}`.toLowerCase();
      const href = url.toLowerCase();
      let score = 0;
      if (textRe.test(text)) score += 100;
      if (isNext && /\bnext\b/.test(text.toLowerCase())) score += 35;
      if (!isNext && /\b(prev|previous)\b/.test(text.toLowerCase())) score += 35;
      if (isNext && /\bnext\b/.test(cls)) score += 25;
      if (!isNext && /\b(prev|previous)\b/.test(cls)) score += 25;
      if (/chapter|chapitre|episode|ep\b/.test(href)) score += 12;
      if (/novel|manga|manhwa|manhua|reader|read/.test(href)) score += 8;
      if (/comment|login|signup|register|home|library/.test(href)) score -= 30;
      if (score > bestScore) {
        bestScore = score;
        best = url;
      }
    }
    return bestScore >= 45 ? best : null;
  }
  const findNextUrl = (doc, baseUrl) => findDirectionalUrl(doc, baseUrl, "next");
  const findPrevUrl = (doc, baseUrl) => findDirectionalUrl(doc, baseUrl, "prev");
  function isLikelyReaderPage(doc = document, url = location.href) {
    const nextUrl = findNextUrl(doc, url);
    const prevUrl = findPrevUrl(doc, url);
    const pathname = (() => {
      try {
        return new URL(url, location.href).pathname;
      } catch {
        return "";
      }
    })();
    const hasReaderRoot = Boolean(doc.querySelector(READING_ROOT_SELECTOR));
    if ((nextUrl || prevUrl) && (hasReaderRoot || READING_PATH_RE.test(pathname))) return true;
    return hasReaderRoot && READING_PATH_RE.test(pathname);
  }
  function findReaderRoot(doc) {
    const selectors = [
      "#chapter-content",
      ".chapter-content",
      ".chapter_content",
      "#readerarea",
      "#reader-area",
      ".reader-area",
      ".reading-content",
      ".chapter-reading-content",
      ".entry-content",
      "article",
      "main"
    ];
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) return el;
    }
    return doc.body;
  }
  function imageSource(img, baseUrl) {
    const raw = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original") || img.getAttribute("src");
    if (!raw || /^(data|blob):/i.test(raw)) return null;
    return absoluteUrl(raw, baseUrl);
  }
  function tagReaderImages(doc, pageUrl) {
    const root = findReaderRoot(doc);
    if (!root) return [];
    const urls = [];
    for (const img of [...root.querySelectorAll("img")].slice(0, MAX_IMAGES_PER_CHAPTER)) {
      const url = imageSource(img, pageUrl);
      if (!url) continue;
      img.setAttribute("data-rer-src", url);
      urls.push(url);
    }
    return [...new Set(urls)];
  }
  async function cacheImage(url, chapterUrl, remainingBytes = Number.POSITIVE_INFINITY) {
    const existing = await dbGet("resources", url);
    if (existing) return true;
    try {
      const target = new URL(url);
      const chapter = new URL(chapterUrl);
      const response = await fetch(url, {
        credentials: target.origin === chapter.origin ? "include" : "omit",
        mode: "cors",
        cache: "force-cache"
      });
      if (!response.ok) return false;
      const blob = await response.blob();
      if (!blob.size || blob.size > MAX_RESOURCE_BYTES || blob.size > remainingBytes) return false;
      if (!await storageAllowsWrite(blob.size)) return false;
      await dbPut("resources", {
        url,
        chapterUrl,
        origin: chapter.origin,
        blob,
        bytes: blob.size,
        savedAt: Date.now()
      });
      return true;
    } catch {
      return false;
    }
  }
  async function cacheImagesSlowly(imageUrls, chapterUrl, byteBudget = Number.POSITIVE_INFINITY) {
    let cached = 0;
    let cachedBytes = 0;
    for (const url of imageUrls) {
      if (!navigator.onLine) break;
      const before = await dbGet("resources", url);
      if (await cacheImage(url, chapterUrl, Math.max(0, byteBudget - cachedBytes))) {
        const after = before || await dbGet("resources", url);
        cachedBytes += before ? 0 : after?.bytes || 0;
        cached += 1;
        status.imageCached += 1;
      }
      updateUI();
      await sleep(IMAGE_DELAY_MS);
    }
    return { cached, bytes: cachedBytes };
  }
  async function hydrateCachedImages() {
    revokeObjectUrls();
    const imgs = [...document.querySelectorAll("img[data-rer-src]")];
    for (const img of imgs) {
      const url = img.getAttribute("data-rer-src");
      if (!url) continue;
      const resource = await dbGet("resources", url);
      if (!resource?.blob) continue;
      const objectUrl = URL.createObjectURL(resource.blob);
      objectUrls.push(objectUrl);
      img.src = objectUrl;
      img.removeAttribute("srcset");
    }
  }
  function revokeObjectUrls() {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls = [];
  }
  function sanitizeCachedDocument(doc) {
    doc.querySelectorAll(
      'script, iframe, frame, frameset, object, embed, base, meta[http-equiv="refresh"], #rer-reader-control, #rer-reading-rails, #rer-reading-buffer-badge, #rer-reading-buffer-panel, .asr-reader-control'
    ).forEach((el) => el.remove());
    for (const el of doc.querySelectorAll("*")) {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name.startsWith("on") || name === "srcdoc") {
          el.removeAttribute(attr.name);
          continue;
        }
        if (["href", "src", "xlink:href", "action", "formaction"].includes(name) && /^javascript:/i.test(value)) {
          el.removeAttribute(attr.name);
        }
      }
    }
    return doc;
  }
  function serializeChapter(doc, pageUrl) {
    const clone = sanitizeCachedDocument(doc.cloneNode(true));
    const imageUrls = tagReaderImages(clone, pageUrl);
    const bodyHtml = clone.body?.innerHTML || "";
    return {
      url: pageUrl,
      origin: new URL(pageUrl).origin,
      title: doc.title || "",
      bodyHtml,
      nextUrl: findNextUrl(doc, pageUrl),
      prevUrl: findPrevUrl(doc, pageUrl),
      imageUrls,
      bytes: new Blob([bodyHtml]).size,
      savedAt: Date.now()
    };
  }
  async function saveCurrentChapter() {
    const url = absoluteUrl(location.href, location.href);
    if (!url) return null;
    const record = serializeChapter(document, url);
    await dbPut("chapters", record);
    return record;
  }
  async function fetchChapter(url, remainingBytes = Number.POSITIVE_INFINITY) {
    let response;
    try {
      response = await fetch(url, {
        credentials: "include",
        cache: "no-cache",
        headers: { Accept: "text/html,application/xhtml+xml" }
      });
    } catch {
      return { error: "network" };
    }
    if (response.status === 429) {
      return {
        error: "rate-limit",
        retryAfter: response.headers.get("Retry-After")
      };
    }
    if (response.status === 401 || response.status === 403) {
      return { error: `http-${response.status}` };
    }
    if (!response.ok) return { error: `http-${response.status}` };
    const html = await response.text();
    if (html.length < 500) return { error: "unexpected-page" };
    const doc = new DOMParser().parseFromString(html, "text/html");
    const record = serializeChapter(doc, url);
    if (record.bytes > remainingBytes) return { error: "byte-budget" };
    if (!await storageAllowsWrite(record.bytes)) return { error: "storage-budget" };
    await dbPut("chapters", record);
    return { record };
  }
  async function getFreshCachedChapter(url) {
    const cached = await dbGet("chapters", url);
    const maxAge = CACHE_TTL_DAYS * 24 * 60 * 60 * 1e3;
    if (!cached || Date.now() - cached.savedAt >= maxAge) return null;
    return cached;
  }
  async function collectCachedAhead(startUrl, chapterLimit = bufferPolicy.maxChapters) {
    const records = [];
    const seen = /* @__PURE__ */ new Set();
    const currentUrl = absoluteUrl(location.href, location.href);
    if (currentUrl) seen.add(currentUrl);
    let nextUrl = startUrl;
    while (records.length < chapterLimit && nextUrl) {
      if (seen.has(nextUrl)) {
        nextUrl = null;
        break;
      }
      if (new URL(nextUrl).origin !== location.origin) break;
      seen.add(nextUrl);
      const record = await getFreshCachedChapter(nextUrl);
      if (!record) break;
      records.push(record);
      nextUrl = record.nextUrl;
    }
    return { records, nextUrl };
  }
  async function observedChapterBytes(origin) {
    const [chapters, resources] = await Promise.all([dbAll("chapters"), dbAll("resources")]);
    const totals = /* @__PURE__ */ new Map();
    for (const chapter of chapters) {
      if (chapter.origin === origin) totals.set(chapter.url, chapter.bytes || 0);
    }
    for (const resource of resources) {
      if (resource.origin !== origin || !totals.has(resource.chapterUrl)) continue;
      totals.set(resource.chapterUrl, (totals.get(resource.chapterUrl) || 0) + (resource.bytes || 0));
    }
    const samples = [...totals.values()].filter((bytes) => bytes > 0);
    return samples.length ? samples.reduce((sum, bytes) => sum + bytes, 0) / samples.length : null;
  }
  async function refreshCachedAheadStatus() {
    const nextUrl = findNextUrl(document, location.href);
    if (!nextUrl) {
      status.cachedAhead = 0;
      return;
    }
    const averageBytes = await observedChapterBytes(location.origin);
    const target = adaptiveChapterTarget(averageBytes);
    status.expectedAhead = target;
    const { records } = await collectCachedAhead(nextUrl, target);
    status.cachedAhead = records.length;
  }
  async function prefetchAhead() {
    if (prefetchRunning || !navigator.onLine) return;
    prefetchRunning = true;
    status.imageCached = 0;
    status.imageTotal = 0;
    status.problem = false;
    status.message = "V\xE9rification du buffer\u2026";
    showBufferStatus();
    updateUI();
    try {
      if (!isLikelyReaderPage()) {
        status.cachedAhead = 0;
        status.problem = false;
        status.message = "Hors page de lecture \u2014 buffer inactif";
        return;
      }
      const current = await saveCurrentChapter();
      if (!current?.nextUrl) {
        status.cachedAhead = 0;
        status.problem = false;
        status.message = "Fin de lecture d\xE9tect\xE9e";
        return;
      }
      const keep = /* @__PURE__ */ new Set([current.url]);
      if (current.prevUrl) keep.add(current.prevUrl);
      const averageBytes = await observedChapterBytes(location.origin);
      const targetChapters = adaptiveChapterTarget(averageBytes);
      status.expectedAhead = targetChapters;
      const cached = await collectCachedAhead(current.nextUrl, targetChapters);
      for (const record of cached.records) keep.add(record.url);
      const seen = new Set(keep);
      status.cachedAhead = cached.records.length;
      let nextUrl = cached.nextUrl;
      const chaptersToImageCache = [];
      let networkFetches = 0;
      let limitMessage = "";
      status.message = status.cachedAhead ? `${status.cachedAhead}/${targetChapters} d\xE9j\xE0 en cache \u2014 compl\xE9ment\u2026` : "Pr\xE9chargement\u2026";
      updateUI();
      while (status.cachedAhead < targetChapters && status.cachedAhead < bufferPolicy.maxChapters && nextUrl) {
        if (!navigator.onLine) break;
        if (seen.has(nextUrl)) {
          status.message = "Boucle de navigation d\xE9tect\xE9e \u2014 buffer arr\xEAt\xE9 proprement";
          break;
        }
        const sameOrigin = new URL(nextUrl).origin === location.origin;
        if (!sameOrigin) break;
        seen.add(nextUrl);
        await refreshCacheStats();
        if (status.cacheBytes >= bufferPolicy.byteBudget) {
          limitMessage = "Budget local atteint \u2014 buffer conserv\xE9";
          break;
        }
        if (!await storageAllowsWrite()) {
          limitMessage = "Espace de stockage prot\xE9g\xE9 \u2014 buffer conserv\xE9";
          break;
        }
        if (networkFetches > 0) await sleep(FETCH_DELAY_MS);
        const result = await fetchChapter(nextUrl, Math.max(0, bufferPolicy.byteBudget - status.cacheBytes));
        networkFetches += 1;
        if (result.error) {
          if (result.error === "byte-budget" || result.error === "storage-budget") {
            status.problem = false;
            limitMessage = result.error === "byte-budget" ? "Budget local atteint \u2014 buffer conserv\xE9" : "Espace de stockage prot\xE9g\xE9 \u2014 buffer conserv\xE9";
            break;
          }
          status.problem = true;
          if (result.error === "rate-limit") {
            status.message = result.retryAfter ? `Pause serveur (429, Retry-After ${result.retryAfter})` : "Pause serveur (429)";
          } else if (result.error === "network") {
            status.message = "R\xE9seau coup\xE9 \u2014 buffer conserv\xE9";
          } else {
            status.message = `Pr\xE9chargement stopp\xE9 (${result.error})`;
          }
          break;
        }
        const record = result.record;
        keep.add(record.url);
        status.cachedAhead += 1;
        status.imageTotal += record.imageUrls.length;
        chaptersToImageCache.push(record);
        updateUI();
        nextUrl = record.nextUrl;
      }
      status.problem = false;
      status.message = limitMessage || (status.cachedAhead ? `${status.cachedAhead}/${status.expectedAhead} chapitre${status.cachedAhead > 1 ? "s" : ""} pr\xEAt${status.cachedAhead > 1 ? "s" : ""}` : "Aucun chapitre en avance");
      updateUI();
      scheduleBufferFade();
      for (const chapter of chaptersToImageCache) {
        await refreshCacheStats();
        const remainingBytes = Math.max(0, bufferPolicy.byteBudget - status.cacheBytes);
        if (remainingBytes <= 0 || !await storageAllowsWrite()) break;
        await cacheImagesSlowly(chapter.imageUrls, chapter.url, remainingBytes);
      }
      await pruneOrigin(location.origin, keep);
      await refreshCacheStats();
    } catch (error) {
      console.warn("[RER Reading Buffer]", error);
      status.problem = true;
      status.message = "Erreur locale \u2014 voir console";
    } finally {
      prefetchRunning = false;
      updateUI();
      if (!status.problem) scheduleBufferFade();
    }
  }
  async function pruneOrigin(origin, keepUrls) {
    const chapters = await dbAll("chapters");
    const expiry = Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1e3;
    const staleChapterUrls = /* @__PURE__ */ new Set();
    for (const chapter of chapters) {
      if (chapter.origin !== origin || keepUrls.has(chapter.url)) continue;
      if (chapter.savedAt < expiry) {
        staleChapterUrls.add(chapter.url);
        await dbDelete("chapters", chapter.url);
      }
    }
    const resources = await dbAll("resources");
    for (const resource of resources) {
      if (resource.origin !== origin || keepUrls.has(resource.chapterUrl)) continue;
      if (resource.savedAt < expiry || staleChapterUrls.has(resource.chapterUrl)) {
        await dbDelete("resources", resource.url);
      }
    }
  }
  function clickedAnchor(event) {
    const el = event.target instanceof Element ? event.target.closest("a[href]") : null;
    return el || null;
  }
  async function openCachedChapter(url) {
    const record = await dbGet("chapters", url);
    if (!record) return false;
    revokeObjectUrls();
    history.pushState({ rerReadingBuffer: true }, "", record.url);
    document.title = record.title || document.title;
    const cachedDoc = sanitizeCachedDocument(
      new DOMParser().parseFromString(record.bodyHtml, "text/html")
    );
    const fragment = document.createDocumentFragment();
    for (const child of [...cachedDoc.body.childNodes]) {
      fragment.appendChild(document.importNode(child, true));
    }
    document.body.replaceChildren(fragment);
    document.querySelectorAll(".asr-icon").forEach((icon) => {
      const oldControl = icon.closest("button");
      if (oldControl) oldControl.remove();
    });
    await hydrateCachedImages();
    mountUI();
    status.problem = !navigator.onLine;
    status.message = navigator.onLine ? "Chapitre servi instantan\xE9ment depuis le buffer" : "Lecture depuis le buffer \u2014 r\xE9seau indisponible";
    await refreshCacheStats();
    await refreshCachedAheadStatus();
    showBufferStatus();
    updateUI();
    if (navigator.onLine) {
      setTimeout(() => void prefetchAhead(), 350);
    }
    window.scrollTo(0, 0);
    return true;
  }
  async function navigateCacheFirst(target) {
    if (await openCachedChapter(target)) return true;
    if (navigator.onLine) {
      location.assign(target);
      return true;
    }
    status.problem = true;
    status.message = "Chapitre suivant absent du buffer et r\xE9seau indisponible";
    showBufferStatus();
    updateUI();
    return false;
  }
  document.addEventListener("click", async (event) => {
    const a = clickedAnchor(event);
    if (!a) return;
    const target = absoluteUrl(a.getAttribute("href"), location.href);
    const next = findNextUrl(document, location.href);
    if (!target || !next || target !== next) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await navigateCacheFirst(target);
  }, true);
  document.addEventListener("keydown", async (event) => {
    if (!["ArrowRight", "d", "D"].includes(event.key)) return;
    const next = findNextUrl(document, location.href);
    if (!next) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await navigateCacheFirst(next);
  }, true);
  window.addEventListener("online", () => {
    status.problem = false;
    status.message = "R\xE9seau revenu \u2014 remise \xE0 niveau du buffer";
    showBufferStatus();
    updateUI();
    void prefetchAhead();
  });
  window.addEventListener("offline", () => {
    status.problem = true;
    status.message = "R\xE9seau indisponible \u2014 lecture depuis le buffer";
    showBufferStatus();
    updateUI();
  });
  window.addEventListener("popstate", () => {
    showBufferStatus();
    updateUI();
    if (!status.problem) scheduleBufferFade(500);
  });
  function normalizeHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#49c6d6";
  }
  function hexToRgb(hex) {
    const value = normalizeHexColor(hex).slice(1);
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16)
    };
  }
  function mixRgb(a, b, amount) {
    const t = Math.max(0, Math.min(1, amount));
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t)
    };
  }
  function rgbCss(rgb) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }
  function rgbaCss(rgb, alpha) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }
  function channelLuminance(channel) {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  function relativeLuminance(rgb) {
    return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
  }
  function contrastRatio(a, b) {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function bestTextColor(surface) {
    const dark = { r: 17, g: 24, b: 39 };
    const light = { r: 255, g: 255, b: 255 };
    return contrastRatio(surface, dark) >= contrastRatio(surface, light) ? rgbCss(dark) : rgbCss(light);
  }
  function getReaderAppearance() {
    const storedSize = readMigratedPreference(
      READER_SIZE_KEY,
      [LEGACY_READER_SIZE_KEY],
      47
    );
    const legacySizes = { small: 40, normal: 47, large: 55 };
    const numericSize = Number(
      Object.prototype.hasOwnProperty.call(legacySizes, storedSize) ? legacySizes[storedSize] : storedSize
    );
    return {
      color: normalizeHexColor(
        readMigratedPreference(
          READER_COLOR_KEY,
          [LEGACY_READER_COLOR_KEY],
          "#49c6d6"
        )
      ),
      opacity: Math.max(
        0.25,
        Math.min(
          1,
          Number(
            readMigratedPreference(
              READER_IDLE_OPACITY_KEY,
              [LEGACY_READER_IDLE_OPACITY_KEY],
              0.9
            )
          ) || 0.9
        )
      ),
      size: Math.max(36, Math.min(68, Number.isFinite(numericSize) ? numericSize : 47)),
      rails: Math.max(
        0,
        Math.min(
          100,
          Number(
            readMigratedPreference(
              READER_RAILS_KEY,
              [LEGACY_READER_RAILS_KEY],
              0
            )
          ) || 0
        )
      )
    };
  }
  function railsLevelLabel(level) {
    if (level <= 0) return "Off";
    if (level <= 25) return "Fin";
    if (level <= 65) return "Doux";
    return "Fort";
  }
  function applyReaderAppearance() {
    if (!control || !panel) return;
    const appearance = getReaderAppearance();
    const accent = hexToRgb(appearance.color);
    const white = { r: 255, g: 255, b: 255 };
    const surface = mixRgb(accent, white, 0.68);
    const buttonLight = mixRgb(accent, white, 0.84);
    const buttonMid = mixRgb(accent, white, 0.64);
    const buttonDeep = mixRgb(accent, white, 0.46);
    const buttonBorder = mixRgb(accent, white, 0.24);
    const border = mixRgb(accent, { r: 0, g: 0, b: 0 }, 0.4);
    const deep = mixRgb(accent, { r: 0, g: 0, b: 0 }, 0.62);
    const textColor = bestTextColor(surface);
    const sizePx = appearance.size;
    control.style.setProperty("--rr-size", `${sizePx}px`);
    control.style.setProperty("--rr-idle-opacity", String(appearance.opacity));
    control.style.setProperty("--rr-text", textColor);
    control.style.setProperty("--rr-border", rgbaCss(buttonBorder, 0.84));
    control.style.setProperty("--rr-shadow", rgbaCss(accent, 0.2));
    control.style.setProperty(
      "--rr-background",
      `linear-gradient(145deg, rgba(255,255,255,.90) 0%, ${rgbaCss(buttonLight, 0.96)} 34%, ${rgbaCss(buttonMid, 0.92)} 70%, ${rgbaCss(buttonDeep, 0.88)} 100%)`
    );
    panel.style.setProperty("--rr-panel-accent", rgbCss(accent));
    panel.style.setProperty("--rr-panel-border", rgbaCss(border, 0.76));
    panel.style.setProperty("--rr-panel-shadow", rgbaCss(deep, 0.3));
    if (sideRails) {
      const railT = appearance.rails / 100;
      const sizeT = Math.max(0, Math.min(1, (appearance.size - 36) / 32));
      const railScale = 0.78 + 0.44 * sizeT;
      const railMinVw = 2.25 * railScale;
      const railMaxVw = 18 * railScale;
      const railWidthVw = railMinVw + (railMaxVw - railMinVw) * railT;
      const railMaxPx = 220 * railScale;
      const railAlpha = 0.36 * appearance.opacity;
      const waveAlpha = Math.min(0.46, railAlpha * 1.28);
      const sparkAlpha = Math.min(0.58, railAlpha * 1.52);
      sideRails.classList.toggle("rr-off", appearance.rails <= 0);
      sideRails.style.setProperty(
        "--rr-rail-width",
        `min(${railWidthVw.toFixed(2)}vw, ${railMaxPx.toFixed(0)}px)`
      );
      sideRails.style.setProperty("--rr-rail-edge", rgbaCss(accent, railAlpha));
      sideRails.style.setProperty(
        "--rr-rail-mid",
        rgbaCss(accent, railAlpha * 0.48)
      );
      sideRails.style.setProperty(
        "--rr-rail-tail",
        rgbaCss(accent, railAlpha * 0.1)
      );
      sideRails.style.setProperty("--rr-rail-wave", rgbaCss(accent, waveAlpha));
      sideRails.style.setProperty("--rr-rail-spark", rgbaCss(accent, sparkAlpha));
    }
    if (hasCustomPosition) {
      requestAnimationFrame(() => clampControlToViewport());
    }
  }
  function showBufferStatus() {
    if (bufferFadeTimerId !== null) {
      clearTimeout(bufferFadeTimerId);
      bufferFadeTimerId = null;
    }
    if (!bufferVisible) bufferShownAt = Date.now();
    if (!bufferShownAt) bufferShownAt = Date.now();
    bufferVisible = true;
    renderControl();
  }
  function scheduleBufferFade(delayMs = BUFFER_FADE_DELAY_MS) {
    if (status.problem || !control) return;
    if (bufferFadeTimerId !== null) clearTimeout(bufferFadeTimerId);
    const elapsed = bufferShownAt ? Date.now() - bufferShownAt : 0;
    const waitMs = Math.max(delayMs, BUFFER_MIN_VISIBLE_MS - elapsed);
    bufferFadeTimerId = setTimeout(() => {
      bufferFadeTimerId = null;
      if (status.problem || panel && !panel.hidden) return;
      bufferVisible = false;
      renderControl();
    }, waitMs);
  }
  function clearGhostTimer() {
    if (ghostTimerId !== null) {
      clearTimeout(ghostTimerId);
      ghostTimerId = null;
    }
  }
  function scheduleGhost(delayMs = SCROLL_GHOST_DELAY_MS) {
    clearGhostTimer();
    if (!scrollState.scrolling) return;
    scrollState.ghosted = false;
    renderControl();
    ghostTimerId = setTimeout(() => {
      ghostTimerId = null;
      if (!scrollState.scrolling) return;
      scrollState.ghosted = true;
      renderControl();
    }, delayMs);
  }
  function scheduleSpeedLabelClear() {
    if (speedLabelTimerId !== null) clearTimeout(speedLabelTimerId);
    const waitMs = Math.max(0, scrollState.speedVisibleUntil - Date.now());
    speedLabelTimerId = setTimeout(() => {
      speedLabelTimerId = null;
      renderControl();
      if (scrollState.scrolling) scheduleGhost(450);
    }, waitMs);
  }
  function createMediaIcon(kind) {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("class", `rr-media-icon rr-media-icon-${kind}`);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    if (kind === "play") {
      const path = document.createElementNS(namespace, "path");
      path.setAttribute(
        "d",
        "M9.15 6.55 C9.15 6.02 9.72 5.69 10.18 5.96 L18.02 10.62 C18.94 11.17 18.94 12.49 18.02 13.04 L10.18 17.70 C9.72 17.97 9.15 17.64 9.15 17.11 Z"
      );
      svg.append(path);
      return svg;
    }
    if (kind === "pause") {
      const leftBar = document.createElementNS(namespace, "rect");
      leftBar.setAttribute("x", "7.35");
      leftBar.setAttribute("y", "6.15");
      leftBar.setAttribute("width", "3.35");
      leftBar.setAttribute("height", "11.70");
      leftBar.setAttribute("rx", "1.15");
      const rightBar = document.createElementNS(namespace, "rect");
      rightBar.setAttribute("x", "13.30");
      rightBar.setAttribute("y", "6.15");
      rightBar.setAttribute("width", "3.35");
      rightBar.setAttribute("height", "11.70");
      rightBar.setAttribute("rx", "1.15");
      svg.append(leftBar, rightBar);
      return svg;
    }
    return null;
  }
  function applyControlAnchorClass() {
    if (!control) return;
    control.classList.toggle("rr-anchor-left", controlAnchor === "left");
    control.classList.toggle("rr-anchor-right", controlAnchor === "right");
  }
  function setControlContent(iconValue, labelText, expanded) {
    if (!control || !controlIcon || !controlLabel) return;
    controlIcon.replaceChildren();
    const mediaIcon = iconValue === "play" || iconValue === "pause" ? createMediaIcon(iconValue) : null;
    if (mediaIcon) {
      controlIcon.append(mediaIcon);
    } else {
      controlIcon.textContent = iconValue;
    }
    controlLabel.textContent = labelText || "";
    control.classList.toggle("rr-expanded", Boolean(expanded));
    control.classList.toggle("rr-compact", !expanded);
    applyControlAnchorClass();
    if (panel && !panel.hidden) requestAnimationFrame(positionPanelNearControl);
  }
  function renderControl() {
    if (!control) return;
    const now = Date.now();
    const panelOpen = panel && !panel.hidden;
    const speedVisible = scrollState.available && scrollState.speedVisibleUntil > now;
    let hidden = false;
    let description = "Reader";
    if (status.problem) {
      setControlContent("\u26A0", `\u{1F4DA} ${status.cachedAhead}/${status.expectedAhead}`, true);
      description = `Probl\xE8me Reader. Buffer ${status.cachedAhead} sur ${status.expectedAhead}. ${status.message}`;
    } else if (speedVisible) {
      setControlContent("\u2195", `${scrollState.speed} px/s`, true);
      description = `Vitesse de d\xE9filement ${scrollState.speed} pixels par seconde`;
    } else if (bufferVisible) {
      setControlContent("\u{1F4DA}", `${status.cachedAhead}/${status.expectedAhead}`, true);
      description = `Buffer ${status.cachedAhead} sur ${status.expectedAhead}. ${status.message}`;
    } else if (scrollState.available && scrollState.enabled) {
      setControlContent(scrollState.scrolling ? "pause" : "play", "", false);
      description = scrollState.scrolling ? "Mettre en pause le d\xE9filement automatique" : "D\xE9marrer le d\xE9filement automatique";
    } else if (scrollState.available) {
      setControlContent("\u2699", "", false);
      description = "Auto-scroll d\xE9sactiv\xE9 \u2014 ouvrir les r\xE9glages";
    } else if (panelOpen) {
      setControlContent("\u2699", "", false);
      description = "R\xE9glages Reader";
    } else {
      hidden = true;
    }
    control.classList.toggle("rr-hidden", hidden);
    control.classList.toggle(
      "rr-dormant",
      Boolean(
        scrollState.available && !scrollState.enabled && !status.problem && !bufferVisible && !panelOpen
      )
    );
    control.classList.toggle(
      "rr-ghost",
      Boolean(
        scrollState.scrolling && scrollState.ghosted && !status.problem && !bufferVisible && !speedVisible && !panelOpen && !controlGesture
      )
    );
    control.setAttribute("aria-label", description);
    control.removeAttribute("title");
    updatePanelStatus();
  }
  function updatePanelStatus() {
    if (!panel) return;
    const info = panel.querySelector(".rer-status");
    if (info) {
      const parts = [
        `\u{1F4DA} ${status.cachedAhead}/${status.expectedAhead}`,
        navigator.onLine ? "R\xE9seau OK" : "Hors ligne \xB7 cache"
      ];
      if (status.problem && status.message) parts.push(status.message);
      info.textContent = parts.join(" \xB7 ");
    }
    const scrollToggle = panel.querySelector("#rer-reader-scroll-toggle");
    if (scrollToggle) {
      scrollToggle.checked = Boolean(scrollState.enabled);
      scrollToggle.disabled = !scrollState.available;
    }
    const scrollMeta = panel.querySelector(".rer-scroll-meta");
    if (scrollMeta) {
      scrollMeta.textContent = scrollState.available ? `${scrollState.speed} px/s` : "Indisponible";
    }
    const retryBtn = panel.querySelector("#rer-reading-buffer-retry");
    if (retryBtn) retryBtn.hidden = !status.problem;
  }
  function updateUI() {
    renderControl();
  }
  function applyAnchoredControlPosition(anchor, offset, top, save = false) {
    if (!control) return;
    const rect = control.getBoundingClientRect();
    const margin = 8;
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const maxOffset = Math.max(margin, window.innerWidth - rect.width - margin);
    const clampedTop = Math.min(Math.max(margin, top), maxTop);
    const clampedOffset = Math.min(Math.max(margin, offset), maxOffset);
    controlAnchor = anchor === "left" ? "left" : "right";
    control.style[controlAnchor] = `${clampedOffset}px`;
    control.style[controlAnchor === "left" ? "right" : "left"] = "auto";
    control.style.top = `${clampedTop}px`;
    control.style.bottom = "auto";
    hasCustomPosition = true;
    applyControlAnchorClass();
    if (save) {
      desiredControlPosition = {
        horizontalAnchor: controlAnchor,
        offset: Math.round(clampedOffset),
        top: Math.round(clampedTop)
      };
      GM_setValue(
        READER_POSITION_KEY,
        JSON.stringify(desiredControlPosition)
      );
    }
    if (panel && !panel.hidden) positionPanelNearControl();
  }
  function setControlPositionFromTop(left, top) {
    if (!control) return;
    const rect = control.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const clampedLeft = Math.min(Math.max(margin, left), maxLeft);
    const clampedTop = Math.min(Math.max(margin, top), maxTop);
    control.style.left = `${clampedLeft}px`;
    control.style.right = "auto";
    control.style.top = `${clampedTop}px`;
    control.style.bottom = "auto";
    hasCustomPosition = true;
    if (panel && !panel.hidden) positionPanelNearControl();
  }
  function anchorControlToNearestEdge(save = false) {
    if (!control) return;
    const rect = control.getBoundingClientRect();
    const anchor = rect.left + rect.width / 2 <= window.innerWidth / 2 ? "left" : "right";
    const offset = anchor === "left" ? rect.left : window.innerWidth - rect.right;
    applyAnchoredControlPosition(anchor, offset, rect.top, save);
  }
  function clampControlToViewport() {
    if (!control || !hasCustomPosition || !desiredControlPosition) return;
    applyAnchoredControlPosition(
      desiredControlPosition.horizontalAnchor,
      desiredControlPosition.offset,
      desiredControlPosition.top
    );
  }
  function loadSavedControlPosition() {
    const raw = readMigratedPreference(
      READER_POSITION_KEY,
      LEGACY_READER_POSITION_KEYS,
      ""
    );
    if (!raw) {
      applyControlAnchorClass();
      return;
    }
    try {
      const position = JSON.parse(raw);
      if ((position.horizontalAnchor === "left" || position.horizontalAnchor === "right") && Number.isFinite(position.offset) && Number.isFinite(position.top)) {
        desiredControlPosition = {
          horizontalAnchor: position.horizontalAnchor,
          offset: Number(position.offset),
          top: Number(position.top)
        };
        applyAnchoredControlPosition(
          desiredControlPosition.horizontalAnchor,
          desiredControlPosition.offset,
          desiredControlPosition.top
        );
        return;
      }
      if (Number.isFinite(position.left) && Number.isFinite(position.bottom)) {
        const rect = control.getBoundingClientRect();
        const top = window.innerHeight - position.bottom - rect.height;
        setControlPositionFromTop(position.left, top);
        anchorControlToNearestEdge(true);
        return;
      }
      if (Number.isFinite(position.left) && Number.isFinite(position.top)) {
        setControlPositionFromTop(position.left, position.top);
        anchorControlToNearestEdge(true);
      }
    } catch {
    }
  }
  function positionPanelNearControl() {
    if (!control || !panel || panel.hidden) return;
    const controlRect = control.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 10;
    let left = controlRect.right - panelRect.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - panelRect.width - margin));
    let top = controlRect.top - panelRect.height - margin;
    if (top < margin) {
      top = Math.min(
        window.innerHeight - panelRect.height - margin,
        controlRect.bottom + margin
      );
    }
    panel.style.left = `${Math.max(margin, left)}px`;
    panel.style.top = `${Math.max(margin, top)}px`;
  }
  function openReaderPanel() {
    if (!panel) return;
    panel.hidden = false;
    bufferVisible = bufferVisible || status.problem;
    scrollState.ghosted = false;
    clearGhostTimer();
    renderControl();
    requestAnimationFrame(positionPanelNearControl);
  }
  function closeReaderPanel() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    renderControl();
    if (!status.problem && bufferVisible) {
      scheduleBufferFade(350);
    }
    if (scrollState.scrolling) scheduleGhost(500);
  }
  function clearLongPressTimer() {
    if (!controlGesture?.longPressTimerId) return;
    clearTimeout(controlGesture.longPressTimerId);
    controlGesture.longPressTimerId = null;
  }
  function speedStepsForDelta(deltaY) {
    const distance = Math.abs(deltaY);
    if (distance < CONTROL_SWIPE_THRESHOLD_PX) return 0;
    const direction = deltaY < 0 ? 1 : -1;
    return direction * (1 + Math.floor(
      (distance - CONTROL_SWIPE_THRESHOLD_PX) / CONTROL_SPEED_PX_PER_STEP
    ));
  }
  function finishControlGesture(event) {
    if (!controlGesture || event.pointerId !== controlGesture.pointerId) return;
    const state = controlGesture;
    clearLongPressTimer();
    if (state.mode === "drag") {
      anchorControlToNearestEdge(true);
    } else if (state.mode === "longpress" && event.type !== "pointercancel") {
      openReaderPanel();
    } else if (state.mode === "pending" && event.type !== "pointercancel") {
      if (scrollState.available && scrollState.enabled) {
        document.dispatchEvent(new CustomEvent("rer-reader-toggle-scroll"));
      } else if (!state.panelWasClosedOnPointerDown) {
        openReaderPanel();
      }
    }
    if (control.hasPointerCapture(event.pointerId)) {
      control.releasePointerCapture(event.pointerId);
    }
    control.classList.remove("rr-pressing");
    controlGesture = null;
    renderControl();
    if (scrollState.scrolling) scheduleGhost(650);
  }
  function mountUI() {
    document.getElementById("rer-reader-control")?.remove();
    document.getElementById("rer-reading-rails")?.remove();
    document.getElementById("rer-reading-buffer-badge")?.remove();
    document.getElementById("rer-reading-buffer-panel")?.remove();
    document.querySelectorAll(".asr-reader-control").forEach((el) => el.remove());
    control = document.createElement("button");
    control.id = "rer-reader-control";
    control.type = "button";
    controlIcon = document.createElement("span");
    controlIcon.className = "rr-icon";
    controlIcon.setAttribute("aria-hidden", "true");
    controlLabel = document.createElement("span");
    controlLabel.className = "rr-label";
    control.append(controlIcon, controlLabel);
    sideRails = document.createElement("div");
    sideRails.id = "rer-reading-rails";
    sideRails.setAttribute("aria-hidden", "true");
    const leftRail = document.createElement("span");
    leftRail.className = "rr-side-rail rr-side-rail-left";
    const rightRail = document.createElement("span");
    rightRail.className = "rr-side-rail rr-side-rail-right";
    const svgNamespace = "http://www.w3.org/2000/svg";
    for (const rail of [leftRail, rightRail]) {
      const waveSvg = document.createElementNS(svgNamespace, "svg");
      waveSvg.setAttribute("class", "rr-side-rail-wave");
      waveSvg.setAttribute("viewBox", "0 0 100 1000");
      waveSvg.setAttribute("preserveAspectRatio", "none");
      waveSvg.setAttribute("aria-hidden", "true");
      const primaryWave = document.createElementNS(svgNamespace, "path");
      primaryWave.setAttribute(
        "d",
        "M 18 -20 C 42 72, 4 154, 28 246 S 8 410, 31 510 S 5 675, 27 782 S 8 930, 30 1020"
      );
      primaryWave.setAttribute("class", "rr-wave-primary");
      const secondaryWave = document.createElementNS(svgNamespace, "path");
      secondaryWave.setAttribute(
        "d",
        "M 30 -30 C 52 88, 16 174, 39 280 S 18 448, 42 558 S 15 724, 39 842 S 18 950, 42 1030"
      );
      secondaryWave.setAttribute("class", "rr-wave-secondary");
      waveSvg.append(primaryWave, secondaryWave);
      rail.append(waveSvg);
    }
    sideRails.append(leftRail, rightRail);
    panel = document.createElement("div");
    panel.id = "rer-reading-buffer-panel";
    panel.hidden = true;
    const header = document.createElement("div");
    header.className = "rer-panel-header";
    const title = document.createElement("strong");
    title.textContent = "Buffer";
    const info = document.createElement("span");
    info.className = "rer-status";
    header.append(title, info);
    const retryBtn = document.createElement("button");
    retryBtn.id = "rer-reading-buffer-retry";
    retryBtn.type = "button";
    retryBtn.textContent = "R\xE9essayer le buffer";
    retryBtn.addEventListener("click", () => void prefetchAhead());
    const appearance = getReaderAppearance();
    const scrollRow = document.createElement("div");
    scrollRow.className = "rer-setting-row rer-scroll-row";
    const scrollLabel = document.createElement("strong");
    scrollLabel.className = "rer-inline-title";
    scrollLabel.textContent = "Auto-scroll";
    const scrollMeta = document.createElement("span");
    scrollMeta.className = "rer-scroll-meta";
    const switchLabel = document.createElement("label");
    switchLabel.className = "rer-switch";
    const scrollToggle = document.createElement("input");
    scrollToggle.id = "rer-reader-scroll-toggle";
    scrollToggle.type = "checkbox";
    scrollToggle.checked = Boolean(scrollState.enabled);
    scrollToggle.disabled = !scrollState.available;
    scrollToggle.setAttribute("aria-label", "Activer ou d\xE9sactiver l\u2019auto-scroll");
    scrollToggle.addEventListener("change", () => {
      scrollState.enabled = scrollToggle.checked;
      GM_setValue(SCROLL_ENABLED_KEY, scrollState.enabled);
      document.dispatchEvent(
        new CustomEvent("rer-reader-scroll-enabled", {
          detail: { enabled: scrollState.enabled }
        })
      );
      renderControl();
    });
    const switchTrack = document.createElement("span");
    switchTrack.className = "rer-switch-track";
    switchLabel.append(scrollToggle, switchTrack);
    scrollRow.append(scrollLabel, scrollMeta, switchLabel);
    const appearanceTitle = document.createElement("div");
    appearanceTitle.className = "rer-section-title";
    appearanceTitle.textContent = "Apparence";
    const colorRow = document.createElement("label");
    colorRow.className = "rer-setting-row";
    colorRow.append(document.createTextNode("Couleur du th\xE8me"));
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = appearance.color;
    colorInput.setAttribute("aria-label", "Couleur du th\xE8me");
    colorInput.addEventListener("input", () => {
      GM_setValue(READER_COLOR_KEY, colorInput.value);
      applyReaderAppearance();
      renderControl();
    });
    colorRow.append(colorInput);
    const railsRow = document.createElement("label");
    railsRow.className = "rer-setting-row rer-slider-row";
    const railsLabel = document.createElement("span");
    railsLabel.textContent = "Rep\xE8res lat\xE9raux";
    const railsControls = document.createElement("span");
    railsControls.className = "rer-slider-controls";
    const railsInput = document.createElement("input");
    railsInput.type = "range";
    railsInput.min = "0";
    railsInput.max = "100";
    railsInput.step = "1";
    railsInput.value = String(appearance.rails);
    railsInput.setAttribute(
      "aria-label",
      "Largeur des rep\xE8res lat\xE9raux"
    );
    const railsOutput = document.createElement("output");
    railsOutput.textContent = railsLevelLabel(appearance.rails);
    railsInput.addEventListener("input", () => {
      const value = Number(railsInput.value);
      GM_setValue(READER_RAILS_KEY, value);
      railsOutput.textContent = railsLevelLabel(value);
      applyReaderAppearance();
    });
    railsControls.append(railsInput, railsOutput);
    railsRow.append(railsLabel, railsControls);
    const opacityRow = document.createElement("label");
    opacityRow.className = "rer-setting-row rer-slider-row";
    const opacityLabel = document.createElement("span");
    opacityLabel.textContent = "Opacit\xE9";
    const opacityControls = document.createElement("span");
    opacityControls.className = "rer-slider-controls";
    const opacityInput = document.createElement("input");
    opacityInput.type = "range";
    opacityInput.min = "0.25";
    opacityInput.max = "1";
    opacityInput.step = "0.05";
    opacityInput.value = String(appearance.opacity);
    opacityInput.setAttribute(
      "aria-label",
      "Opacit\xE9 du bouton et des rep\xE8res lat\xE9raux"
    );
    const opacityOutput = document.createElement("output");
    opacityOutput.textContent = `${Math.round(appearance.opacity * 100)}%`;
    opacityInput.addEventListener("input", () => {
      const value = Number(opacityInput.value);
      GM_setValue(READER_IDLE_OPACITY_KEY, value);
      opacityOutput.textContent = `${Math.round(value * 100)}%`;
      applyReaderAppearance();
      renderControl();
    });
    opacityControls.append(opacityInput, opacityOutput);
    opacityRow.append(opacityLabel, opacityControls);
    const sizeRow = document.createElement("label");
    sizeRow.className = "rer-setting-row rer-slider-row";
    const sizeLabel = document.createElement("span");
    sizeLabel.textContent = "Taille";
    const sizeControls = document.createElement("span");
    sizeControls.className = "rer-slider-controls";
    const sizeInput = document.createElement("input");
    sizeInput.type = "range";
    sizeInput.min = "36";
    sizeInput.max = "68";
    sizeInput.step = "1";
    sizeInput.value = String(appearance.size);
    sizeInput.setAttribute(
      "aria-label",
      "Taille du bouton et \xE9chelle maximale des rep\xE8res lat\xE9raux"
    );
    const sizeOutput = document.createElement("output");
    sizeOutput.textContent = `${Math.round(appearance.size)} px`;
    sizeInput.addEventListener("input", () => {
      const value = Number(sizeInput.value);
      GM_setValue(READER_SIZE_KEY, value);
      sizeOutput.textContent = `${Math.round(value)} px`;
      applyReaderAppearance();
      renderControl();
      requestAnimationFrame(positionPanelNearControl);
    });
    sizeControls.append(sizeInput, sizeOutput);
    sizeRow.append(sizeLabel, sizeControls);
    panel.append(
      header,
      retryBtn,
      scrollRow,
      appearanceTitle,
      colorRow,
      sizeRow,
      opacityRow,
      railsRow
    );
    document.body.append(sideRails, control, panel);
    injectStyles();
    applyReaderAppearance();
    loadSavedControlPosition();
    bufferVisible = true;
    bufferShownAt = Date.now();
    renderControl();
    control.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      document.dispatchEvent(new CustomEvent("rer-reader-stop-scroll"));
      openReaderPanel();
    });
    control.addEventListener("pointerdown", (event) => {
      if (controlGesture || event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      scrollState.ghosted = false;
      clearGhostTimer();
      const rect = control.getBoundingClientRect();
      controlGesture = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        panelWasClosedOnPointerDown: panelClosedByControlPointerId === event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: rect.left,
        originTop: rect.top,
        mode: "pending",
        speedSteps: 0,
        longPressTimerId: null
      };
      panelClosedByControlPointerId = null;
      control.setPointerCapture(event.pointerId);
      if (event.pointerType !== "mouse") {
        controlGesture.longPressTimerId = setTimeout(() => {
          if (!controlGesture || controlGesture.mode !== "pending") return;
          controlGesture.longPressTimerId = null;
          controlGesture.mode = "longpress";
          control.classList.add("rr-pressing");
          renderControl();
        }, CONTROL_LONG_PRESS_MS);
      }
      renderControl();
    });
    control.addEventListener("pointermove", (event) => {
      if (!controlGesture || event.pointerId !== controlGesture.pointerId) return;
      const deltaX = event.clientX - controlGesture.startX;
      const deltaY = event.clientY - controlGesture.startY;
      const distance = Math.hypot(deltaX, deltaY);
      if (controlGesture.pointerType === "mouse") {
        if (controlGesture.mode === "pending" && distance >= 4) {
          controlGesture.mode = "drag";
        }
        if (controlGesture.mode === "drag") {
          event.preventDefault();
          setControlPositionFromTop(
            controlGesture.originLeft + deltaX,
            controlGesture.originTop + deltaY
          );
        }
        return;
      }
      if (controlGesture.mode === "longpress") {
        if (distance >= 4) {
          controlGesture.mode = "drag";
          control.classList.remove("rr-pressing");
        } else {
          return;
        }
      }
      if (controlGesture.mode === "drag") {
        event.preventDefault();
        setControlPositionFromTop(
          controlGesture.originLeft + deltaX,
          controlGesture.originTop + deltaY
        );
        return;
      }
      if (controlGesture.mode === "pending") {
        const verticalEnough = scrollState.available && scrollState.enabled && Math.abs(deltaY) >= CONTROL_SWIPE_THRESHOLD_PX && Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
        if (verticalEnough) {
          clearLongPressTimer();
          controlGesture.mode = "speed";
        } else if (distance >= CONTROL_SWIPE_THRESHOLD_PX) {
          clearLongPressTimer();
          controlGesture.mode = "cancelled";
        }
      }
      if (controlGesture.mode === "speed") {
        event.preventDefault();
        const steps = speedStepsForDelta(deltaY);
        const deltaSteps = steps - controlGesture.speedSteps;
        if (deltaSteps !== 0) {
          controlGesture.speedSteps = steps;
          document.dispatchEvent(
            new CustomEvent("rer-reader-speed-steps", {
              detail: { steps: deltaSteps }
            })
          );
        }
      }
    });
    control.addEventListener("pointerup", finishControlGesture);
    control.addEventListener("pointercancel", finishControlGesture);
    control.addEventListener(
      "wheel",
      (event) => {
        if (!scrollState.available || !scrollState.enabled) return;
        event.preventDefault();
        document.dispatchEvent(
          new CustomEvent("rer-reader-speed-steps", {
            detail: { steps: event.deltaY < 0 ? 1 : -1 }
          })
        );
      },
      { passive: false }
    );
  }
  function injectStyles() {
    if (document.getElementById("rer-reading-buffer-style")) return;
    const style = document.createElement("style");
    style.id = "rer-reading-buffer-style";
    style.textContent = `
      #rer-reading-rails {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        overflow: hidden;
        pointer-events: none;
        opacity: 1;
        transition: opacity 180ms ease;
      }

      #rer-reading-rails.rr-off {
        opacity: 0;
      }

      #rer-reading-rails .rr-side-rail {
        position: absolute;
        top: 0;
        bottom: 0;
        width: var(--rr-rail-width, min(8vw, 120px));
        pointer-events: none;
        transition: width 180ms ease, background 180ms ease;
      }

      #rer-reading-rails .rr-side-rail-left {
        left: 0;
        background:
          radial-gradient(circle at 18% 9%, var(--rr-rail-spark, rgba(73,198,214,.12)) 0 1.4px, transparent 2.3px),
          radial-gradient(circle at 27% 28%, var(--rr-rail-spark, rgba(73,198,214,.12)) 0 1.2px, transparent 2.1px),
          radial-gradient(circle at 15% 58%, var(--rr-rail-spark, rgba(73,198,214,.12)) 0 1.5px, transparent 2.4px),
          radial-gradient(circle at 25% 84%, var(--rr-rail-spark, rgba(73,198,214,.12)) 0 1.3px, transparent 2.2px),
          linear-gradient(
            90deg,
            var(--rr-rail-edge, rgba(73,198,214,.11)) 0%,
            var(--rr-rail-mid, rgba(73,198,214,.05)) 32%,
            var(--rr-rail-tail, rgba(73,198,214,.012)) 72%,
            transparent 100%
          );
      }

      #rer-reading-rails .rr-side-rail-right {
        right: 0;
        background:
          radial-gradient(circle at 82% 9%, var(--rr-rail-spark, rgba(73,198,214,.12)) 0 1.4px, transparent 2.3px),
          radial-gradient(circle at 73% 28%, var(--rr-rail-spark, rgba(73,198,214,.12)) 0 1.2px, transparent 2.1px),
          radial-gradient(circle at 85% 58%, var(--rr-rail-spark, rgba(73,198,214,.12)) 0 1.5px, transparent 2.4px),
          radial-gradient(circle at 75% 84%, var(--rr-rail-spark, rgba(73,198,214,.12)) 0 1.3px, transparent 2.2px),
          linear-gradient(
            270deg,
            var(--rr-rail-edge, rgba(73,198,214,.11)) 0%,
            var(--rr-rail-mid, rgba(73,198,214,.05)) 32%,
            var(--rr-rail-tail, rgba(73,198,214,.012)) 72%,
            transparent 100%
          );
      }

      #rer-reading-rails .rr-side-rail-wave {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
        color: var(--rr-rail-wave, rgba(73,198,214,.16));
        pointer-events: none;
      }

      #rer-reading-rails .rr-side-rail-right .rr-side-rail-wave {
        transform: scaleX(-1);
        transform-origin: center;
      }

      #rer-reading-rails .rr-side-rail-wave path {
        fill: none;
        stroke: currentColor;
        vector-effect: non-scaling-stroke;
      }

      #rer-reading-rails .rr-wave-primary {
        stroke-width: 1.25;
        opacity: .88;
      }

      #rer-reading-rails .rr-wave-secondary {
        stroke-width: .8;
        opacity: .34;
      }

      #rer-reader-control {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483646;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        box-sizing: border-box;
        width: auto;
        min-width: var(--rr-size, 47px);
        height: var(--rr-size, 47px);
        margin: 0;
        padding: 0;
        overflow: hidden;
        border: 1px solid var(--rr-border, rgba(20, 80, 90, .8));
        border-radius: 999px;
        appearance: none;
        -webkit-appearance: none;
        background: var(--rr-background, rgba(255,255,255,.72));
        color: var(--rr-text, #111827);
        box-shadow:
          0 7px 24px var(--rr-shadow, rgba(0,0,0,.22)),
          inset 0 1px 0 rgba(255,255,255,.70);
        font: 650 14px/1 system-ui, -apple-system, "Segoe UI", "Segoe UI Emoji", "Apple Color Emoji", sans-serif;
        white-space: nowrap;
        cursor: grab;
        opacity: var(--rr-idle-opacity, .9);
        user-select: none;
        touch-action: none;
        backdrop-filter: blur(12px) saturate(135%);
        -webkit-backdrop-filter: blur(12px) saturate(135%);
        transition:
          opacity 360ms ease,
          padding 220ms ease,
          transform 160ms ease,
          box-shadow 220ms ease;
        -webkit-tap-highlight-color: transparent;
      }

      #rer-reader-control::before {
        content: "";
        position: absolute;
        left: 5px;
        right: 5px;
        top: 3px;
        height: 42%;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(255,255,255,.76), rgba(255,255,255,0));
        opacity: .74;
        pointer-events: none;
      }

      #rer-reader-control::after {
        content: "";
        position: absolute;
        top: 7px;
        left: 20%;
        width: 28%;
        height: 4px;
        border-radius: 999px;
        background: rgba(255,255,255,.72);
        filter: blur(.35px);
        opacity: .55;
        transform: rotate(-4deg);
        pointer-events: none;
      }

      #rer-reader-control > * {
        position: relative;
        z-index: 1;
      }

      #rer-reader-control.rr-compact {
        min-width: var(--rr-size, 47px);
        padding-left: 0;
        padding-right: 0;
      }

      #rer-reader-control.rr-expanded {
        min-width: var(--rr-size, 47px);
        padding-left: 11px;
        padding-right: 11px;
      }

      /* The control itself stays the same pill. The label opens/closes inside
         it, so the outer geometry morphs smoothly instead of jumping between
         a fixed circle and width:auto. Edge anchoring then makes that growth
         happen inward from the nearest side of the viewport. */
      #rer-reader-control.rr-anchor-left {
        transform-origin: left center;
      }

      #rer-reader-control.rr-anchor-right {
        transform-origin: right center;
      }

      #rer-reader-control.rr-hidden {
        opacity: 0;
        transform: translateY(5px) scale(.96);
        pointer-events: none;
      }

      #rer-reader-control.rr-ghost:not(:hover) {
        opacity: .10;
      }

      #rer-reader-control.rr-dormant:not(:hover) {
        opacity: .18;
      }

      #rer-reader-control:hover,
      #rer-reader-control.rr-pressing {
        opacity: var(--rr-idle-opacity, .9) !important;
      }

      #rer-reader-control.rr-pressing {
        transform: scale(.96);
        box-shadow:
          0 4px 15px var(--rr-shadow, rgba(0,0,0,.18)),
          inset 0 1px 0 rgba(255,255,255,.72);
      }

      #rer-reader-control .rr-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.15em;
        line-height: 1;
      }

      #rer-reader-control .rr-media-icon {
        display: block;
        width: 19px;
        height: 19px;
        overflow: visible;
        fill: currentColor;
        flex: 0 0 auto;
      }

      #rer-reader-control .rr-media-icon-play {
        width: 19px;
        height: 19px;
      }

      #rer-reader-control .rr-media-icon-pause {
        width: 18px;
        height: 18px;
      }

      #rer-reader-control .rr-label {
        display: inline-block;
        max-width: 0;
        margin-left: 0;
        overflow: hidden;
        line-height: 1;
        opacity: 0;
        white-space: nowrap;
        transition:
          max-width 220ms ease,
          margin-left 220ms ease,
          opacity 160ms ease;
      }

      #rer-reader-control.rr-expanded .rr-label {
        max-width: 112px;
        margin-left: 7px;
        opacity: 1;
      }

      #rer-reading-buffer-panel {
        position: fixed;
        z-index: 2147483647;
        min-width: 270px;
        max-width: min(370px, calc(100vw - 20px));
        padding: 12px;
        border: 1px solid var(--rr-panel-border, rgba(255,255,255,.2));
        border-radius: 17px;
        background:
          linear-gradient(155deg, rgba(255,255,255,.07), rgba(255,255,255,0) 36%),
          rgba(18,20,24,.84);
        color: white;
        font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow:
          0 16px 46px var(--rr-panel-shadow, rgba(0,0,0,.34)),
          inset 0 1px 0 rgba(255,255,255,.08);
        backdrop-filter: blur(19px) saturate(140%);
        -webkit-backdrop-filter: blur(19px) saturate(140%);
      }

      #rer-reading-buffer-panel[hidden] {
        display: none !important;
      }

      #rer-reading-buffer-panel .rer-panel-header,
      #rer-reading-buffer-panel .rer-setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      #rer-reading-buffer-panel .rer-panel-header {
        margin-bottom: 5px;
        font-size: 12px;
      }

      #rer-reading-buffer-panel .rer-panel-header strong,
      #rer-reading-buffer-panel .rer-inline-title {
        color: var(--rr-panel-accent, #7de6ef);
        font-size: 11px;
        font-weight: 750;
        letter-spacing: .055em;
        text-transform: uppercase;
      }

      #rer-reading-buffer-panel .rer-status {
        max-width: 72%;
        text-align: right;
        opacity: .76;
        font-size: 10.5px;
        line-height: 1.25;
      }

      #rer-reading-buffer-panel .rer-section-title {
        margin: 11px 0 6px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,.09);
        color: var(--rr-panel-accent, #7de6ef);
        font-size: 11px;
        font-weight: 750;
        letter-spacing: .055em;
        text-transform: uppercase;
      }

      #rer-reading-buffer-panel .rer-setting-row {
        min-height: 34px;
        margin: 4px 0;
      }

      #rer-reading-buffer-panel .rer-scroll-row {
        display: grid;
        grid-template-columns: minmax(82px, 1fr) auto 42px;
        align-items: center;
        gap: 12px;
        margin-top: 2px;
        padding-bottom: 7px;
        border-bottom: 1px solid rgba(255,255,255,.09);
      }

      #rer-reading-buffer-panel .rer-scroll-meta {
        min-width: 54px;
        text-align: center;
        opacity: .82;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
      }

      #rer-reading-buffer-panel .rer-slider-controls {
        display: inline-grid;
        grid-template-columns: minmax(112px, 1fr) 42px;
        align-items: center;
        gap: 7px;
        min-width: 162px;
      }

      #rer-reading-buffer-panel .rer-slider-controls output {
        text-align: right;
        opacity: .72;
        font-variant-numeric: tabular-nums;
      }

      #rer-reading-buffer-panel input[type="range"] {
        width: 100%;
        margin: 0;
        accent-color: var(--rr-panel-accent, #7de6ef);
      }

      #rer-reading-buffer-panel input[type="color"] {
        width: 42px;
        height: 29px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: transparent;
      }

      #rer-reading-buffer-panel button {
        border: 0;
        border-radius: 9px;
        padding: 6px 9px;
        background: rgba(255,255,255,.94);
        color: #111827;
        font: inherit;
      }

      #rer-reading-buffer-panel .rer-switch {
        position: relative;
        display: inline-flex;
        width: 42px;
        height: 24px;
        flex: 0 0 auto;
      }

      #rer-reading-buffer-panel .rer-switch input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      #rer-reading-buffer-panel .rer-switch-track {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: rgba(255,255,255,.17);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.10);
        transition: background 180ms ease, box-shadow 180ms ease;
      }

      #rer-reading-buffer-panel .rer-switch-track::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: rgba(255,255,255,.94);
        box-shadow: 0 2px 7px rgba(0,0,0,.28);
        transition: transform 180ms ease;
      }

      #rer-reading-buffer-panel .rer-switch input:checked + .rer-switch-track {
        background: var(--rr-panel-accent, #7de6ef);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.18);
      }

      #rer-reading-buffer-panel .rer-switch input:checked + .rer-switch-track::after {
        transform: translateX(18px);
      }

      #rer-reading-buffer-panel .rer-switch input:disabled + .rer-switch-track {
        opacity: .38;
      }

      #rer-reading-buffer-retry {
        margin: 2px 0 5px;
      }

    `;
    document.head.appendChild(style);
  }
  document.addEventListener("rer-reader-scroll-state", (event) => {
    const detail = event.detail || {};
    const wasScrolling = scrollState.scrolling;
    if (typeof detail.available === "boolean") {
      scrollState.available = detail.available;
    }
    if (typeof detail.enabled === "boolean") {
      scrollState.enabled = detail.enabled;
    }
    if (typeof detail.scrolling === "boolean") {
      scrollState.scrolling = detail.scrolling;
    }
    if (Number.isFinite(detail.speed)) {
      scrollState.speed = detail.speed;
    }
    if (typeof detail.mode === "string") {
      scrollState.mode = detail.mode;
    }
    if (Number.isFinite(detail.minSpeed)) {
      scrollState.minSpeed = detail.minSpeed;
    }
    if (Number.isFinite(detail.maxSpeed)) {
      scrollState.maxSpeed = detail.maxSpeed;
    }
    if (Number.isFinite(detail.speedStep)) {
      scrollState.speedStep = detail.speedStep;
    }
    if (detail.showSpeed) {
      scrollState.speedVisibleUntil = Date.now() + SPEED_LABEL_MS;
      scrollState.ghosted = false;
      clearGhostTimer();
      scheduleSpeedLabelClear();
    }
    if (!wasScrolling && scrollState.scrolling && !detail.showSpeed) {
      scheduleGhost();
    } else if (wasScrolling && !scrollState.scrolling) {
      clearGhostTimer();
      scrollState.ghosted = false;
    }
    renderControl();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!panel || panel.hidden) return;
    if (event.target instanceof Node && panel.contains(event.target)) return;
    if (event.target instanceof Node && control?.contains(event.target)) {
      panelClosedByControlPointerId = event.pointerId;
    }
    closeReaderPanel();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel && !panel.hidden) {
      closeReaderPanel();
    }
  });
  window.addEventListener("resize", () => {
    if (hasCustomPosition && control) {
      requestAnimationFrame(() => clampControlToViewport());
    }
    if (panel && !panel.hidden) positionPanelNearControl();
  });
  async function refreshCacheStats() {
    const [chapters, resources] = await Promise.all([dbAll("chapters"), dbAll("resources")]);
    status.cacheBytes = chapters.filter((x) => x.origin === location.origin).reduce((sum, x) => sum + (x.bytes || 0), 0) + resources.filter((x) => x.origin === location.origin).reduce((sum, x) => sum + (x.bytes || 0), 0);
  }
  async function clearOrigin(origin) {
    const [chapters, resources] = await Promise.all([dbAll("chapters"), dbAll("resources")]);
    for (const x of chapters) if (x.origin === origin) await dbDelete("chapters", x.url);
    for (const x of resources) if (x.origin === origin) await dbDelete("resources", x.url);
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function canonicalProgressUrl() {
    const url = new URL(location.href);
    url.hash = "";
    return url.href;
  }
  function progressCandidates() {
    const selector = READER_MODE === "comic" ? "main img, article img, img" : "main p, article p, main li, article li, p, li";
    return Array.from(document.querySelectorAll(selector)).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.height > 8 && rect.width > 8;
    });
  }
  function anchorText(element) {
    const raw = element instanceof HTMLImageElement ? element.alt || element.currentSrc || element.src || "" : element.textContent || "";
    return raw.replace(/\s+/g, " ").trim().slice(0, 96);
  }
  function captureReadingAnchor() {
    const candidates = progressCandidates();
    if (!candidates.length) return null;
    const targetY = Math.max(0, Math.min(window.innerHeight * 0.28, window.innerHeight - 1));
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const element of candidates) {
      const rect2 = element.getBoundingClientRect();
      const distance = rect2.top <= targetY && rect2.bottom >= targetY ? 0 : Math.min(Math.abs(rect2.top - targetY), Math.abs(rect2.bottom - targetY));
      if (distance < bestDistance) {
        best = element;
        bestDistance = distance;
      }
    }
    if (!best) return null;
    const rect = best.getBoundingClientRect();
    return {
      tag: best.tagName.toLowerCase(),
      id: best.id || "",
      text: anchorText(best),
      index: candidates.indexOf(best),
      offset: rect.top - targetY
    };
  }
  function maximumDocumentScrollY() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    return Math.max(0, scrollingElement.scrollHeight - window.innerHeight);
  }
  function saveReadingProgressNow() {
    if (restoringProgress) return;
    const maximum = maximumDocumentScrollY();
    const scrollY = Math.max(0, window.scrollY);
    const progress = {
      version: 1,
      url: canonicalProgressUrl(),
      savedAt: Date.now(),
      scrollY,
      ratio: maximum > 0 ? Math.min(1, scrollY / maximum) : 0,
      anchor: captureReadingAnchor()
    };
    GM_setValue(READING_PROGRESS_KEY, JSON.stringify(progress));
  }
  function scheduleReadingProgressSave() {
    if (restoringProgress || progressSaveTimerId !== null) return;
    progressSaveTimerId = window.setTimeout(() => {
      progressSaveTimerId = null;
      saveReadingProgressNow();
    }, PROGRESS_SAVE_THROTTLE_MS);
  }
  function readSavedReadingProgress() {
    const raw = GM_getValue(READING_PROGRESS_KEY, "");
    if (!raw) return null;
    try {
      const progress = JSON.parse(raw);
      if (progress?.version !== 1 || progress.url !== canonicalProgressUrl() || !Number.isFinite(progress.scrollY) || !Number.isFinite(progress.ratio)) return null;
      return progress;
    } catch {
      return null;
    }
  }
  function resolveReadingAnchor(anchor) {
    if (!anchor) return null;
    if (anchor.id) {
      const byId = document.getElementById(anchor.id);
      if (byId && byId.tagName.toLowerCase() === anchor.tag) return byId;
    }
    const candidates = progressCandidates();
    if (anchor.text) {
      const nearby = candidates.map((element, index) => ({ element, index, text: anchorText(element) })).filter((candidate) => candidate.text === anchor.text).sort((a, b) => Math.abs(a.index - anchor.index) - Math.abs(b.index - anchor.index));
      if (nearby[0]) return nearby[0].element;
    }
    return candidates[anchor.index] || null;
  }
  function restoreReadingProgress(progress) {
    const anchor = resolveReadingAnchor(progress.anchor);
    if (anchor && progress.anchor) {
      const targetY = Math.max(0, Math.min(window.innerHeight * 0.28, window.innerHeight - 1));
      const rect = anchor.getBoundingClientRect();
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - targetY - progress.anchor.offset),
        behavior: "instant"
      });
      return true;
    }
    const maximum = maximumDocumentScrollY();
    const ratioY = maximum * Math.max(0, Math.min(1, progress.ratio));
    const fallbackY = maximum > 0 ? ratioY : progress.scrollY;
    window.scrollTo({ top: Math.max(0, fallbackY), behavior: "instant" });
    return maximum > 0 || progress.scrollY === 0;
  }
  function restoreSavedReadingProgress() {
    const progress = readSavedReadingProgress();
    if (!progress || progress.scrollY <= 1) return;
    restoringProgress = true;
    let attempts = 0;
    const tryRestore = () => {
      attempts += 1;
      const restored = restoreReadingProgress(progress);
      if (!restored && attempts < PROGRESS_RESTORE_MAX_ATTEMPTS) {
        window.setTimeout(tryRestore, 350 * attempts);
        return;
      }
      window.setTimeout(() => {
        restoringProgress = false;
      }, 120);
    };
    requestAnimationFrame(tryRestore);
  }
  function installReadingProgressPersistence() {
    window.addEventListener("scroll", scheduleReadingProgressSave, { passive: true });
    window.addEventListener("pagehide", saveReadingProgressNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveReadingProgressNow();
    });
  }
  async function boot() {
    if (!isLikelyReaderPage()) return;
    await refreshCacheStats();
    await refreshCachedAheadStatus();
    mountUI();
    updateUI();
    restoreSavedReadingProgress();
    installReadingProgressPersistence();
    setTimeout(() => void prefetchAhead(), 1200);
  }
  void boot();
})();

(() => {
  "use strict";
  const SCROLL_ACTIVE_ATTR = "data-rer-reader-scroll-active";
  if (document.documentElement.hasAttribute(SCROLL_ACTIVE_ATTR)) return;
  document.documentElement.setAttribute(SCROLL_ACTIVE_ATTR, "1");
  const COMIC_READER_URL_RE = /(manga|manhua|manhwa|webtoon|comic|comics|webcomic|scantrad)/i;
  const NOVEL_READER_URL_RE = /(novel|webnovel|lightnovel|light-novel|fiction|wuxia|royalroad|scribblehub)/i;
  const MODE = COMIC_READER_URL_RE.test(location.href) ? "comic" : NOVEL_READER_URL_RE.test(location.href) ? "novel" : null;
  if (!MODE) return;
  const siteStorageKey = (base) => `${base}:${location.origin}`;
  const MISSING_SCROLL_PREFERENCE = "__rer_scroll_preference_missing__";
  function readMigratedScrollPreference(key, legacyKeys, fallbackValue) {
    const currentValue = GM_getValue(key, MISSING_SCROLL_PREFERENCE);
    if (currentValue !== MISSING_SCROLL_PREFERENCE) return currentValue;
    for (const legacyKey of legacyKeys) {
      if (!legacyKey) continue;
      const legacyValue = GM_getValue(legacyKey, MISSING_SCROLL_PREFERENCE);
      if (legacyValue === MISSING_SCROLL_PREFERENCE) continue;
      GM_setValue(key, legacyValue);
      return legacyValue;
    }
    return fallbackValue;
  }
  const SPEED_STORAGE_KEY = siteStorageKey("rerReaderScrollSpeedPxPerSecond");
  const ENABLED_STORAGE_KEY = siteStorageKey("rerReaderScrollEnabled");
  const LEGACY_SPEED_STORAGE_KEY = MODE === "novel" ? "autoScrollNovelSpeedPxPerSecond" : "autoScrollReaderSpeedPxPerSecond";
  const LEGACY_ENABLED_STORAGE_KEY = `rerReaderScrollEnabled:${location.origin}:${MODE}`;
  const DEFAULT_ENABLED = MODE === "comic";
  const MIN_SPEED = MODE === "novel" ? -300 : -1e3;
  const MAX_SPEED = MODE === "novel" ? 300 : 1e3;
  const SPEED_STEP = MODE === "novel" ? 5 : 50;
  const DEFAULT_SPEED = MODE === "novel" ? 40 : 250;
  let enabled = Boolean(
    readMigratedScrollPreference(
      ENABLED_STORAGE_KEY,
      [LEGACY_ENABLED_STORAGE_KEY],
      DEFAULT_ENABLED
    )
  );
  let scrolling = false;
  let rafId = null;
  let lastTimestamp = null;
  let scrollTargetY = null;
  let scrollTargetX = 0;
  let maximumScrollYCache = null;
  let maximumScrollYDirty = true;
  let lastMaximumScrollRefresh = 0;
  let lastPositionSyncTimestamp = 0;
  let wakeLock = null;
  let wakeLockRequestPending = false;
  const MAX_SCROLL_REFRESH_MS = 1e3;
  const POSITION_SYNC_INTERVAL_MS = 250;
  const legacyLocalSpeedRaw = localStorage.getItem(LEGACY_SPEED_STORAGE_KEY);
  const legacyLocalSpeed = legacyLocalSpeedRaw === null ? Number.NaN : Number(legacyLocalSpeedRaw);
  const defaultSpeed = Number.isFinite(legacyLocalSpeed) ? legacyLocalSpeed : DEFAULT_SPEED;
  const storedSpeed = Number(
    readMigratedScrollPreference(
      SPEED_STORAGE_KEY,
      [LEGACY_SPEED_STORAGE_KEY],
      defaultSpeed
    )
  );
  let speed = Number.isFinite(storedSpeed) ? Math.max(MIN_SPEED, Math.min(MAX_SPEED, storedSpeed)) : DEFAULT_SPEED;
  function publishScrollState({ showSpeed = false } = {}) {
    document.dispatchEvent(
      new CustomEvent("rer-reader-scroll-state", {
        detail: {
          available: true,
          enabled,
          scrolling,
          speed,
          mode: MODE,
          minSpeed: MIN_SPEED,
          maxSpeed: MAX_SPEED,
          speedStep: SPEED_STEP,
          showSpeed
        }
      })
    );
  }
  function saveSpeed() {
    GM_setValue(SPEED_STORAGE_KEY, speed);
  }
  function getScrollingElement() {
    return document.scrollingElement || document.documentElement;
  }
  function getCurrentScrollY() {
    return getScrollingElement().scrollTop;
  }
  function invalidateMaximumScrollY() {
    maximumScrollYDirty = true;
  }
  function getMaximumScrollY(now = performance.now()) {
    if (maximumScrollYCache === null || maximumScrollYDirty || now - lastMaximumScrollRefresh >= MAX_SCROLL_REFRESH_MS) {
      const scrollingElement = getScrollingElement();
      maximumScrollYCache = Math.max(
        0,
        scrollingElement.scrollHeight - window.innerHeight
      );
      maximumScrollYDirty = false;
      lastMaximumScrollRefresh = now;
    }
    return maximumScrollYCache;
  }
  if (typeof ResizeObserver === "function") {
    const scrollSizeObserver = new ResizeObserver(invalidateMaximumScrollY);
    scrollSizeObserver.observe(document.documentElement);
    if (document.body) scrollSizeObserver.observe(document.body);
  }
  window.addEventListener("resize", invalidateMaximumScrollY, { passive: true });
  window.visualViewport?.addEventListener(
    "resize",
    invalidateMaximumScrollY,
    { passive: true }
  );
  function isFullscreen() {
    return Boolean(
      document.fullscreenElement || document.webkitFullscreenElement
    );
  }
  async function enterFullscreenIfNeeded() {
    if (isFullscreen()) return;
    const element = document.documentElement;
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else {
        const webkitElement = element;
        webkitElement.webkitRequestFullscreen?.();
      }
    } catch {
    }
  }
  function shouldHoldWakeLock() {
    return scrolling && speed !== 0 && document.visibilityState === "visible";
  }
  async function releaseWakeLock() {
    const currentWakeLock = wakeLock;
    wakeLock = null;
    if (!currentWakeLock) return;
    try {
      await currentWakeLock.release();
    } catch {
    }
  }
  async function syncWakeLock() {
    if (!shouldHoldWakeLock()) {
      await releaseWakeLock();
      return;
    }
    if (wakeLock || wakeLockRequestPending || !("wakeLock" in navigator)) return;
    wakeLockRequestPending = true;
    try {
      const requestedWakeLock = await navigator.wakeLock.request("screen");
      if (!shouldHoldWakeLock()) {
        await requestedWakeLock.release();
        return;
      }
      wakeLock = requestedWakeLock;
      requestedWakeLock.addEventListener("release", () => {
        if (wakeLock === requestedWakeLock) wakeLock = null;
      }, { once: true });
    } catch {
    } finally {
      wakeLockRequestPending = false;
    }
  }
  function stopScroll() {
    if (!scrolling && rafId === null) {
      void syncWakeLock();
      publishScrollState();
      return;
    }
    scrolling = false;
    lastTimestamp = null;
    scrollTargetY = null;
    lastPositionSyncTimestamp = 0;
    document.documentElement.classList.remove("asr-scrolling");
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    void syncWakeLock();
    publishScrollState();
  }
  function scrollStep(timestamp) {
    rafId = null;
    if (!scrolling || speed === 0) {
      lastTimestamp = null;
      return;
    }
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const elapsedSeconds = Math.min(
      (timestamp - lastTimestamp) / 1e3,
      0.05
    );
    lastTimestamp = timestamp;
    if (scrollTargetY === null || timestamp - lastPositionSyncTimestamp >= POSITION_SYNC_INTERVAL_MS) {
      const currentScrollY = getCurrentScrollY();
      if (scrollTargetY === null || Math.abs(currentScrollY - scrollTargetY) > 80) {
        scrollTargetY = currentScrollY;
      }
      lastPositionSyncTimestamp = timestamp;
    }
    const maximumScrollY = getMaximumScrollY(timestamp);
    scrollTargetY = Math.max(
      0,
      Math.min(
        maximumScrollY,
        scrollTargetY + speed * elapsedSeconds
      )
    );
    window.scrollTo({
      top: scrollTargetY,
      left: scrollTargetX,
      behavior: "instant"
    });
    const reachedBottom = speed > 0 && scrollTargetY >= maximumScrollY - 1;
    const reachedTop = speed < 0 && scrollTargetY <= 1;
    if (reachedBottom || reachedTop) {
      stopScroll();
      return;
    }
    rafId = requestAnimationFrame(scrollStep);
  }
  async function startScroll({ useFullscreen = false } = {}) {
    if (!enabled || scrolling) return;
    if (useFullscreen) {
      await enterFullscreenIfNeeded();
    }
    scrolling = true;
    lastTimestamp = null;
    scrollTargetY = getCurrentScrollY();
    scrollTargetX = window.scrollX;
    lastPositionSyncTimestamp = performance.now();
    invalidateMaximumScrollY();
    getMaximumScrollY(lastPositionSyncTimestamp);
    if (speed !== 0) {
      document.documentElement.classList.add("asr-scrolling");
      rafId = requestAnimationFrame(scrollStep);
    }
    void syncWakeLock();
    publishScrollState();
  }
  function toggleScroll({ useFullscreen = false } = {}) {
    if (!enabled) return;
    if (scrolling) {
      stopScroll();
    } else {
      void startScroll({ useFullscreen });
    }
  }
  function speedStepForDirection(currentSpeed, direction) {
    if (MODE !== "novel") return SPEED_STEP;
    if (direction > 0) {
      return currentSpeed >= 20 || currentSpeed < -20 ? 10 : 5;
    }
    return currentSpeed > 20 || currentSpeed <= -20 ? 10 : 5;
  }
  function changeSpeedSteps(steps) {
    if (!enabled) return;
    const wholeSteps = Math.trunc(steps);
    if (wholeSteps === 0) return;
    const direction = Math.sign(wholeSteps);
    for (let i = 0; i < Math.abs(wholeSteps); i += 1) {
      const step = speedStepForDirection(speed, direction);
      speed = Math.max(
        MIN_SPEED,
        Math.min(MAX_SPEED, speed + direction * step)
      );
    }
    saveSpeed();
    if (scrolling) {
      if (speed === 0) {
        document.documentElement.classList.remove("asr-scrolling");
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        lastTimestamp = null;
        scrollTargetY = getCurrentScrollY();
      } else {
        document.documentElement.classList.add("asr-scrolling");
        if (rafId === null) {
          lastTimestamp = null;
          scrollTargetY = getCurrentScrollY();
          scrollTargetX = window.scrollX;
          lastPositionSyncTimestamp = performance.now();
          invalidateMaximumScrollY();
          rafId = requestAnimationFrame(scrollStep);
        }
      }
    }
    void syncWakeLock();
    publishScrollState({ showSpeed: true });
  }
  function isTypingTarget(element) {
    if (!(element instanceof Element)) return false;
    return Boolean(
      element.closest(
        "input, textarea, select, [contenteditable='true']"
      )
    );
  }
  function isSpaceReservedTarget(element) {
    if (!(element instanceof Element)) return false;
    const interactiveElement = element.closest(
      "button, summary, a[href], [role='button']"
    );
    return Boolean(
      interactiveElement && interactiveElement.id !== "rer-reader-control"
    );
  }
  document.addEventListener("rer-reader-toggle-scroll", () => {
    toggleScroll({ useFullscreen: true });
  });
  document.addEventListener("rer-reader-stop-scroll", () => {
    stopScroll();
  });
  document.addEventListener("rer-reader-scroll-enabled", (event) => {
    enabled = Boolean(event.detail?.enabled);
    GM_setValue(ENABLED_STORAGE_KEY, enabled);
    if (!enabled && scrolling) {
      stopScroll();
      return;
    }
    publishScrollState();
  });
  document.addEventListener("rer-reader-speed-steps", (event) => {
    const steps = Number(event.detail?.steps);
    if (!Number.isFinite(steps) || steps === 0) return;
    changeSpeedSteps(steps);
  });
  document.addEventListener("visibilitychange", () => {
    void syncWakeLock();
  });
  window.addEventListener("pagehide", () => {
    void releaseWakeLock();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!scrolling) return;
    const control = document.getElementById("rer-reader-control");
    const panel = document.getElementById("rer-reading-buffer-panel");
    if (event.target instanceof Node && (control?.contains(event.target) || panel?.contains(event.target))) {
      return;
    }
    stopScroll();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (!enabled) return;
    if (isTypingTarget(event.target)) return;
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
    if (hasModifier) return;
    if (event.code === "Space" && !event.repeat) {
      if (isSpaceReservedTarget(event.target)) return;
      event.preventDefault();
      toggleScroll({ useFullscreen: true });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      changeSpeedSteps(1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      changeSpeedSteps(-1);
    }
  });
  publishScrollState();
})();
