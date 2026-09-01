export default {
  id: "lora",
  title: "LoRa 遥控",

  mount(root) {
    root.innerHTML = `
      <section class="panel">
        <h2>LoRa RX 链路状态</h2>
        <div class="card-grid">
          <div class="card"><div class="label">节点</div><div id="lora-node" class="value">--</div></div>
          <div class="card"><div class="label">串口</div><div id="lora-serial" class="value">--</div></div>
          <div class="card"><div class="label">空中链路</div><div id="lora-link" class="value">--</div></div>
          <div class="card"><div class="label">距上次状态 (s)</div><div id="lora-age" class="value">--</div></div>
          <div class="card"><div class="label">last_seq</div><div id="lora-seq" class="value">--</div></div>
          <div class="card"><div class="label">rx_ok_count</div><div id="lora-ok" class="value">--</div></div>
          <div class="card"><div class="label">rx_drop_count</div><div id="lora-drop" class="value">--</div></div>
          <div class="card"><div class="label">profile</div><div id="lora-profile" class="value">--</div></div>
          <div class="card"><div class="label">ROS 话题</div><div id="lora-topic" class="value mono-block">/lora/rx_status</div></div>
          <div class="card"><div class="label">串口设备</div><div id="lora-port" class="value mono-block">--</div></div>
        </div>
        <div class="card-grid">
          <div class="card wide"><div class="label">硬件 / 总线</div><div id="lora-hw" class="value mono-block">OBC USB-RS232 · E90-DTU</div></div>
        </div>
        <p class="hint">
          数据链：岸端 TX → E90 LoRa → 艇端 <code>lora_joy_rx</code> →
          <code>/joy</code> + <code>/lora/rx_status</code>。
          「节点在线」表示 status 在更新；「串口已开」表示软件启动成功；
          「空中已连通」表示近期收到合法手柄帧。
        </p>
      </section>
    `;
  },

  update(snapshot) {
    const data = snapshot.modules?.lora;
    if (!data) {
      return;
    }

    const nodeOnline = Boolean(data.alive || data.connected);
    const serialOpen = Boolean(data.serial_open);
    const linkUp = Boolean(data.link_up);

    document.getElementById("lora-node").textContent = nodeOnline ? "在线" : "离线";
    document.getElementById("lora-serial").textContent = serialOpen ? "已打开" : "未打开";
    document.getElementById("lora-link").textContent = linkUp ? "已连通" : "无数据";
    document.getElementById("lora-age").textContent = data.age_sec ?? "--";
    document.getElementById("lora-seq").textContent =
      nodeOnline ? (data.last_seq ?? "--") : "--";
    document.getElementById("lora-ok").textContent =
      nodeOnline ? (data.rx_ok_count ?? "--") : "--";
    document.getElementById("lora-drop").textContent =
      nodeOnline ? (data.rx_drop_count ?? "--") : "--";
    document.getElementById("lora-profile").textContent =
      nodeOnline ? (data.profile || "--") : (data.message || "等待状态");
    document.getElementById("lora-topic").textContent =
      data.status_topic ?? "/lora/rx_status";
    document.getElementById("lora-port").textContent =
      nodeOnline ? (data.port || "--") : "--";
    document.getElementById("lora-hw").textContent =
      data.hardware ?? "OBC USB-RS232 · E90-DTU LoRa RX · 9600 8N1 · /joy";
  },

  destroy() {},
};
