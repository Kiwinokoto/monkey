// ==UserScript==
// @name         RER Reader — Buffer + Comic Auto Scroll
// @namespace    kiwinokoto.rer-reader
// @version      1.2.0
// @description  Lecture cache-first avec buffer de 5 chapitres, plus auto-scroll desktop/mobile sur manga/manhua/manhwa/webtoon/comics.
// @author       Kevin + ChatGPT
// @match        *://*/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

// -----------------------------------------------------------------------------
// Module 1 — Reading buffer
// -----------------------------------------------------------------------------
(() => {
  'use strict';

  // Evite qu'un buffer standalone et un script combine ne tournent en double.
  const BUFFER_ACTIVE_ATTR = 'data-rer-reading-buffer-active';
  if (document.documentElement.hasAttribute(BUFFER_ACTIVE_ATTR)) return;
  document.documentElement.setAttribute(BUFFER_ACTIVE_ATTR, '1');

  // ---------------------------------------------------------------------------
  // Reglages simples
  // ---------------------------------------------------------------------------
  const LOOKAHEAD = 5;                 // Passe a 3 ici si tu preferes un buffer plus petit.
  const FETCH_DELAY_MS = 2500;         // Pause entre deux chapitres -> pas de rafale.
  const IMAGE_DELAY_MS = 150;          // Les images sont mises en cache doucement.
  const MAX_IMAGES_PER_CHAPTER = 80;   // Protection contre les pages absurdes.
  const CACHE_TTL_DAYS = 7;
  const MAX_RESOURCE_BYTES = 12 * 1024 * 1024; // Ignore une image individuelle > 12 Mo.
  const DB_NAME = 'rer-reading-buffer-v1';
  const DB_VERSION = 1;

  const READER_URL_RE = /(manga|manhwa|manhua|webtoon|comic|webcomic|scantrad|novel|webnovel|lightnovel|fiction|wuxia|chapter|chapitre|reader|read)/i;
  const NEXT_TEXT_RE = /^(?:next(?:\s+chapter)?|chapter\s+next|chapitre\s+suivant|suivant|next\s*[›»→]?|[›»→])$/i;
  const PREV_TEXT_RE = /^(?:prev(?:ious)?(?:\s+chapter)?|chapter\s+prev(?:ious)?|chapitre\s+pr[eé]c[eé]dent|pr[eé]c[eé]dent|[‹«←])$/i;

  let dbPromise;
  let prefetchRunning = false;
  let objectUrls = [];
  const READER_COLOR_KEY = 'rerReaderAccentColor';
  const READER_IDLE_OPACITY_KEY = 'rerReaderIdleOpacity';
  const READER_SIZE_KEY = 'rerReaderControlSize';
  const BADGE_MIN_VISIBLE_MS = 700;
  const BADGE_FADE_DELAY_MS = 750;

  let badge;
  let panel;
  let badgeFadeTimerId = null;
  let badgeShownAt = 0;
  let status = {
    cachedAhead: 0,
    expectedAhead: LOOKAHEAD,
    imageCached: 0,
    imageTotal: 0,
    cacheBytes: 0,
    message: 'Initialisation…',
    problem: false,
  };

  // ---------------------------------------------------------------------------
  // IndexedDB
  // ---------------------------------------------------------------------------
  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains('chapters')) {
          const store = db.createObjectStore('chapters', { keyPath: 'url' });
          store.createIndex('savedAt', 'savedAt');
          store.createIndex('origin', 'origin');
        }

        if (!db.objectStoreNames.contains('resources')) {
          const store = db.createObjectStore('resources', { keyPath: 'url' });
          store.createIndex('savedAt', 'savedAt');
          store.createIndex('chapterUrl', 'chapterUrl');
          store.createIndex('origin', 'origin');
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
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(storeName, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function dbDelete(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------------------------------------------------------------------------
  // Detection des liens de lecture
  // ---------------------------------------------------------------------------
  function absoluteUrl(href, baseUrl) {
    try {
      const u = new URL(href, baseUrl);
      if (!/^https?:$/.test(u.protocol)) return null;
      u.hash = '';
      return u.href;
    } catch {
      return null;
    }
  }

  function visibleText(el) {
    return [
      el.textContent,
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('data-title'),
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function findDirectionalUrl(doc, baseUrl, direction) {
    const isNext = direction === 'next';
    const rel = isNext ? 'next' : 'prev';
    const textRe = isNext ? NEXT_TEXT_RE : PREV_TEXT_RE;
    const currentUrl = absoluteUrl(baseUrl, baseUrl);

    const relLink = doc.querySelector(`a[rel~="${rel}"][href], link[rel~="${rel}"][href]`);
    if (relLink) {
      const url = absoluteUrl(relLink.getAttribute('href'), baseUrl);
      if (url && url !== currentUrl) return url;
    }

    const candidates = [...doc.querySelectorAll('a[href]')];
    let best = null;
    let bestScore = -Infinity;

    for (const a of candidates) {
      const url = absoluteUrl(a.getAttribute('href'), baseUrl);
      if (!url || url === currentUrl) continue;

      // Un buffer de lecture ne doit jamais partir precharger un autre domaine.
      if (new URL(url).origin !== new URL(baseUrl).origin) continue;

      const text = visibleText(a);
      const cls = `${a.id || ''} ${a.className || ''}`.toLowerCase();
      const href = url.toLowerCase();
      let score = 0;

      if (textRe.test(text)) score += 100;
      if (isNext && /\bnext\b/.test(text.toLowerCase())) score += 35;
      if (!isNext && /\b(prev|previous)\b/.test(text.toLowerCase())) score += 35;
      if (isNext && /\bnext\b/.test(cls)) score += 25;
      if (!isNext && /\b(prev|previous)\b/.test(cls)) score += 25;
      if (/chapter|chapitre|episode|ep\b/.test(href)) score += 12;
      if (/novel|manga|manhwa|manhua|reader|read/.test(href)) score += 8;

      // Evite quelques faux positifs courants.
      if (/comment|login|signup|register|home|library/.test(href)) score -= 30;

      if (score > bestScore) {
        bestScore = score;
        best = url;
      }
    }

    return bestScore >= 45 ? best : null;
  }

  const findNextUrl = (doc, baseUrl) => findDirectionalUrl(doc, baseUrl, 'next');
  const findPrevUrl = (doc, baseUrl) => findDirectionalUrl(doc, baseUrl, 'prev');

  function isLikelyReaderPage(doc = document, url = location.href) {
    if (READER_URL_RE.test(url) && findNextUrl(doc, url)) return true;

    const text = doc.body?.innerText?.slice(0, 8000) || '';
    return Boolean(findNextUrl(doc, url) && /chapter|chapitre|manga|manhwa|manhua|webtoon|comic|webcomic|novel|webnovel|lightnovel|fiction|wuxia/i.test(text));
  }

  // ---------------------------------------------------------------------------
  // Images : best effort. Texte/HTML reste le coeur fiable de la V1.
  // ---------------------------------------------------------------------------
  function findReaderRoot(doc) {
    const selectors = [
      '#chapter-content', '.chapter-content', '.chapter_content',
      '#readerarea', '#reader-area', '.reader-area', '.reading-content',
      '.chapter-reading-content', '.entry-content', 'article', 'main',
    ];

    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) return el;
    }
    return doc.body;
  }

  function imageSource(img, baseUrl) {
    const raw = img.getAttribute('data-src')
      || img.getAttribute('data-lazy-src')
      || img.getAttribute('data-original')
      || img.getAttribute('src');

    if (!raw || /^(data|blob):/i.test(raw)) return null;
    return absoluteUrl(raw, baseUrl);
  }

  function tagReaderImages(doc, pageUrl) {
    const root = findReaderRoot(doc);
    if (!root) return [];

    const urls = [];
    for (const img of [...root.querySelectorAll('img')].slice(0, MAX_IMAGES_PER_CHAPTER)) {
      const url = imageSource(img, pageUrl);
      if (!url) continue;
      img.setAttribute('data-rer-src', url);
      urls.push(url);
    }
    return [...new Set(urls)];
  }

  async function cacheImage(url, chapterUrl) {
    const existing = await dbGet('resources', url);
    if (existing) return true;

    try {
      const target = new URL(url);
      const chapter = new URL(chapterUrl);
      const response = await fetch(url, {
        credentials: target.origin === chapter.origin ? 'include' : 'omit',
        mode: 'cors',
        cache: 'force-cache',
      });

      if (!response.ok) return false;

      const blob = await response.blob();
      if (!blob.size || blob.size > MAX_RESOURCE_BYTES) return false;

      await dbPut('resources', {
        url,
        chapterUrl,
        origin: chapter.origin,
        blob,
        bytes: blob.size,
        savedAt: Date.now(),
      });
      return true;
    } catch {
      // CDN sans CORS, protection anti-hotlink, etc. : on laisse tomber proprement.
      return false;
    }
  }

  async function cacheImagesSlowly(imageUrls, chapterUrl) {
    let cached = 0;
    for (const url of imageUrls) {
      if (!navigator.onLine) break;
      if (await cacheImage(url, chapterUrl)) {
        cached += 1;
        status.imageCached += 1;
      }
      updateUI();
      await sleep(IMAGE_DELAY_MS);
    }
    return cached;
  }

  async function hydrateCachedImages() {
    revokeObjectUrls();
    const imgs = [...document.querySelectorAll('img[data-rer-src]')];

    for (const img of imgs) {
      const url = img.getAttribute('data-rer-src');
      if (!url) continue;
      const resource = await dbGet('resources', url);
      if (!resource?.blob) continue;

      const objectUrl = URL.createObjectURL(resource.blob);
      objectUrls.push(objectUrl);
      img.src = objectUrl;
      img.removeAttribute('srcset');
    }
  }

  function revokeObjectUrls() {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls = [];
  }

  // ---------------------------------------------------------------------------
  // Chapitres
  // ---------------------------------------------------------------------------
  function serializeChapter(doc, pageUrl) {
    const clone = doc.cloneNode(true);
    clone.querySelectorAll('script, iframe, object, embed, #rer-reading-buffer-badge, #rer-reading-buffer-panel, .asr-reader-control').forEach(el => el.remove());
    const imageUrls = tagReaderImages(clone, pageUrl);
    const bodyHtml = clone.body?.innerHTML || '';

    return {
      url: pageUrl,
      origin: new URL(pageUrl).origin,
      title: doc.title || '',
      bodyHtml,
      nextUrl: findNextUrl(doc, pageUrl),
      prevUrl: findPrevUrl(doc, pageUrl),
      imageUrls,
      bytes: new Blob([bodyHtml]).size,
      savedAt: Date.now(),
    };
  }

  async function saveCurrentChapter() {
    const url = absoluteUrl(location.href, location.href);
    if (!url) return null;
    const record = serializeChapter(document, url);
    await dbPut('chapters', record);
    return record;
  }

  async function fetchChapter(url) {
    let response;
    try {
      response = await fetch(url, {
        credentials: 'include',
        cache: 'no-cache',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
    } catch {
      return { error: 'network' };
    }

    if (response.status === 429) {
      return {
        error: 'rate-limit',
        retryAfter: response.headers.get('Retry-After'),
      };
    }

    // On ne cherche pas a contourner les protections du site.
    if (response.status === 401 || response.status === 403) {
      return { error: `http-${response.status}` };
    }

    if (!response.ok) return { error: `http-${response.status}` };

    const html = await response.text();
    if (html.length < 500) return { error: 'unexpected-page' };

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const record = serializeChapter(doc, url);
    await dbPut('chapters', record);
    return { record };
  }

  async function getFreshCachedChapter(url) {
    const cached = await dbGet('chapters', url);
    const maxAge = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

    if (!cached || Date.now() - cached.savedAt >= maxAge) return null;
    return cached;
  }

  async function collectCachedAhead(startUrl) {
    const records = [];
    const seen = new Set();
    const currentUrl = absoluteUrl(location.href, location.href);
    if (currentUrl) seen.add(currentUrl);

    let nextUrl = startUrl;

    while (records.length < LOOKAHEAD && nextUrl) {
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

  async function refreshCachedAheadStatus() {
    const nextUrl = findNextUrl(document, location.href);
    if (!nextUrl) {
      status.cachedAhead = 0;
      return;
    }

    const { records } = await collectCachedAhead(nextUrl);
    status.cachedAhead = records.length;
  }

  async function prefetchAhead() {
    if (prefetchRunning || !navigator.onLine) return;
    prefetchRunning = true;

    status.imageCached = 0;
    status.imageTotal = 0;
    status.problem = false;
    status.message = 'Vérification du buffer…';
    updateUI();

    try {
      const current = await saveCurrentChapter();
      if (!current?.nextUrl) {
        status.cachedAhead = 0;
        status.problem = false;
        status.message = 'Fin de lecture détectée';
        return;
      }

      const keep = new Set([current.url]);
      if (current.prevUrl) keep.add(current.prevUrl);

      const cached = await collectCachedAhead(current.nextUrl);
      for (const record of cached.records) keep.add(record.url);

      const seen = new Set(keep);
      status.cachedAhead = cached.records.length;
      let nextUrl = cached.nextUrl;
      const chaptersToImageCache = [];
      let networkFetches = 0;

      status.message = status.cachedAhead
        ? `${status.cachedAhead}/${LOOKAHEAD} déjà en cache — complément…`
        : 'Préchargement…';
      updateUI();

      while (status.cachedAhead < LOOKAHEAD && nextUrl) {
        if (!navigator.onLine) break;

        if (seen.has(nextUrl)) {
          status.message = 'Boucle de navigation détectée — buffer arrêté proprement';
          break;
        }

        const sameOrigin = new URL(nextUrl).origin === location.origin;
        if (!sameOrigin) break;

        seen.add(nextUrl);

        if (networkFetches > 0) await sleep(FETCH_DELAY_MS);

        const result = await fetchChapter(nextUrl);
        networkFetches += 1;

        if (result.error) {
          status.problem = true;
          if (result.error === 'rate-limit') {
            status.message = result.retryAfter
              ? `Pause serveur (429, Retry-After ${result.retryAfter})`
              : 'Pause serveur (429)';
          } else if (result.error === 'network') {
            status.message = 'Réseau coupé — buffer conservé';
          } else {
            status.message = `Préchargement stoppé (${result.error})`;
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

      // On ne retravaille les images que pour les nouveaux chapitres téléchargés.
      for (const chapter of chaptersToImageCache) {
        await cacheImagesSlowly(chapter.imageUrls, chapter.url);
      }

      await pruneOrigin(location.origin, keep);
      await refreshCacheStats();

      status.problem = false;
      status.message = status.cachedAhead
        ? `${status.cachedAhead}/${LOOKAHEAD} chapitre${status.cachedAhead > 1 ? 's' : ''} prêt${status.cachedAhead > 1 ? 's' : ''}`
        : 'Aucun chapitre en avance';
    } catch (error) {
      console.warn('[RER Reading Buffer]', error);
      status.problem = true;
      status.message = 'Erreur locale — voir console';
    } finally {
      prefetchRunning = false;
      updateUI();
      if (!status.problem) scheduleBadgeFade();
    }
  }

  async function pruneOrigin(origin, keepUrls) {
    const chapters = await dbAll('chapters');
    const expiry = Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

    for (const chapter of chapters) {
      if (chapter.origin !== origin) continue;
      const stale = chapter.savedAt < expiry;
      const outsideWindow = !keepUrls.has(chapter.url);
      if (stale || outsideWindow) await dbDelete('chapters', chapter.url);
    }

    const resources = await dbAll('resources');
    for (const resource of resources) {
      if (resource.origin !== origin) continue;
      const stale = resource.savedAt < expiry;
      const outsideWindow = !keepUrls.has(resource.chapterUrl);
      if (stale || outsideWindow) await dbDelete('resources', resource.url);
    }
  }

  // ---------------------------------------------------------------------------
  // Lecture hors ligne
  // ---------------------------------------------------------------------------
  function clickedAnchor(event) {
    const el = event.target instanceof Element ? event.target.closest('a[href]') : null;
    return el || null;
  }

  async function openCachedChapter(url) {
    const record = await dbGet('chapters', url);
    if (!record) return false;

    revokeObjectUrls();
    history.pushState({ rerReadingBuffer: true }, '', record.url);
    document.title = record.title || document.title;
    document.body.innerHTML = record.bodyHtml;

    // Les caches créés avant la v1.2 peuvent contenir une copie HTML sans
    // événements du bouton de scroll. On la retire avant de remonter le vrai contrôle.
    document.querySelectorAll('.asr-reader-control').forEach(el => el.remove());
    document.querySelectorAll('.asr-icon').forEach(icon => {
      const oldControl = icon.closest('button');
      if (oldControl) oldControl.remove();
    });

    await hydrateCachedImages();
    mountUI();
    status.problem = !navigator.onLine;
    status.message = navigator.onLine
      ? 'Chapitre servi instantanément depuis le buffer'
      : 'Lecture depuis le buffer — réseau indisponible';
    await refreshCacheStats();
    await refreshCachedAheadStatus();
    document.dispatchEvent(new CustomEvent('rer-reader-content-replaced'));
    updateUI();

    if (navigator.onLine) {
      setTimeout(() => void prefetchAhead(), 120);
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
    status.message = 'Chapitre suivant absent du buffer et réseau indisponible';
    updateUI();
    return false;
  }

  document.addEventListener('click', async (event) => {
    const a = clickedAnchor(event);
    if (!a) return;

    const target = absoluteUrl(a.getAttribute('href'), location.href);
    const next = findNextUrl(document, location.href);
    if (!target || !next || target !== next) return;

    // Cache-first : le clic Next est toujours intercepté. Si le chapitre n'est
    // pas en cache et que le réseau fonctionne, navigateCacheFirst relance une
    // navigation réseau normale avec location.assign().
    event.preventDefault();
    event.stopImmediatePropagation();
    await navigateCacheFirst(target);
  }, true);

  document.addEventListener('keydown', async (event) => {
    if (!['ArrowRight', 'd', 'D'].includes(event.key)) return;

    const next = findNextUrl(document, location.href);
    if (!next) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    await navigateCacheFirst(next);
  }, true);

  window.addEventListener('online', () => {
    status.problem = false;
    status.message = 'Réseau revenu — remise à niveau du buffer';
    updateUI();
    void prefetchAhead();
  });

  window.addEventListener('offline', () => {
    status.problem = true;
    status.message = 'Réseau indisponible — lecture depuis le buffer';
    updateUI();
  });

  window.addEventListener('popstate', () => {
    updateUI();
    if (!status.problem) scheduleBadgeFade(500);
  });

  // ---------------------------------------------------------------------------
  // Mini UI
  // ---------------------------------------------------------------------------
  function normalizeHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#ffffff';
  }

  function getReaderAppearance() {
    return {
      color: normalizeHexColor(GM_getValue(READER_COLOR_KEY, '#ffffff')),
      opacity: Math.max(0.25, Math.min(1, Number(GM_getValue(READER_IDLE_OPACITY_KEY, 0.9)) || 0.9)),
      size: ['small', 'normal', 'large'].includes(GM_getValue(READER_SIZE_KEY, 'normal'))
        ? GM_getValue(READER_SIZE_KEY, 'normal')
        : 'normal',
    };
  }

  function emitAppearanceChange() {
    document.dispatchEvent(new CustomEvent('rer-reader-appearance-change'));
  }

  function showBadge() {
    if (!badge) return;

    if (badgeFadeTimerId !== null) {
      clearTimeout(badgeFadeTimerId);
      badgeFadeTimerId = null;
    }

    if (badge.classList.contains('rer-hidden') || !badgeShownAt) {
      badgeShownAt = Date.now();
    }

    badge.classList.remove('rer-hidden');
  }

  function scheduleBadgeFade(delayMs = BADGE_FADE_DELAY_MS) {
    if (!badge || status.problem || (panel && !panel.hidden)) return;

    if (badgeFadeTimerId !== null) clearTimeout(badgeFadeTimerId);

    const elapsed = badgeShownAt ? Date.now() - badgeShownAt : 0;
    const waitMs = Math.max(delayMs, BADGE_MIN_VISIBLE_MS - elapsed);

    badgeFadeTimerId = setTimeout(() => {
      badgeFadeTimerId = null;
      if (!badge || status.problem || (panel && !panel.hidden)) return;
      badge.classList.add('rer-hidden');
    }, waitMs);
  }

  function openReaderPanel() {
    if (!panel) return;
    panel.hidden = false;
    showBadge();
    updateUI();
  }

  function togglePanel() {
    if (!panel) return;
    panel.hidden = !panel.hidden;

    if (panel.hidden) {
      if (!status.problem) scheduleBadgeFade(350);
    } else {
      showBadge();
    }

    updateUI();
  }

  function mountUI() {
    document.getElementById('rer-reading-buffer-badge')?.remove();
    document.getElementById('rer-reading-buffer-panel')?.remove();

    badge = document.createElement('button');
    badge.id = 'rer-reading-buffer-badge';
    badge.type = 'button';
    badge.addEventListener('click', togglePanel);

    panel = document.createElement('div');
    panel.id = 'rer-reading-buffer-panel';
    panel.hidden = true;

    const header = document.createElement('div');
    header.className = 'rer-panel-header';

    const title = document.createElement('strong');
    title.textContent = 'Reader';

    const closeBtn = document.createElement('button');
    closeBtn.id = 'rer-reading-buffer-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.addEventListener('click', () => {
      panel.hidden = true;
      if (!status.problem) scheduleBadgeFade(350);
    });

    header.append(title, closeBtn);

    const info = document.createElement('div');
    info.className = 'rer-status';

    const retryBtn = document.createElement('button');
    retryBtn.id = 'rer-reading-buffer-retry';
    retryBtn.type = 'button';
    retryBtn.textContent = 'Réessayer le buffer';
    retryBtn.addEventListener('click', () => void prefetchAhead());

    const appearance = getReaderAppearance();

    const appearanceTitle = document.createElement('div');
    appearanceTitle.className = 'rer-section-title';
    appearanceTitle.textContent = 'Apparence du contrôle';

    const colorRow = document.createElement('label');
    colorRow.className = 'rer-setting-row';
    colorRow.append(document.createTextNode('Couleur'));

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = appearance.color;
    colorInput.setAttribute('aria-label', 'Couleur du contrôle');
    colorInput.addEventListener('input', () => {
      GM_setValue(READER_COLOR_KEY, colorInput.value);
      emitAppearanceChange();
    });
    colorRow.append(colorInput);

    const opacityRow = document.createElement('label');
    opacityRow.className = 'rer-setting-row';
    opacityRow.append(document.createTextNode('Opacité au repos'));

    const opacityInput = document.createElement('input');
    opacityInput.type = 'range';
    opacityInput.min = '0.25';
    opacityInput.max = '1';
    opacityInput.step = '0.05';
    opacityInput.value = String(appearance.opacity);
    opacityInput.setAttribute('aria-label', 'Opacité au repos');
    opacityInput.addEventListener('input', () => {
      GM_setValue(READER_IDLE_OPACITY_KEY, Number(opacityInput.value));
      emitAppearanceChange();
    });
    opacityRow.append(opacityInput);

    const sizeRow = document.createElement('label');
    sizeRow.className = 'rer-setting-row';
    sizeRow.append(document.createTextNode('Taille'));

    const sizeSelect = document.createElement('select');
    sizeSelect.setAttribute('aria-label', 'Taille du contrôle');
    for (const [value, label] of [['small', 'Petite'], ['normal', 'Normale'], ['large', 'Grande']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === appearance.size;
      sizeSelect.append(option);
    }
    sizeSelect.addEventListener('change', () => {
      GM_setValue(READER_SIZE_KEY, sizeSelect.value);
      emitAppearanceChange();
    });
    sizeRow.append(sizeSelect);

    const advanced = document.createElement('details');
    advanced.className = 'rer-advanced';

    const summary = document.createElement('summary');
    summary.textContent = 'Avancé';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Vider le cache de ce site';
    clearBtn.addEventListener('click', async () => {
      await clearOrigin(location.origin);
      status.cachedAhead = 0;
      status.cacheBytes = 0;
      status.problem = false;
      status.message = 'Cache de ce site vidé';
      updateUI();
      scheduleBadgeFade();
    });

    advanced.append(summary, clearBtn);

    panel.append(
      header,
      info,
      retryBtn,
      appearanceTitle,
      colorRow,
      opacityRow,
      sizeRow,
      advanced
    );
    document.body.append(badge, panel);

    injectStyles();
    badgeShownAt = Date.now();
    updateUI();
  }

  function injectStyles() {
    if (document.getElementById('rer-reading-buffer-style')) return;

    const style = document.createElement('style');
    style.id = 'rer-reading-buffer-style';
    style.textContent = `
      #rer-reading-buffer-badge {
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 2147483646;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        min-height: 30px;
        margin: 0;
        border: 0;
        border-radius: 999px;
        padding: 7px 10px;
        appearance: none;
        -webkit-appearance: none;
        white-space: nowrap;
        background: rgba(20,20,24,.88);
        color: white;
        font: 600 12px/1 system-ui, -apple-system, "Segoe UI", "Segoe UI Emoji", "Apple Color Emoji", sans-serif;
        letter-spacing: 0;
        box-shadow: 0 2px 10px rgba(0,0,0,.25);
        cursor: pointer;
        opacity: .88;
        transform: translateY(0);
        transition: opacity 420ms ease, transform 420ms ease;
        -webkit-tap-highlight-color: transparent;
      }

      #rer-reading-buffer-badge.rer-hidden {
        opacity: 0;
        transform: translateY(4px);
        pointer-events: none;
      }

      #rer-reading-buffer-panel {
        position: fixed;
        right: 12px;
        bottom: 52px;
        z-index: 2147483646;
        min-width: 245px;
        max-width: min(340px, calc(100vw - 24px));
        padding: 10px;
        border-radius: 12px;
        background: rgba(20,20,24,.96);
        color: white;
        font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 4px 18px rgba(0,0,0,.35);
      }

      #rer-reading-buffer-panel[hidden] { display: none !important; }

      #rer-reading-buffer-panel .rer-panel-header,
      #rer-reading-buffer-panel .rer-setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      #rer-reading-buffer-panel .rer-panel-header {
        margin-bottom: 8px;
        font-size: 13px;
      }

      #rer-reading-buffer-panel .rer-status {
        margin-bottom: 8px;
        white-space: pre-line;
        opacity: .9;
      }

      #rer-reading-buffer-panel .rer-section-title {
        margin: 10px 0 6px;
        font-weight: 650;
      }

      #rer-reading-buffer-panel .rer-setting-row {
        margin: 6px 0;
      }

      #rer-reading-buffer-panel input[type="range"] {
        width: 120px;
      }

      #rer-reading-buffer-panel input[type="color"] {
        width: 38px;
        height: 28px;
        padding: 0;
        border: 0;
        background: transparent;
      }

      #rer-reading-buffer-panel select {
        min-width: 92px;
      }

      #rer-reading-buffer-panel button,
      #rer-reading-buffer-panel select {
        border: 0;
        border-radius: 8px;
        padding: 6px 8px;
        background: #fff;
        color: #111;
        font: inherit;
      }

      #rer-reading-buffer-retry {
        margin: 2px 0 6px;
      }

      #rer-reading-buffer-close {
        margin: 0 !important;
        padding: 2px 7px !important;
        background: transparent !important;
        color: white !important;
        font-size: 18px !important;
        line-height: 1 !important;
        cursor: pointer;
      }

      #rer-reading-buffer-panel .rer-advanced {
        margin-top: 8px;
        opacity: .88;
      }

      #rer-reading-buffer-panel .rer-advanced button {
        margin-top: 8px;
      }
    `;

    document.head.appendChild(style);
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 Mo';
    return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} Mo`;
  }

  function updateUI() {
    if (!badge || !panel) return;

    const online = navigator.onLine;
    showBadge();

    badge.textContent = `📚 ${status.cachedAhead}/${LOOKAHEAD}${online ? '' : ' · OFF'}`;
    badge.title = status.message;
    badge.setAttribute('aria-label', `Buffer ${status.cachedAhead} sur ${LOOKAHEAD}. ${status.message}`);

    const info = panel.querySelector('.rer-status');
    if (info) {
      const lines = [
        `Buffer ${status.cachedAhead}/${LOOKAHEAD} · ${formatBytes(status.cacheBytes)}`,
        online ? 'Réseau OK' : 'Réseau indisponible',
      ];

      if (status.problem) lines.push(status.message);
      info.textContent = lines.join('\n');
    }

    const retryBtn = panel.querySelector('#rer-reading-buffer-retry');
    if (retryBtn) retryBtn.hidden = !status.problem;
  }

  document.addEventListener('rer-reader-open-panel', openReaderPanel);

  async function refreshCacheStats() {
    const [chapters, resources] = await Promise.all([dbAll('chapters'), dbAll('resources')]);
    status.cacheBytes = chapters
      .filter(x => x.origin === location.origin)
      .reduce((sum, x) => sum + (x.bytes || 0), 0)
      + resources
        .filter(x => x.origin === location.origin)
        .reduce((sum, x) => sum + (x.bytes || 0), 0);
  }

  async function clearOrigin(origin) {
    const [chapters, resources] = await Promise.all([dbAll('chapters'), dbAll('resources')]);
    for (const x of chapters) if (x.origin === origin) await dbDelete('chapters', x.url);
    for (const x of resources) if (x.origin === origin) await dbDelete('resources', x.url);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function boot() {
    if (!isLikelyReaderPage()) return;

    await refreshCacheStats();
    await refreshCachedAheadStatus();
    mountUI();
    updateUI();

    // Laisse la page finir tranquillement son propre chargement avant le buffer.
    setTimeout(() => void prefetchAhead(), 1200);
  }

  void boot();
})();


// -----------------------------------------------------------------------------
// Module 2 — Comic auto-scroll
// -----------------------------------------------------------------------------
(() => {
  "use strict";

  const COMIC_READER_URL_RE = /(manga|manhua|manhwa|webtoon|comic|comics|webcomic|scantrad)/i;
  if (!COMIC_READER_URL_RE.test(location.href)) return;

  const SPEED_STORAGE_KEY = "autoScrollReaderSpeedPxPerSecond";
  const POSITION_STORAGE_KEY = "autoScrollReaderButtonPosition";

  const MIN_SPEED = -1000;
  const MAX_SPEED = 1000;
  const SPEED_STEP = 50;
  const TOUCH_LONG_PRESS_MS = 450;
  const TOUCH_SWIPE_THRESHOLD_PX = 12;
  const TOUCH_SPEED_PX_PER_STEP = 32;
  const READER_COLOR_KEY = "rerReaderAccentColor";
  const READER_IDLE_OPACITY_KEY = "rerReaderIdleOpacity";
  const READER_SIZE_KEY = "rerReaderControlSize";
  const SCROLL_GHOST_OPACITY = 0.1;
  const SCROLL_GHOST_DELAY_MS = 900;

  let scrolling = false;
  let buttonHovered = false;
  let rafId = null;
  let lastTimestamp = null;
  let scrollTargetY = null;
  let gestureState = null;
  let suppressNextClick = false;
  let hasCustomPosition = false;
  let ghostTimerId = null;
  let scrollGhosted = false;

  const legacySavedSpeed = Number(localStorage.getItem(SPEED_STORAGE_KEY));
  const defaultSpeed = Number.isFinite(legacySavedSpeed)
    ? legacySavedSpeed
    : 250;

  const storedSpeed = Number(
    GM_getValue(SPEED_STORAGE_KEY, defaultSpeed)
  );

  let speed = Number.isFinite(storedSpeed)
    ? Math.max(MIN_SPEED, Math.min(MAX_SPEED, storedSpeed))
    : 250;

  function saveSpeed() {
    GM_setValue(SPEED_STORAGE_KEY, speed);
  }

  function getScrollingElement() {
    return document.scrollingElement || document.documentElement;
  }

  function getCurrentScrollY() {
    return getScrollingElement().scrollTop;
  }

  function getMaximumScrollY() {
    const scrollingElement = getScrollingElement();

    return Math.max(
      0,
      scrollingElement.scrollHeight - window.innerHeight
    );
  }

  function getNearTop() {
    return getCurrentScrollY() <= 8;
  }

  function getNearBottom() {
    return getCurrentScrollY() >= getMaximumScrollY() - 8;
  }

  function isFullscreen() {
    return Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement
    );
  }

  async function enterFullscreenIfNeeded() {
    if (isFullscreen()) {
      return;
    }

    const element = document.documentElement;

    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      }
    } catch {
      // Si le navigateur refuse le fullscreen, l'auto-scroll reste utilisable.
    }
  }

  const style = document.createElement("style");

  style.textContent = `
    html.asr-scrolling {
      scroll-behavior: auto !important;
    }

    .asr-icon {
      position: relative;
      display: inline-block;
      width: 1.15em;
      min-width: 1.15em;
      height: 1em;
      color: #111827;
      line-height: 1;
    }

    .asr-icon--play::before {
      content: "";
      position: absolute;
      left: 0.38em;
      top: 0.14em;
      width: 0;
      height: 0;
      border-top: 0.36em solid transparent;
      border-bottom: 0.36em solid transparent;
      border-left: 0.52em solid currentColor;
    }

    .asr-icon--pause::before,
    .asr-icon--pause::after {
      content: "";
      position: absolute;
      top: 0.16em;
      width: 0.18em;
      height: 0.68em;
      border-radius: 999px;
      background: currentColor;
    }

    .asr-icon--pause::before {
      left: 0.35em;
    }

    .asr-icon--pause::after {
      right: 0.35em;
    }

    .asr-label {
      display: inline-block;
      color: inherit;
      white-space: nowrap;
    }

    .asr-menu {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.25em;
      margin-left: 0.12rem;
      padding-left: 0.38rem;
      border-left: 1px solid currentColor;
      opacity: 0.72;
      font-weight: 700;
      line-height: 1;
    }
  `;

  document.head.appendChild(style);

  const button = document.createElement("button");
  button.className = "asr-reader-control";
  const icon = document.createElement("span");
  const label = document.createElement("span");
  const menuIcon = document.createElement("span");

  button.setAttribute(
    "aria-label",
    "Activer ou mettre en pause l'auto-scroll"
  );

  icon.className = "asr-icon";
  icon.setAttribute("aria-hidden", "true");

  label.className = "asr-label";

  menuIcon.className = "asr-menu";
  menuIcon.textContent = "⋮";
  menuIcon.setAttribute("aria-hidden", "true");

  button.append(icon, label, menuIcon);

  Object.assign(button.style, {
    position: "fixed",
    right: "1rem",
    bottom: "5rem",
    zIndex: "999999",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    minWidth: "8.9rem",
    justifyContent: "center",
    padding: "0.65rem 0.95rem",
    border: "1px solid rgba(17, 24, 39, 0.7)",
    borderRadius: "999px",
    background: "rgba(255, 255, 255, 0.9)",
    color: "#111827",
    fontSize: "0.95rem",
    fontFamily: "system-ui, sans-serif",
    cursor: "grab",
    boxShadow: "0 0.25rem 0.8rem rgba(0,0,0,0.18)",
    opacity: "0.9",
    userSelect: "none",
    touchAction: "none",
    backdropFilter: "blur(0.35rem)",
    transition:
      "opacity 160ms ease, box-shadow 160ms ease, transform 160ms ease",
    appearance: "none",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  });

  function normalizeReaderColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#ffffff";
  }

  function readableTextColor(hex) {
    const value = normalizeReaderColor(hex).slice(1);
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) > 150000 ? "#111827" : "#ffffff";
  }

  function getReaderAppearance() {
    const color = normalizeReaderColor(GM_getValue(READER_COLOR_KEY, "#ffffff"));
    const opacity = Math.max(
      0.25,
      Math.min(1, Number(GM_getValue(READER_IDLE_OPACITY_KEY, 0.9)) || 0.9)
    );
    const storedSize = GM_getValue(READER_SIZE_KEY, "normal");
    const size = ["small", "normal", "large"].includes(storedSize)
      ? storedSize
      : "normal";

    return { color, opacity, size };
  }

  function applyReaderAppearance() {
    const appearance = getReaderAppearance();
    const textColor = readableTextColor(appearance.color);

    button.style.background = appearance.color;
    button.style.color = textColor;
    button.style.borderColor = textColor;

    const sizes = {
      small: { fontSize: "0.82rem", padding: "0.52rem 0.72rem", minWidth: "7.6rem" },
      normal: { fontSize: "0.95rem", padding: "0.65rem 0.95rem", minWidth: "8.9rem" },
      large: { fontSize: "1.08rem", padding: "0.78rem 1.08rem", minWidth: "10rem" },
    };
    const size = sizes[appearance.size];
    button.style.fontSize = size.fontSize;
    button.style.padding = size.padding;
    button.style.minWidth = size.minWidth;
  }

  function clearGhostTimer() {
    if (ghostTimerId !== null) {
      clearTimeout(ghostTimerId);
      ghostTimerId = null;
    }
  }

  function scheduleGhost(delayMs = SCROLL_GHOST_DELAY_MS) {
    clearGhostTimer();
    if (!scrolling) return;

    scrollGhosted = false;
    updateButton();

    ghostTimerId = setTimeout(() => {
      ghostTimerId = null;
      if (!scrolling) return;
      scrollGhosted = true;
      updateButton();
    }, delayMs);
  }

  function revealControlTemporarily(delayMs = 650) {
    if (!scrolling) return;
    scrollGhosted = false;
    updateButton();
    scheduleGhost(delayMs);
  }

  function updateButton() {
    icon.classList.toggle("asr-icon--play", !scrolling);
    icon.classList.toggle("asr-icon--pause", scrolling);

    label.textContent = `${speed} px/s`;

    const appearance = getReaderAppearance();
    const dragging = gestureState?.mode === "drag";
    const interacting = Boolean(gestureState) || buttonHovered;

    button.style.opacity = String(
      scrolling && scrollGhosted && !interacting
        ? Math.min(SCROLL_GHOST_OPACITY, appearance.opacity)
        : appearance.opacity
    );

    button.style.cursor = dragging
      ? "grabbing"
      : scrolling && buttonHovered
        ? "none"
        : "grab";
  }

  function stopScroll() {
    scrolling = false;
    lastTimestamp = null;
    scrollTargetY = null;
    scrollGhosted = false;
    clearGhostTimer();

    document.documentElement.classList.remove("asr-scrolling");

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    updateButton();
  }

  function scrollStep(timestamp) {
    rafId = null;

    if (!scrolling || speed === 0) {
      lastTimestamp = null;
      return;
    }

    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    /*
     * On limite volontairement le rattrapage après une frame lente :
     * mieux vaut ralentir très brièvement que produire un saut visible.
     */
    const elapsedSeconds = Math.min(
      (timestamp - lastTimestamp) / 1000,
      0.05
    );

    lastTimestamp = timestamp;

    const currentScrollY = getCurrentScrollY();

    /*
     * Le navigateur peut arrondir la position visible.
     * Le site peut aussi charger de nouvelles images ou modifier la hauteur
     * de la page pendant la lecture.
     *
     * On conserve normalement notre cible précise en sous-pixels.
     * Mais si la page s'est fortement décalée, on se resynchronise.
     */
    if (
      scrollTargetY === null ||
      Math.abs(currentScrollY - scrollTargetY) > 80
    ) {
      scrollTargetY = currentScrollY;
    }

    const maximumScrollY = getMaximumScrollY();

    scrollTargetY = Math.max(
      0,
      Math.min(
        maximumScrollY,
        scrollTargetY + speed * elapsedSeconds
      )
    );

    window.scrollTo({
      top: scrollTargetY,
      left: window.scrollX,
      behavior: "auto",
    });

    const reachedBottom =
      speed > 0 &&
      (scrollTargetY >= maximumScrollY - 1 || getNearBottom());

    const reachedTop =
      speed < 0 &&
      (scrollTargetY <= 1 || getNearTop());

    if (reachedBottom || reachedTop) {
      stopScroll();
      return;
    }

    rafId = requestAnimationFrame(scrollStep);
  }

  async function startScroll({ useFullscreen = false } = {}) {
    if (scrolling) {
      return;
    }

    if (useFullscreen) {
      await enterFullscreenIfNeeded();
    }

    scrolling = true;
    lastTimestamp = null;
    scrollTargetY = getCurrentScrollY();

    if (speed !== 0) {
      /*
       * Certains sites imposent scroll-behavior: smooth.
       * Ce style interfère avec notre animation continue.
       */
      document.documentElement.classList.add("asr-scrolling");
      rafId = requestAnimationFrame(scrollStep);
    }

    updateButton();
    scheduleGhost();
  }

  function toggleScroll({ useFullscreen = false } = {}) {
    if (scrolling) {
      stopScroll();
    } else {
      startScroll({ useFullscreen });
    }
  }

  function changeSpeed(delta) {
    speed = Math.max(
      MIN_SPEED,
      Math.min(MAX_SPEED, speed + delta)
    );

    saveSpeed();
    updateButton();

    if (scrolling) {
      revealControlTemporarily();
    }

    if (!scrolling) {
      return;
    }

    if (speed === 0) {
      document.documentElement.classList.remove("asr-scrolling");

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      lastTimestamp = null;
      scrollTargetY = getCurrentScrollY();
      return;
    }

    document.documentElement.classList.add("asr-scrolling");

    if (rafId === null) {
      lastTimestamp = null;
      scrollTargetY = getCurrentScrollY();
      rafId = requestAnimationFrame(scrollStep);
    }
  }

  function isTypingTarget(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    return Boolean(
      element.closest(
        "input, textarea, select, [contenteditable='true']"
      )
    );
  }

  function isSpaceReservedTarget(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const interactiveElement = element.closest(
      "button, summary, a[href], [role='button']"
    );

    return Boolean(
      interactiveElement &&
      interactiveElement !== button
    );
  }

  function applyButtonPosition(left, bottom, save = false) {
    const rect = button.getBoundingClientRect();

    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxBottom = Math.max(
      0,
      window.innerHeight - rect.height
    );

    const clampedLeft = Math.min(
      Math.max(0, left),
      maxLeft
    );

    const clampedBottom = Math.min(
      Math.max(0, bottom),
      maxBottom
    );

    button.style.left = `${clampedLeft}px`;
    button.style.top = "auto";
    button.style.right = "auto";
    button.style.bottom = `${clampedBottom}px`;

    hasCustomPosition = true;

    if (save) {
      GM_setValue(
        POSITION_STORAGE_KEY,
        JSON.stringify({
          left: clampedLeft,
          bottom: clampedBottom,
        })
      );
    }
  }

  function setButtonPosition(left, top, save = false) {
    const rect = button.getBoundingClientRect();

    const maxTop = Math.max(
      0,
      window.innerHeight - rect.height
    );

    const clampedTop = Math.min(
      Math.max(0, top),
      maxTop
    );

    const bottom =
      window.innerHeight -
      clampedTop -
      rect.height;

    applyButtonPosition(left, bottom, save);
  }

  function loadSavedButtonPosition() {
    const rawPosition = GM_getValue(POSITION_STORAGE_KEY, "");

    if (!rawPosition) {
      return;
    }

    try {
      const position = JSON.parse(rawPosition);

      if (
        Number.isFinite(position.left) &&
        Number.isFinite(position.bottom)
      ) {
        applyButtonPosition(
          position.left,
          position.bottom
        );
        return;
      }

      if (
        Number.isFinite(position.left) &&
        Number.isFinite(position.top)
      ) {
        // Migration de l'ancien format { left, top }.
        setButtonPosition(
          position.left,
          position.top,
          true
        );
      }
    } catch {
      // Position invalide : on conserve l'emplacement par défaut.
    }
  }

  function clearLongPressTimer() {
    if (!gestureState?.longPressTimerId) {
      return;
    }

    clearTimeout(gestureState.longPressTimerId);
    gestureState.longPressTimerId = null;
  }

  function enterDragMode() {
    if (!gestureState || gestureState.mode !== "tap") {
      return;
    }

    const rect = button.getBoundingClientRect();

    gestureState.mode = "drag";
    gestureState.originLeft = rect.left;
    gestureState.originTop = rect.top;
    suppressNextClick = true;
    updateButton();
  }

  function speedStepsForDelta(deltaY) {
    const distance = Math.abs(deltaY);

    if (distance < TOUCH_SWIPE_THRESHOLD_PX) {
      return 0;
    }

    const direction = deltaY < 0 ? 1 : -1;

    return direction * (
      1 +
      Math.floor(
        (distance - TOUCH_SWIPE_THRESHOLD_PX) /
        TOUCH_SPEED_PX_PER_STEP
      )
    );
  }

  function finishPointerGesture(event) {
    if (
      !gestureState ||
      event.pointerId !== gestureState.pointerId
    ) {
      return;
    }

    const state = gestureState;
    clearLongPressTimer();

    if (state.mode === "drag") {
      const rect = button.getBoundingClientRect();
      setButtonPosition(rect.left, rect.top, true);
    }

    if (state.mode !== "tap" || event.type === "pointercancel") {
      suppressNextClick = true;
    }

    if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }

    gestureState = null;
    updateButton();
    if (scrolling) scheduleGhost(650);
  }

  button.addEventListener("click", (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest(".asr-menu")
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (scrolling) stopScroll();
      document.dispatchEvent(new CustomEvent("rer-reader-open-panel"));
      return;
    }

    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      return;
    }

    toggleScroll({ useFullscreen: true });
  });

  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (scrolling) stopScroll();
    document.dispatchEvent(new CustomEvent("rer-reader-open-panel"));
  });

  button.addEventListener("mouseenter", () => {
    buttonHovered = true;
    button.style.transform = "translateY(-0.05rem)";
    updateButton();
  });

  button.addEventListener("mouseleave", () => {
    buttonHovered = false;
    button.style.transform = "translateY(0)";
    updateButton();
  });

  button.addEventListener("pointerdown", (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest(".asr-menu")
    ) {
      return;
    }

    if (
      gestureState ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    if (scrolling) revealControlTemporarily();

    const rect = button.getBoundingClientRect();

    gestureState = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      mode: "tap",
      speedSteps: 0,
      longPressTimerId: null,
    };

    button.setPointerCapture(event.pointerId);

    if (event.pointerType !== "mouse") {
      gestureState.longPressTimerId = setTimeout(() => {
        enterDragMode();
      }, TOUCH_LONG_PRESS_MS);
    }

    updateButton();
  });

  button.addEventListener("pointermove", (event) => {
    if (
      !gestureState ||
      event.pointerId !== gestureState.pointerId
    ) {
      return;
    }

    const deltaX = event.clientX - gestureState.startX;
    const deltaY = event.clientY - gestureState.startY;
    const distance = Math.hypot(deltaX, deltaY);

    // Souris : on conserve le drag immédiat historique.
    if (gestureState.pointerType === "mouse") {
      if (
        gestureState.mode === "tap" &&
        distance >= 4
      ) {
        gestureState.mode = "drag";
        suppressNextClick = true;
        updateButton();
      }

      if (gestureState.mode === "drag") {
        event.preventDefault();
        setButtonPosition(
          gestureState.originLeft + deltaX,
          gestureState.originTop + deltaY
        );
      }

      return;
    }

    if (gestureState.mode === "drag") {
      event.preventDefault();
      setButtonPosition(
        gestureState.originLeft + deltaX,
        gestureState.originTop + deltaY
      );
      return;
    }

    if (gestureState.mode === "tap") {
      const verticalEnough =
        Math.abs(deltaY) >= TOUCH_SWIPE_THRESHOLD_PX &&
        Math.abs(deltaY) > Math.abs(deltaX) * 1.2;

      if (verticalEnough) {
        clearLongPressTimer();
        gestureState.mode = "speed";
        suppressNextClick = true;
      } else if (distance >= TOUCH_SWIPE_THRESHOLD_PX) {
        // Un geste surtout horizontal sur le bouton ne déclenche rien.
        clearLongPressTimer();
        gestureState.mode = "cancelled";
        suppressNextClick = true;
      }
    }

    if (gestureState.mode === "speed") {
      event.preventDefault();

      const steps = speedStepsForDelta(deltaY);
      const deltaSteps = steps - gestureState.speedSteps;

      if (deltaSteps !== 0) {
        gestureState.speedSteps = steps;
        changeSpeed(deltaSteps * SPEED_STEP);
      }
    }
  });

  button.addEventListener("pointerup", finishPointerGesture);
  button.addEventListener("pointercancel", finishPointerGesture);

  button.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();

      if (event.deltaY < 0) {
        changeSpeed(SPEED_STEP);
      } else {
        changeSpeed(-SPEED_STEP);
      }
    },
    { passive: false }
  );

  document.body.appendChild(button);
  applyReaderAppearance();
  updateButton();
  loadSavedButtonPosition();

  document.addEventListener("rer-reader-appearance-change", () => {
    applyReaderAppearance();
    updateButton();
  });

  document.addEventListener("rer-reader-content-replaced", () => {
    if (!button.isConnected) {
      document.body.appendChild(button);
      applyReaderAppearance();
      updateButton();
      loadSavedButtonPosition();
    }
  });

  // Reprendre la main n'importe où dans la page arrête l'auto-scroll sans
  // consommer le geste : le clic, le lien ou le swipe du site continue normalement.
  document.addEventListener("pointerdown", (event) => {
    if (!scrolling) return;
    if (event.target instanceof Node && button.contains(event.target)) return;
    stopScroll();
  }, true);

  window.addEventListener("resize", () => {
    if (!hasCustomPosition) {
      return;
    }

    const left = Number.parseFloat(button.style.left);
    const bottom = Number.parseFloat(button.style.bottom);

    if (
      Number.isFinite(left) &&
      Number.isFinite(bottom)
    ) {
      applyButtonPosition(left, bottom);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) {
      return;
    }

    const hasModifier =
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey;

    if (hasModifier) {
      return;
    }

    if (event.code === "Space" && !event.repeat) {
      if (isSpaceReservedTarget(event.target)) {
        return;
      }

      event.preventDefault();
      toggleScroll({ useFullscreen: true });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      changeSpeed(SPEED_STEP);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      changeSpeed(-SPEED_STEP);
    }
  });
})();
