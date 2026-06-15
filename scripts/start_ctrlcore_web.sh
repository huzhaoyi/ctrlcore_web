#!/usr/bin/env bash
# 启动 CtrlCore 模块化调试 Web（需 communicationservice 已在运行）
set -euo pipefail

WS="${SEALIEN_WS:-${HOME}/sealien_ws}"
WEB_PORT="${CTRLCORE_WEB_PORT:-8081}"
RESTART=0

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
    echo "  启动 ctrlcore_web_node，浏览器访问调试面板"
    echo ""
    echo "选项:"
    echo "  --port PORT      Web 端口 (默认: 8081)"
    echo "  --restart        若 Web 已在运行，先停止再启动"
    echo "  -h, --help       显示帮助"
    echo ""
    echo "环境变量:"
    echo "  SEALIEN_WS          工作空间 (默认: ~/sealien_ws)"
    echo "  CTRLCORE_WEB_PORT   Web 端口 (默认: 8081)"
    echo ""
    echo "示例:"
    echo "  $(basename "$0")"
    echo "  $(basename "$0") --port 8082"
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
    echo "请先: colcon build --packages-select sealien_ctrlcore_web" >&2
    exit 1
fi

# shellcheck source=/dev/null
set +u
source "${WS}/install/setup.bash"
set -u

if [[ "${RESTART}" -eq 1 ]]; then
    stop_ctrlcore_web
elif ctrlcore_web_running && port_in_use; then
    echo "=== CtrlCore Web 已在运行 ==="
    echo "  浏览器: http://127.0.0.1:${WEB_PORT}/"
    echo "  重启:   $(basename "$0") --restart"
    exit 0
fi

if port_in_use; then
    echo "错误: 端口 ${WEB_PORT} 已被其它进程占用" >&2
    echo "  查看: ss -tlnp | grep :${WEB_PORT}" >&2
    echo "  换端口: $(basename "$0") --port 8082" >&2
    exit 1
fi

echo "=== CtrlCore 调试 Web ==="
echo "  工作空间: ${WS}"
echo "  端口:     ${WEB_PORT}"
echo "  浏览器:   http://127.0.0.1:${WEB_PORT}/"
echo "  说明:     需另起 communication_service（或使用 start_ctrlcore_debug_stack.sh）"
echo "  按 Ctrl+C 停止"
echo ""

exec ros2 launch sealien_ctrlcore_web ctrlcore_web.launch.py \
    ctrlcore_web_node.ros__parameters.web_port:="${WEB_PORT}"
