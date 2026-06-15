const MAV_TYPE_LABELS = {
  0: "通用设备",
  1: "固定翼",
  2: "四旋翼",
  3: "同轴直升机",
  4: "直升机",
  5: "天线跟踪器",
  6: "地面站",
  7: "飞艇",
  8: "自由气球",
  9: "火箭",
  10: "地面 ROV/ rover",
  11: "水面艇",
  12: "潜艇 / AUV",
  13: "六旋翼",
  14: "八旋翼",
  15: "三旋翼",
  16: "扑翼机",
  17: "风筝",
  18: "机载控制器",
};

const MAV_STATE_LABELS = {
  0: "未初始化",
  1: "启动中",
  2: "校准中",
  3: "待机（可运行）",
  4: "运行中",
  5: "异常（仍可导航）",
  6: "紧急",
  7: "关机中",
  8: "终止飞行",
};

function labelFrom(map, value, unknownPrefix) {
  const key = Number(value);
  if (Number.isNaN(key)) {
    return "--";
  }
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    return map[key];
  }
  return `${unknownPrefix}(${key})`;
}

function formatVehicleType(value) {
  return labelFrom(MAV_TYPE_LABELS, value, "未知类型");
}

function formatSystemStatus(value) {
  return labelFrom(MAV_STATE_LABELS, value, "未知状态");
}

function formatMavlinkVersion(value) {
  const ver = Number(value);
  if (Number.isNaN(ver)) {
    return "--";
  }
  if (ver === 2 || ver === 3) {
    return "MAVLink v2.0";
  }
  if (ver === 1) {
    return "MAVLink v1.0";
  }
  return `MAVLink 版本 ${ver}`;
}

export default {
  id: "link",
  title: "MCU 链路",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>MCU 链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">连接</div><div id="link-connected" class="value">--</div></div>
          <div class="card"><div class="label">心跳计数</div><div id="link-rx-count" class="value">--</div></div>
          <div class="card"><div class="label">MCU timestamp_ms</div><div id="link-ts" class="value">--</div></div>
          <div class="card"><div class="label">最近更新 (s)</div><div id="link-age" class="value">--</div></div>
          <div class="card"><div class="label">设备类型 (type)</div><div id="link-type" class="value">--</div></div>
          <div class="card"><div class="label">系统状态 (system_status)</div><div id="link-status" class="value">--</div></div>
          <div class="card"><div class="label">协议版本 (mavlink_version)</div><div id="link-mavlink" class="value">--</div></div>
        </div>
        <p class="hint">数据来源：/HeartbeatStatus。MCU 当前默认：设备类型=通用设备，系统状态=待机。</p>
      </section>
    `;
  },

  update(snapshot) {
    const data = snapshot.modules?.link;
    if (!data) {
      return;
    }
    const connected = Boolean(data.connected);
    document.getElementById("link-connected").textContent = connected ? "在线" : "等待中";
    document.getElementById("link-rx-count").textContent = data.rx_count ?? "--";
    document.getElementById("link-ts").textContent = data.timestamp_ms ?? "--";
    document.getElementById("link-age").textContent = data.age_sec ?? "--";

    if (connected) {
      document.getElementById("link-type").textContent = formatVehicleType(data.type);
      document.getElementById("link-status").textContent = formatSystemStatus(data.system_status);
      document.getElementById("link-mavlink").textContent = formatMavlinkVersion(data.mavlink_version);
    } else {
      const msg = data.message || "等待心跳";
      document.getElementById("link-type").textContent = msg;
      document.getElementById("link-status").textContent = "--";
      document.getElementById("link-mavlink").textContent = "--";
    }
  },

  destroy() {},
};
