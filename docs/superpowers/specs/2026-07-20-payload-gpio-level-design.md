# 电磁阀 GPIO HIGH/LOW 显示设计

## 目标

在 `payload_en` 面板的两路电磁阀卡片中，明确显示 TCA9535 输出寄存器回读电平：`HIGH` 或 `LOW`。

## 数据定义

- ROS 话题：`/Switch`
- ROS 字段：`switch_status[0]` 对应阀 1，`switch_status[1]` 对应阀 2
- `1` 显示为 `HIGH`，`0` 显示为 `LOW`
- 当前硬件为高有效，因此 `HIGH` 同时对应阀开启，`LOW` 同时对应阀关闭
- HIGH/LOW 仅代表 TCA9535 输出锁存寄存器回读，不声称是管脚物理电压实测反馈

## 界面行为

每路电磁阀卡片同时显示：

1. 逻辑状态：`开启 ON` 或 `关闭 OFF`
2. 输出电平：`GPIO 输出：HIGH` 或 `GPIO 输出：LOW`
3. 管脚映射：例如 `DEV4 P1 PIN0 (24V/P4)`

当 `/Switch` 未连接或状态超时时，输出电平显示 `GPIO 输出：—`，不得把后端占位值 `0` 误显示为有效 LOW。

## 修改范围

- 修改 `web/modules/payload_en/panel.js`
- 不修改 MCU 协议、ROS 消息定义和 `sealien_ctrlpilot_communicationservice`
- 不修改执行器命令及安全行为

## 验证

- 对电平格式化逻辑执行自动化测试：`1 → HIGH`、`0 → LOW`、离线 → `—`
- 执行前端 JavaScript 语法检查
- 构建 `sealien_ctrlcore_web`
- 核对安装目录包含新的 HIGH/LOW 文案

