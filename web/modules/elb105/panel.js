import { postModule } from "../../core/api.js";
import {
  buildAlignmentRequest,
  buildElb105ViewModel,
} from "./view_model.mjs";

const INPUT_STYLE =
  "width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1419;color:var(--text)";

const TEXT_FIELDS = {
  "elb-connected": "connected_text",
  "elb-rx-count": "rx_count",
  "elb-age": "age",
  "elb-topic": "topic",
  "elb-hw": "hardware",
  "elb-frame-seq": "frame_seq",
  "elb-imu-time": "imu_time",
  "elb-frame-id": "frame_id",
  "elb-stamp": "stamp",
  "elb-heading": "heading",
  "elb-pitch": "pitch",
  "elb-roll": "roll",
  "elb-gyro-x": "gyro_x",
  "elb-gyro-y": "gyro_y",
  "elb-gyro-z": "gyro_z",
  "elb-accel-x": "accel_x",
  "elb-accel-y": "accel_y",
  "elb-accel-z": "accel_z",
  "elb-lat": "latitude",
  "elb-lon": "longitude",
  "elb-vel-n": "velocity_north",
  "elb-vel-e": "velocity_east",
  "elb-vel-d": "velocity_down",
  "elb-dvl-bottom-front": "dvl_bottom_front",
  "elb-dvl-bottom-right": "dvl_bottom_right",
  "elb-dvl-bottom-down": "dvl_bottom_down",
  "elb-dvl-water-front": "dvl_water_front",
  "elb-dvl-water-right": "dvl_water_right",
  "elb-dvl-water-down": "dvl_water_down",
  "elb-dvl-height": "dvl_bottom_height",
  "elb-dvl-update-count": "dvl_update_count",
  "elb-dvl-valid-hex": "dvl_valid_hex",
  "elb-temperature": "temperature",
  "elb-dvl-scale": "dvl_speed_scale",
  "elb-dvl-mount-error": "dvl_mount_error",
};

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function setStatus(id, ok, text) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  element.textContent = text;
  element.style.color = ok ? "var(--ok)" : "var(--warn)";
}

function setSemanticStatus(id, state, text) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  element.textContent = text;
  element.classList.remove("status-ok", "status-bad", "status-warn");
  const className = state === "valid" || state === "complete" || state === "recent" || state === "slow"
    ? "status-ok"
    : state === "invalid" || state === "offline" || state === "timeout"
      ? "status-bad"
      : "status-warn";
  element.classList.add(className);
}

function card(label, id, hint = "") {
  const hintHtml = hint ? `<p class="hint">${hint}</p>` : "";
  return `<div class="card"><div class="label">${label}</div><div id="${id}" class="value">--</div>${hintHtml}</div>`;
}

