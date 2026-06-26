#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BMS 通用通讯协议 V1.1 → Web 可读中文 + 排查备注。"""

from typing import Any, Dict, List, Tuple

PROTECT_OV_BITS: List[Tuple[int, str, str]] = [
    (0, "电芯过压保护", "某节单体电压过高：停充、检查充电器输出，待 BMS 自动恢复或人工复位"),
    (1, "总压过压保护", "整包总电压过高：检查串联节数配置与充电电压是否匹配"),
    (4, "充满保护", "电池已充满或接近满充：属正常停充保护，确认 SOC 是否接近 100%"),
]

PROTECT_UV_BITS: List[Tuple[int, str, str]] = [
    (0, "电芯欠压保护", "某节单体电压过低：停止大电流放电，尽快充电或检查是否有过放负载"),
    (1, "总压欠压保护", "整包总电压过低：电量耗尽风险，立即充电并检查放电回路"),
]

PROTECT_TEMP_BITS: List[Tuple[int, str, str]] = [
    (0, "充电温度保护", "充电时温度超限：停止充电，检查散热与环境温度"),
    (1, "放电温度保护", "放电时温度超限：降低负载，检查散热"),
    (2, "MOS 过温保护", "功率 MOS 温度过高：检查大电流持续时间与 MOS 散热"),
    (4, "高温保护", "电池或环境高温：暂停充放电，改善通风"),
    (5, "低温保护", "电池或环境低温：加热或移至适宜温度后再充放电"),
]

PROTECT_OTHER_BITS: List[Tuple[int, str, str]] = [
    (0, "放电短路保护", "输出短路或极低阻抗负载：立即断开负载，检查线缆与接插件"),
    (1, "放电过流保护", "放电电流超过 BMS 阈值：减小负载或检查推进器/设备同时启动"),
    (2, "充电过流保护", "充电电流过大：检查充电器规格与充电线阻"),
    (4, "环境高温保护", "环境温度传感器报高温：改善舱内散热"),
    (5, "环境低温保护", "环境温度传感器报低温：检查密封与保温"),
]

FAIL_STATUS_BITS: List[Tuple[int, str, str]] = [
    (0, "温度采集失效", "温度探头或采样电路异常：检查探头接线，必要时更换 BMS 或探头"),
    (1, "电压采集失效", "电压采样线或采集芯片异常：检查均衡线/采样线连接"),
    (2, "放电 MOS 失效", "放电 MOS 驱动或本体损坏：禁止带载下水，联系维护更换 MOS 板"),
    (3, "充电 MOS 失效", "充电 MOS 驱动或本体损坏：禁止充电，联系维护"),
    (4, "电芯不均衡", "各串电压差过大：需均衡或检查单体健康，避免长期满充满放"),
]

ALARM0_BITS: List[Tuple[int, str, str]] = [
    (0, "电芯过放告警", "某节电压偏低预警：计划充电，避免继续深放"),
    (1, "总压过放告警", "整包电压偏低预警：尽快返航或充电"),
    (2, "电芯过压告警", "某节电压偏高预警：检查充电策略"),
    (3, "总压过压告警", "整包电压偏高预警：检查充电器"),
    (4, "放电过流告警", "放电电流接近限值：减小负载"),
    (5, "充电过流告警", "充电电流接近限值：检查充电器"),
    (6, "放电过温告警", "放电温度偏高预警：关注散热"),
    (7, "充电过温告警", "充电温度偏高预警：暂停充电并降温"),
]

ALARM1_BITS: List[Tuple[int, str, str]] = [
    (0, "环境高温告警", "舱内或环境温度过高：改善散热"),
    (1, "环境低温告警", "舱内或环境温度过低：注意保温"),
    (2, "SOC 过低告警", "剩余电量不足：安排充电或缩短任务"),
    (3, "MOS 过温告警", "MOS 温度偏高：降低持续大电流"),
    (4, "漏水检测告警", "检测到进水：立即断电、出水检查密封与舱体"),
]


def decode_bits_detail(val: int, bit_map: List[Tuple[int, str, str]]) -> Tuple[List[str], List[str]]:
    names: List[str] = []
    hints: List[str] = []
    for bit, label, tip in bit_map:
        if val & (1 << bit):
            names.append(label)
            hints.append(tip)
    return names, hints


def fmt_ok_or_join(items: List[str], ok_text: str = "正常") -> str:
    if not items:
        return ok_text
    return "；".join(items)


