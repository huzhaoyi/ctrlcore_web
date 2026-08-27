import { buildDebugNavLayout } from "./debug_nav.mjs";
import { fetchMeta, fetchSnapshot } from "./api.js";
import {
  buildAppHash,
  parseAppRoute,
  WORKSPACE_DEBUG,
  WORKSPACE_MONITOR,
} from "./app_route.mjs";
import {
  getModuleHealth,
  markAllModulesOffline,
} from "./module_health.mjs";
import { mountMonitor, updateMonitor } from "./monitor.mjs";

const POLL_MS = 100;

export class AppShell {
  constructor() {
    this.modules = new Map();
    this.activeId = null;
    this.workspace = WORKSPACE_MONITOR;
    this.monitorMounted = false;
    this.pollTimer = null;
    this.pollBusy = false;
    this.lastSnapshot = null;

    this.tabMonitor = document.getElementById("tab-monitor");
    this.tabDebug = document.getElementById("tab-debug");
    this.workspaceMonitor = document.getElementById("workspace-monitor");
    this.workspaceDebug = document.getElementById("workspace-debug");
    this.monitorRoot = document.getElementById("monitor-root");
    this.navEl = document.getElementById("module-nav");
    this.panelRoot = document.getElementById("panel-root");
    this.linkBadge = document.getElementById("link-badge");
    this.serverTimeEl = document.getElementById("server-time");
    this.monitorHandlers = {
      onOpenModule: (moduleId) => this.showModule(moduleId),
    };
  }

  async init() {
    const manifestResp = await fetch("/modules.manifest.json");
    const manifest = await manifestResp.json();
    const meta = await fetchMeta();
    const metaMap = new Map(meta.modules.map((item) => [item.id, item]));

    for (const entry of manifest.modules) {
      const mod = await import(entry.script);
      const panel = mod.default;
      const info = metaMap.get(panel.id) || { title: panel.id };
      panel.title = info.title || panel.title;
      this.modules.set(panel.id, panel);
    }

    this._buildDebugNav();

    this.tabMonitor?.addEventListener("click", () => {
      this.showWorkspace(WORKSPACE_MONITOR);
    });
    this.tabDebug?.addEventListener("click", () => {
      this.showWorkspace(WORKSPACE_DEBUG);
    });
    window.addEventListener("hashchange", () => {
      this._applyRoute(parseAppRoute());
    });

    this._applyRoute(parseAppRoute());

    this.pollTimer = setInterval(() => this._poll(), POLL_MS);
    await this._poll();
  }

  _applyRoute(route) {
    if (route.workspace === WORKSPACE_MONITOR) {
      this.showWorkspace(WORKSPACE_MONITOR, { syncHash: false });
      return;
    }

    const moduleId = route.moduleId && this.modules.has(route.moduleId)
      ? route.moduleId
      : null;
    this.showWorkspace(WORKSPACE_DEBUG, { syncHash: false, moduleId });
  }

