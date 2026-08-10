export function getModuleHealth(snapshot, moduleId) {
  const online = snapshot?.modules?.[moduleId]?.alive === true;
  return {
    online,
    label: online ? "在线" : "离线",
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
