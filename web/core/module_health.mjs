/** 调试侧栏圆点：区分「话题有数据」与「设备真正在线」。 */

function topicAlive(data) {
  return data?.alive === true;
}

function gsOnlineCount(data) {
  const onlineCount = Number(data?.online_count);
  if (Number.isFinite(onlineCount)) {
    return onlineCount;
  }
  const channels = Array.isArray(data?.channels) ? data.channels : [];
  return channels.filter((ch) => ch && ch.online).length;
}

export function getModuleHealth(snapshot, moduleId) {
  const data = snapshot?.modules?.[moduleId];
  if (!topicAlive(data)) {
    return {
      online: false,
      label: "离线",
    };
  }

  /* 舵机：/GsStatus 在流不等于 CAN 舵机在线 */
  if (moduleId === "gs") {
    const count = gsOnlineCount(data);
    if (count <= 0) {
      return {
        online: false,
        label: "无在线通道",
      };
    }
    return {
      online: true,
      label: `${count} 路在线`,
    };
  }

  /* 天通：话题在不等于模块驻网 */
  if (moduleId === "m1" && data.module_online === false) {
    return {
      online: false,
      label: "模块未在线",
    };
  }

  /* LoRa：串口开但无空中链路时侧栏不显示在线 */
  if (moduleId === "lora") {
    if (data.link_up) {
      return {
        online: true,
        label: "已连通",
      };
    }
    if (data.serial_open) {
      return {
        online: false,
        label: "无空中数据",
      };
    }
    return {
      online: false,
      label: "串口未开",
    };
  }

  return {
    online: true,
    label: "在线",
  };
}

export function markAllModulesOffline(snapshot, moduleIds) {
  const modules = {};
  for (const moduleId of moduleIds) {
    modules[moduleId] = {
      ...(snapshot?.modules?.[moduleId] || {}),
      alive: false,
    };
  }
  return {
    ...(snapshot || {}),
    ok: false,
    modules,
  };
}
