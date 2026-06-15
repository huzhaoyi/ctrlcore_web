import { fetchMeta, fetchSnapshot } from "./api.js";

const POLL_MS = 500;

export class AppShell {
  constructor() {
    this.modules = new Map();
    this.activeId = null;
    this.pollTimer = null;
    this.lastSnapshot = null;
    this.navEl = document.getElementById("module-nav");
    this.panelRoot = document.getElementById("panel-root");
    this.linkBadge = document.getElementById("link-badge");
    this.serverTimeEl = document.getElementById("server-time");
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
      this._addNavButton(panel);
    }

    const first = manifest.modules[0]?.id;
    if (first) {
      this.showModule(first);
    }

    this.pollTimer = setInterval(() => this._poll(), POLL_MS);
    await this._poll();
  }

  _addNavButton(panel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-btn";
    btn.dataset.moduleId = panel.id;
    btn.textContent = panel.title;
    btn.addEventListener("click", () => this.showModule(panel.id));
    this.navEl.appendChild(btn);
  }

  showModule(moduleId) {
    const panel = this.modules.get(moduleId);
    if (!panel) {
      return;
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

    if (this.lastSnapshot) {
      const panel = this.modules.get(moduleId);
      if (panel && typeof panel.update === "function") {
        panel.update(this.lastSnapshot);
      }
    }
  }

  _updateActivePanel(snapshot) {
    if (!this.activeId) {
      return;
    }
    const panel = this.modules.get(this.activeId);
    if (panel && typeof panel.update === "function") {
      panel.update(snapshot);
    }
  }

  async _poll() {
    try {
      const snapshot = await fetchSnapshot();
      this.lastSnapshot = snapshot;
      this._updateChrome(snapshot);
      this._updateActivePanel(snapshot);
    } catch (err) {
      const detail = err && err.message ? err.message : String(err);
      this.linkBadge.textContent = "API 异常";
      this.linkBadge.title =
        `无法访问 /api/snapshot：${detail}。请确认通过 http://本机IP:8081 打开，且 ctrlcore_web_node 已启动。`;
      this.linkBadge.className = "badge offline";
      console.error(err);
    }
  }

  _updateChrome(snapshot) {
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
    document.getElementById("panel-root").textContent = "页面初始化失败，请检查 ctrlcore_web_node 是否已启动。";
  });
});
