# sealien_ctrlcore_web

MCU 采集上发数据的 **模块化调试 Web 面板**。订阅 `sealien_ctrlpilot_communicationservice` 发布的 ROS2 Topic，经 HTTP 展示；不修改 MAVLink 网关逻辑。

## 数据流

```
MCU (MAVLink UDP) → mavlink_bridge_node → ROS2 Topic → ctrlcore_web_node → 浏览器
```

## 依赖

- ROS 2 Humble
- 已编译并 source 的工作空间：
  - `sealien_ctrlpilot_msgmanagement`
  - `sealien_ctrlpilot_communicationservice`
  - `sealien_ctrlcore_web`

```bash
cd ~/sealien_ws
source /opt/ros/humble/setup.bash
colcon build --packages-select sealien_ctrlpilot_msgmanagement sealien_ctrlpilot_communicationservice sealien_ctrlcore_web
source install/setup.bash
```

## 快速启动

### 方式一：一键脚本（推荐）

```bash
# 同时启动 MAVLink 网关 + 调试 Web
~/sealien_ws/src/sealien_ctrlcore_web/scripts/start_ctrlcore_debug_stack.sh

# 仅启动调试 Web（需 communicationservice 已在运行）
~/sealien_ws/src/sealien_ctrlcore_web/scripts/start_ctrlcore_web.sh
```

浏览器打开：**http://127.0.0.1:8081**（或本机 IP `192.168.100.50:8081`）

### 方式二：手动 launch

```bash
source ~/sealien_ws/install/setup.bash

# 终端 1：MAVLink 网关
ros2 launch sealien_ctrlpilot_communicationservice communication_service.launch.py

# 终端 2：调试 Web
ros2 launch sealien_ctrlcore_web ctrlcore_web.launch.py
```

## 当前模块

| 模块 ID | 面板 | ROS 订阅 | ROS 发布 |
|---------|------|----------|----------|
| `link` | MCU 链路 | `/HeartbeatStatus` | — |
| `m1` | 天通卫通 M1 | `/m1/status`, `/m1/downlink`, `/m1/link_state` | `/m1/uplink`, `/m1/call_cmd` |
| `depth` | Keller 深度 | `/DepthStatus` | — |
| `wire_displacement` | 拉线位移 | `/WireDisplacementStatus` | — |
| `payload_en` | 电磁阀×2 | `/Switch` | `/obc/switch_cmd` |
| `bms` | 电池管理 | `/BmsStatus` | `/obc/bms_mos_cmd` |

完整列表见 `web/modules.manifest.json` 与 `config/web_modules.yaml`。

配置：`config/web_modules.yaml`

```yaml
ctrlcore_web_node:
  ros__parameters:
    web_host: "0.0.0.0"
    web_port: 8081
    enabled_modules:
      - link
      - m1
      - depth
      - wire_displacement
      - payload_en
```

## HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/meta` | 已启用模块列表 |
| GET | `/api/snapshot` | 聚合快照（前端 500ms 轮询） |
| POST | `/api/modules/m1/uplink` | M1 卫星上行透传 |
| POST | `/api/modules/payload_en/cmd` | 阀控，`{"index":0,"value":1}`（0=阀1 1=阀2） |
| POST | `/api/modules/payload_en/all_off` | 两路阀全部关闭 |

示例：

```bash
curl -s http://127.0.0.1:8081/api/snapshot | python3 -m json.tool
curl -s -X POST http://127.0.0.1:8081/api/modules/payload_en/cmd \
  -H 'Content-Type: application/json' \
  -d '{"index":0,"value":1}'
```

MCU `M1_SIM=1` 时，M1 驱动会内部造数；阀控需 `task_i2c_ctrl_gpio` 与 TCA9535 在线。

## 增删模块

### 后端

1. 新建 `sealien_ctrlcore_web/modules/<id>/backend.py`，继承 `WebModule`
2. 在 `core/registry.py` 的 `_MODULE_CLASSES` 注册
3. `config/web_modules.yaml` 的 `enabled_modules` 增加 `<id>`

### 前端

1. 新建 `web/modules/<id>/panel.js`（导出 `{ id, title, mount, update, destroy }`）
2. `web/modules.manifest.json` 增加对应条目

## 目录结构

```
sealien_ctrlcore_web/
├── README.md
├── config/web_modules.yaml
├── launch/ctrlcore_web.launch.py
├── scripts/
│   ├── start_ctrlcore_web.sh
│   └── start_ctrlcore_debug_stack.sh
├── sealien_ctrlcore_web/          # Python 后端
│   ├── web_node.py
│   ├── http_server.py
│   ├── core/
│   └── modules/
└── web/                           # 静态前端
    ├── index.html
    ├── modules.manifest.json
    └── modules/
```

## 常见问题

**页面显示 MCU 离线**

- 确认 `communication_service` 已启动
- MCU mavproxy chan 1 指向 OBC：`192.168.100.50:9999`
- `ros2 topic echo /HeartbeatStatus --once` 是否有数据

**端口 8081 被占用**

```bash
ss -tlnp | grep 8081
pkill -f ctrlcore_web_node
```

**停止调试栈**

```bash
~/sealien_ws/src/sealien_ctrlcore_web/scripts/stop_ctrlcore_debug_stack.sh
```

## 网络参考（AUV 联调）

| 设备 | IP | 端口 |
|------|-----|------|
| OBC / PC | 192.168.100.50 | UDP 9999（MAVLink 入） |
| MCU | 192.168.100.199 | — |
| Web | 192.168.100.50 | TCP 8081 |