def fmt_hint_join(hints: List[str], ok_hint: str) -> str:
    if not hints:
        return ok_hint
    return " ".join(f"• {h}" for h in hints)


def decode_work_state(charging: bool, discharging: bool, current_a: float) -> Tuple[str, str]:
    if charging and discharging:
        text = "充电中 · 放电中"
    elif charging:
        text = "充电中"
    elif discharging:
        text = "放电中"
    else:
        text = "静置"
    if current_a > 0.01:
        cur_hint = f"电流 +{current_a} A，电池对外放电"
    elif current_a < -0.01:
        cur_hint = f"电流 {current_a} A，电池在充电"
    else:
        cur_hint = "电流接近 0，负载与充电器均未明显拉电流"
    return text, cur_hint


def decode_mos_state(charge_on: bool, discharge_on: bool) -> Tuple[str, str, str, str]:
    if charge_on:
        charge_text = "已合上 · 允许充电"
        charge_hint = "充电回路 MOS 导通，外部充电器可向内充电"
    else:
        charge_text = "已断开 · 禁止充电"
        charge_hint = "充电 MOS 关断，外部无法充电（含人工下发禁充）"
    if discharge_on:
        discharge_text = "已合上 · 允许放电"
        discharge_hint = "放电回路 MOS 导通，负载可取电"
    else:
        discharge_text = "已断开 · 禁止放电"
        discharge_hint = "放电 MOS 关断，负载被切断（含保护或人工禁放）"
    return charge_text, charge_hint, discharge_text, discharge_hint


def decode_temp_valid_flags(mos_valid: bool, env_valid: bool) -> Tuple[str, str]:
    mos_text = "有 MOS 温度数据" if mos_valid else "无 MOS 温度数据"
    env_text = "有环境温度数据" if env_valid else "无环境温度数据"
    return mos_text, env_text


def decode_scheme(scheme_id: int) -> Tuple[str, str]:
    vendor_map = {4: "TI 方案", 3: "中颖方案"}
    hi = (scheme_id >> 4) & 0x0F
    lo = scheme_id & 0x0F
    vendor = vendor_map.get(hi, f"未知方案({hi})")
    if lo == 0x0E:
        ext = "协议扩展"
        hint = "支持扩展字段的 TI 方案固件"
    else:
        ext = f"识别码 0x{lo:X}"
        hint = "方案识别字节，用于区分 BMS 硬件/固件批次"
    return f"{vendor} · {ext}", hint


def decode_temp_labels(temp_count: int, mos_temp_valid: bool, env_temp_valid: bool) -> List[str]:
    labels: List[str] = []
    cell_n = temp_count - (1 if mos_temp_valid else 0) - (1 if env_temp_valid else 0)
    if cell_n < 0:
        cell_n = 0
    for i in range(cell_n):
        labels.append(f"电芯温度 {i + 1}")
    if mos_temp_valid:
        labels.append("MOS 温度")
    if env_temp_valid:
        labels.append("环境温度")
    while len(labels) < temp_count:
        labels.append(f"温度探头 {len(labels) + 1}")
    return labels[:temp_count]


def decode_balance_cells(balance0: int, balance1: int, balance2: int) -> Tuple[str, str]:
    active: List[str] = []
    for byte_val, base in ((balance2, 1), (balance1, 9), (balance0, 17)):
        for bit in range(8):
            if byte_val & (1 << bit):
                active.append(f"第 {base + bit} 串")
    if not active:
        return "无均衡", "当前没有电芯在主动均衡，属正常"
    text = "均衡中：" + "、".join(active)
    hint = "BMS 正在对电压偏高的串进行均衡，大电流任务时属正常现象"
    return text, hint


def decode_soc_hint(soc_pct: int) -> str:
    if soc_pct >= 80:
        return "电量充足，可正常任务"
    if soc_pct >= 30:
        return "电量中等，关注剩余任务时长"
    if soc_pct >= 15:
        return "电量偏低，建议计划充电或缩短任务"
    return "电量严重不足，尽快充电，避免过放保护"


def build_health_summary(pack: Dict[str, Any]) -> str:
    if not pack.get("comm_ok"):
        return "通信失联：检查 uart6 接线、BMS 上电与波特率 9600"
    issues: List[str] = []
    for key in ("protect_items", "fail_items", "alarm_items"):
        items = pack.get(key) or []
        issues.extend(items)
    if issues:
        return "存在异常：" + "；".join(issues[:4]) + ("…" if len(issues) > 4 else "")
    return "当前无保护、告警与失效，状态正常"


