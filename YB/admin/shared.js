// 共用 admin 工具:fetch wrapper、登录态检查、顶部导航
(function () {
  function defaultApiBase() {
    if (window.location.port === "3001") return "http://localhost:3000";
    return window.location.origin;
  }
  function apiUrl(path) {
    return `${defaultApiBase().replace(/\/$/, "")}${path}`;
  }

  // fetch 包装:自动带 cookie,401 自动跳登录页
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const r = await originalFetch(input, { credentials: "include", ...init });
    const u = typeof input === "string" ? input : (input && input.url) || "";
    if (r.status === 401 && u.includes("/api/admin/") && !u.includes("/api/admin/login")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`./login.html?next=${next}`);
    }
    return r;
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtNumber(n) {
    if (!Number.isFinite(Number(n))) return "—";
    return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function fmtRtp(n) {
    if (!Number.isFinite(Number(n)) || Number(n) === 0) return "—";
    return `${(Number(n) * 100).toFixed(2)}%`;
  }

  // 顶部导航 + 用户名 + 退出按钮
  function renderNav(activePage) {
    const pages = [
      { id: "index", label: "首页", href: "./index.html" },
      { id: "games", label: "游戏", href: "./games.html" },
      { id: "merchants", label: "商户", href: "./merchants.html" },
      { id: "transactions", label: "流水", href: "./transactions.html" },
      { id: "audit", label: "审计", href: "./audit.html" }
    ];
    const items = pages.map((p) => `
      <a href="${p.href}" class="nav-link ${p.id === activePage ? "is-active" : ""}">${p.label}</a>
    `).join("");
    return `
      <header class="top-nav">
        <div class="top-nav-inner">
          <a href="./index.html" class="nav-brand">WTNS Gaming · Admin</a>
          <nav class="nav-links">${items}</nav>
          <div class="nav-right">
            <span class="user-chip">
              <span class="user-chip-label">用户</span>
              <span id="navCurrentUser" class="user-chip-name">…</span>
            </span>
            <button id="navLogout" class="ghost-button" type="button">退出</button>
          </div>
        </div>
      </header>
    `;
  }

  async function bootstrapNav(activePage) {
    const host = document.getElementById("topNav");
    if (host) host.innerHTML = renderNav(activePage);
    try {
      const r = await fetch(apiUrl("/api/admin/me"));
      if (!r.ok) return;
      const data = await r.json();
      const el = document.getElementById("navCurrentUser");
      if (el) el.textContent = data.username || "?";
    } catch (e) { /* ignore */ }
    const logoutBtn = document.getElementById("navLogout");
    if (logoutBtn) logoutBtn.addEventListener("click", async () => {
      try { await fetch(apiUrl("/api/admin/logout"), { method: "POST" }); } catch (e) {}
      window.location.replace("./login.html");
    });
  }

  function setStatusOn(el, text, ok = true) {
    if (!el) return;
    el.textContent = text;
    el.style.background = ok ? "rgba(34, 197, 94, 0.13)" : "rgba(239, 68, 68, 0.16)";
    el.style.color = ok ? "#86efac" : "#fecaca";
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // 给所有游戏 dropdown 用的统一加载函数;返回 [{ gameId, name, status, ... }]
  let _gamesCache = null;
  async function loadAllGames(force = false) {
    if (_gamesCache && !force) return _gamesCache;
    const r = await fetch(apiUrl("/api/admin/games"));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    _gamesCache = data.items || [];
    return _gamesCache;
  }

  function statusBadge(status) {
    const s = status || "unknown";
    return `<span class="status-badge status-badge-${escapeHtml(s)}">${escapeHtml(s)}</span>`;
  }

  window.YBAdmin = {
    apiUrl,
    fetchJson: async (path, init) => {
      const r = await fetch(apiUrl(path), init);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    bootstrapNav,
    escapeHtml,
    fmtNumber,
    fmtRtp,
    setStatusOn,
    getQueryParam,
    loadAllGames,
    statusBadge
  };
})();
