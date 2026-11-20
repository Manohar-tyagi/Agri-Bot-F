(function () {
  "use strict";

  var API_URL = "http://localhost:8080/api/status";
  var MODE_VALUES = {
    LINE_FOLLOWING: "Driving",
    AVOIDING_OBSTACLE: "Blocked",
    PLUCKING: "Picking",
    IDLE: "Waiting"
  };
  var MODE_NOTES = {
    LINE_FOLLOWING: "Following the crop row",
    AVOIDING_OBSTACLE: "Something in the way",
    PLUCKING: "Picking produce",
    IDLE: "Not moving yet"
  };

  var BATTERY_FULL_HOURS = 4;
  var ROW_TOTAL = 12;

  var ICONS = {
    battery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="8" width="17" height="9" rx="2"/><path d="M21 11v3"/></svg>',
    mode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    obstacle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 9v5M12 17v.5"/></svg>',
    plucked: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16"/><path d="M6 20V8l4-4h4l4 4v12"/></svg>',
    position: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  function dashboardMarkup() {
    return (
      '<div class="glass-card dashboard bento">' +
        '<div class="bento-header">' +
          '<div><span class="bento-kicker">LIVE TELEMETRY</span><h3 class="bento-title">Bot Status &amp; Field Feed</h3></div>' +
          '<div class="bento-header-right">' +
            '<span class="mode-pill" data-dash-mode-pill>&#9679; Driving &middot; Following the crop row</span>' +
            '<span class="status-pill"><span class="pill-light offline" data-dash-pill id="live-conn-pill"><span class="status-dot"></span><span data-dash-conn>Offline</span></span></span>' +
            '<button class="btn btn-ghost btn-sm" type="button" data-dash-refresh>Refresh</button>' +
          '</div>' +
        '</div>' +
        '<div class="bento-row1">' +
          '<div class="bento-card bento-battery">' +
            '<div class="bento-card-head">Battery &amp; Power <span class="batt-pill" id="batt-pill" data-dash-batt-pill>Healthy</span></div>' +
            '<div class="ring-wrap"><svg class="ring" viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="52"/><circle class="ring-fill" data-dash-ring cx="60" cy="60" r="52"/></svg><span class="ring-val" id="stat-battery" data-dash-battery>78%</span></div>' +
            '<div class="bento-meta" id="stat-battery-note" data-dash-battery-note>~3.1 hours left &middot; Healthy</div>' +
          '</div>' +
          '<div class="bento-card bento-rowtrack">' +
            '<div class="bento-card-head">Navigation &amp; Row</div>' +
            '<div class="rowtrack-top"><span class="rowtrack-val" id="stat-row" data-dash-position>Row 3 of 12</span><span class="rowtrack-pct">25% of field covered</span></div>' +
            '<div class="rowtrack-bars" id="rowtrack-bars"></div>' +
            '<div class="bento-meta" data-dash-position-note>of 12 rows</div>' +
          '</div>' +
        '</div>' +
        '<div class="bento-row2">' +
          '<div class="bento-card">' +
            '<div class="bento-card-head">Harvest &amp; Proximity</div>' +
            '<div class="harvest-split">' +
              '<div class="harvest-col">' +
                '<div class="harvest-label">ITEMS PLUCKED</div>' +
                '<div class="bento-big" id="stat-plucked" data-dash-plucked>14</div>' +
                '<div class="bento-sub">Harvested this session</div>' +
              '</div>' +
              '<div class="harvest-divider"></div>' +
              '<div class="harvest-col">' +
                '<div class="harvest-label">LAST OBSTACLE</div>' +
                '<div class="bento-big" id="stat-obstacle" data-dash-obstacle>24 cm</div>' +
                '<div class="prox-bar"><div class="prox-fill" data-dash-prox></div></div>' +
                '<div class="bento-meta" data-dash-obstacle-note>Seen at 1:40 am</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="bento-card bento-subsys">' +
            '<div class="bento-card-head">Subsystems &amp; Bot Health <span class="subsys-pill" id="subsys-pill" data-dash-subsys-pill>Nominal</span></div>' +
            '<div class="subsys-list">' +
              '<div class="subsys-row"><span class="subsys-key">Bot Unit</span><span class="subsys-val" id="subsys-bot" data-dash-subsys-bot>AGRI-DEMO-0001</span></div>' +
              '<div class="subsys-row"><span class="subsys-key">Drive &amp; Steering</span><span class="subsys-val" id="subsys-drive" data-dash-subsys-drive>Active · Row 3</span></div>' +
              '<div class="subsys-row"><span class="subsys-key">Harvester Arm</span><span class="subsys-val" id="subsys-arm" data-dash-subsys-arm>Ready · 14 plucked</span></div>' +
              '<div class="subsys-row"><span class="subsys-key">Proximity Array</span><span class="subsys-val" id="subsys-prox" data-dash-subsys-prox>Clear (24 cm)</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="dash-empty" data-dash-empty hidden>' +
          '<p class="dash-empty-title">Waiting for your bot to connect</p>' +
          '<p class="dash-empty-text">Start the Java backend to see live data.</p>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---- outer cream contour canvas animator ---- */
  function mountCreamContour() {
    try {
      var mount = document.querySelector(".live-dash");
      if (!mount) return;
      var outer = mount.parentElement;
      while (outer && !/pt-rows/.test(outer.className || "")) outer = outer.parentElement;
      if (!outer) outer = mount.parentElement;
      if (!outer || outer.__creamContour) return;
      outer.__creamContour = true;
      outer.style.position = "relative";
      outer.style.overflow = "hidden";
      var canvas = document.createElement("canvas");
      canvas.className = "telemetry-contour-canvas";
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;";
      outer.insertBefore(canvas, outer.firstChild);
      var ctx = canvas.getContext("2d");
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = 0, H = 0, raf = 0, visible = true, t = 0, last = 0;
      function size() {
        var r = outer.getBoundingClientRect();
        W = Math.max(1, Math.round(Math.max(r.width, window.innerWidth)));
        H = Math.max(1, Math.round(r.height));
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      }
      function draw(now) {
        if (!visible) { raf = requestAnimationFrame(draw); return; }
        if (now - last < 1000 / 30) { raf = requestAnimationFrame(draw); return; }
        last = now; t += 0.008;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        var curves = 11;
        for (var i = 0; i < curves; i++) {
          var baseY = (H / (curves + 1)) * (i + 1);
          var amp = 40 + i * 6;
          var freq = 0.0025 + i * 0.0006;
          var phase = t * (0.35 + i * 0.04) + i * 1.3;
          var accent = (i === 2 || i === 5 || i === 8);
          ctx.strokeStyle = accent ? "rgba(22,163,74,0.16)" : "rgba(18,30,22,0.15)";
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          for (var x = 0; x <= W; x += 4) {
            var y = baseY + Math.sin(x * freq + phase) * amp + Math.cos(x * freq * 1.7 - phase * 0.6) * (amp * 0.4);
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        raf = requestAnimationFrame(draw);
      }
      size();
      var ro = new ResizeObserver(function () { size(); });
      ro.observe(outer);
      var io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0 });
      io.observe(outer);
      raf = requestAnimationFrame(draw);
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountCreamContour);
  else setTimeout(mountCreamContour, 0);

  window.renderLiveDashboard = function (container) {
    if (!container) return null;
    if (container.__liveDashboard) return container.__liveDashboard;

    container.classList.add("live-dashboard", "live-dash");
    container.innerHTML = dashboardMarkup();

    var q = function (selector) { return container.querySelector(selector); };
    var pill = q("[data-dash-pill]");
    var conn = q("[data-dash-conn]");
    var batteryEl = q("[data-dash-battery]");
    var batteryFill = q("[data-dash-battery-fill]");
    var batteryNoteEl = q("[data-dash-battery-note]");
    var modeEl = q("[data-dash-mode]");
    var modeNoteEl = q("[data-dash-mode-note]");
    var obstacleEl = q("[data-dash-obstacle]");
    var obstacleNoteEl = q("[data-dash-obstacle-note]");
    var pluckedEl = q("[data-dash-plucked]");
    var positionEl = q("[data-dash-position]");
    var positionNoteEl = q("[data-dash-position-note]");
    var emptyState = q("[data-dash-empty]");
    var dashGrid = q(".dash-grid");

    var isOnline = false;
    var userChoseLive = false;
    var isEmpty = false;

    var visible = false;
    var liveTimer = null;

    function setWaitingState() {
      [batteryEl, modeEl, obstacleEl, pluckedEl, positionEl].forEach(function (el) {
        if (!el) return;
        el.textContent = "Waiting for the bot...";
        el.classList.add("is-waiting");
      });
      if (batteryFill) batteryFill.style.width = "0%";
      if (batteryNoteEl) batteryNoteEl.textContent = "";
      if (modeNoteEl) modeNoteEl.textContent = "";
      if (obstacleNoteEl) obstacleNoteEl.textContent = "";
      if (positionNoteEl) positionNoteEl.textContent = "";
    }

    function renderDashboard(data) {
      if (!data) return;
      var battery = Math.max(0, Math.min(100, data.batteryPercent != null ? data.batteryPercent : 0));

      [batteryEl, modeEl, obstacleEl, pluckedEl, positionEl].forEach(function (el) {
        if (el) el.classList.remove("is-waiting");
      });

      if (batteryEl) batteryEl.textContent = battery + "%";
      if (batteryFill) {
        batteryFill.style.width = battery + "%";
        batteryFill.classList.remove("is-low", "is-critical");
        if (battery < 20) batteryFill.classList.add("is-critical");
        else if (battery < 50) batteryFill.classList.add("is-low");
      }
      if (batteryNoteEl) {
        var hours = (battery / 100) * BATTERY_FULL_HOURS;
        var note = "About " + hours.toFixed(1) + " hours left";
        if (battery < 20) note += " \u00b7 Very low";
        else if (battery < 50) note += " \u00b7 Low";
        batteryNoteEl.textContent = note;
      }
      var battPill = q("[data-dash-batt-pill]");
      if (battPill) {
        if (battery <= 30) { battPill.textContent = "Low"; battPill.className = "batt-pill low"; }
        else { battPill.textContent = "Healthy"; battPill.className = "batt-pill healthy"; }
      }

      if (modeEl) {
        var modeText = MODE_VALUES[data.mode] || "Waiting";
        modeEl.innerHTML = '<span class="mode-dot" aria-hidden="true"></span> ' + modeText;
      }
      if (modeNoteEl) {
        modeNoteEl.textContent = MODE_NOTES[data.mode] || "Not moving yet";
      }

      if (data.lastObstacle && data.lastObstacle.detected) {
        var dist = data.lastObstacle.distanceCm;
        var timeStr = "";
        var t = data.lastObstacle.timestamp;
        if (t) {
          try { timeStr = new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase(); }
          catch (e) { timeStr = t; }
        }
        if (obstacleEl) obstacleEl.textContent = dist + " cm";
        if (obstacleNoteEl) obstacleNoteEl.textContent = "away, seen at " + (timeStr || "—");
      } else {
        if (obstacleEl) obstacleEl.textContent = "None";
        if (obstacleNoteEl) obstacleNoteEl.textContent = "so far";
      }

      if (pluckedEl) pluckedEl.textContent = data.itemsPlucked != null ? data.itemsPlucked : "\u2014";

      if (positionEl) {
        if (data.positionOnRow != null) positionEl.textContent = "Row " + data.positionOnRow;
        else positionEl.textContent = "\u2014";
      }
      if (positionNoteEl) {
        if (data.positionOnRow != null) positionNoteEl.textContent = "of " + ROW_TOTAL + " rows";
        else positionNoteEl.textContent = "";
      }
      // row track bars
      var bars = q("#rowtrack-bars");
      if (bars) {
        var cur = data.positionOnRow != null ? data.positionOnRow : 0;
        var html = "";
        for (var i = 1; i <= ROW_TOTAL; i++) {
          var cls = i < cur ? "done" : (i === cur ? "active" : "");
          html += "<div class=\"rowbar-col\"><span class=\"rowbar " + cls + "\"></span><span class=\"rowbar-num\">" + i + "</span></div>";
        }
        bars.innerHTML = html;
        bars.classList.add("rowtrack-bars-wrap");
      }
      // proximity bar color
      var prox = q("[data-dash-prox]");
      if (prox && data.lastObstacle && data.lastObstacle.detected) {
        var d = data.lastObstacle.distanceCm;
        var pct = Math.min(100, Math.max(0, (d / 60) * 100));
        prox.style.width = pct + "%";
        prox.style.background = d < 15 ? "#dc2626" : (d <= 30 ? "#d97706" : "#14a35c");
      } else if (prox) {
        prox.style.width = "0%";
      }
      // ring gauge
      var ring = q("[data-dash-ring]");
      if (ring) {
        var off = 327 - (327 * (battery / 100));
        ring.style.strokeDashoffset = off;
      }
    }

    function setPillLive() {
      if (pill) pill.className = "pill-light online";
      if (conn) conn.textContent = "Online";
    }
    function setPillOffline() {
      if (pill) pill.className = "pill-light offline";
      if (conn) conn.textContent = "Offline";
    }

    function onLiveSuccess(data) {
      isOnline = true;
      isEmpty = false;
      userChoseLive = userChoseLive; // keep
      setPillLive();
      if (dashGrid) dashGrid.classList.remove("is-empty");
      if (emptyState) emptyState.hidden = true;
      renderDashboard(data);
      var botCode = "AGRI-DEMO-0001";
      try { var t = localStorage.getItem("agripal_token") || sessionStorage.getItem("agripal_token"); } catch (e) {}
      // bot code from auth-gate user if available
      if (window.AgriPalAuth && window.AgriPalAuth.user && window.AgriPalAuth.user.botCode) botCode = window.AgriPalAuth.user.botCode;
      var subsysBot = q("[data-dash-subsys-bot]");
      if (subsysBot) subsysBot.textContent = botCode;
      var subsysDrive = q("[data-dash-subsys-drive]");
      if (subsysDrive) {
        var mode = data.mode;
        if (mode === "IDLE") subsysDrive.textContent = "Standby";
        else subsysDrive.textContent = "Active \u00b7 Row " + (data.positionOnRow != null ? data.positionOnRow : "--");
      }
      var subsysArm = q("[data-dash-subsys-arm]");
      if (subsysArm) subsysArm.textContent = "Ready \u00b7 " + (data.itemsPlucked != null ? data.itemsPlucked : 0) + " plucked";
      var subsysProx = q("[data-dash-subsys-prox]");
      if (subsysProx) {
        var d = (data.lastObstacle && data.lastObstacle.detected) ? data.lastObstacle.distanceCm : null;
        if (d == null) subsysProx.textContent = "--";
        else if (d >= 30) subsysProx.textContent = "Clear (" + d + " cm)";
        else subsysProx.textContent = "Caution (" + d + " cm)";
      }
      var subsysPill = q("[data-dash-subsys-pill]");
      if (subsysPill) {
        var d2 = (data.lastObstacle && data.lastObstacle.detected) ? data.lastObstacle.distanceCm : 999;
        if (d2 >= 30) { subsysPill.textContent = "Nominal"; subsysPill.className = "subsys-pill nominal"; }
        else { subsysPill.textContent = "Caution"; subsysPill.className = "subsys-pill caution"; }
      }
      var sync = q("[data-dash-sync]");
      if (sync) sync.textContent = "Synced just now \u00b7 200 OK";
      window.dispatchEvent(new CustomEvent('agripal:reading', {detail: {mode: (data.mode === 'LINE_FOLLOWING' ? 'driving' : data.mode === 'AVOIDING_OBSTACLE' ? 'blocked' : data.mode === 'PLUCKING' ? 'picking' : 'idle'), row: (data.positionOnRow != null ? data.positionOnRow : 1), rows: ROW_TOTAL, batteryPct: Math.max(0, Math.min(100, data.batteryPercent != null ? data.batteryPercent : 0)), demo: false}}));
    }

    function showEmptyState() {
      isEmpty = true;
      isOnline = false;
      setPillOffline();
      setWaitingState();
      if (dashGrid) dashGrid.classList.add("is-empty");
      if (emptyState) emptyState.hidden = false;
      var subsysBot = q("[data-dash-subsys-bot]");
      if (subsysBot) subsysBot.textContent = "--";
      var subsysDrive = q("[data-dash-subsys-drive]");
      if (subsysDrive) subsysDrive.textContent = "--";
      var subsysArm = q("[data-dash-subsys-arm]");
      if (subsysArm) subsysArm.textContent = "--";
      var subsysProx = q("[data-dash-subsys-prox]");
      if (subsysProx) subsysProx.textContent = "--";
      var subsysPill = q("[data-dash-subsys-pill]");
      if (subsysPill) { subsysPill.textContent = "Offline"; subsysPill.className = "subsys-pill offline"; }
      var battPill = q("[data-dash-batt-pill]");
      if (battPill) { battPill.textContent = "Offline"; battPill.className = "batt-pill offline"; }
      var sync = q("[data-dash-sync]");
      if (sync) sync.textContent = "Offline \u00b7 Cannot reach server";
      stopAll();
    }

    function pollStatus() {
      if (!visible || isEmpty) return;
      fetch(API_URL, { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!visible || isEmpty) return;
          onLiveSuccess(data);
        })
        .catch(function () {
          if (!visible) return;
          showEmptyState();
        });
    }

    function startLivePolling() {
      if (liveTimer) return;
      pollStatus();
      liveTimer = window.setInterval(pollStatus, 5000);
    }

    function stopLivePolling() {
      if (liveTimer) { window.clearInterval(liveTimer); liveTimer = null; }
    }

    function stopAll() {
      stopLivePolling();
    }


    function start() {
      if (visible) return api;
      visible = true;
      userChoseLive = false;
      isEmpty = false;
      if (dashGrid) dashGrid.classList.remove("is-empty");
      if (emptyState) emptyState.hidden = true;
      setPillOffline();
      startLivePolling();
      return api;
    }

    function stop() {
      visible = false;
      stopAll();
      return api;
    }

    function destroy() {
      stopAll();
      visible = false;
      if (container.__liveDashboard === api) container.__liveDashboard = null;
      if (container.classList) {
        container.classList.remove("live-dashboard");
        container.classList.remove("live-dash");
      }
      container.innerHTML = "";
      return api;
    }

    var api = {
      start: start,
      stop: stop,
      destroy: destroy,
      render: renderDashboard,
      refresh: pollStatus,
      container: container
    };

    container.__liveDashboard = api;
    return api;
  };
})();
