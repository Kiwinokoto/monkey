// ==UserScript==
// @name         Auto Scroll Manga / Manhua / Comics
// @namespace    local.auto-scroll-reader
// @version      1.7
// @description  Ajoute un bouton flottant, déplaçable et réglable pour scroller automatiquement sur les sites de lecture.
// @include      /^https?:\/\/.*(manga|manhua|manhwa|webtoon|comic|comics|webcomic|scantrad).*$/
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const KEYWORDS = [
    "manga",
    "manhua",
    "manhwa",
    "webtoon",
    "comic",
    "comics",
    "webcomic",
    "scantrad",
  ];

  const SPEED_STORAGE_KEY = "autoScrollReaderSpeedPxPerSecond";
  const POSITION_STORAGE_KEY = "autoScrollReaderButtonPosition";

  const MIN_SPEED = 10;
  const MAX_SPEED = 500;
  const SPEED_STEP = 10;

  const currentUrl = window.location.href.toLowerCase();
  const shouldRun = KEYWORDS.some((keyword) => currentUrl.includes(keyword));

  if (!shouldRun) {
    return;
  }

  let scrolling = false;
  let buttonHovered = false;
  let rafId = null;
  let lastTimestamp = null;
  let scrollTargetY = null;
  let dragState = null;
  let suppressNextClick = false;
  let hasCustomPosition = false;

  const legacySavedSpeed = Number(localStorage.getItem(SPEED_STORAGE_KEY));
  const defaultSpeed = Number.isFinite(legacySavedSpeed)
    ? legacySavedSpeed
    : 70;

  const storedSpeed = Number(GM_getValue(SPEED_STORAGE_KEY, defaultSpeed));

  let speed = Number.isFinite(storedSpeed)
    ? Math.max(MIN_SPEED, Math.min(MAX_SPEED, storedSpeed))
    : 70;

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

  function updateButton() {
    const iconClass = scrolling ? "asr-icon--pause" : "asr-icon--play";

    button.innerHTML = `
      <span class="asr-icon ${iconClass}" aria-hidden="true"></span>
      <span class="asr-label">Auto · ${speed}px/s</span>
    `;

    button.style.background = "rgba(255, 255, 255, 0.62)";
    button.style.color = "#111827";
    button.style.border = "1px solid rgba(17, 24, 39, 0.16)";

    if (buttonHovered) {
      button.style.opacity = scrolling ? "0.62" : "0.78";
    } else {
      button.style.opacity = scrolling ? "0.28" : "0.45";
    }
  }

  function stopScroll() {
    scrolling = false;
    lastTimestamp = null;
    scrollTargetY = null;

    document.documentElement.classList.remove("asr-scrolling");

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    updateButton();
  }

  function scrollStep(timestamp) {
    if (!scrolling) {
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

    scrollTargetY = Math.min(
      maximumScrollY,
      scrollTargetY + speed * elapsedSeconds
    );

    window.scrollTo({
      top: scrollTargetY,
      left: window.scrollX,
      behavior: "auto",
    });

    if (scrollTargetY >= maximumScrollY - 1 || getNearBottom()) {
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

    /*
     * Certains sites imposent scroll-behavior: smooth.
     * Ce style interfère avec notre animation continue.
     */
    document.documentElement.classList.add("asr-scrolling");

    updateButton();
    rafId = requestAnimationFrame(scrollStep);
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
  }

  function isTypingTarget(element) {
    if (!element) {
      return false;
    }

    const tagName = element.tagName?.toLowerCase();

    return (
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      element.isContentEditable
    );
  }

  function setButtonPosition(left, top, save = false) {
    const rect = button.getBoundingClientRect();

    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);

    const clampedLeft = Math.min(Math.max(0, left), maxLeft);
    const clampedTop = Math.min(Math.max(0, top), maxTop);

    button.style.left = `${clampedLeft}px`;
    button.style.top = `${clampedTop}px`;
    button.style.right = "auto";
    button.style.bottom = "auto";

    hasCustomPosition = true;

    if (save) {
      GM_setValue(
        POSITION_STORAGE_KEY,
        JSON.stringify({
          left: clampedLeft,
          top: clampedTop,
        })
      );
    }
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
        Number.isFinite(position.top)
      ) {
        setButtonPosition(position.left, position.top);
      }
    } catch {
      // Position invalide : on conserve l'emplacement par défaut.
    }
  }

  function finishDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    if (dragState.moved) {
      const rect = button.getBoundingClientRect();

      setButtonPosition(rect.left, rect.top, true);

      if (event.type === "pointerup") {
        suppressNextClick = true;
      }
    }

    if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }

    button.style.cursor = "grab";
    dragState = null;
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

  button.setAttribute(
    "aria-label",
    "Activer ou mettre en pause l'auto-scroll"
  );

  Object.assign(button.style, {
    position: "fixed",
    right: "1rem",
    bottom: "1rem",
    zIndex: "999999",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    minWidth: "8.9rem",
    justifyContent: "center",
    padding: "0.65rem 0.95rem",
    border: "1px solid rgba(17, 24, 39, 0.16)",
    borderRadius: "999px",
    background: "rgba(255, 255, 255, 0.62)",
    color: "#111827",
    fontSize: "0.95rem",
    fontFamily: "system-ui, sans-serif",
    cursor: "grab",
    boxShadow: "0 0.25rem 0.8rem rgba(0,0,0,0.18)",
    opacity: "0.45",
    userSelect: "none",
    touchAction: "none",
    backdropFilter: "blur(0.35rem)",
    transition:
      "opacity 160ms ease, box-shadow 160ms ease, transform 160ms ease",
    appearance: "none",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  });

  button.addEventListener("click", (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      return;
    }

    toggleScroll({ useFullscreen: true });
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
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const rect = button.getBoundingClientRect();

    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
    };

    button.setPointerCapture(event.pointerId);
    button.style.cursor = "grabbing";
  });

  button.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (!dragState.moved && Math.hypot(deltaX, deltaY) < 4) {
      return;
    }

    dragState.moved = true;
    event.preventDefault();

    setButtonPosition(
      dragState.originLeft + deltaX,
      dragState.originTop + deltaY
    );
  });

  button.addEventListener("pointerup", finishDrag);
  button.addEventListener("pointercancel", finishDrag);

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

    const rect = button.getBoundingClientRect();
    setButtonPosition(rect.left, rect.top);
  });

  document.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();

    if (
      key === "a" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      toggleScroll({ useFullscreen: true });
      return;
    }

    if (event.key === "Escape") {
      stopScroll();
      return;
    }

    if (buttonHovered && event.key === "ArrowUp") {
      event.preventDefault();
      changeSpeed(SPEED_STEP);
      return;
    }

    if (buttonHovered && event.key === "ArrowDown") {
      event.preventDefault();
      changeSpeed(-SPEED_STEP);
      return;
    }

    if (event.key === "[") {
      changeSpeed(-SPEED_STEP);
      return;
    }

    if (event.key === "]") {
      changeSpeed(SPEED_STEP);
    }
  });
})();
