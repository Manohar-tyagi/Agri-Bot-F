/* ---------- dotrobot.js : one reusable dot-robot renderer ----------
   createDotRobot(canvas, options) is shared by the Navigate / Detect /
   Harvest panel and by the Specs "Explore the bot" panel. Every instance
   owns its particles, rig, timers and listeners, so two robots can live on
   the page without sharing state.

   Useful options:
     panel            element that defines the visible box (defaults to canvas parent)
     assemble         animate the particles into the robot on first view (default true)
     bandSweep        ambient highlight band (default true)
     repel            cursor repulsion bubble (default true)
     wave             random waving / greeting (default true)
     clickWave        clicking the panel triggers a wave (default true)
     bloom            soft glow pass (default true)
     counts           { desktop, mobile } particle targets
     onResize         called after every resize (good for hotspot placement)
     onReady          called once the robot is built
   -------------------------------------------------------------------- */
(function (global) {
  "use strict";

  function createDotRobot(canvas, options) {
    options = options || {};

    var panel = options.panel || (canvas && canvas.parentElement);
    if (!canvas || !panel) return null;

    var DW = 600, DH = 750;

    var prefersReduced = options.reducedMotion != null
      ? !!options.reducedMotion
      : (global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);

    var DEBUG = options.debug != null ? !!options.debug : (global.location.hash.indexOf("debug") !== -1);
    var COUNTS = options.counts || { desktop: 6000, mobile: 3200 };
    var DOT_R_MIN = 2.3, DOT_R_MAX = 3.1;

    /* botshape.js / botrig.js declare globals at script level. The rig is a
       class, so it lives in the global lexical environment rather than on
       window — resolve both forms so this file works on every page. */
    var makeParticles = typeof buildParticles === "function" ? buildParticles : global.buildParticles;
    var RigCtor = typeof BotRig === "function" ? BotRig : global.BotRig;

    var C_DARK = "rgb(30,160,100)";
    var C_MID = "rgb(61,220,132)";
    var C_BRIGHT = "rgb(215,255,235)";

    var ctx = null;
    var dpr = 1, W = 0, H = 0;
    var scale = 1, offX = 0, offY = 0;

    var particles = [];
    var numPts = 0;
    var rig = null;
    var assembled = false, asmRunning = false, asmStart = 0;
    var panelVisible = false;

    var running = false, rafId = 0, destroyed = false;
    var frameCount = 0, frameTime = 0, avgFrameTime = 0;
    var stride = 1;

    var cursorClientX = null, cursorClientY = null;
    var bandPeriod = 7000;

    var sprites = {};
    var bloomCanvas = null;
    var pulseState = null;

    var dbgLine = null;
    var io = null, ro = null;

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function bandFor(lum) { return lum < 0.35 ? 0 : lum < 0.7 ? 1 : 2; }
    function colorFor(band) { return band === 0 ? C_DARK : band === 1 ? C_MID : C_BRIGHT; }

    function toDevX(x) { return (offX + x * scale) * dpr; }
    function toDevY(y) { return (offY + y * scale) * dpr; }

    function resize() {
      if (!panel) return false;
      var b = panel.getBoundingClientRect();
      var w = Math.round(b.width), h = Math.round(b.height);
      if (w === 0 || h === 0) return false;
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      W = w; H = h;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      scale = Math.min(W / DW, H / DH) * 0.94;
      offX = (W - DW * scale) / 2;
      offY = (H - DH * scale) / 2;
      buildSprites();
      if (bloomCanvas) {
        bloomCanvas.width = Math.max(1, Math.round(W * dpr / 4));
        bloomCanvas.height = Math.max(1, Math.round(H * dpr / 4));
      }
      if (typeof options.onResize === "function") options.onResize(toScreen);
      return true;
    }

    function buildSprites() {
      sprites = {};
      var sizes = [1, 1.6, 2.2, 2.8];
      [0, 1, 2].forEach(function (band) {
        sprites[band] = [];
        sizes.forEach(function (r) {
          var devR = Math.max(1, Math.round(r * dpr));
          var d = devR * 2 + 6;
          var c = document.createElement("canvas");
          c.width = d; c.height = d;
          var g = c.getContext("2d");
          var grad = g.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, devR);
          grad.addColorStop(0, colorFor(band));
          grad.addColorStop(0.45, colorFor(band));
          grad.addColorStop(1, "transparent");
          g.fillStyle = grad;
          g.fillRect(0, 0, d, d);
          sprites[band].push({ c: c, cssR: r });
        });
      });
    }

    function radiusIndexFor(lum) {
      var r = DOT_R_MIN + (DOT_R_MAX - DOT_R_MIN) * lum;
      var panelFactor = Math.min(1, W / 600);
      r *= (0.85 + 0.3 * panelFactor);
      return r < 2.45 ? 0 : r < 2.85 ? 1 : r < 3.35 ? 2 : 3;
    }

    function spriteFor(lum, bright) {
      var band = bright ? 2 : bandFor(lum);
      var idx = radiusIndexFor(lum);
      if (idx < 0) idx = 0; if (idx > 3) idx = 3;
      return sprites[band][idx];
    }

    function buildParticlesAndSprites() {
      var count = W < 700 ? COUNTS.mobile : COUNTS.desktop;
      var list = makeParticles(count);
      numPts = list.length;
      rig = new RigCtor(list);
      rig.cfg.blinkMin = 1.8;
      rig.cfg.blinkMax = 3.4;
      rig.cfg.wave = options.wave !== false;
      rig.cfg.waveMin = 5;
      rig.cfg.waveMax = 8;
      rig.cfg.waveDur = 2.1;
      rig.cfg.eyeTravelX = 13;
      rig.cfg.eyeTravelY = 9;
      rig.cfg.repelR = 72;
      rig.cfg.repelPush = (options.repel === false || prefersReduced) ? 0 : 30;
      rig.nextWave = rig.cfg.wave ? 0.8 : Infinity;
      particles = [];
      for (var i = 0; i < numPts; i++) {
        var p = list[i];
        particles.push({
          homeX: toDevX(p.x), homeY: toDevY(p.y),
          sx: Math.random() * (W * dpr), sy: Math.random() * (H * dpr),
          lum: p.lum, region: p.region,
          band: bandFor(p.lum),
          phaseX: Math.random() * Math.PI * 2, phaseY: Math.random() * Math.PI * 2,
          alphaBase: 0.9 + p.lum * 0.1,
          asmDelay: 0, asmDur: 700
        });
      }
      /* stagger: wheels first, head/eyes last */
      var order = { 1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 5, 9: 6, 10: 7, 8: 8, 0: 9 };
      var maxOrder = 9;
      var asmTotal = 1400;
      for (var k = 0; k < numPts; k++) {
        var pt = particles[k];
        var o = order[pt.region] != null ? order[pt.region] : 5;
        pt.asmDelay = (o / maxOrder) * asmTotal * 0.75;
      }
      if (options.assemble === false) {
        assembled = true;
        asmRunning = false;
      }
      if (DEBUG) showDebug();
    }

    function startAssemble() {
      if (options.assemble === false || asmRunning || assembled) return;
      asmRunning = true;
      asmStart = performance.now();
      assembled = false;
    }

    function finishAssemble() {
      assembled = true;
      asmRunning = false;
      if (rig) rig.nextWave = rig.cfg.wave ? 0.8 : Infinity;
    }

    function updateVisibility() {
      var vis = panelVisible && !document.hidden && !destroyed;
      if (vis && !running) {
        running = true;
        rafId = requestAnimationFrame(loop);
      } else if (!vis && running) {
        running = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      }
    }

    function loop(now) {
      if (!running) return;
      tick(now);
      rafId = requestAnimationFrame(loop);
    }

    function tick(now) {
      if (!ctx) return;
      var dt = Math.min((now - (tick.last || now)) / 1000, 1 / 30);
      tick.last = now;

      frameCount++;
      frameTime += dt * 1000;
      if (frameCount >= 60) {
        avgFrameTime = frameTime / 60;
        frameCount = 0; frameTime = 0;
        stride = avgFrameTime > 20 ? 2 : 1;
        if (DEBUG) updateDebug();
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W * dpr, H * dpr);

      /* radial green glow centred on the chest (very soft, behind robot) */
      var gcx = toDevX(300), gcy = toDevY(495), grad = Math.max(W, H) * dpr * 0.5;
      var ggrad = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, grad);
      ggrad.addColorStop(0, "rgba(61,220,132,0.06)");
      ggrad.addColorStop(1, "rgba(61,220,132,0)");
      ctx.fillStyle = ggrad;
      ctx.fillRect(gcx - grad, gcy - grad, grad * 2, grad * 2);

      var cursor = null, inside = false;
      if (cursorClientX !== null) {
        var pr = panel.getBoundingClientRect();
        inside = cursorClientX >= pr.left && cursorClientX <= pr.right && cursorClientY >= pr.top && cursorClientY <= pr.bottom;
        cursor = {
          x: (cursorClientX - pr.left - offX) / scale,
          y: (cursorClientY - pr.top - offY) / scale
        };
      }
      var rigCursor = prefersReduced ? { x: 300, y: 262 } : cursor;
      var rigInside = prefersReduced ? false : (inside && !asmRunning);
      if (rig) rig.update(dt, rigCursor, rigInside);

      /* optional ambient highlight band */
      var bandY = -1e9;
      var bandWidth = 45 * scale * dpr;
      if (options.bandSweep !== false && !prefersReduced) {
        var bandPhase = (now % bandPeriod) / bandPeriod;
        bandY = toDevY(60 + bandPhase * 640);
      }

      /* one-shot local brightening around a hotspot, in design coords */
      var pulseStrength = 0;
      if (pulseState) {
        var pt = (now - pulseState.start) / pulseState.dur;
        if (pt >= 1) pulseState = null;
        else pulseStrength = 1 - pt;
      }

      ctx.globalCompositeOperation = "lighter";

      for (var i = 0; i < numPts; i += stride) {
        var p = particles[i];
        var targetX = p.homeX, targetY = p.homeY;
        if (rig) {
          targetX = toDevX(rig.x[i] + rig.ox[i]);
          targetY = toDevY(rig.y[i] + rig.oy[i]);
        }
        var ax, ay;

        if (asmRunning) {
          var t0 = p.asmDelay, t1 = t0 + p.asmDur;
          if (now < asmStart + t0) { ax = p.sx; ay = p.sy; }
          else if (now >= asmStart + t1) { ax = targetX; ay = targetY; }
          else {
            var tt = easeOutCubic((now - asmStart - t0) / p.asmDur);
            ax = p.sx + (targetX - p.sx) * tt;
            ay = p.sy + (targetY - p.sy) * tt;
          }
        } else {
          ax = targetX; ay = targetY;
          if (!prefersReduced) {
            ax += Math.sin(now * 0.0015 + p.phaseX) * 0.8 * dpr;
            ay += Math.cos(now * 0.0015 + p.phaseY) * 0.8 * dpr;
          }
        }

        var boost = 1;
        var dist = Math.abs(ay - bandY);
        if (dist < bandWidth) boost = 1 + 0.6 * (1 - dist / bandWidth);

        var nearPulse = false;
        if (pulseStrength > 0 && rig) {
          var pdx = rig.x[i] - pulseState.designX;
          var pdy = rig.y[i] - pulseState.designY;
          var pd = Math.hypot(pdx, pdy);
          if (pd < 55) {
            nearPulse = true;
            boost += (1 - pd / 55) * pulseStrength * 1.6;
          }
        }

        var alpha = p.alphaBase * boost;
        if (nearPulse) alpha *= 1 + 0.35 * pulseStrength;

        var sp = spriteFor(p.lum, nearPulse);
        var rDev = sp.cssR * dpr * (nearPulse ? 1 + 0.15 * pulseStrength : 1);
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.drawImage(sp.c, ax - rDev, ay - rDev, rDev * 2, rDev * 2);
      }

      /* soft glow (bloom): downscale to 1/4, draw back scaled up with lighter */
      if (bloomCanvas && options.bloom !== false) {
        var bc = bloomCanvas.getContext("2d");
        bc.setTransform(1, 0, 0, 1, 0, 0);
        bc.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
        bc.drawImage(canvas, 0, 0, bloomCanvas.width, bloomCanvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.35;
        ctx.drawImage(bloomCanvas, 0, 0, W * dpr, H * dpr);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      /* assemble-done detection */
      if (!assembled && asmRunning) {
        var allDone = true;
        for (var j = 0; j < numPts; j++) {
          if (now < asmStart + particles[j].asmDelay + particles[j].asmDur) { allDone = false; break; }
        }
        if (allDone) finishAssemble();
      }
    }

    function drawFallback() {
      try {
        if (!ctx) ctx = canvas.getContext("2d");
        var b = panel.getBoundingClientRect();
        dpr = Math.min(global.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(b.width * dpr));
        canvas.height = Math.max(1, Math.round(b.height * dpr));
        W = b.width; H = b.height;
        scale = Math.min(W / DW, H / DH) * 0.94;
        offX = (W - DW * scale) / 2; offY = (H - DH * scale) / 2;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#070b0e";
        ctx.fillRect(0, 0, W * dpr, H * dpr);
        var cx = toDevX(300), cy = toDevY(262), r = 40 * scale * dpr;
        ctx.fillStyle = C_MID;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - 16 * scale * dpr, cy - 8 * scale * dpr, 10 * scale * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 16 * scale * dpr, cy - 8 * scale * dpr, 10 * scale * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C_DARK;
        ctx.fillRect(toDevX(270), toDevY(380), 60 * scale * dpr, 110 * scale * dpr);
        ctx.beginPath(); ctx.arc(toDevX(240), toDevY(620), 20 * scale * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(toDevX(360), toDevY(620), 20 * scale * dpr, 0, Math.PI * 2); ctx.fill();
      } catch (e2) { console.error("[agripal] fallback failed:", e2.message); }
    }

    function showDebug() {
      if (!DEBUG) return;
      if (!dbgLine) {
        dbgLine = document.createElement("div");
        dbgLine.style.position = "absolute";
        dbgLine.style.bottom = "8px";
        dbgLine.style.left = "8px";
        dbgLine.style.font = "11px monospace";
        dbgLine.style.color = "#3ddc84";
        dbgLine.style.background = "rgba(0,0,0,0.5)";
        dbgLine.style.padding = "4px 8px";
        dbgLine.style.borderRadius = "4px";
        dbgLine.style.pointerEvents = "none";
        panel.appendChild(dbgLine);
      }
    }
    function updateDebug() {
      if (!DEBUG || !dbgLine) return;
      var fps = avgFrameTime > 0 ? (1000 / avgFrameTime).toFixed(0) : "—";
      dbgLine.textContent = "particles " + numPts + ", canvas " + W + "x" + H + ", fps " + fps;
    }

    function onPointerMove(e) {
      if (e.pointerType === "touch") return;
      cursorClientX = e.clientX;
      cursorClientY = e.clientY;
    }

    function onPointerDown(e) {
      if (e.pointerType === "touch") { cursorClientX = null; cursorClientY = null; }
    }

    function clearPointer() {
      cursorClientX = null;
      cursorClientY = null;
    }

    function onPanelClick() {
      if (rig && !prefersReduced && options.clickWave !== false) rig.triggerWave();
    }

    function toScreen(x, y) {
      return { x: offX + x * scale, y: offY + y * scale };
    }

    function pulse(x, y, duration) {
      pulseState = { designX: x, designY: y, start: performance.now(), dur: duration || 900 };
    }

    function start() {
      if (destroyed) return;
      panelVisible = true;
      updateVisibility();
    }

    function stop() {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }

    function destroy() {
      destroyed = true;
      stop();
      clearPointer();
      global.removeEventListener("pointermove", onPointerMove);
      global.removeEventListener("pointerdown", onPointerDown);
      global.removeEventListener("blur", clearPointer);
      document.removeEventListener("pointerleave", clearPointer);
      document.removeEventListener("visibilitychange", updateVisibility);
      panel.removeEventListener("click", onPanelClick);
      if (io) { io.disconnect(); io = null; }
      if (ro) { ro.disconnect(); ro = null; }
      if (dbgLine && dbgLine.parentNode) dbgLine.parentNode.removeChild(dbgLine);
      dbgLine = null;
      particles = [];
      rig = null;
    }

    function init() {
      try {
        ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        if (!resize()) {
          setTimeout(init, 16);
          return;
        }
        buildParticlesAndSprites();

        if (global.IntersectionObserver) {
          io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
              panelVisible = e.isIntersecting;
              if (panelVisible && !asmRunning && !assembled) startAssemble();
              updateVisibility();
            });
          }, { threshold: 0.12 });
          io.observe(panel);
        } else {
          panelVisible = true;
          startAssemble();
          updateVisibility();
        }

        setTimeout(function () {
          if (!destroyed && !asmRunning && !assembled && panelVisible && !document.hidden) finishAssemble();
        }, 2000);

        document.addEventListener("visibilitychange", updateVisibility);
        if (global.ResizeObserver) {
          ro = new ResizeObserver(function () { resize(); });
          ro.observe(panel);
        }

        running = panelVisible && !document.hidden;
        if (running) rafId = requestAnimationFrame(loop);
        if (typeof options.onReady === "function") options.onReady();
      } catch (e) {
        console.error("[agripal] dot robot error:", e.message);
        drawFallback();
      }
    }

    global.addEventListener("pointermove", onPointerMove, { passive: true });
    global.addEventListener("pointerdown", onPointerDown, { passive: true });
    global.addEventListener("blur", clearPointer);
    document.addEventListener("pointerleave", clearPointer);
    panel.addEventListener("click", onPanelClick);

    init();

    return {
      resize: resize,
      start: start,
      stop: stop,
      destroy: destroy,
      pulse: pulse,
      toScreen: toScreen,
      setActiveLabel: function () { /* kept for the Navigate panel API */ },
      isAssembled: function () { return assembled; }
    };
  }

  global.createDotRobot = createDotRobot;
})(window);
