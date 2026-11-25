/* Homepage behaviour: assembly scrub through the 120 render frames,
   pinned capabilities highlight (Navigate → Detect → Harvest),
   draggable telemetry wireframe, and live status polling against the
   Spring Boot API. */

(function () {
  "use strict";

  var API_BASE = window.AGRIPAL_API_BASE || 'http://localhost:8080';
  var isHomePage = document.body && document.body.getAttribute("data-page") === "home";

  /* ==========================================================================
     Single source of truth for the Specs tab.
     Edit values here — every Specs section reads from these two arrays.
     Hotspot x,y are positions in the robot's 600 x 750 design space
     (the same space used by botshape.js).
     ========================================================================== */
  var SPECS = [
    {
      id: "control",
      name: "Arduino Nano (Type-C)",
      part: "ATmega328P",
      category: "Electronics",
      photo: "Ardiuno",
      hotspot: { x: 300, y: 505 },
      rows: [["Microcontroller", "ATmega328P"], ["Logic level", "5 V"], ["Clock", "16 MHz"], ["I/O", "14 digital, 8 analog"]],
      role: "Runs the PID loop, obstacle logic and the pluck sequence."
    },
    {
      id: "driver",
      name: "TB6612FNG motor driver",
      part: "TB6612FNG",
      category: "Electronics",
      photo: "Motor driver",
      hotspot: { x: 300, y: 631 },
      rows: [["Channels", "2 (dual)"], ["Continuous current", "1.2 A per channel"], ["Control", "PWM speed + direction"]],
      role: "Turns controller signals into wheel speed and direction."
    },
    {
      id: "ir",
      name: "8-channel IR line array",
      part: "8-ch reflectance",
      category: "Sensors",
      photo: "IR Sensor",
      hotspot: { x: 300, y: 672 },
      rows: [["Sensors", "8 reflectance"], ["Output", "Analog"], ["Update rate", "about 100 Hz"]],
      role: "Reads the guide line so the bot stays centred on the row."
    },
    {
      id: "obstacle",
      name: "IR proximity module",
      part: "IR proximity",
      category: "Sensors",
      photo: "obstacle",
      hotspot: { x: 385, y: 630 },
      rows: [["Type", "IR emitter and receiver"], ["Output", "Digital"], ["Range", "adjustable (about 2 to 30 cm)"]],
      role: "Detects anything in the path so the bot halts or reroutes."
    },
    {
      id: "battery",
      name: "Li-Po battery, 1000 mAh",
      part: "Li-Po 1S · 1000 mAh",
      category: "Power",
      photo: "Li-po battery",
      hotspot: { x: 300, y: 565 },
      rows: [["Capacity", "1000 mAh"], ["Discharge", "25C"], ["Type", "rechargeable"]],
      role: "Powers motors, sensors and controller."
    },
    {
      id: "motors",
      name: "N20 gear motors x2",
      part: "N20 · 2 pcs",
      category: "Mechanical",
      photo: "Motor",
      hotspot: { x: 150, y: 640 },
      rows: [["Type", "N20 geared DC"], ["Speed", "about 2000 RPM"], ["Quantity", "2"]],
      role: "Differential drive for precise turns between rows."
    },
    {
      id: "gripper",
      name: "Servo gripper",
      part: "Servo · 2-finger",
      category: "Mechanical",
      photo: "servo griper",
      hotspot: { x: 70, y: 340 },
      rows: [["Actuation", "servo"], ["Fingers", "2-finger claw"], ["Action", "pluck and place"]],
      role: "Closes on ripe produce and releases it into the tray."
    },
    {
      id: "software-backend",
      name: "Backend",
      part: "Java / Spring Boot REST API",
      category: "Software",
      photo: null,
      hotspot: null,
      rows: [["Language", "Java"], ["Framework", "Spring Boot"], ["Interface", "REST API"], ["Host", "local network"]],
      role: "Serves telemetry and status to the dashboard over the local network."
    },
    {
      id: "software-control",
      name: "Control",
      part: "PID line following",
      category: "Software",
      photo: null,
      hotspot: null,
      rows: [["Method", "PID line following"], ["Loop rate", "100 Hz"], ["Output", "motor correction"]],
      role: "Computes the steering correction that keeps the bot centred on the row."
    },
    {
      id: "software-dashboard",
      name: "Dashboard",
      part: "HTML, CSS, vanilla JS",
      category: "Software",
      photo: null,
      hotspot: null,
      rows: [["Stack", "HTML, CSS, vanilla JS"], ["Data", "REST polling"], ["View", "live telemetry"]],
      role: "Renders live telemetry from the Spring Boot API."
    }
  ];

  var STATS = [
    { label: "Top speed", value: 0.5, unit: "m/s", note: "Slow on purpose for accurate plucking", max: 1 },
    { label: "Payload", value: 2, unit: "kg" },
    { label: "Runtime", value: 4, unit: "hrs", max: 8 },
    { label: "Sensors onboard", value: 6 },
    { label: "Control loop", value: 100, unit: "Hz" },
    { label: "Drive", text: "2WD differential" }
  ];

  window.AGRI_PAL_SPECS = SPECS;
  window.AGRI_PAL_STATS = STATS;

  /* Single source of truth for the Components tab photos. */
  var AGRI_PAL_COMPONENTS = [
    { name: "Arduino", file: "Ardiuno", description: "The control unit — the microcontroller brain running the line-following PID and sensor loop at 100 Hz.", chips: ["ATmega control board", "100 Hz control loop", "Runs line PID + telemetry"] },
    { name: "IR Sensor", file: "IR Sensor", description: "The line sensor array under the front bumper reads the guide line and feeds a weighted steering error.", chips: ["IR line sensor array", "Weighted analog readout", "PID steering corrections"] },
    { name: "Obstacle Sensor", file: "obstacle", description: "Ultrasonic rangefinder scans ahead and halts, reroutes or raises an alert before contact.", chips: ["Ultrasonic ranging", "Safety threshold", "Halt / reroute / alert"] },
    { name: "Motor", file: "Motor", description: "Four DC gear motors deliver torque for differential drive over uneven field rows.", chips: ["4 × DC gear motors", "Bi-directional drive", "PWM speed control"] },
    { name: "Motor Driver", file: "Motor driver", description: "Maps PWM signals to the four wheels with full bidirectional drive control.", chips: ["PWM to 4 wheels", "Bi-directional", "Drive-train control"] },
    { name: "Li-po Battery", file: "Li-po battery", description: "Rechargeable Li-ion pack with a balancing BMS feeds regulated logic rails with protection.", chips: ["Li-ion pack + BMS", "5V / 3.3V rails", "Under-voltage cutoff"] },
    { name: "Servo Gripper", file: "servo griper", description: "Servo-driven two-finger gripper reaches out, grips ripe produce and drops it into the payload tray.", chips: ["Servo two-finger gripper", "Shoulder reach + wrist", "Grip sensing"] },
    { name: "Assembled Bot", file: "Assembeled Bot", description: "The finished Agri-Pal, assembled from every part in this grid.", chips: ["Line follower", "Obstacle detection", "Plucking"] }
  ];
  window.AGRI_PAL_COMPONENTS = AGRI_PAL_COMPONENTS;

  var COMPONENT_PHOTO_EXTS = ["png", "jpg", "jpeg", "webp"];

  window.AgriPalPhotoFallback = function (img) {
    if (!img) return;
    var base = img.getAttribute("data-photo-base");
    var step = parseInt(img.getAttribute("data-photo-step") || "0", 10);
    var next = step + 1;
    if (base && next < COMPONENT_PHOTO_EXTS.length) {
      img.setAttribute("data-photo-step", String(next));
      img.src = encodeURI("assets/Components/" + base + "." + COMPONENT_PHOTO_EXTS[next]);
      return;
    }
    img.onerror = null;
    img.style.display = "none";
    if (img.parentNode) img.parentNode.classList.add("pt-tile-broken");
    if (img.__agriSettle) img.__agriSettle(false);
  };

  window.AgriPalTrackComponents = function (scope) {
    if (!scope || !scope.querySelector) return;
    var grid = scope.querySelector(".pt-components-grid");
    if (!grid || grid.__agriTracked) return;
    grid.__agriTracked = true;
    var imgs = [].slice.call(grid.querySelectorAll(".pt-tile-photo img"));
    var total = imgs.length;
    var done = 0;
    var loaded = 0;
    var failed = [];

    function report() {
      var line = "Components: " + loaded + "/" + total + " photos loaded";
      if (failed.length) line += " | failed: " + failed.join(", ");
      console.log(line);
    }

    imgs.forEach(function (img) {
      var settled = false;
      function settle(ok) {
        if (settled) return;
        settled = true;
        done++;
        if (ok) loaded++;
        else failed.push(img.getAttribute("data-component-name") || img.alt || "unknown");
        if (done === total) report();
      }
      img.__agriSettle = settle;
      img.addEventListener("load", function () { settle(img.naturalWidth > 0); });
      img.addEventListener("error", function () {
        if (img.parentNode && img.parentNode.classList.contains("pt-tile-broken")) settle(false);
      });
      if (img.complete && img.naturalWidth > 0) settle(true);
      else if (img.complete && img.parentNode && img.parentNode.classList.contains("pt-tile-broken")) settle(false);
    });
  };

  var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var RIG_BLINK_MIN = 1.8;
  var RIG_BLINK_MAX = 3.4;
  var RIG_WAVE_MIN = 5;
  var RIG_WAVE_MAX = 8;
  var RIG_WAVE_DUR = 2.1;
  var RIG_EYE_TRAVEL_X = 13;
  var RIG_EYE_TRAVEL_Y = 9;
  var RIG_REPEL_R = 72;
  var RIG_REPEL_PUSH = 30;

  /* ==========================================================================
     1 · Assembly scrub — canvas driven by scroll over 120 render frames
     ========================================================================= */
  var canvas = document.getElementById("bot-canvas");
  var stageEl = document.getElementById("asc-stage");
  var loader = document.getElementById("asc-loader");
  var caption = document.getElementById("asc-caption");
  var track = document.getElementById("asc-track");
  var frameCount = 120;
  var frames = [];
  var shown = -1;
  var ctx;

  function drawFrame(i) {
    if (!canvas || !frames[i]) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    var dpr = window.devicePixelRatio || 1;
    var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw; canvas.height = bh;
    }
    ctx = ctx || canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    var img = frames[i];
    var s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    var dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.fillStyle = "#10141a";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  function wipeLoader() {
    if (loader && !loader.classList.contains("done")) {
      loader.classList.add("done");
      setTimeout(function () { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 600);
    }
  }

/* Frames are requested with a RELATIVE path (no leading slash) so they
     resolve both from a local static server and from file://. The `after`
     callback receives the numeric frame INDEX (not the Image element), so
     callers like drawFrame can index the frames[] cache directly. */
  function ensureFrame(i, after) {
    if (frames[i]) { if (after) after(i); return; }
    if (prefersReduced) { i = frameCount - 1; if (frames[i]) { if (after) after(i); return; } }
    var url = "assets/frames/frame_" + String(i + 1).padStart(3, "0") + ".jpg";
    var img = new Image();
    img.onload = function () {
      frames[i] = img;
      if (after) after(i);
    };
    img.onerror = function () {
      frames[i] = null;
      console.error("[agripal] failed to load frame", url);
      if (shown === -1) wipeLoader();
    };
    img.src = url;
  }

  function updateScrub() {
    if (!track || !canvas) return;
    var tr = track.getBoundingClientRect();
    /* Pinned travel = tall wrapper height minus the pinned panel height. */
    var stageH = stageEl ? (stageEl.offsetHeight || window.innerHeight) : window.innerHeight;
    var total = track.offsetHeight - stageH;
    /* Pin offset from the CSS sticky `top` — progress is measured from the
       moment the panel pins, so the full 0..1 range maps onto the travel. */
    var T = stageEl ? (parseFloat(window.getComputedStyle(stageEl).top) || 0) : 0;
    var p = total > 0 ? Math.min(1, Math.max(0, (T - tr.top) / total)) : 1;
    var i = Math.min(frameCount - 1, Math.max(0, Math.round(p * (frameCount - 1))));

    if (i !== shown) {
      shown = i;
      ensureFrame(i, drawFrame);
      if (prefersReduced) return;
      ensureFrame(Math.min(frameCount - 1, i + 1));
      ensureFrame(Math.max(0, i - 1));
    }
    /* caption fades out once the build completes */
    if (caption && p > 0.985 && !caption.classList.contains("faded")) caption.classList.add("faded");
    var bar = document.querySelector(".asc-scrub i");
    if (bar) bar.style.width = (p * 100).toFixed(1) + "%";
  }

  function onScroll() {
    /* Run synchronously on every scroll event — rAF can be throttled by
       background tabs / WebViews, which left the build frame frozen before. */
    updateScrub();
    updateCapabilities();
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  window.addEventListener("load", onScroll);

  if (isHomePage) {
    setTimeout(function () {
      if (shown === -1) wipeLoader();
    }, 9000);

    /* load the first frame eagerly and hide the loader */
    ensureFrame(0, function (img) { drawFrame(0); wipeLoader(); });
    if (prefersReduced) { ensureFrame(frameCount - 1, function () { drawFrame(frameCount - 1); wipeLoader(); }); }
  }

  /* ==========================================================================
     2 · Capabilities — pinned section, labels highlight in sequence
        (Navigate → Detect → Harvest) from scroll progress through the
        200vh track.
     ========================================================================= */
  var capSection = document.getElementById("capabilities");
  var capStage = document.getElementById("cap-stage");
  var capLabels = document.querySelectorAll(".cap-label");
  var capLabelEls = [].slice.call(capLabels);
  var lastPhase = -1;

  function updateCapabilities() {
    if (!capSection || !capLabelEls.length) return;
    var tr = capSection.getBoundingClientRect();
    var vh = window.innerHeight;
    var total = capSection.offsetHeight - vh;
    /* cap-stage is pinned at top:0, so progress = how far the section has
       travelled past the viewport top, divided by the pinned travel. */
    var p = total > 0 ? Math.min(1, Math.max(0, -tr.top / total)) : 1;
    var phase = p < 1 / 3 ? 0 : p < 2 / 3 ? 1 : 2;
    capLabelEls.forEach(function (l, idx) {
      l.classList.toggle("lit", idx === phase);
    });
    if (capStage) {
      capStage.classList.remove("phase-0", "phase-1", "phase-2");
      capStage.classList.add("phase-" + phase);
    }
    if (window.AgriPalDotRobot && phase !== lastPhase) {
      window.AgriPalDotRobot.setActiveLabel(phase);
      lastPhase = phase;
    }
  }
  updateCapabilities();

  /* ==========================================================================
     3 · Hero thumbnail parallax — soft counter-drift on pointer move.
        Desktop only (fine pointer); touch and reduced-motion skip it.
        Tracks the cursor opposite the movement, a few px, layered under
        the idle float (which animates the parent .thumb-img).
     ========================================================================= */
  var hero = document.querySelector(".hero.moodboard");
  var paxFine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (hero && paxFine && !prefersReduced) {
    var thImgs = [].slice.call(hero.querySelectorAll(".thumb img"));
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width - 0.5;
      var ny = (e.clientY - r.top) / r.height - 0.5;
      var dx = (-nx * 12).toFixed(1), dy = (-ny * 8).toFixed(1);
      for (var k = 0; k < thImgs.length; k++) thImgs[k].style.transform = "translate(" + dx + "px," + dy + "px)";
    });
    hero.addEventListener("pointerleave", function () {
      for (var k = 0; k < thImgs.length; k++) thImgs[k].style.transform = "";
    });
  }

  /* ==========================================================================
     4 · Draggable telemetry wireframe
     ========================================================================= */
  var wire = document.getElementById("wire-rotate");
  if (wire) {
    var rotX = -8, rotY = 18, drag = null;
    function applyRot(animate) {
      wire.style.transition = animate ? "transform .6s " + "cubic-bezier(.22,.61,.36,1)" : "none";
      wire.style.transform = "rotateX(" + rotX + "deg) rotateY(" + rotY + "deg)";
    }
    applyRot(false);
    wire.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY };
      wire.setPointerCapture(e.pointerId);
      applyRot(false);
    });
    wire.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      rotY = Math.min(40, Math.max(-40, rotY + dx * 0.6));
      rotX = Math.min(40, Math.max(-40, rotX - dy * 0.6));
      applyRot(false);
    });
    wire.addEventListener("pointerup", function () { drag = null; applyRot(true); });
    wire.addEventListener("pointercancel", function () { drag = null; applyRot(true); });
  }

  /* ==========================================================================
     5 · Live status polling against the Spring Boot API
     ========================================================================= */
  var statusRows = document.getElementById("stat-rows");
  var valve = { battery: document.getElementById("row-battery"), mode: document.getElementById("row-mode"), obstacle: document.getElementById("row-obstacle"), plucked: document.getElementById("row-plucked") };

  function setOffline(offline) {
    if (!statusRows) return;
    var rows = statusRows.querySelectorAll(".stat-row");
    rows.forEach(function (r) { r.classList.toggle("offline", offline); });
  }

  function applyStatus(d) {
    setOffline(false);
    if (valve.battery) valve.battery.textContent = (d.battery != null ? d.battery : "—") + (typeof d.battery === "number" || (d.battery != null && /%$/.test(String(d.battery))) ? "" : "");
    if (valve.mode) valve.mode.textContent = d.mode || "Standby";
    if (valve.obstacle) valve.obstacle.textContent = d.obstacle || "None";
    if (valve.plucked) {
      var old = valve.plucked.textContent;
      valve.plucked.textContent = d.plucked != null ? d.plucked : "0";
      if (old !== valve.plucked.textContent && valve.plucked.classList) {
        valve.plucked.classList.add("tick");
        setTimeout(function () { valve.plucked.classList.remove("tick"); }, 260);
      }
    }
  }

  function pollStatus() {
    if (!statusRows) return;
    var st = null;
    try { st = localStorage.getItem("agripal_token") || sessionStorage.getItem("agripal_token"); } catch (e) {}
    if (!st) return;
    fetch((window.AGRIPAL_API_BASE || 'http://localhost:8080') + "/api/status", { cache: "no-store", headers: { "Authorization": "Bearer " + st } })
      .then(function (res) { if (!res.ok) throw new Error("bad"); return res.json(); })
      .then(applyStatus)
      .catch(function () { setOffline(true); });
  }
  pollStatus();
  window.setInterval(pollStatus, 4000);

  /* ==========================================================================
     6 · Navbar inside tab views — stays visible, dark variant over dark tabs,
     active pill, direct tab switching, hash support, tab indicator arrows.
     ========================================================================= */
  var siteNav = document.getElementById("site-nav");
  var navLinks = document.getElementById("nav-links");
  var tabKeyByHref = {
    "#components": "components",
    "#specs": "specs",
    "#live-status": "status",
    "#live": "status",
    "#simulation": "simulation"
  };

  function setNavbarOverlay(on) {
    if (!siteNav) return;
    if (on) {
      siteNav.classList.add("nav-overlay");
    } else {
      siteNav.classList.remove("nav-overlay");
    }
  }

  function setNavbarTheme(theme) {
    if (!siteNav) return;
    siteNav.setAttribute("data-theme", theme);
  }

  function setNavActive(key) {
    if (!navLinks) return;
    navLinks.querySelectorAll("a").forEach(function (a) {
      var k = a.getAttribute("data-modal");
      var active = (k === key);
      a.classList.toggle("nav-active", active);
    });
  }

  function showTabIndicator(show) {
    var ind = document.getElementById("tab-indicator");
    if (ind) ind.style.display = show ? "flex" : "none";
  }

  function updateTabIndicator(key) {
    var ind = document.getElementById("tab-indicator");
    if (!ind) return;
    var order = ["components", "specs", "status", "simulation"];
    var idx = order.indexOf(key);
    var total = order.length;
    var cur = idx >= 0 ? idx + 1 : 0;
    var prevKey = order[(idx - 1 + total) % total];
    var nextKey = order[(idx + 1) % total];
    ind.innerHTML =
      '<button class="tab-arrow" data-modal="' + prevKey + '" title="Previous tab">&#9664;</button>' +
      '<span class="tab-count">' + cur + " / " + total + "</span>" +
      '<button class="tab-arrow" data-modal="' + nextKey + '" title="Next tab">&#9654;</button>';
  }

  function switchTab(key, ev) {
    setNavbarTheme(key === "home" ? "light" : "dark");
    setNavActive(key);
    showTabIndicator(true);
    updateTabIndicator(key);
    if (window.AgriPalParticles) {
      window.AgriPalParticles.open(key, ev);
      var p = document.querySelector(".pt-page");
      if (p) p.scrollTop = 0;
    }
  }

  function returnHome() {
    closeContactView(true);
    if (window.AgriPalAuth && window.AgriPalAuth.closeAll) window.AgriPalAuth.closeAll();
    setNavbarOverlay(false);
    setNavbarTheme("light");
    setNavActive("home");
    showTabIndicator(false);
    if (navLinks) {
      navLinks.querySelectorAll("a").forEach(function (a) {
        a.classList.remove("active");
        a.removeAttribute("aria-current");
      });
      var homeLink = navLinks.querySelector('a[data-modal="home"]');
      if (homeLink) homeLink.classList.add("active");
    }
    if (window.AgriPalUI && window.AgriPalUI.closeModal) window.AgriPalUI.closeModal();
    if (window.AgriPalParticles && window.AgriPalParticles.isOpen()) {
      window.AgriPalParticles.close();
    }
    var homeMain = document.getElementById("main");
    if (homeMain) homeMain.style.display = "";
    document.body.style.overflow = "";
    document.querySelectorAll(".pt-page").forEach(function (p) { p.style.display = "none"; });
    var homeFooter = document.querySelector(".footer-site, .footer");
    if (homeFooter) homeFooter.style.display = "";
    if (window.AgriPalAuth && window.AgriPalAuth.restoreHomeSections) window.AgriPalAuth.restoreHomeSections();
    history.replaceState(null, "", location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* Clicking a tab link while inside a tab view switches directly. */
  document.addEventListener("click", function (e) {
    var trig = e.target.closest("[data-modal]");
    if (!trig) return;
    var key = trig.getAttribute("data-modal");
    if (window.AgriPalAuth && window.AgriPalAuth.closeAll) window.AgriPalAuth.closeAll();
    if (!key || !tabKeyByHref["#" + key] && key !== "home" && key !== "components" && key !== "specs" && key !== "status" && key !== "simulation") return;
    if (key === "status" || key === "simulation") {
      var gateToken = null;
      try { gateToken = localStorage.getItem("agripal_token") || sessionStorage.getItem("agripal_token"); } catch (e) {}
      if (!gateToken) {
        try { sessionStorage.setItem("agripal_returnTo", key === "status" ? "#live-status" : "#simulation"); } catch (e) {}
        location.hash = "#login";
        return;
      }
    }
    var modalKey = key;
    if (isContactOpen()) closeContactView(true);
    if (modalKey === "home") { e.__agriNavHandled = true; e.preventDefault(); e.stopPropagation(); returnHome(); return; }
    e.__agriNavHandled = true;
    e.preventDefault();
    e.stopPropagation();
    var hashMap = { components: "#components", specs: "#specs", status: "#live-status", simulation: "#simulation" };
    history.replaceState(null, "", hashMap[modalKey] || "#" + modalKey);
    setNavbarOverlay(true);
    switchTab(modalKey, e);
  }, true);

  /* Hashchange — back/forward and direct links. */
  window.addEventListener("hashchange", function () {
    var hash = location.hash;
    if (hash === "#contact") { openContactView(null, { fromHistory: true }); return; }
    if (isContactOpen()) closeContactView(true);
    if (hash === "#live-status" || hash === "#simulation") {
      var hGateToken = null;
      try { hGateToken = localStorage.getItem("agripal_token") || sessionStorage.getItem("agripal_token"); } catch (e) {}
      if (!hGateToken) {
        try { sessionStorage.setItem("agripal_returnTo", hash); } catch (e) {}
        location.hash = "#login";
        return;
      }
    }
    var key = tabKeyByHref[hash];
    if (hash === "" || hash === "#top") { returnHome(); return; }
    if (key) {
      setNavbarOverlay(true);
      switchTab(key);
    }
  });

  window.AgriPalNav = {
    setOverlay: setNavbarOverlay,
    setDark: setNavbarTheme,
    setActive: setNavActive,
    showIndicator: showTabIndicator,
    updateIndicator: updateTabIndicator,
    switchTab: switchTab,
    returnHome: returnHome
  };

  /* ==========================================================================
     6b · Contact view — light page, circular reveal, validated contact form
     ========================================================================== */
  var contactView = null;
  var contactCard = null;
  var contactSending = false;
  var CONTACT_TIMEOUT = 6000;
  var CONTACT_KEYS = ["name", "email", "subject", "message", "consent"];

  function escapeContactHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function contactFieldMarkup(id, name, label, placeholder, required, type, autocomplete) {
    return (
      '<div class="ct-field">' +
        '<label for="' + id + '">' + label + (required ? '<span class="ct-req">*</span>' : "") + "</label>" +
        '<input id="' + id + '" name="' + name + '" type="' + type + '" placeholder="' + placeholder + '"' +
          (autocomplete ? ' autocomplete="' + autocomplete + '"' : "") +
          ' aria-describedby="ct-error-' + name + '"' + (required ? ' aria-required="true"' : "") + ">" +
        '<p class="ct-error" id="ct-error-' + name + '" data-error-for="' + name + '"></p>' +
      "</div>"
    );
  }

  function contactFormMarkup() {
    return (
      '<div class="ct-card-head">' +
        '<div><h2 class="ct-card-title">Tell us what you need</h2>' +
        '<p class="ct-card-sub">Talk directly to the team that built it.</p></div>' +
        '<span class="ct-required">* Required fields</span>' +
      "</div>" +
      '<form class="ct-form" novalidate>' +
        '<div class="ct-form-grid">' +
          contactFieldMarkup("ct-name", "name", "Name", "Full name", true, "text", "name") +
          contactFieldMarkup("ct-organisation", "organisation", "College / Organisation", "Where are you from?", false, "text", "organization") +
          contactFieldMarkup("ct-email", "email", "Email", "you@email.com", true, "email", "email") +
          contactFieldMarkup("ct-subject", "subject", "Subject", "What is this about?", true, "text", null) +
        "</div>" +
        '<div class="ct-field ct-field-full">' +
          '<label for="ct-message">Message<span class="ct-req">*</span></label>' +
          '<textarea id="ct-message" name="message" placeholder="Tell us what you have in mind." minlength="10" aria-describedby="ct-error-message" aria-required="true"></textarea>' +
          '<p class="ct-error" id="ct-error-message" data-error-for="message"></p>' +
        "</div>" +
        '<label class="ct-check" for="ct-consent">' +
          '<input id="ct-consent" name="consent" type="checkbox">' +
          '<span class="ct-box" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7"/></svg></span>' +
          '<span>I agree to be contacted about this message.</span>' +
        "</label>" +
        '<p class="ct-error" id="ct-error-consent" data-error-for="consent"></p>' +
        '<div class="ct-hp" aria-hidden="true"><label>Leave this field empty<input type="text" name="contactWebsite" tabindex="-1" autocomplete="off"></label></div>' +
        '<div class="ct-notice" hidden role="alert">' +
          "<p>Our server is offline right now. You can send this through your email app instead.</p>" +
          '<a class="ct-notice-link" href="mailto:hello@agripal.xyz">Open email app</a>' +
        "</div>" +
        '<button class="ct-submit" type="submit" disabled>' +
          '<span class="ct-submit-label">Send message</span>' +
          '<span class="ct-submit-ico">' +
            '<svg class="ct-submit-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>' +
            '<span class="ct-spinner" aria-hidden="true"></span>' +
          "</span>" +
        "</button>" +
        '<p class="ct-status ct-sr" role="status" aria-live="polite"></p>' +
      "</form>"
    );
  }

  function contactSuccessMarkup(name) {
    return (
      '<div class="ct-success" role="status">' +
        '<span class="ct-success-ring" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path class="ct-check-path" d="M5 12.5l4.2 4.2L19 7"/></svg></span>' +
        '<h3 class="ct-success-title" tabindex="-1">Message sent</h3>' +
        "<p>Thanks, " + escapeContactHtml(name || "there") + ". Your message is on its way to the Agri-Pal team.</p>" +
        '<button type="button" class="ct-linkbtn" data-ct-reset>Send another message</button>' +
      "</div>"
    );
  }

  function contactFooterClone() {
    var source = document.querySelector(".footer-site") || document.querySelector(".footer");
    if (!source) return null;
    var clone = source.cloneNode(true);
    clone.querySelectorAll("[id]").forEach(function (el) { el.removeAttribute("id"); });
    clone.querySelectorAll("[data-contact]").forEach(function (a) {
      a.removeAttribute("data-contact");
      a.setAttribute("href", "mailto:hello@agripal.xyz");
    });
    return clone;
  }

  function buildContactView() {
    if (contactView) return;
    contactView = document.createElement("div");
    contactView.className = "ct-view";
    contactView.setAttribute("role", "dialog");
    contactView.setAttribute("aria-modal", "true");
    contactView.setAttribute("aria-label", "Contact Agri-Pal");
    contactView.innerHTML =
      '<div class="ct-main">' +
        '<div class="ct-blobs" aria-hidden="true"><i></i><i></i><i></i></div>' +
        '<button class="ct-back" type="button" data-ct-back aria-label="Go back">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>' +
          "<span>Back</span>" +
        "</button>" +
        '<div class="ct-hero">' +
          '<div class="ct-headline-wrap">' +
            '<h1 class="ct-headline">' +
              '<span class="ct-line">GOT AN IDEA?</span>' +
              '<span class="ct-line ct-line-two"><span class="ct-line-two-wrap">LET\'S TALK.' +
                '<span class="ct-doodle ct-underline" aria-hidden="true"><svg viewBox="0 0 220 18" fill="none" pathLength="100"><path d="M2 12c18-10 30-10 44 0s26 10 44 0 30-10 44 0 26 10 42 2" pathLength="100"/></svg></span>' +
              "</span></span>" +
            "</h1>" +
            '<span class="ct-doodle ct-curl" aria-hidden="true"><svg viewBox="0 0 110 90" fill="none" pathLength="100"><path d="M84 6c26 10 4 44-22 34C38 30 14 50 26 72c10 19 44 12 58-8" pathLength="100"/></svg></span>' +
            '<span class="ct-doodle ct-aster" aria-hidden="true"><svg viewBox="0 0 60 60" fill="none" pathLength="100"><path d="M30 3v54M3 30h54M10 10l40 40M50 10L10 50" pathLength="100"/></svg></span>' +
          "</div>" +
          '<p class="ct-sub">Questions about Agri-Pal, the build or the code? Tell us what is on your mind.</p>' +
          '<div class="ct-write">' +
            '<span class="ct-write-label">Write to</span>' +
            '<a class="ct-mail" href="mailto:hello@agripal.xyz">' +
              "<span>hello@agripal.xyz</span>" +
              '<span class="ct-mail-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg></span>' +
            "</a>" +
          "</div>" +
        "</div>" +
        '<div class="ct-card"></div>' +
      "</div>" +
      '<div class="ct-footer-slot"></div>';

    document.body.appendChild(contactView);
    var footer = contactFooterClone();
    if (footer) contactView.querySelector(".ct-footer-slot").appendChild(footer);
    contactCard = contactView.querySelector(".ct-card");
    renderContactForm();

    contactView.querySelector("[data-ct-back]").addEventListener("click", function () {
      if (history.state && history.state.contact) history.back();
      else returnHome();
    });
  }

  function contactFields() {
    return {
      form: contactCard.querySelector(".ct-form"),
      name: contactCard.querySelector("#ct-name"),
      organisation: contactCard.querySelector("#ct-organisation"),
      email: contactCard.querySelector("#ct-email"),
      subject: contactCard.querySelector("#ct-subject"),
      message: contactCard.querySelector("#ct-message"),
      consent: contactCard.querySelector("#ct-consent"),
      honeypot: contactCard.querySelector('[name="contactWebsite"]'),
      submit: contactCard.querySelector(".ct-submit"),
      label: contactCard.querySelector(".ct-submit-label"),
      status: contactCard.querySelector(".ct-status"),
      notice: contactCard.querySelector(".ct-notice"),
      noticeLink: contactCard.querySelector(".ct-notice-link")
    };
  }

  function contactEmailOk(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function contactErrorFor(key, f) {
    if (key === "name") return (f.name.value || "").trim() ? "" : "Please enter your name.";
    if (key === "email") {
      var email = (f.email.value || "").trim();
      if (!email) return "Please enter your email address.";
      return contactEmailOk(email) ? "" : "Please enter a valid email address.";
    }
    if (key === "subject") return (f.subject.value || "").trim() ? "" : "Please enter a subject.";
    if (key === "message") {
      var message = (f.message.value || "").trim();
      if (!message) return "Please write a message.";
      return message.length >= 10 ? "" : "Please add at least 10 characters.";
    }
    if (key === "consent") return f.consent.checked ? "" : "Please tick the box so we can reply.";
    return "";
  }

  function contactValidity(f) {
    var values = {};
    CONTACT_KEYS.forEach(function (key) { values[key] = !contactErrorFor(key, f); });
    return {
      values: values,
      valid: CONTACT_KEYS.every(function (key) { return values[key]; })
    };
  }

  function contactSetError(key, message) {
    if (!contactCard) return;
    var field = contactCard.querySelector("#ct-" + key);
    var error = contactCard.querySelector('[data-error-for="' + key + '"]');
    if (field) {
      field.classList.toggle("is-invalid", !!message);
      field.setAttribute("aria-invalid", message ? "true" : "false");
    }
    if (error) error.textContent = message;
  }

  function contactRefreshErrors(f, keys) {
    keys.forEach(function (key) { contactSetError(key, contactErrorFor(key, f)); });
  }

  function contactUpdateSubmit(f) {
    f.submit.disabled = contactSending || !contactValidity(f).valid;
  }

  function contactMailto(f) {
    var subject = (f.subject.value || "").trim() || "Message from the Agri-Pal website";
    var body = [
      "Name: " + (f.name.value || "").trim(),
      "College / Organisation: " + (f.organisation.value || "").trim(),
      "Email: " + (f.email.value || "").trim(),
      "Subject: " + (f.subject.value || "").trim(),
      "",
      "Message:",
      f.message.value || ""
    ].join("\n");
    return "mailto:hello@agripal.xyz?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  function contactPost(payload) {
    return new Promise(function (resolve, reject) {
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (controller) { try { controller.abort(); } catch (e) {} }
        reject(new Error("timeout"));
      }, CONTACT_TIMEOUT);
      var options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      };
      if (controller) options.signal = controller.signal;
      fetch(API_BASE + "/api/contact", options)
        .then(function (res) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (res.status === 200 || res.status === 201) resolve(res);
          else reject(new Error("HTTP " + res.status));
        })
        .catch(function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function showContactSuccess(name) {
    contactSending = false;
    contactCard.innerHTML = contactSuccessMarkup(name);
    var title = contactCard.querySelector(".ct-success-title");
    if (title) { try { title.focus({ preventScroll: true }); } catch (e) {} }
    var reset = contactCard.querySelector("[data-ct-reset]");
    if (reset) reset.addEventListener("click", renderContactForm);
  }

  function renderContactForm() {
    if (!contactCard) return;
    contactSending = false;
    contactCard.innerHTML = contactFormMarkup();
    bindContactForm();
  }

  function bindContactForm() {
    var f = contactFields();
    if (!f.form) return;

    function refresh() {
      contactUpdateSubmit(f);
    }

    ["name", "email", "subject", "message"].forEach(function (key) {
      var el = f[key];
      if (!el) return;
      el.addEventListener("blur", function () {
        contactSetError(key, contactErrorFor(key, f));
      });
      el.addEventListener("input", function () {
        var error = contactCard.querySelector('[data-error-for="' + key + '"]');
        if (error && error.textContent && !contactErrorFor(key, f)) contactSetError(key, "");
        refresh();
      });
    });

    f.consent.addEventListener("change", function () {
      contactSetError("consent", contactErrorFor("consent", f));
      refresh();
    });

    f.noticeLink.addEventListener("click", function () {
      f.noticeLink.href = contactMailto(f);
    });

    f.form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (contactSending) return;

      if (f.honeypot && f.honeypot.value.trim() !== "") {
        showContactSuccess((f.name.value || "").trim());
        return;
      }

      contactRefreshErrors(f, CONTACT_KEYS);
      var validity = contactValidity(f);
      if (!validity.valid) {
        var first = CONTACT_KEYS.filter(function (key) { return !validity.values[key]; })[0];
        f.status.textContent = "Please check the highlighted fields.";
        if (first && f[first]) f[first].focus();
        contactUpdateSubmit(f);
        return;
      }

      contactSending = true;
      f.submit.disabled = true;
      f.submit.classList.add("is-sending");
      f.label.textContent = "Sending...";
      f.status.textContent = "Sending your message...";
      f.notice.hidden = true;

      contactPost({
        name: (f.name.value || "").trim(),
        organisation: (f.organisation.value || "").trim(),
        email: (f.email.value || "").trim(),
        subject: (f.subject.value || "").trim(),
        message: f.message.value || ""
      }).then(function () {
        showContactSuccess((f.name.value || "").trim());
      }).catch(function () {
        contactSending = false;
        f.submit.classList.remove("is-sending");
        f.label.textContent = "Send message";
        contactUpdateSubmit(f);
        f.noticeLink.href = contactMailto(f);
        f.notice.hidden = false;
        f.status.textContent = "Our server is offline right now. You can send this through your email app instead.";
      });
    });

    refresh();
  }

  function isContactOpen() {
    return !!contactView && contactView.classList.contains("is-open");
  }

  function setCtaActive(on) {
    var cta = document.querySelector(".nav-cta");
    if (cta) cta.classList.toggle("cta-active", !!on);
  }

  function clearNavPageActive() {
    if (!navLinks) return;
    navLinks.querySelectorAll("a").forEach(function (a) {
      a.classList.remove("active", "nav-active");
      a.removeAttribute("aria-current");
    });
  }

  function contactOrigin(ev) {
    if (ev && typeof ev.clientX === "number" && (ev.clientX !== 0 || ev.clientY !== 0)) {
      return { x: ev.clientX, y: ev.clientY };
    }
    var trigger = ev && ev.target && ev.target.closest ? ev.target.closest("[data-contact]") : null;
    var btn = trigger || document.querySelector(".nav-cta");
    if (btn) {
      var r = btn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  function openContactView(ev, opts) {
    opts = opts || {};
    if (!contactView) buildContactView();
    if (!opts.fromHistory && location.hash !== "#contact") {
      try { history.pushState({ contact: true }, "", "#contact"); }
      catch (e) { location.hash = "#contact"; }
    }
    if (window.AgriPalParticles && window.AgriPalParticles.isOpen()) window.AgriPalParticles.close();
    if (window.AgriPalUI && window.AgriPalUI.closeModal) window.AgriPalUI.closeModal();
    setNavbarOverlay(true);
    setNavbarTheme("dark");
    setNavActive(null);
    clearNavPageActive();
    showTabIndicator(false);
    setCtaActive(true);
    document.body.style.overflow = "hidden";
    contactView.scrollTop = 0;

    if (!isContactOpen()) {
      var origin = contactOrigin(ev);
      var radius = Math.hypot(window.innerWidth, window.innerHeight) * 1.15;
      contactView.style.setProperty("--c0", "circle(0px at " + origin.x + "px " + origin.y + "px)");
      contactView.style.setProperty("--c1", "circle(" + radius + "px at " + origin.x + "px " + origin.y + "px)");
      contactView.classList.remove("is-closing");
      void contactView.offsetWidth;
      contactView.classList.add("is-open");
      requestAnimationFrame(function () { contactView.scrollTop = 0; });
    }
  }

  function closeContactView(immediate) {
    if (!contactView) return;
    var wasOpen = contactView.classList.contains("is-open");
    contactView.classList.remove("is-open");
    setCtaActive(false);
    if (!wasOpen) return;
    if (immediate) {
      contactView.classList.remove("is-closing");
      document.body.style.overflow = "";
      return;
    }
    contactView.classList.add("is-closing");
    setTimeout(function () {
      contactView.classList.remove("is-closing");
      document.body.style.overflow = "";
    }, 660);
  }

  document.addEventListener("click", function (e) {
    var trig = e.target.closest("[data-contact]");
    if (!trig) return;
    if (trig.closest(".ct-view")) return;
    e.preventDefault();
    e.stopPropagation();
    openContactView(e);
  }, true);

  window.addEventListener("popstate", function () {
    if (location.hash === "#contact") openContactView(null, { fromHistory: true });
    else if (isContactOpen()) closeContactView(true);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !isContactOpen()) return;
    if (history.state && history.state.contact) history.back();
    else returnHome();
  });


  /* ==========================================================================
     7 · Dot-built robot — Navigate / Detect / Harvest section (Canvas 2D)
     The renderer lives in dotrobot.js so the Specs panel uses the exact same
     dot robot (same particles, size and colours) without sharing state.
     ========================================================================== */
  (function () {
    "use strict";

    var panel = document.getElementById("robot-panel");
    var canvas = document.getElementById("dot-robot");
    if (!panel || !canvas || !window.createDotRobot) return;

    var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.AgriPalDotRobot = window.createDotRobot(canvas, {
      panel: panel,
      assemble: true,
      bandSweep: true,
      repel: true,
      wave: true,
      clickWave: true,
      bloom: true,
      reducedMotion: prefersReduced,
      debug: location.hash.indexOf("debug") !== -1
    });
  })();


  (function () {
    function initHash() {
      var hash = location.hash;
      if (hash === "#contact") {
        openContactView(null, { fromHistory: true });
        return;
      }
      if (hash) {
        var key = tabKeyByHref[hash];
        if (key) {
          setNavbarOverlay(true);
          switchTab(key);
        }
      }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHash);
    else initHash();
  })();

})();

