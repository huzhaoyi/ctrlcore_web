const WORKSPACE_MONITOR = "monitor";
const WORKSPACE_DEBUG = "debug";

export function parseAppRoute(hash = location.hash) {
  const trimmed = String(hash).replace(/^#/, "").replace(/^\//, "");

  if (trimmed === "" || trimmed === "monitor") {
    return { workspace: WORKSPACE_MONITOR, moduleId: null };
  }

  if (trimmed === "debug") {
    return { workspace: WORKSPACE_DEBUG, moduleId: null };
  }

  const debugMatch = trimmed.match(/^debug\/([^/]+)$/);
  if (debugMatch) {
    return { workspace: WORKSPACE_DEBUG, moduleId: debugMatch[1] };
  }

  return { workspace: WORKSPACE_MONITOR, moduleId: null };
}

export function buildAppHash(workspace, moduleId = null) {
  if (workspace === WORKSPACE_MONITOR) {
    return "#monitor";
  }
  if (moduleId) {
    return `#debug/${moduleId}`;
  }
  return "#debug";
}

export { WORKSPACE_MONITOR, WORKSPACE_DEBUG };
