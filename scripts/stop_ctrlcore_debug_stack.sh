#!/usr/bin/env bash
# 停止 CtrlCore 调试栈（communication_service + ctrlcore_web）
set -euo pipefail

echo "=== 停止 CtrlCore 调试栈 ==="

stop_pattern() {
    local pattern="$1"
    local name="$2"
    if pgrep -f "${pattern}" >/dev/null 2>&1; then
        echo "停止 ${name} ..."
        pkill -SIGINT -f "${pattern}" 2>/dev/null || true
    fi
}

stop_pattern "ctrlcore_web_node" "ctrlcore_web"
stop_pattern "ros2 launch sealien_ctrlcore_web" "ctrlcore_web launch"
stop_pattern "ros2 launch sealien_ctrlpilot_communicationservice communication_service" "communication_service"
stop_pattern "mavlink_bridge_node" "mavlink_bridge_node"

for _ in $(seq 1 10); do
    if ! pgrep -f "ctrlcore_web_node|mavlink_bridge_node" >/dev/null 2>&1; then
        echo "完成"
        exit 0
    fi
    sleep 0.3
done

echo "WARN: 仍有残留，强制结束"
pkill -9 -f ctrlcore_web_node 2>/dev/null || true
pkill -9 -f mavlink_bridge_node 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true
echo "完成"