def enrich_bms_pack(pack: Dict[str, Any]) -> Dict[str, Any]:
    ov_names, ov_hints = decode_bits_detail(int(pack.get("protect_ov", 0)), PROTECT_OV_BITS)
    uv_names, uv_hints = decode_bits_detail(int(pack.get("protect_uv", 0)), PROTECT_UV_BITS)
    tp_names, tp_hints = decode_bits_detail(int(pack.get("protect_temp", 0)), PROTECT_TEMP_BITS)
    ot_names, ot_hints = decode_bits_detail(int(pack.get("protect_other", 0)), PROTECT_OTHER_BITS)
    fail_names, fail_hints = decode_bits_detail(int(pack.get("fail_status", 0)), FAIL_STATUS_BITS)
    a0_names, a0_hints = decode_bits_detail(int(pack.get("alarm0", 0)), ALARM0_BITS)
    a1_names, a1_hints = decode_bits_detail(int(pack.get("alarm1", 0)), ALARM1_BITS)
    alarm_names = a0_names + a1_names
    alarm_hints = a0_hints + a1_hints

    work_text, work_hint = decode_work_state(
        bool(pack.get("charging")),
        bool(pack.get("discharging")),
        float(pack.get("current_a", 0.0)),
    )
    chg_text, chg_hint, dsg_text, dsg_hint = decode_mos_state(
        bool(pack.get("charge_mos_on")),
        bool(pack.get("discharge_mos_on")),
    )
    mos_temp_text, env_temp_text = decode_temp_valid_flags(
        bool(pack.get("mos_temp_valid")),
        bool(pack.get("env_temp_valid")),
    )
    scheme_text, scheme_hint = decode_scheme(int(pack.get("scheme_id", 0)))
    balance_text, balance_hint = decode_balance_cells(
        int(pack.get("balance0", 0)),
        int(pack.get("balance1", 0)),
        int(pack.get("balance2", 0)),
    )

    temp_count = int(pack.get("temp_count", 0))
    temp_labels = decode_temp_labels(
        temp_count,
        bool(pack.get("mos_temp_valid")),
        bool(pack.get("env_temp_valid")),
    )
    temps = pack.get("temp_c") or []
    temp_readings = []
    for i in range(temp_count):
        label = temp_labels[i] if i < len(temp_labels) else f"温度探头 {i + 1}"
        val = temps[i] if i < len(temps) else None
        temp_readings.append({"label": label, "value_c": val})

    pack["work_state_text"] = work_text
    pack["work_state_hint"] = work_hint
    pack["charge_mos_text"] = chg_text
    pack["charge_mos_hint"] = chg_hint
    pack["discharge_mos_text"] = dsg_text
    pack["discharge_mos_hint"] = dsg_hint
    pack["mos_temp_valid_text"] = mos_temp_text
    pack["env_temp_valid_text"] = env_temp_text
    pack["protect_ov_text"] = fmt_ok_or_join(ov_names)
    pack["protect_ov_hint"] = fmt_hint_join(ov_hints, "无过压类保护动作")
    pack["protect_uv_text"] = fmt_ok_or_join(uv_names)
    pack["protect_uv_hint"] = fmt_hint_join(uv_hints, "无欠压类保护动作")
    pack["protect_temp_text"] = fmt_ok_or_join(tp_names)
    pack["protect_temp_hint"] = fmt_hint_join(tp_hints, "无温度类保护动作")
    pack["protect_other_text"] = fmt_ok_or_join(ot_names)
    pack["protect_other_hint"] = fmt_hint_join(ot_hints, "无短路/过流/环境类保护动作")
    pack["fail_text"] = fmt_ok_or_join(fail_names, ok_text="无失效")
    pack["fail_hint"] = fmt_hint_join(fail_hints, "采集与 MOS 驱动正常")
    pack["alarm_text"] = fmt_ok_or_join(alarm_names, ok_text="无告警")
    pack["alarm_hint"] = fmt_hint_join(alarm_hints, "无预警项，可正常作业")
    pack["balance_text"] = balance_text
    pack["balance_hint"] = balance_hint
    pack["scheme_text"] = scheme_text
    pack["scheme_hint"] = scheme_hint
    pack["soc_hint"] = decode_soc_hint(int(pack.get("soc_pct", 0)))
    pack["temp_readings"] = temp_readings
    pack["protect_items"] = ov_names + uv_names + tp_names + ot_names
    pack["fail_items"] = fail_names
    pack["alarm_items"] = alarm_names
    pack["health_summary"] = build_health_summary(pack)
    return pack
