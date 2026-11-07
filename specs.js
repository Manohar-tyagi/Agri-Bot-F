/* ---------- specs.js : Specs tab content ----------
   Everything here is scoped to the Specs overlay (prefix `specs-`).
   Values come from window.AGRI_PAL_SPECS / window.AGRI_PAL_STATS, created
   at the top of script.js. The tab itself lives in particles.js, which
   calls window.AgriPalSpecs.sectionsMarkup() and .mount(page). */

(function (global) {
  "use strict";

  var SPECS = global.AGRI_PAL_SPECS || [];
  var STATS = global.AGRI_PAL_STATS || [];

  var PHOTO_EXTS = ["png", "jpg", "jpeg", "webp"];
  var CATEGORIES = ["Electronics", "Sensors", "Power", "Mechanical", "Software"];
  var REDUCED = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var HARDWARE = SPECS.filter(function (s) { return !!s.hotspot; });
  var state = {
    page: null,
    root: null,
    dsTab: "Electronics",
    photoLoaded: false,
    cleanup: []
  };

  /* ---------------------------------------------------------------- helpers */

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function photoUrl(entry, ext) {
    return encodeURI("assets/Components/" + entry.photo + "." + ext);
  }

  function statByLabel(label) {
    for (var i = 0; i < STATS.length; i++) {
      if (STATS[i].label === label) return STATS[i];
    }
    return { label: label, value: 0, unit: "", max: 0 };
  }

  function iconLines(name) {
    switch (name) {
      case "controller":
      case "chip":
        return '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>';
      case "driver":
        return '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 10v4M10.5 10v4M14 10v4M17.5 10v4"/>';
      case "ir":
        return '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>';
      case "obstacle":
        return '<path d="M12 12h.01"/><path d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>';
      case "battery":
        return '<rect x="2.5" y="7" width="17" height="10" rx="3"/><path d="M21.5 10v4M6 10v4M10 10v4M14 10v4"/>';
      case "motor":
        return '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22M4.9 4.9l2.5 2.5M16.6 16.6l2.5 2.5M19.1 4.9l-2.5 2.5M7.4 16.6l-2.5 2.5"/>';
      case "gripper":
        return '<path d="M4 4v6a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V4"/><path d="M7 21v-7M17 21v-7"/><path d="M10 14v7M14 14v7"/>';
      case "api":
        return '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h5M11 16.5h5"/>';
      case "dashboard":
        return '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 13h4M7 16.5h7M16 13v3.5"/>';
      case "wifi":
        return '<path d="M2.5 8.5a14 14 0 0 1 19 0M6 12a9 9 0 0 1 12 0M9.5 15.5a4 4 0 0 1 5 0M12 19h.01"/>';
      default:
        return '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 12h8M8 15h5"/>';
    }
  }

  function iconSvg(name, cls) {
    return '<svg' + (cls ? ' class="' + cls + '"' : "") + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + iconLines(name) + "</svg>";
  }

  function iconFor(entry) {
    if (entry.id === "software-backend") return "api";
    if (entry.id === "software-control") return "chip";
    if (entry.id === "software-dashboard") return "dashboard";
    return entry.id === "control" ? "controller" : entry.id;
  }

  function photoInner(entry, imgClass) {
    if (!entry.photo) {
      return '<span class="specs-icon-tile" aria-hidden="true">' + iconSvg(iconFor(entry)) + "</span>";
    }
    return '<img class="' + imgClass + '" src="' + photoUrl(entry, PHOTO_EXTS[0]) + '" alt="' + esc(entry.name) + ' part photo" loading="lazy" decoding="async" ' +
      'data-spec-photo data-spec-photo-base="' + esc(entry.photo) + '" data-spec-photo-class="' + imgClass + '" data-spec-photo-icon="' + iconFor(entry) + '">';
  }

  function wirePhotos(scope) {
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll("img[data-spec-photo]").forEach(function (img) {
      if (img.__specsWired) return;
      img.__specsWired = true;
      var step = 0;

      function fail() {
        step++;
        if (step < PHOTO_EXTS.length) {
          img.src = photoUrl({ photo: img.getAttribute("data-spec-photo-base") }, PHOTO_EXTS[step]);
          return;
        }
        var cls = img.getAttribute("data-spec-photo-class") || "specs-photo-img";
        var box = document.createElement("div");
        box.className = cls + " specs-photo--fallback";
        box.setAttribute("role", "img");
        box.setAttribute("aria-label", "Photo unavailable for " + (img.alt || "part"));
        box.innerHTML = '<span class="specs-photo-fallback-icon">' + iconSvg(img.getAttribute("data-spec-photo-icon") || "chip") + "</span>";
        if (img.parentNode) img.parentNode.replaceChild(box, img);
      }

      img.addEventListener("error", fail);
      img.addEventListener("load", function () {
        if (img.naturalWidth === 0) fail();
      });
      if (img.complete && img.naturalWidth === 0) fail();
    });
  }

  /* One console report for the seven hardware photos. */
  function preloadPhotos() {
    if (state.photoLoaded) return;
    state.photoLoaded = true;
    var entries = SPECS.filter(function (s) { return !!s.photo; });
    var total = entries.length;
    if (!total) return;
    var loaded = 0, remaining = total, failed = [];

    entries.forEach(function (entry) {
      (function tryExt(i) {
        var img = new Image();
        img.onload = function () {
          loaded++;
          remaining--;
          if (remaining === 0) report();
        };
        img.onerror = function () {
          if (i + 1 < PHOTO_EXTS.length) { tryExt(i + 1); return; }
          failed.push(entry.name);
          remaining--;
          if (remaining === 0) report();
        };
        img.src = photoUrl(entry, PHOTO_EXTS[i]);
      })(0);
    });

    function report() {
      var line = "Specs: " + loaded + "/" + total + " photos loaded";
      if (failed.length) line += " | failed: " + failed.join(", ");
      console.log(line);
    }
  }

  /* -------------------------------------------------------------- 01 bento */

  function bentoMarkup() {
    var speed = statByLabel("Top speed");
    var payload = statByLabel("Payload");
    var runtime = statByLabel("Runtime");
    var sensors = statByLabel("Sensors onboard");
    var loop = statByLabel("Control loop");
    var drive = statByLabel("Drive");
    var runtimePct = runtime.max ? Math.round((runtime.value / runtime.max) * 100) : 0;

    var dots = "";
    for (var i = 0; i < (sensors.value || 0); i++) {
      dots += '<i style="--i:' + i + '"></i>';
    }

    return (
      '<section id="specs-glance" class="specs-section specs-section--light specs-reveal" data-specs-bento>' +
        '<div class="specs-inner">' +
          '<div class="specs-head"><span>01 / AT A GLANCE</span><span>KEY NUMBERS</span></div>' +
          '<div class="specs-bento">' +
            '<article class="specs-tile specs-tile--speed">' +
              '<div class="specs-tile-top"><span class="specs-tile-label">' + esc(speed.label) + '</span></div>' +
              '<div class="specs-gauge-wrap">' +
                '<svg class="specs-gauge" viewBox="0 0 220 126" aria-hidden="true">' +
                  '<path class="specs-gauge-track" d="M20 110 A90 90 0 0 1 200 110" pathLength="100"/>' +
                  '<path class="specs-gauge-fill" data-specs-gauge d="M20 110 A90 90 0 0 1 200 110" pathLength="100" style="stroke-dasharray:100;stroke-dashoffset:100"/>' +
                '</svg>' +
                '<div class="specs-gauge-value"><span data-count="' + speed.value + '" data-decimals="1">0.0</span><small>' + esc(speed.unit) + "</small></div>" +
              "</div>" +
              '<p class="specs-tile-note">' + esc(speed.note) + "</p>" +
            "</article>" +
            '<article class="specs-tile">' +
              '<div class="specs-tile-top"><span class="specs-tile-label">' + esc(payload.label) + '</span></div>' +
              '<p class="specs-stat"><span data-count="' + payload.value + '" data-decimals="0">0</span><small>' + esc(payload.unit) + "</small></p>" +
              '<div class="specs-tile-rule"></div>' +
              '<p class="specs-tile-meta">Collection tray capacity</p>' +
            "</article>" +
            '<article class="specs-tile">' +
              '<div class="specs-tile-top"><span class="specs-tile-label">' + esc(runtime.label) + '</span></div>' +
              '<p class="specs-stat"><span data-count="' + runtime.value + '" data-decimals="0">0</span><small>' + esc(runtime.unit) + "</small></p>" +
              '<div class="specs-bar"><i data-specs-fill="' + runtimePct + '"></i></div>' +
              '<p class="specs-tile-meta">' + runtime.value + " of " + runtime.max + " " + esc(runtime.unit) + " usable</p>" +
            "</article>" +
            '<article class="specs-tile">' +
              '<div class="specs-tile-top"><span class="specs-tile-label">' + esc(sensors.label) + '</span></div>' +
              '<div class="specs-sensor-dots">' + dots + "</div>" +
              '<p class="specs-tile-meta">IR array, proximity, feedback</p>' +
            "</article>" +
            '<article class="specs-tile">' +
              '<div class="specs-tile-top"><span class="specs-tile-label">' + esc(loop.label) + '</span></div>' +
              '<p class="specs-stat"><span data-count="' + loop.value + '" data-decimals="0">0</span><small>' + esc(loop.unit) + "</small></p>" +
              '<svg class="specs-pulse" viewBox="0 0 180 34" aria-hidden="true"><path d="M2 20h28l7-12 9 24 10-30 9 21 8-13h105" pathLength="100"/></svg>' +
            "</article>" +
            '<article class="specs-tile specs-tile--drive">' +
              '<div class="specs-tile-top"><span class="specs-tile-label">' + esc(drive.label) + '</span></div>' +
              '<div class="specs-drive-row">' +
                '<p class="specs-drive-value">' + esc(drive.text || "—") + "</p>" +
                '<div class="specs-drive-wheels" aria-hidden="true"><i></i><i></i></div>' +
              "</div>" +
              '<p class="specs-tile-meta">Independent left / right wheel control for tight turns between rows.</p>' +
            "</article>" +
          "</div>" +
        "</div>" +
      "</section>"
    );
  }

  function animateBento(section) {
    if (!section || section.__specsAnimated) return;
    section.__specsAnimated = true;
    var counters = section.querySelectorAll("[data-count]");
    var gauge = section.querySelector("[data-specs-gauge]");
    var fill = section.querySelector("[data-specs-fill]");
    var speed = statByLabel("Top speed");

    if (REDUCED) {
      counters.forEach(function (el) {
        el.textContent = Number(el.getAttribute("data-count")).toFixed(parseInt(el.getAttribute("data-decimals") || "0", 10));
      });
      if (gauge) gauge.style.strokeDashoffset = String(100 - (speed.max ? (speed.value / speed.max) * 100 : 0));
      if (fill) fill.style.width = fill.getAttribute("data-specs-fill") + "%";
      section.querySelectorAll(".specs-sensor-dots, .specs-pulse, .specs-bar").forEach(function (el) { el.classList.add("is-on"); });
      return;
    }

    var start = 0;
    function frame(now) {
      if (!start) start = now;
      var t = Math.min(1, (now - start) / 1200);
      var e = 1 - Math.pow(1 - t, 3);
      counters.forEach(function (el) {
        var target = Number(el.getAttribute("data-count"));
        var dec = parseInt(el.getAttribute("data-decimals") || "0", 10);
        el.textContent = (target * e).toFixed(dec);
      });
      if (gauge) {
        var targetOffset = 100 - (speed.max ? (speed.value / speed.max) * 100 : 0);
        gauge.style.strokeDashoffset = String(100 - (100 - targetOffset) * e);
      }
      if (fill && !fill.__specsFilled) fill.style.width = (Number(fill.getAttribute("data-specs-fill")) * e) + "%";
      if (t < 1) requestAnimationFrame(frame);
      else {
        counters.forEach(function (el) {
          el.textContent = Number(el.getAttribute("data-count")).toFixed(parseInt(el.getAttribute("data-decimals") || "0", 10));
        });
        if (fill) { fill.style.width = fill.getAttribute("data-specs-fill") + "%"; fill.__specsFilled = true; }
        section.querySelectorAll(".specs-sensor-dots, .specs-pulse, .specs-bar").forEach(function (el) { el.classList.add("is-on"); });
      }
    }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------- 02 explore */

  function exploreMarkup() {
    return (
      '<section id="specs-explore" class="specs-section specs-section--dark specs-reveal" data-specs-explore>' +
        '<div class="specs-inner">' +
          '<div class="specs-head"><span>02 / EXPLORE THE BOT</span><span>INTERACTIVE</span></div>' +
          '<div class="specs-explore-grid">' +
            '<div class="specs-bot-panel" data-specs-bot-panel>' +
              '<canvas class="specs-bot-canvas" data-specs-bot-canvas role="img" aria-label="Dot-built Agri-Pal robot with selectable component hotspots"></canvas>' +
              '<div class="specs-hotspots" data-specs-hotspots></div>' +
            "</div>" +
            '<div class="specs-partcard" data-specs-partcard aria-live="polite">' +
              '<div class="specs-partcard-swap" data-specs-card-swap></div>' +
              '<div class="specs-card-nav">' +
                '<button class="specs-card-arrow" type="button" data-specs-prev aria-label="Previous part"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
                '<span class="specs-card-counter" data-specs-counter aria-live="polite">1 / ' + HARDWARE.length + "</span>" +
                '<button class="specs-card-arrow" type="button" data-specs-next aria-label="Next part"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>' +
              "</div>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</section>"
    );
  }

  function cardMarkup(entry, index) {
    var rows = entry.rows.map(function (row) {
      return '<div class="specs-card-row"><dt>' + esc(row[0]) + "</dt><dd>" + esc(row[1]) + "</dd></div>";
    }).join("");
    return (
      '<figure class="specs-partcard-photo">' + photoInner(entry, "specs-card-photo-img") + "</figure>" +
      '<div class="specs-partcard-head"><span class="specs-pill">' + esc(entry.category) + "</span>" +
        '</div>' +
      '<h3 class="specs-partcard-title">' + esc(entry.name) + "</h3>" +
      '<dl class="specs-card-rows">' + rows + "</dl>" +
      '<p class="specs-partcard-role">' + esc(entry.role) + "</p>"
    );
  }

  function initExplore(root) {
    var section = root.querySelector("[data-specs-explore]");
    if (!section || !HARDWARE.length) return;

    var canvas = section.querySelector("[data-specs-bot-canvas]");
    var panel = section.querySelector("[data-specs-bot-panel]");
    var layer = section.querySelector("[data-specs-hotspots]");
    var swap = section.querySelector("[data-specs-card-swap]");
    var card = section.querySelector("[data-specs-partcard]");
    var counter = section.querySelector("[data-specs-counter]");
    var prev = section.querySelector("[data-specs-prev]");
    var next = section.querySelector("[data-specs-next]");
    var current = 0;
    var interacted = false;
    var autoTimer = null;
    var visible = false;
    var swapTimer = null;

    var bot = global.createDotRobot ? global.createDotRobot(canvas, {
      panel: panel,
      assemble: false,
      bandSweep: false,
      repel: false,
      wave: false,
      clickWave: false,
      bloom: true,
      reducedMotion: REDUCED,
      onResize: positionHotspots
    }) : null;

    var buttons = HARDWARE.map(function (entry, index) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "specs-hotspot";
      btn.setAttribute("aria-label", "Select " + entry.name);
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("data-specs-hotspot", entry.id);
      btn.innerHTML = '<span class="specs-hotspot-ring" aria-hidden="true"></span><span class="specs-hotspot-dot" aria-hidden="true"></span><span class="specs-hotspot-tip">' + esc(entry.name) + "</span>";
      btn.addEventListener("pointerenter", stopAuto);
      btn.addEventListener("focus", stopAuto);
      btn.addEventListener("click", function () {
        stopAuto();
        select(index, true);
      });
      layer.appendChild(btn);
      return btn;
    });

    function positionHotspots() {
      if (!bot || !buttons) return;
      HARDWARE.forEach(function (entry, index) {
        var p = bot.toScreen(entry.hotspot.x, entry.hotspot.y);
        var btn = buttons[index];
        btn.style.left = p.x + "px";
        btn.style.top = p.y + "px";
      });
    }

    function syncSelected() {
      buttons.forEach(function (btn, i) {
        var on = i === current;
        btn.classList.toggle("is-selected", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    function select(index, animate) {
      index = (index + HARDWARE.length) % HARDWARE.length;
      current = index;
      var entry = HARDWARE[index];
      if (counter) counter.textContent = (index + 1) + " / " + HARDWARE.length;
      syncSelected();
      if (bot) bot.pulse(entry.hotspot.x, entry.hotspot.y, 900);

      if (!animate || REDUCED) {
        swap.innerHTML = cardMarkup(entry, index);
        wirePhotos(swap);
        swap.classList.remove("is-swapping");
        return;
      }
      clearTimeout(swapTimer);
      swap.classList.add("is-swapping");
      swapTimer = setTimeout(function () {
        swap.innerHTML = cardMarkup(entry, index);
        wirePhotos(swap);
        requestAnimationFrame(function () { swap.classList.remove("is-swapping"); });
      }, 125);
    }

    function startAuto() {
      if (REDUCED || interacted || autoTimer) return;
      autoTimer = setInterval(function () {
        if (!visible) return;
        select(current + 1, true);
      }, 5000);
    }

    function stopAuto() {
      interacted = true;
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }

    function onPrev() { stopAuto(); select(current - 1, true); }
    function onNext() { stopAuto(); select(current + 1, true); }
    prev.addEventListener("click", onPrev);
    next.addEventListener("click", onNext);
    if (panel) panel.addEventListener("pointerenter", stopAuto);
    if (card) card.addEventListener("pointerenter", stopAuto);

    /* keep the selected part reachable from the Datasheet */
    section.__specsSelectPart = function (id) {
      var found = -1;
      HARDWARE.forEach(function (entry, i) { if (entry.id === id) found = i; });
      if (found < 0) return;
      stopAuto();
      select(found, true);
    };

    positionHotspots();
    select(0, false);

    var io = null;
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (visible) { if (bot) bot.start(); startAuto(); }
          else { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } if (bot) bot.stop(); }
        });
      }, { threshold: 0.18 });
      io.observe(section);
    } else {
      visible = true;
      startAuto();
    }

    state.cleanup.push(function () {
      clearTimeout(swapTimer);
      if (autoTimer) clearInterval(autoTimer);
      if (io) io.disconnect();
      if (bot) bot.destroy();
    });
  }

  /* ------------------------------------------------------------ 03 datasheet */

  function tabCount(cat) {
    return SPECS.filter(function (s) { return s.category === cat; }).length;
  }

  function tabsMarkup(active) {
    return CATEGORIES.map(function (cat) {
      var on = cat === active;
      return '<button class="specs-tab' + (on ? " is-active" : "") + '" type="button" role="tab" aria-selected="' + (on ? "true" : "false") + '" data-specs-tab="' + cat + '">' +
        esc(cat) + ' <span class="specs-tab-count">' + tabCount(cat) + "</span></button>";
    }).join("");
  }

  function datasheetRowMarkup(entry) {
    var chips = entry.rows.slice(0, 2).map(function (row) {
      return '<span class="specs-chip"><b>' + esc(row[0]) + "</b>" + esc(row[1]) + "</span>";
    }).join("");
    var fullRows = entry.rows.map(function (row) {
      return '<div class="specs-ds-rowline"><dt>' + esc(row[0]) + "</dt><dd>" + esc(row[1]) + "</dd></div>";
    }).join("");
    var detailId = "specs-ds-detail-" + entry.id;

    return (
      '<article class="specs-ds-row" data-specs-ds-row="' + entry.id + '">' +
        '<div class="specs-ds-head">' +
          '<span class="specs-ds-thumb">' + photoInner(entry, "specs-ds-photo-img") + "</span>" +
          '<div class="specs-ds-main">' +
            '<button class="specs-ds-name" type="button" data-specs-select="' + entry.id + '">' + esc(entry.name) + "</button>" +
            '<div class="specs-ds-chips">' + chips + "</div>" +
          "</div>" +
          '<button class="specs-ds-plus" type="button" data-specs-ds-toggle aria-expanded="false" aria-controls="' + detailId + '" aria-label="Show full details for ' + esc(entry.name) + '">' +
            '<span aria-hidden="true"></span>' +
          "</button>" +
        "</div>" +
        '<div class="specs-ds-detail" id="' + detailId + '" data-specs-ds-detail>' +
          '<div class="specs-ds-detail-inner">' +
            '<dl class="specs-ds-fullrows">' + fullRows + "</dl>" +
            '<p class="specs-ds-role">' + esc(entry.role) + "</p>" +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function datasheetListMarkup(cat) {
    var entries = SPECS.filter(function (s) { return s.category === cat; });
    return entries.map(datasheetRowMarkup).join("");
  }

  function datasheetMarkup() {
    return (
      '<section id="specs-datasheet" class="specs-section specs-section--light specs-reveal" data-specs-datasheet>' +
        '<div class="specs-inner">' +
          '<div class="specs-head"><span>03 / DATASHEET</span><span>FULL DETAIL</span></div>' +
          '<div class="specs-tabs-wrap">' +
            '<div class="specs-tabs" role="tablist" aria-label="Datasheet categories" data-specs-tabs>' + tabsMarkup(state.dsTab) + "</div>" +
          "</div>" +
          '<div class="specs-ds-list" data-specs-ds-list>' + datasheetListMarkup(state.dsTab) + "</div>" +
        "</div>" +
      "</section>"
    );
  }

  function closeDetail(row) {
    if (!row) return;
    var detail = row.querySelector("[data-specs-ds-detail]");
    var plus = row.querySelector("[data-specs-ds-toggle]");
    if (!row.classList.contains("is-open")) return;
    row.classList.remove("is-open");
    if (plus) {
      plus.setAttribute("aria-expanded", "false");
      plus.setAttribute("aria-label", plus.getAttribute("aria-label").replace(/^Hide/, "Show"));
    }
    if (!detail) return;
    detail.style.height = detail.scrollHeight + "px";
    requestAnimationFrame(function () { detail.style.height = "0px"; });
  }

  function openDetail(row) {
    var detail = row.querySelector("[data-specs-ds-detail]");
    var plus = row.querySelector("[data-specs-ds-toggle]");
    row.classList.add("is-open");
    if (plus) {
      plus.setAttribute("aria-expanded", "true");
      plus.setAttribute("aria-label", plus.getAttribute("aria-label").replace(/^Show/, "Hide"));
    }
    if (!detail) return;
    detail.style.height = detail.scrollHeight + "px";
    detail.addEventListener("transitionend", function onEnd(e) {
      if (e.propertyName !== "height" || !row.classList.contains("is-open")) return;
      detail.style.height = "auto";
      detail.removeEventListener("transitionend", onEnd);
    });
  }

  function initDatasheet(root) {
    var section = root.querySelector("[data-specs-datasheet]");
    if (!section) return;
    var tabs = section.querySelector("[data-specs-tabs]");
    var list = section.querySelector("[data-specs-ds-list]");
    var switchTimer = null;

    function wireList() {
      wirePhotos(list);
      var open = list.querySelector(".specs-ds-row.is-open");
      if (open) {
        var detail = open.querySelector("[data-specs-ds-detail]");
        if (detail) detail.style.height = "auto";
      }
    }

    function switchTab(cat) {
      if (!cat || cat === state.dsTab) return;
      state.dsTab = cat;
      tabs.innerHTML = tabsMarkup(cat);
      clearTimeout(switchTimer);
      if (REDUCED) {
        list.innerHTML = datasheetListMarkup(cat);
        wireList();
        return;
      }
      list.classList.add("is-switching");
      switchTimer = setTimeout(function () {
        list.innerHTML = datasheetListMarkup(cat);
        wireList();
        requestAnimationFrame(function () { list.classList.remove("is-switching"); });
      }, 130);
    }

    tabs.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-specs-tab]");
      if (btn) switchTab(btn.getAttribute("data-specs-tab"));
    });

    list.addEventListener("click", function (e) {
      var selectBtn = e.target.closest("[data-specs-select]");
      if (selectBtn) {
        selectPart(selectBtn.getAttribute("data-specs-select"));
        return;
      }
      var toggle = e.target.closest("[data-specs-ds-toggle]");
      if (!toggle) return;
      var row = toggle.closest(".specs-ds-row");
      if (!row) return;
      var wasOpen = row.classList.contains("is-open");
      var open = list.querySelector(".specs-ds-row.is-open");
      if (open && open !== row) closeDetail(open);
      if (wasOpen) closeDetail(row);
      else openDetail(row);
    });

    wireList();
    state.cleanup.push(function () { clearTimeout(switchTimer); });
  }

  /* ----------------------------------------------------------- 04 how it works */

  var HOW_STEPS = [
    {
      label: "Follow the row",
      desc: "The IR array reads the guide line and the Arduino continuously steers the motors to stay centred.",
      paths: ["ir-ard", "ard-driver", "driver-motors"],
      nodes: ["ir", "arduino", "driver", "motors"],
      speed: 1
    },
    {
      label: "Detect obstacle",
      desc: "The proximity sensor reports anything inside its range straight to the Arduino controller.",
      paths: ["obs-ard"],
      nodes: ["obstacle", "arduino"],
      speed: 1.35
    },
    {
      label: "Reroute or wait",
      desc: "The Arduino slows the drive and reroutes around the obstacle, pausing the motor driver before moving on.",
      paths: ["ard-driver", "driver-motors"],
      nodes: ["arduino", "driver", "motors"],
      speed: 0.5
    },
    {
      label: "Pluck produce",
      desc: "The Arduino commands the servo gripper to close on ripe produce and release it into the tray.",
      paths: ["ard-grip"],
      nodes: ["arduino", "gripper"],
      speed: 1.4
    }
  ];

  function svgNode(id, x, y, w, h, label, icon) {
    return (
      '<g class="specs-node" data-node="' + id + '" transform="translate(' + x + ' ' + y + ')">' +
        '<rect class="specs-node-box" width="' + w + '" height="' + h + '" rx="16"/>' +
        '<svg class="specs-node-icon" x="16" y="' + ((h - 24) / 2) + '" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + iconLines(icon) + "</svg>" +
        '<text class="specs-node-label" x="52" y="' + (h / 2 + 4) + '">' + esc(label) + "</text>" +
      "</g>"
    );
  }

  function howMarkup() {
    var chips = HOW_STEPS.map(function (step, i) {
      return '<button class="specs-step" type="button" data-specs-step="' + i + '" aria-pressed="' + (i === 0 ? "true" : "false") + '"><span>' + (i + 1) + "</span>" + esc(step.label) + "</button>";
    }).join("");

    return (
      '<section id="specs-how" class="specs-section specs-section--dark specs-reveal" data-specs-how>' +
        '<div class="specs-inner">' +
          '<div class="specs-head"><span>04 / HOW IT WORKS</span><span>SENSE / THINK / ACT</span></div>' +
          '<div class="specs-diagram-wrap" data-specs-diagram-wrap>' +
            '<svg class="specs-diagram" viewBox="0 0 1000 420" role="img" aria-labelledby="specs-diagram-title specs-diagram-desc">' +
              '<title id="specs-diagram-title">Agri-Pal system diagram</title>' +
              '<desc id="specs-diagram-desc">IR and obstacle sensors feed the Arduino controller. The controller drives the motor driver, motors and servo gripper, and sends telemetry over Wi-Fi to the Java API and dashboard.</desc>' +
              '<defs>' +
                '<marker id="specs-arrow" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#68767d"/></marker>' +
              "</defs>" +
              '<g class="specs-wires">' +
                '<path class="specs-wire" data-wire="ir-ard" marker-end="url(#specs-arrow)" d="M210 102 C292 102 322 128 390 132"/>' +
                '<path class="specs-wire" data-wire="obs-ard" marker-end="url(#specs-arrow)" d="M210 202 C292 202 322 178 390 178"/>' +
                '<path class="specs-wire" data-wire="ard-driver" marker-end="url(#specs-arrow)" d="M610 120 C686 120 690 72 760 72"/>' +
                '<path class="specs-wire" data-wire="driver-motors" marker-end="url(#specs-arrow)" d="M850 104 L850 140"/>' +
                '<path class="specs-wire" data-wire="ard-grip" marker-end="url(#specs-arrow)" d="M610 180 C688 180 686 282 760 282"/>' +
                '<path class="specs-wire specs-wire--telemetry" data-wire="ard-api" marker-end="url(#specs-arrow)" d="M500 210 C500 280 500 300 500 350"/>' +
                '<path class="specs-wire specs-wire--telemetry" data-wire="api-dash" marker-end="url(#specs-arrow)" d="M610 382 C686 382 690 382 760 382"/>' +
              "</g>" +
              '<g class="specs-wifi-tag" transform="translate(520 286)">' +
                '<svg x="0" y="-7" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + iconLines("wifi") + "</svg>" +
                '<text x="22" y="7">WI-FI</text>' +
              "</g>" +
              '<g class="specs-dots" data-specs-dots></g>' +
              '<g class="specs-nodes">' +
                svgNode("ir", 30, 70, 180, 64, "IR array", "ir") +
                svgNode("obstacle", 30, 170, 180, 64, "Obstacle sensor", "obstacle") +
                svgNode("arduino", 390, 90, 220, 120, "Arduino controller", "controller") +
                svgNode("driver", 760, 40, 180, 64, "Motor driver", "driver") +
                svgNode("motors", 760, 140, 180, 64, "Motors", "motor") +
                svgNode("gripper", 760, 250, 180, 64, "Servo gripper", "gripper") +
                svgNode("api", 390, 350, 220, 64, "Java API", "api") +
                svgNode("dashboard", 760, 350, 180, 64, "Dashboard", "dashboard") +
              "</g>" +
            "</svg>" +
          "</div>" +
          '<div class="specs-steps" role="group" aria-label="Working cycle steps" data-specs-steps>' + chips + "</div>" +
          '<p class="specs-step-desc" data-specs-step-desc>' + esc(HOW_STEPS[0].desc) + "</p>" +
        "</div>" +
      "</section>"
    );
  }

  function initHow(root) {
    var section = root.querySelector("[data-specs-how]");
    if (!section) return;
    var svg = section.querySelector(".specs-diagram");
    var wrap = section.querySelector("[data-specs-diagram-wrap]");
    var stepsEl = section.querySelector("[data-specs-steps]");
    var descEl = section.querySelector("[data-specs-step-desc]");
    var dotsLayer = section.querySelector("[data-specs-dots]");
    if (!svg || !stepsEl) return;

    var paths = {};
    svg.querySelectorAll("[data-wire]").forEach(function (el) {
      paths[el.getAttribute("data-wire")] = { el: el, len: el.getTotalLength() };
    });
    var nodes = {};
    svg.querySelectorAll("[data-node]").forEach(function (el) { nodes[el.getAttribute("data-node")] = el; });
    var buttons = [].slice.call(stepsEl.querySelectorAll("[data-specs-step]"));

    var current = 0;
    var dots = [];
    var raf = 0;
    var timer = null;
    var visible = false;
    var hovered = false;

    function makeDot(path, phase, speed, radius, cls) {
      var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("r", radius);
      c.setAttribute("class", cls);
      dotsLayer.appendChild(c);
      dots.push({ el: c, path: path, phase: phase, speed: speed });
    }

    function rebuildDots() {
      dotsLayer.innerHTML = "";
      dots = [];
      if (REDUCED) return;
      var step = HOW_STEPS[current];
      step.paths.forEach(function (id) {
        var p = paths[id];
        if (!p) return;
        var count = id === "driver-motors" ? 1 : 2;
        for (var k = 0; k < count; k++) {
          makeDot(p, (k / count) + (id.length % 3) * 0.06, step.speed, 3.4, "specs-flow-dot");
        }
      });
      ["ard-api", "api-dash"].forEach(function (id) {
        if (paths[id]) makeDot(paths[id], (id.length % 5) * 0.1, 0.16, 2.1, "specs-flow-dot specs-flow-dot--telemetry");
      });
    }

    function setStep(index, user) {
      current = (index + HOW_STEPS.length) % HOW_STEPS.length;
      var step = HOW_STEPS[current];
      buttons.forEach(function (btn, i) {
        btn.classList.toggle("is-active", i === current);
        btn.setAttribute("aria-pressed", i === current ? "true" : "false");
      });
      Object.keys(nodes).forEach(function (id) { nodes[id].classList.remove("is-active", "is-paused"); });
      step.nodes.forEach(function (id) {
        if (nodes[id]) nodes[id].classList.add("is-active");
      });
      if (current === 2 && nodes.driver) nodes.driver.classList.add("is-paused");
      Object.keys(paths).forEach(function (id) { paths[id].el.classList.remove("is-active"); });
      step.paths.forEach(function (id) { if (paths[id]) paths[id].el.classList.add("is-active"); });
      if (descEl) descEl.textContent = step.desc;
      rebuildDots();
      if (user) schedule();
    }

    function animate(now) {
      if (!visible) { raf = 0; return; }
      for (var i = 0; i < dots.length; i++) {
        var dot = dots[i];
        var t = ((now * 0.00035 * dot.speed + dot.phase) % 1 + 1) % 1;
        var pt = dot.path.el.getPointAtLength(t * dot.path.len);
        dot.el.setAttribute("cx", pt.x);
        dot.el.setAttribute("cy", pt.y);
      }
      raf = requestAnimationFrame(animate);
    }

    function schedule() {
      clearInterval(timer);
      timer = null;
      if (REDUCED || !visible) return;
      timer = setInterval(function () {
        if (hovered || !visible) return;
        setStep(current + 1, false);
      }, 3500);
    }

    function start() {
      if (REDUCED) return;
      if (!raf) raf = requestAnimationFrame(animate);
      schedule();
    }

    function stop() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      clearInterval(timer);
      timer = null;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setStep(Number(btn.getAttribute("data-specs-step")), true);
      });
    });

    if (wrap) {
      wrap.addEventListener("pointerenter", function () { hovered = true; });
      wrap.addEventListener("pointerleave", function () { hovered = false; });
    }

    setStep(0, false);

    var io = null;
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (visible) start();
          else stop();
        });
      }, { threshold: 0.15 });
      io.observe(section);
    } else {
      visible = true;
      start();
    }

    state.cleanup.push(function () {
      if (io) io.disconnect();
      stop();
      dots = [];
    });
  }

  /* ------------------------------------------------------------- reveal / mount */

  function initReveal(root) {
    var items = root.querySelectorAll(".specs-reveal");
    if (!items.length) return;

    function reveal(el) {
      el.classList.add("is-visible");
      if (el.hasAttribute("data-specs-bento")) animateBento(el);
    }

    if (REDUCED || !global.IntersectionObserver) {
      items.forEach(reveal);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          reveal(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
    items.forEach(function (el) { io.observe(el); });
    state.cleanup.push(function () { io.disconnect(); });
  }

  function sectionsMarkup() {
    return (
      '<div class="specs-scope specs-view">' +
        bentoMarkup() +
        exploreMarkup() +
        datasheetMarkup() +
        howMarkup() +
      "</div>"
    );
  }

  function unmount() {
    var page = state.page;
    state.cleanup.forEach(function (fn) {
      try { fn(); } catch (e) { /* keep tearing down the rest */ }
    });
    state.cleanup = [];
    if (state.root) state.root.__specsSelectPart = null;
    if (page) {
      page.querySelectorAll(".specs-partcard-swap img[data-spec-photo]").forEach(function (img) { img.__specsWired = false; });
    }
    state.page = null;
    state.root = null;
  }

  function mount(page) {
    if (!page) return;
    unmount();
    state.page = page;
    state.root = page.querySelector(".specs-scope");
    if (!state.root) return;
    preloadPhotos();
    initReveal(state.root);
    initExplore(state.root);
    initDatasheet(state.root);
    initHow(state.root);
  }

  function selectPart(id) {
    var explore = state.root && state.root.querySelector("[data-specs-explore]");
    if (!explore) return;
    if (explore.__specsSelectPart) explore.__specsSelectPart(id);
    var target = document.getElementById("specs-explore");
    if (target && explore.__specsSelectPart) {
      // only scroll when the part actually lives in section 02
      var found = HARDWARE.some ? HARDWARE.some(function (e) { return e.id === id; }) : false;
      if (!found) return;
      try { target.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" }); }
      catch (e) { target.scrollIntoView(); }
    }
  }

  global.AgriPalSpecs = {
    sectionsMarkup: sectionsMarkup,
    mount: mount,
    unmount: unmount,
    selectPart: selectPart
  };
})(window);
