/** 调试区侧栏分组（舱段定义见 hull_segments.mjs）。 */

import { HULL_SEGMENTS } from "./hull_segments.mjs";

export { HULL_SEGMENTS as DEBUG_NAV_GROUPS };

const GROUPED_MODULE_IDS = new Set(
  HULL_SEGMENTS.flatMap((segment) => segment.debugModules),
);

export function buildDebugNavLayout(moduleIds) {
  const available = new Set(moduleIds);
  const groups = [];

  for (const segment of HULL_SEGMENTS) {
    const modules = segment.debugModules.filter((id) => available.has(id));
    if (!modules.length && !segment.debugPlaceholder) {
      continue;
    }
    groups.push({
      segmentId: segment.id,
      title: segment.title,
      accentVar: segment.accentVar,
      moduleIds: modules,
      placeholder: segment.debugPlaceholder,
    });
  }

  const ungrouped = [...available].filter((id) => !GROUPED_MODULE_IDS.has(id));
  if (ungrouped.length) {
    groups.push({
      segmentId: "misc",
      title: "其他",
      accentVar: "--seg-misc",
      moduleIds: ungrouped.sort(),
      placeholder: null,
    });
  }

  return groups;
}
