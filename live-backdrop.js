(function () {
  "use strict";

  var reducedMotion = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var TINTS = {
    dawn: ["#ffe3cf", "#fbd9e4"],
    day: ["#e3f4ec", "#f6f7f3"],
    evening: ["#ffe0bd", "#fdeede"],
    night: ["#dfe6f2", "#e9edf5"]
  };

  function tintForHour(h) {
    if (h >= 5 && h < 8) return TINTS.dawn;
    if (h >= 8 && h < 16) return TINTS.day;
    if (h >= 16 && h < 19) return TINTS.evening;
    return TINTS.night;
  }

  var sections = [];

  function makeBg() {
    var bg = document.createElement("div");
    bg.className = "ld-bg";
    bg.setAttribute("aria-hidden", "true");
    bg.innerHTML = '<div class="ld-blobs"><i></i><i></i><i></i></div><div class="ld-dots"></div><div class="ld-tint"></div>';
    return bg;
  }

  function enhanceSection(root) {
    if (!root || root.__ldEnhanced) return;
    root.__ldEnhanced = true;
    root.classList.add("live-section");
    // ld-bg as first child
    var bg = makeBg();
    root.insertBefore(bg, root.firstChild);
    var panel = root.querySelector(".glass-card.dashboard") || root.querySelector(".dashboard");
    var sec = { root: root, bg: bg, state: { mode: "idle", row: 1, rows: 12, batteryPct: 100 } };
    sections.push(sec);
    applyTintTo(root);
  }

  function scan() {
    var nodes = document.querySelectorAll(".live-dash, .live-dashboard, .live-section");
    nodes.forEach(enhanceSection);
  }

  // MutationObserver for dynamically created dashboards
  if (window.MutationObserver) {
    var mo = new MutationObserver(function () { scan(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---------- tint ----------
  function applyTintTo(root) {
    var h = new Date().getHours();
    var t = tintForHour(h);
    root.style.setProperty("--ld-tint-a", t[0]);
    root.style.setProperty("--ld-tint-b", t[1]);
  }
  function applyTint() {
    sections.forEach(function (s) { applyTintTo(s.root); });
  }
  // re-check tint every 10 minutes
  setInterval(applyTint, 10 * 60 * 1000);

  // ---------- pulse ring ----------
  var lastRingTime = 0;
  function statusColor(detail) {
    var battery = detail.batteryPct;
    var mode = detail.mode;
    if (battery != null && battery < 20) return "#dc2626";
    if (mode === "blocked" || (battery != null && battery >= 20 && battery <= 49)) return "#d97706";
    return "#16a34a";
  }
  function emitPulseRing(detail) {
    var now = Date.now();
    if (now - lastRingTime < 1500) return;
    lastRingTime = now;
    if (reducedMotion) return; // no pulse ring
    sections.forEach(function (s) {
      var root = s.root;
      // find status pill dot
      var dot = root.querySelector(".pill-light .status-dot") || root.querySelector(".status-dot");
      var ring = document.createElement("div");
      ring.className = "ld-pulse-ring";
      ring.style.borderColor = statusColor(detail);
      // position relative to root
      var rootRect = root.getBoundingClientRect();
      if (dot) {
        var dr = dot.getBoundingClientRect();
        ring.style.left = (dr.left + dr.width / 2 - rootRect.left) + "px";
        ring.style.top = (dr.top + dr.height / 2 - rootRect.top) + "px";
      } else {
        ring.style.left = "50%";
        ring.style.top = "40px";
      }
      root.appendChild(ring);
      setTimeout(function () {
        if (ring.parentNode) ring.parentNode.removeChild(ring);
      }, 1900);
    });
  }

  // ---------- updated line ----------
  function updateUpdatedLine() {
    sections.forEach(function (s) {
      var src = s.root.querySelector(".dash-source");
      if (!src) return;
      var span = src.querySelector(".ld-updated");
      if (!span) {
        span = document.createElement("span");
        span.className = "ld-updated";
        src.appendChild(span);
      }
      var start = Date.now();
      span.textContent = " \u00b7 Updated just now";
      if (src.__ldTimer) clearInterval(src.__ldTimer);
      src.__ldTimer = setInterval(function () {
        var sec = Math.round((Date.now() - start) / 1000);
        if (sec < 1) span.textContent = " \u00b7 Updated just now";
        else span.textContent = " \u00b7 Updated " + sec + "s ago";
      }, 1000);
    });
  }

  // ---------- event listener ----------
  window.addEventListener("agripal:reading", function (e) {
    var detail = (e && e.detail) ? e.detail : {};
    sections.forEach(function (s) { /* field strip removed; pulse/updated/tint remain */ });
    emitPulseRing(detail);
    updateUpdatedLine();
    applyTint();
  });

  // ---------- init ----------
  function init() {
    scan();
    // tint initial
    applyTint();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // also scan later for late-mounted dashboards
  setTimeout(scan, 500);
  setTimeout(scan, 1500);
})();