  _syncHash() {
    const nextHash = buildAppHash(this.workspace, this.activeId);
    if (location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }

  showWorkspace(workspace, options = {}) {
    const { syncHash = true, moduleId = null } = options;
    const prevWorkspace = this.workspace;
    this.workspace = workspace;

    this.workspaceMonitor?.classList.toggle(
      "workspace-active",
      workspace === WORKSPACE_MONITOR,
    );
    this.workspaceDebug?.classList.toggle(
      "workspace-active",
      workspace === WORKSPACE_DEBUG,
    );
    this.tabMonitor?.classList.toggle("active", workspace === WORKSPACE_MONITOR);
    this.tabDebug?.classList.toggle("active", workspace === WORKSPACE_DEBUG);
    this.tabMonitor?.setAttribute(
      "aria-selected",
      workspace === WORKSPACE_MONITOR ? "true" : "false",
    );
    this.tabDebug?.setAttribute(
      "aria-selected",
      workspace === WORKSPACE_DEBUG ? "true" : "false",
    );

    if (workspace === WORKSPACE_MONITOR) {
      this._destroyActivePanel();
      if (!this.monitorMounted && this.monitorRoot) {
        mountMonitor(this.monitorRoot, this.monitorHandlers);
        this.monitorMounted = true;
      }
      if (this.lastSnapshot) {
        updateMonitor(this.monitorRoot, this.lastSnapshot, this.monitorHandlers);
      }
    } else if (prevWorkspace === WORKSPACE_MONITOR) {
      const targetId = moduleId || this.activeId || this.modules.keys().next().value;
      if (targetId) {
        this.showModule(targetId, { syncHash: false });
      }
    } else if (moduleId) {
      this.showModule(moduleId, { syncHash: false });
    }

    if (syncHash) {
      this._syncHash();
    }
  }

  _buildDebugNav() {
    if (!this.navEl) {
      return;
    }

    this.navEl.innerHTML = "";
    const layout = buildDebugNavLayout([...this.modules.keys()]);

    for (const group of layout) {
      const section = document.createElement("section");
      section.className = "nav-group";
      section.dataset.segmentId = group.segmentId;

      const title = document.createElement("div");
      title.className = "nav-group-title";
      title.textContent = group.title;
      section.appendChild(title);

      const list = document.createElement("div");
      list.className = "nav-group-list";

      for (const moduleId of group.moduleIds) {
        const panel = this.modules.get(moduleId);
        if (panel) {
          list.appendChild(this._createNavButton(panel));
        }
      }

      if (group.placeholder) {
        const hint = document.createElement("div");
        hint.className = "nav-group-placeholder";
        hint.textContent = group.placeholder;
        list.appendChild(hint);
      }

      section.appendChild(list);
      this.navEl.appendChild(section);
    }
  }

  _createNavButton(panel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-btn";
    btn.dataset.moduleId = panel.id;
    const statusDot = document.createElement("span");
    statusDot.className = "nav-status-dot offline";
    statusDot.dataset.role = "module-health";
    statusDot.setAttribute("role", "img");
    statusDot.setAttribute("aria-label", "离线");

    const label = document.createElement("span");
    label.className = "nav-btn-label";
    label.textContent = panel.title;
    btn.append(statusDot, label);
    btn.addEventListener("click", () => this.showModule(panel.id));
    return btn;
  }

  _highlightNavGroup(moduleId) {
    if (!this.navEl) {
      return;
    }

    let activeSegment = null;
    for (const section of this.navEl.querySelectorAll(".nav-group")) {
      const hasModule = section.querySelector(`[data-module-id="${moduleId}"]`);
      section.classList.toggle("nav-group-active", Boolean(hasModule));
      if (hasModule) {
        activeSegment = section.dataset.segmentId;
      }
    }
    return activeSegment;
  }

  _destroyActivePanel() {
    if (!this.activeId) {
      return;
    }
    const prev = this.modules.get(this.activeId);
    if (prev && typeof prev.destroy === "function") {
      prev.destroy();
    }
    this.activeId = null;
  }

  showModule(moduleId, options = {}) {
    const { syncHash = true } = options;
    const panel = this.modules.get(moduleId);
    if (!panel) {
      return;
    }

    if (this.workspace !== WORKSPACE_DEBUG) {
      this.showWorkspace(WORKSPACE_DEBUG, { syncHash: false, moduleId });
    }

    if (this.activeId && this.activeId !== moduleId) {
      const prev = this.modules.get(this.activeId);
      if (prev && typeof prev.destroy === "function") {
        prev.destroy();
      }
    }

    this.activeId = moduleId;
    this.panelRoot.innerHTML = "";
    panel.mount(this.panelRoot);

    for (const btn of this.navEl.querySelectorAll(".nav-btn")) {
      btn.classList.toggle("active", btn.dataset.moduleId === moduleId);
    }
    this._highlightNavGroup(moduleId);

    if (this.lastSnapshot) {
      const activePanel = this.modules.get(moduleId);
      if (activePanel && typeof activePanel.update === "function") {
        activePanel.update(this.lastSnapshot);
      }
    }

    if (syncHash) {
      this._syncHash();
    }
  }

  _updateActiveView(snapshot) {
    if (this.workspace === WORKSPACE_MONITOR) {
      updateMonitor(this.monitorRoot, snapshot, this.monitorHandlers);
      return;
    }
    if (!this.activeId) {
      return;
    }
    const panel = this.modules.get(this.activeId);
    if (panel && typeof panel.update === "function") {
      panel.update(snapshot);
    }
  }

  async _poll() {
    if (this.pollBusy) {
      return;
    }
    this.pollBusy = true;
    try {
      const snapshot = await fetchSnapshot();
      this.lastSnapshot = snapshot;
      this._updateChrome(snapshot);
      this._updateActiveView(snapshot);
    } catch (err) {
      const detail = err && err.message ? err.message : String(err);
      const offlineSnapshot = markAllModulesOffline(
        this.lastSnapshot,
        this.modules.keys(),
      );
      this.lastSnapshot = offlineSnapshot;
      this._updateModuleHealth(offlineSnapshot);
      this._updateActiveView(offlineSnapshot);
      this.linkBadge.textContent = "API 异常";
      this.linkBadge.title =
        `无法访问 /api/snapshot：${detail}。请确认通过 http://本机IP:8081 打开，且 ctrlcore_web_node 已启动。`;
      this.linkBadge.className = "badge offline";
      console.error(err);
    } finally {
      this.pollBusy = false;
    }
  }

  _updateModuleHealth(snapshot) {
    for (const btn of this.navEl.querySelectorAll(".nav-btn")) {
      const health = getModuleHealth(snapshot, btn.dataset.moduleId);
      const dot = btn.querySelector('[data-role="module-health"]');
      if (!dot) {
        continue;
      }
      dot.classList.toggle("online", health.online);
      dot.classList.toggle("offline", !health.online);
      dot.setAttribute("aria-label", health.label);
      dot.title = health.label;
    }
  }

  _updateChrome(snapshot) {
    this._updateModuleHealth(snapshot);
    const linkOk = Boolean(snapshot.link_ok);
    this.linkBadge.textContent = linkOk ? "MCU 在线" : "MCU 离线";
    this.linkBadge.title = linkOk
      ? "已收到 MCU 心跳"
      : "Web 正常，但未收到 /HeartbeatStatus（检查 communication_service 与 MCU 网络）";
    this.linkBadge.className = linkOk ? "badge online" : "badge offline";
    if (this.serverTimeEl) {
      const ts = new Date(snapshot.server_time * 1000);
      this.serverTimeEl.textContent = ts.toLocaleTimeString();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const shell = new AppShell();
  shell.init().catch((err) => {
    console.error("shell init failed", err);
    const monitorRoot = document.getElementById("monitor-root");
    if (monitorRoot) {
      monitorRoot.textContent = "页面初始化失败，请检查 ctrlcore_web_node 是否已启动。";
      return;
    }
    document.getElementById("panel-root").textContent =
      "页面初始化失败，请检查 ctrlcore_web_node 是否已启动。";
  });
});
