// -----------------------------------------------------------------------------
// Module 2 — Auto-scroll engine (comics + novels)
// -----------------------------------------------------------------------------
(() => {
  "use strict";

  // Evite qu'un userscript et l'extension ne lancent deux moteurs de scroll.
  const SCROLL_ACTIVE_ATTR = "data-rer-reader-scroll-active";
  if (document.documentElement.hasAttribute(SCROLL_ACTIVE_ATTR)) return;
  document.documentElement.setAttribute(SCROLL_ACTIVE_ATTR, "1");

  const COMIC_READER_URL_RE = /(manga|manhua|manhwa|webtoon|comic|comics|webcomic|scantrad)/i;
  const NOVEL_READER_URL_RE = /(novel|webnovel|lightnovel|light-novel|fiction|wuxia|royalroad|scribblehub)/i;

  const MODE = COMIC_READER_URL_RE.test(location.href)
    ? "comic"
    : NOVEL_READER_URL_RE.test(location.href)
      ? "novel"
      : null;

  if (!MODE) return;

  const siteStorageKey = base => `${base}:${location.origin}`;
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

  const LEGACY_SPEED_STORAGE_KEY = MODE === "novel"
    ? "autoScrollNovelSpeedPxPerSecond"
    : "autoScrollReaderSpeedPxPerSecond";
  const LEGACY_ENABLED_STORAGE_KEY =
    `rerReaderScrollEnabled:${location.origin}:${MODE}`;

  const DEFAULT_ENABLED = MODE === "comic";
  const MIN_SPEED = MODE === "novel" ? -300 : -1000;
  const MAX_SPEED = MODE === "novel" ? 300 : 1000;
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

  const MAX_SCROLL_REFRESH_MS = 1000;
  const POSITION_SYNC_INTERVAL_MS = 250;

  const legacyLocalSpeedRaw = localStorage.getItem(LEGACY_SPEED_STORAGE_KEY);
  const legacyLocalSpeed = legacyLocalSpeedRaw === null
    ? Number.NaN
    : Number(legacyLocalSpeedRaw);
  const defaultSpeed = Number.isFinite(legacyLocalSpeed)
    ? legacyLocalSpeed
    : DEFAULT_SPEED;

  const storedSpeed = Number(
    readMigratedScrollPreference(
      SPEED_STORAGE_KEY,
      [LEGACY_SPEED_STORAGE_KEY],
      defaultSpeed
    )
  );

  let speed = Number.isFinite(storedSpeed)
    ? Math.max(MIN_SPEED, Math.min(MAX_SPEED, storedSpeed))
    : DEFAULT_SPEED;

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
          showSpeed,
        },
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
    if (
      maximumScrollYCache === null ||
      maximumScrollYDirty ||
      now - lastMaximumScrollRefresh >= MAX_SCROLL_REFRESH_MS
    ) {
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

  // Lazy-loaded images and responsive layout can change the scrollable height.
  // Mark the cache dirty only when geometry changes instead of forcing a
  // scrollHeight read on every animation frame.
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
      document.fullscreenElement ||
      document.webkitFullscreenElement
    );
  }

  async function enterFullscreenIfNeeded() {
    if (isFullscreen()) return;

    const element = document.documentElement;

    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      }
    } catch {
      // Le navigateur peut refuser le plein écran ; le scroll reste utilisable.
    }
  }

  function stopScroll() {
    if (!scrolling && rafId === null) {
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
      (timestamp - lastTimestamp) / 1000,
      0.05
    );
    lastTimestamp = timestamp;

    // Reconcile occasionally with the browser's actual position, but avoid a
    // layout-sensitive scrollTop read on every frame.
    if (
      scrollTargetY === null ||
      timestamp - lastPositionSyncTimestamp >= POSITION_SYNC_INTERVAL_MS
    ) {
      const currentScrollY = getCurrentScrollY();
      if (
        scrollTargetY === null ||
        Math.abs(currentScrollY - scrollTargetY) > 80
      ) {
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

    // "instant" is deliberate: the rAF loop is the animator. "auto" could let
    // a site's CSS scroll-behavior:smooth add a second animation on top.
    window.scrollTo({
      top: scrollTargetY,
      left: scrollTargetX,
      behavior: "instant",
    });

    const reachedBottom =
      speed > 0 && scrollTargetY >= maximumScrollY - 1;

    const reachedTop =
      speed < 0 && scrollTargetY <= 1;

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

    // Novel : réglage fin autour de zéro, puis grands pas pour se déplacer vite.
    // Crans : … -40, -30, -20, -15, -10, -5, 0, 5, 10, 15, 20, 30, 40 …
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
      interactiveElement &&
      interactiveElement.id !== "rer-reader-control"
    );
  }

  document.addEventListener("rer-reader-toggle-scroll", () => {
    toggleScroll({ useFullscreen: true });
  });

  document.addEventListener("rer-reader-stop-scroll", () => {
    stopScroll();
  });

  document.addEventListener("rer-reader-scroll-enabled", event => {
    enabled = Boolean(event.detail?.enabled);
    GM_setValue(ENABLED_STORAGE_KEY, enabled);

    if (!enabled && scrolling) {
      stopScroll();
      return;
    }

    publishScrollState();
  });

  document.addEventListener("rer-reader-speed-steps", event => {
    const steps = Number(event.detail?.steps);
    if (!Number.isFinite(steps) || steps === 0) return;
    changeSpeedSteps(steps);
  });

  // Toute interaction avec la page rend immédiatement la main à l'utilisateur.
  document.addEventListener("pointerdown", event => {
    if (!scrolling) return;

    const control = document.getElementById("rer-reader-control");
    const panel = document.getElementById("rer-reading-buffer-panel");

    if (
      event.target instanceof Node &&
      (control?.contains(event.target) || panel?.contains(event.target))
    ) {
      return;
    }

    stopScroll();
  }, true);

  document.addEventListener("keydown", event => {
    if (!enabled) return;
    if (isTypingTarget(event.target)) return;

    const hasModifier =
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey;

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