export default {
  id: "elb105",
  title: "ELB105 惯导",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>ROS 链路与帧信息</h2>
        <div class="card-grid">
          ${card("连接", "elb-connected")}
          ${card("接收计数", "elb-rx-count")}
          ${card("数据年龄 (s)", "elb-age")}
          ${card("帧序号", "elb-frame-seq")}
          ${card("IMU 时间 (s)", "elb-imu-time")}
          ${card("frame_id", "elb-frame-id")}
          ${card("ROS 时间戳", "elb-stamp")}
          ${card("话题", "elb-topic")}
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="elb-hw" class="value mono-block">--</div></div>
        </div>
        <p class="hint">ROS <code>/elb105/shzr04</code> · SHZR04 147B 二进制帧 · 460800 baud · 50 Hz · reliable</p>
      </section>

      <section class="panel">
        <h2>对准状态与指令</h2>
        <div class="card-grid">
          ${card("对准状态", "elb-alignment", "0 待机 · 1 粗对准 · 2 精对准 · 3 对准完成")}
          ${card("预计对准时间", "elb-alignment-timer", "按 900 秒估算，设备状态为最终依据")}
        </div>
        <p class="hint">对准可能持续数分钟；接口支持连续发送，最近结果按服务完成顺序更新。</p>
        <div class="card-grid">
          <div class="card">
            <div class="label">纬度 (°)</div>
            <input id="elb-align-lat" type="text" value="22.801124" style="${INPUT_STYLE}">
          </div>
          <div class="card">
            <div class="label">经度 (°)</div>
            <input id="elb-align-lon" type="text" value="113.525280" style="${INPUT_STYLE}">
          </div>
          <div class="card">
            <div class="label">高度 (m)</div>
            <input id="elb-align-alt" type="text" value="8.0" style="${INPUT_STYLE}">
          </div>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button id="elb-align-send" type="button">发送对准指令</button>
        </div>
        <div id="elb-align-result" class="hint">POST /api/modules/elb105/align → /elb105/send_alignment</div>
      </section>

      <section class="panel">
        <h2>姿态</h2>
        <div class="card-grid">
          ${card("航向 Heading (°)", "elb-heading")}
          ${card("俯仰 Pitch (°)", "elb-pitch")}
          ${card("横滚 Roll (°)", "elb-roll")}
        </div>
      </section>

      <section class="panel">
        <h2>角速度 (deg/s)</h2>
        <div class="card-grid">
          ${card("X", "elb-gyro-x")}
          ${card("Y", "elb-gyro-y")}
          ${card("Z", "elb-gyro-z")}
        </div>
        <h2>加速度 (m/s²)</h2>
        <div class="card-grid">
          ${card("X", "elb-accel-x")}
          ${card("Y", "elb-accel-y")}
          ${card("Z", "elb-accel-z")}
        </div>
      </section>

      <section class="panel">
        <h2>位置与组合导航速度</h2>
        <div class="card-grid">
          ${card("纬度 (°)", "elb-lat")}
          ${card("经度 (°)", "elb-lon")}
          ${card("北向速度 (m/s)", "elb-vel-n")}
          ${card("东向速度 (m/s)", "elb-vel-e")}
          ${card("地向速度 (m/s)", "elb-vel-d")}
        </div>
      </section>

      <section class="panel">
        <h2>DVL</h2>
        <div class="card-grid">
          ${card("数据更新", "elb-dvl-update")}
          ${card("累计更新次数", "elb-dvl-update-count")}
          ${card("DVL 模式 / 有效状态", "elb-dvl-valid", "0 无效 · 1 对底 · 7 对流")}
          ${card("模式原始值", "elb-dvl-valid-hex")}
          ${card("对底高度 (m)", "elb-dvl-height")}
          ${card("对底前向 (m/s)", "elb-dvl-bottom-front")}
          ${card("对底右向 (m/s)", "elb-dvl-bottom-right")}
          ${card("对底下向 (m/s)", "elb-dvl-bottom-down")}
          ${card("对水前向 (m/s)", "elb-dvl-water-front")}
          ${card("对水右向 (m/s)", "elb-dvl-water-right")}
          ${card("对水下向 (m/s)", "elb-dvl-water-down")}
        </div>
        <p class="hint">数据更新按偏移 112 的 0→1 事件锁存 1.5 秒；DVL 模式来自偏移 145。DVL 无效不会影响惯导姿态、位置和对准状态显示。</p>
      </section>

      <section class="panel">
        <h2>设备状态与标定</h2>
        <div class="card-grid">
          ${card("IMU 温度 (°C)", "elb-temperature")}
          ${card("DVL 速度比例", "elb-dvl-scale")}
          ${card("DVL 安装误差 (°)", "elb-dvl-mount-error")}
        </div>
      </section>
    `;

    this._onAlignSend = async () => {
      const resultElement = document.getElementById("elb-align-result");
      const request = buildAlignmentRequest(
        document.getElementById("elb-align-lat").value,
        document.getElementById("elb-align-lon").value,
        document.getElementById("elb-align-alt").value,
      );
      if (!request.ok) {
        resultElement.textContent = `输入无效: ${request.error}`;
        return;
      }

      const body = request.body;
      try {
        const { status, data } = await postModule("elb105", "align", body);
        resultElement.textContent = data.ok
          ? `已排队 (${status}): ${data.message || "alignment queued"}`
          : `失败: ${data.error || data.message || status}`;
      } catch (error) {
        resultElement.textContent = `请求异常: ${error}`;
      }
    };

    document
      .getElementById("elb-align-send")
      .addEventListener("click", this._onAlignSend);
  },

  update(snapshot) {
    const data = snapshot?.modules?.elb105;
    if (!data) {
      return;
    }

    const view = buildElb105ViewModel(data);
    for (const [id, key] of Object.entries(TEXT_FIELDS)) {
      setText(id, view[key]);
    }
    setStatus("elb-alignment", view.alignment_ok, view.alignment_text);
    setSemanticStatus(
      "elb-alignment-timer",
      view.alignment_timer_state,
      view.alignment_timer_text,
    );
    setSemanticStatus(
      "elb-dvl-update",
      view.dvl_update_state,
      view.dvl_update_text,
    );
    setSemanticStatus(
      "elb-dvl-valid",
      view.dvl_valid_state,
      view.dvl_valid_text,
    );

    if (data.last_align) {
      const result = data.last_align;
      const resultText = result.ok
        ? `最近对准: 成功 - ${result.message || ""}`
        : `最近对准: 失败 - ${result.message || result.error || ""}`;
      setText("elb-align-result", resultText);
    }
  },

  destroy() {
    const button = document.getElementById("elb-align-send");
    if (button && this._onAlignSend) {
      button.removeEventListener("click", this._onAlignSend);
    }
  },
};
