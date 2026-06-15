#!/usr/bin/env bash
# 一键启动：MAVLink 网关 + CtrlCore 调试 Web
set -euo pipefail

WS="${SEALIEN_WS:-${HOME}/sealien_ws}"
WEB_PORT="${CTRLCORE_WEB_PORT:-8081}"
RESTART=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMM_PID=""
WEB_PID=""
STARTED=0

cleanup() {
    if [[ "${STARTED}" -eq 0 ]]; then
        return
    fi
    echo ""
    echo "=== 停止调试栈 ==="
    if [[ -n "${WEB_PID}" ]] && kill -0 "${WEB_PID}" 2>/dev/null; then
        kill -SIGINT "${WEB_PID}" 2>/dev/null || true
        wait "${WEB_PID}" 2>/dev/null || true
    fi
    if [[ -n "${COMM_PID}" ]] && kill -0 "${COMM_PID}" 2>/dev/null; then
        kill -SIGINT "${COMM_PID}" 2>/dev/null || true
        wait "${COMM_PID}" 2>/dev/null || true
    fi
    echo "已退出"
}

stop_ctrlcore_web() {
    if pgrep -f "ctrlcore_web_node" >/dev/null 2>&1; then
        echo "停止已有 ctrlcore_web ..."
        pkill -SIGINT -f "ros2 launch sealien_ctrlcore_web" 2>/dev/null || true
        pkill -SIGINT -f "ctrlcore_web_node" 2>/dev/null || true
        sleep 1
    fi
}

port_in_use() {
    command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ":${WEB_PORT} "
}

ctrlcore_web_running() {
    pgrep -f "ctrlcore_web_node" >/dev/null 2>&1
}

usage() {
    echo "用法: $(basename "$0") [选项]"
    echo "  启动 communication_service + ctrlcore_web"
    echo ""
    echo "选项:"
    echo "  --port PORT      Web 端口 (默认: 8081)"
    echo "  --restart        若 Web 已在运行，先停止再启动"
    echo "  -h, --help       显示帮助"
    echo ""
    echo "环境变量:"
    echo "  SEALIEN_WS          工作空间 (默认: ~/sealien_ws)"
    echo "  CTRLCORE_WEB_PORT   Web 端口 (默认: 8081)"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)
            WEB_PORT="$2"
            shift 2
            ;;
        --restart)
            RESTART=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "未知参数: $1" >&2
            usage
            exit 1
            ;;
    esac
done

if [[ ! -f "${WS}/install/setup.bash" ]]; then
    echo "错误: 未找到 ${WS}/install/setup.bash" >&2
    echo "请先编译:" >&2
    echo "  colcon build --packages-select sealien_ctrlpilot_msgmanagement sealien_ctrlpilot_communicationservice sealien_ctrlcore_web" >&2
    exit 1
fi

# shellcheck source=/dev/null
set +u
source "${WS}/install/setup.bash"
set -u

if pgrep -f "mavlink_bridge_node" >/dev/null 2>&1; then
    echo "提示: mavlink_bridge_node 已在运行，跳过启动 communication_service"
    COMM_PID=""
else
    echo "1/2 启动 communication_service ..."
    ros2 launch sealien_ctrlpilot_communicationservice communication_service.launch.py &
    COMM_PID=$!
    sleep 2
fi

if [[ "${RESTART}" -eq 1 ]]; then
    stop_ctrlcore_web
elif ctrlcore_web_running && port_in_use; then
    echo "=== CtrlCore Web 已在运行 ==="
    echo "  浏览器: http://127.0.0.1:${WEB_PORT}/"
    echo "  重启:   $(basename "$0") --restart"
    echo "  停止:   ${SCRIPT_DIR}/stop_ctrlcore_debug_stack.sh"
    exit 0
fi

if port_in_use; then
    echo "错误: 端口 ${WEB_PORT} 已被其它进程占用" >&2
    echo "  查看: ss -tlnp | grep :${WEB_PORT}" >&2
    echo "  换端口: $(basename "$0") --port 8082" >&2
    exit 1
fi

echo "2/2 启动 ctrlcore_web (端口 ${WEB_PORT}) ..."
ros2 launch sealien_ctrlcore_web ctrlcore_web.launch.py \
    ctrlcore_web_node.ros__parameters.web_port:="${WEB_PORT}" &
WEB_PID=$!

trap cleanup SIGINT SIGTERM EXIT
STARTED=1

echo ""
echo "=== CtrlCore 调试栈已启动 ==="
echo "  MAVLink: UDP 9999 (mavlink_bridge_node)"
echo "  Web:     http://127.0.0.1:${WEB_PORT}/"
echo "  停止:    Ctrl+C 或 ${SCRIPT_DIR}/stop_ctrlcore_debug_stack.sh"
echo ""

wait "${WEB_PID}"
