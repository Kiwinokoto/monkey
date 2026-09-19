// ==UserScript==
// @name         Auto Scroll Manga / Manhua / Comics
// @namespace    local.auto-scroll-reader
// @version      2.0.0
// @description  Ajoute un bouton flottant, déplaçable et réglable pour scroller automatiquement sur les sites de lecture.
// @include      /^https?:\/\/.*(manga|manhua|manhwa|webtoon|comic|comics|webcomic|scantrad).*$/
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const SPEED_STORAGE_KEY = "autoScrollReaderSpeedPxPerSecond";
  const POSITION_STORAGE_KEY = "autoScrollReaderButtonPosition";

  const MIN_SPEED = -1000;
  const MAX_SPEED = 1000;
  const SPEED_STEP = 50;
  const TOUCH_LONG_PRESS_MS = 450;
  const TOUCH_SWIPE_THRESHOLD_PX = 12;
  const TOUCH_SPEED_PX_PER_STEP = 32;

  let scrolling = false;
  let buttonHovered = false;
  let rafId = null;
  let lastTimestamp = null;
  let scrollTargetY = null;
  let gestureState = null;
  let suppressNextClick = false;
  let hasCustomPosition = false;

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
      border-left: 0.52em solid #111827;
    }

    .asr-icon--pause::before,
    .asr-icon--pause::after {
      content: "";
      position: absolute;
      top: 0.16em;
      width: 0.18em;
      height: 0.68em;
      border-radius: 999px;
      background: #111827;
    }

    .asr-icon--pause::before {
      left: 0.35em;
    }

    .asr-icon--pause::after {
      right: 0.35em;
    }

    .asr-label {
      display: inline-block;
      color: #111827;
      white-space: nowrap;
    }
  `;

  document.head.appendChild(style);

  const button = document.createElement("button");
  const icon = document.createElement("span");
  const label = document.createElement("span");

  button.setAttribute(
    "aria-label",
    "Activer ou mettre en pause l'auto-scroll"
  );

  icon.className = "asr-icon";
  icon.setAttribute("aria-hidden", "true");

  label.className = "asr-label";

  button.append(icon, label);

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

  function updateButton() {
    icon.classList.toggle("asr-icon--play", !scrolling);
    icon.classList.toggle("asr-icon--pause", scrolling);

    label.textContent = `${speed} px/s`;

    if (buttonHovered) {
      button.style.opacity = scrolling ? "0.2" : "0.7";
    } else {
      button.style.opacity = scrolling ? "0.5" : "0.9";
    }

    const dragging = gestureState?.mode === "drag";

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
  }

  button.addEventListener("click", (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      return;
    }

    toggleScroll({ useFullscreen: true });
  });

  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
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
      gestureState ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

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
  updateButton();
  loadSavedButtonPosition();

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