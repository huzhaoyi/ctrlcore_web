import {
  buildHullMonitor,
  healthLabel,
} from "./hull_health.mjs";
import { HULL_SEGMENTS } from "./hull_segments.mjs";

function segmentCardsHtml() {
  return HULL_SEGMENTS.map((segment) => `
    <button
      type="button"
      class="hull-segment"
      data-segment-id="${segment.id}"
      data-module-id="${segment.defaultModule}"
    >
      <span class="hull-segment-accent" aria-hidden="true"></span>
      <div class="hull-segment-body">
        <div class="hull-segment-head">
          <span class="hull-segment-dot" data-role="segment-dot"></span>
          <div>
            <div class="hull-segment-title">${segment.title}</div>
            <div class="hull-segment-sub">${segment.subtitle}</div>
          </div>
        </div>
        <div class="hull-segment-summary" data-role="segment-summary">—</div>
        <div class="hull-segment-kpis" data-role="segment-kpis"></div>
      </div>
    </button>
  `).join("");
}

export function mountMonitor(root, handlers = {}) {
  root.innerHTML = `
    <div id="monitor-alert-bar" class="monitor-alert monitor-alert-ok" data-role="alert-bar">
      <span class="monitor-alert-label" data-role="alert-label">整艇状态</span>
      <span class="monitor-alert-text" data-role="alert-text">加载中…</span>
    </div>

    <section class="panel monitor-hull">
      <div class="monitor-hull-head">
        <h2>船体分段</h2>
        <p class="hint">点击舱段进入调试区。颜色表示该段最差子项状态。</p>
      </div>
      <div class="hull-grid">
        ${segmentCardsHtml()}
      </div>
    </section>

    <section class="panel monitor-alerts">
      <h2>告警列表</h2>
      <ul id="monitor-alert-list" class="monitor-alert-list" data-role="alert-list">
        <li class="hint">加载中…</li>
      </ul>
    </section>
  `;

  root.querySelectorAll(".hull-segment").forEach((button) => {
    button.addEventListener("click", () => {
      const moduleId = button.dataset.moduleId;
      if (moduleId && typeof handlers.onOpenModule === "function") {
        handlers.onOpenModule(moduleId);
      }
    });
  });

  const alertBar = root.querySelector('[data-role="alert-bar"]');
  if (alertBar && typeof handlers.onOpenModule === "function") {
    alertBar.addEventListener("click", () => {
      const moduleId = alertBar.dataset.moduleId;
      if (moduleId) {
        handlers.onOpenModule(moduleId);
      }
    });
  }
}

function renderKpis(container, kpis) {
  if (!container) {
    return;
  }
  container.innerHTML = (kpis || [])
    .map((kpi) => `
      <div class="hull-kpi">
        <div class="hull-kpi-label">${kpi.label}</div>
        <div class="hull-kpi-value mono-block">${kpi.value}</div>
      </div>
    `)
    .join("");
}

function renderAlertList(listEl, alerts, onOpenModule) {
  if (!listEl) {
    return;
  }

  if (!alerts.length) {
    listEl.innerHTML = `<li class="monitor-alert-item monitor-alert-item-ok">当前无告警</li>`;
    return;
  }

  listEl.innerHTML = alerts
    .map((alert) => {
      const segmentPrefix = alert.segmentTitle ? `${alert.segmentTitle} · ` : "";
      const moduleAttr = alert.moduleId ? ` data-module-id="${alert.moduleId}"` : "";
      const segmentAttr = alert.segmentId ? ` data-segment-id="${alert.segmentId}"` : "";
      return `
        <li class="monitor-alert-item monitor-alert-item-${alert.level}"${moduleAttr}${segmentAttr}>
          <span class="monitor-alert-item-accent" aria-hidden="true"></span>
          <span class="monitor-alert-item-level">${healthLabel(alert.level)}</span>
          <span class="monitor-alert-item-text">${segmentPrefix}${alert.label}：${alert.detail}</span>
        </li>
      `;
    })
    .join("");

  if (typeof onOpenModule === "function") {
    listEl.querySelectorAll("[data-module-id]").forEach((item) => {
      item.addEventListener("click", () => {
        onOpenModule(item.dataset.moduleId);
      });
    });
  }
}

export function updateMonitor(root, snapshot, handlers = {}) {
  if (!root || !snapshot) {
    return;
  }

  const model = buildHullMonitor(snapshot);

  const alertBar = root.querySelector('[data-role="alert-bar"]');
  const alertLabel = root.querySelector('[data-role="alert-label"]');
  const alertText = root.querySelector('[data-role="alert-text"]');

  if (alertBar) {
    alertBar.className = `monitor-alert monitor-alert-${model.vesselLevel}`;
    alertBar.dataset.moduleId = model.topAlert?.moduleId || "";
    alertBar.style.cursor = model.topAlert?.moduleId ? "pointer" : "default";
  }

  if (alertLabel) {
    alertLabel.textContent = healthLabel(model.vesselLevel);
  }

  if (alertText) {
    if (model.topAlert) {
      const prefix = model.topAlert.segmentTitle ? `${model.topAlert.segmentTitle} · ` : "";
      alertText.textContent = `${prefix}${model.topAlert.label}：${model.topAlert.detail}`;
    } else {
      alertText.textContent = model.linkOk ? "整艇通信正常，各舱段无告警" : "等待数据…";
    }
  }

  for (const segment of model.segments) {
    const card = root.querySelector(`[data-segment-id="${segment.id}"]`);
    if (!card) {
      continue;
    }
    card.className = `hull-segment hull-segment-${segment.level}`;
    card.dataset.moduleId = segment.defaultModule;

    const dot = card.querySelector('[data-role="segment-dot"]');
    if (dot) {
      dot.setAttribute("aria-label", healthLabel(segment.level));
      dot.title = healthLabel(segment.level);
    }

    const summary = card.querySelector('[data-role="segment-summary"]');
    if (summary) {
      summary.textContent = segment.summary;
    }

    renderKpis(card.querySelector('[data-role="segment-kpis"]'), segment.kpis);
  }

  renderAlertList(
    root.querySelector('[data-role="alert-list"]'),
    model.alerts,
    handlers.onOpenModule,
  );
}
