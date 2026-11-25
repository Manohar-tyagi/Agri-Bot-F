(function () {
  "use strict";

  function getToken() { return localStorage.getItem("agripal_token") || sessionStorage.getItem("agripal_token"); }
  function clearToken() { localStorage.removeItem("agripal_token"); sessionStorage.removeItem("agripal_token"); }
  function resolveName(u) {
    if (!u) return "";
    return u.name || u.fullName || (u.user && u.user.name) || u.email || "";
  }
  function initials(name) {
    if (!name) return "";
    var n = String(name).trim();
    if (n.indexOf("@") !== -1) n = n.split("@")[0];
    var parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  var user = null;
  function updateProtectedNav() {
    var authed = !!getToken();
    document.querySelectorAll("[data-auth-required]").forEach(function (el) {
      el.style.display = authed ? "" : "none";
    });
  }
  async function fetchMe() {
    var t = getToken();
    if (!t) { user = null; renderNavAuth(); updateProtectedNav(); return; }
    try {
      var res = await fetch((window.AGRIPAL_API_BASE || 'http://localhost:8080') + '/api/auth/me', { headers: { "Authorization": "Bearer " + t } });
      if (res.status === 401) { clearToken(); user = null; }
      else if (res.ok) { user = await res.json(); }
      else { user = null; }
    } catch (e) { /* keep token on network error */ }
    renderNavAuth();
    updateLiveStatusLock();
    updateProtectedNav();
  }

  function updateLiveStatusLock() {
    var links = document.querySelectorAll('a[href="#live-status"], [data-modal="status"]');
    links.forEach(function (l) {
      var existing = l.querySelector(".nav-lock");
      if (isAuthed()) { if (existing) existing.remove(); return; }
      if (!existing) {
        var s = document.createElement("span");
        s.className = "nav-lock";
        s.innerHTML = ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
        l.appendChild(s);
      }
    });
  }

  function renderNavAuth() {
    var btn = document.getElementById("nav-pfp-btn");
    if (!btn) return;
    // clear previous handlers by cloning
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    btn = newBtn;
    btn.id = "nav-pfp-btn";
    btn.className = "nav-pfp-btn";
    if (!user) {
      btn.setAttribute("aria-label", "Log in");
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
      btn.addEventListener("click", function () { location.hash = "#login"; });
    } else {
      btn.setAttribute("aria-label", "Account menu");
      var name = resolveName(user);
      var ini = initials(name);
      if (ini) { btn.textContent = ini; }
      else { btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>'; }
      btn.addEventListener("click", toggleMenu);
    }
    updateLiveStatusLock();
  }

  var menuOpen = false;
  function toggleMenu() {
    var btn = document.getElementById("nav-pfp-btn");
    var wrap = btn ? btn.parentNode : null;
    if (!wrap) return;
    // remove stale duplicates
    var stale = document.querySelectorAll("#nav-pfp-dropdown");
    stale.forEach(function (el, i) {
      if (i > 0) el.remove();
    });
    var menu = document.getElementById("nav-pfp-dropdown");
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "nav-pfp-dropdown";
      menu.id = "nav-pfp-dropdown";
      menu.innerHTML = '<button type="button" class="nav-logout-btn">Log out</button>';
      wrap.appendChild(menu);
      var logoutBtn = menu.querySelector(".nav-logout-btn");
      if (logoutBtn) logoutBtn.addEventListener("click", function () {
        clearToken(); user = null; menu.classList.remove("is-open"); menuOpen = false;
        renderNavAuth();
        location.hash = "#top";
      });
    }
    menuOpen = !menuOpen;
    menu.classList.toggle("is-open", menuOpen);
    if (menuOpen) {
      setTimeout(function () {
        document.addEventListener("click", outsideClose);
        document.addEventListener("keydown", escClose);
      }, 0);
    }
    function outsideClose(e) {
      if (!wrap.contains(e.target)) { menu.classList.remove("is-open"); menuOpen = false; document.removeEventListener("click", outsideClose); document.removeEventListener("keydown", escClose); }
    }
    function escClose(e) {
      if (e.key === "Escape") { menu.classList.remove("is-open"); menuOpen = false; document.removeEventListener("click", outsideClose); document.removeEventListener("keydown", escClose); }
    }
  }

  /* ---------- Live Status gate ---------- */
  function isAuthed() { return !!getToken(); }

  function requireAuth(view) {
    if (isAuthed()) return true;
    // save returnTo
    try { sessionStorage.setItem("agripal_returnTo", "#" + (view || "live-status")); } catch (e) {}
    location.hash = "#login";
    return false;
  }

  // Lock the dashboard when logged out
  function gateLiveStatus() {
    var liveSection = document.querySelector(".live-section, .live-dash");
    if (!liveSection) return;
    // find dashboard panel
    var mount = (liveSection.hasAttribute && liveSection.hasAttribute("data-live-dashboard")) ? liveSection : (liveSection.querySelector("[data-live-dashboard]") || liveSection.querySelector(".live-dashboard-mount"));
    var panel = liveSection.querySelector(".glass-card.dashboard");
    if (!panel && mount && !isAuthed()) {
      mount.innerHTML =
        '<div class="glass-card dashboard" aria-hidden="true">' +
        '<div class="pt-live-head"><span class="pt-live-label">LIVE DASHBOARD</span><p class="pt-live-lede">Live readings from your bot.</p></div>' +
        '<div class="dash-grid">' +
        '<div class="dash-tile"><div class="dash-label-row"><span class="dash-label">Battery</span></div><span class="dash-value">78%</span></div>' +
        '<div class="dash-tile"><div class="dash-label-row"><span class="dash-label">Mode</span></div><span class="dash-value">Following the row</span></div>' +
        '<div class="dash-tile"><div class="dash-label-row"><span class="dash-label">Last obstacle</span></div><span class="dash-value">24 cm</span></div>' +
        '<div class="dash-tile"><div class="dash-label-row"><span class="dash-label">Items plucked</span></div><span class="dash-value">14</span></div>' +
        '<div class="dash-tile"><div class="dash-label-row"><span class="dash-label">Row position</span></div><span class="dash-value">Row 3 of 12</span></div>' +
        '</div></div>';
      panel = liveSection.querySelector(".glass-card.dashboard");
    }
    if (!panel) return;
    if (isAuthed()) {
      liveSection.classList.remove("live-status-locked");
      // remove lock card if present
      var lc = liveSection.querySelector(".live-lock");
      if (lc) lc.remove();
      // ensure dashboard mounted? live-dashboard.js handles mounting via particles
      return;
    }
    // logged out: lock
    liveSection.classList.add("live-status-locked");
    if (!liveSection.querySelector(".live-lock")) {
      var lock = document.createElement("div");
      lock.className = "live-lock";
      lock.innerHTML =
        '<div class="lock-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>' +
        '<h3>Log in to see your bot\u2019s data</h3>' +
        '<p>Live readings are private to each bot\u2019s owner.</p>' +
        '<div class="lock-btns">' +
          '<button class="lock-primary" data-goto="login">Log in</button>' +
          '<button class="lock-secondary" data-goto="signup">Claim your bot</button>' +
        '</div>' +
        '<div class="lock-demo">Demo bot code: AGRI-DEMO-0001</div>';
      // insert lock card into section (above panel or before panel)
      var panelEl = liveSection.querySelector(".glass-card.dashboard");
      if (panelEl && panelEl.parentNode) panelEl.parentNode.insertBefore(lock, panelEl);
      else liveSection.appendChild(lock);
      lock.querySelectorAll("[data-goto]").forEach(function (b) {
        b.addEventListener("click", function () {
          try { sessionStorage.setItem("agripal_returnTo", "#live-status"); } catch (e) {}
          location.hash = "#" + b.getAttribute("data-goto");
        });
      });
    }
    // prevent real dashboard mount: set a flag
    liveSection.setAttribute("data-gated", "1");
  }

  // Allow Live Status view to open for everyone; gating handled by gateLiveStatus().

  // Observe live-section appearance
  if (window.MutationObserver) {
    var mo = new MutationObserver(function () { gateLiveStatus(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  setTimeout(gateLiveStatus, 500);
  setTimeout(gateLiveStatus, 1500);

  // Re-gate on hash changes
  window.addEventListener("hashchange", function () {
    if (location.hash === "#live-status") gateLiveStatus();
  });

  // After login/signup, navigate to returnTo
  // Hook into auth-ui by listening for token changes via storage event
  window.addEventListener("storage", function () { fetchMe(); gateLiveStatus(); });

  // Prevent real dashboard mounting/polling while logged out, but keep container classes
  if (window.renderLiveDashboard) {
    var origRender = window.renderLiveDashboard;
    window.renderLiveDashboard = function (container) {
      if (!isAuthed()) {
        if (container && container.classList) {
          container.classList.add("live-dashboard", "live-dash", "live-section");
        }
        return { start: function(){}, stop: function(){}, destroy: function(){}, render: function(){}, refresh: function(){}, container: container };
      }
      return origRender(container);
    };
  }

  // expose refresh for auth-ui
  window.AgriPalAuth = { refresh: function () { fetchMe(); gateLiveStatus(); }, get user() { return user; } };

  // initial
  updateProtectedNav();
  fetchMe();
  gateLiveStatus();
})();
