// src/lib/wayfindingProgress.ts
// Pure "is this hunt complete" check, shared by WayfindingPanel.tsx (drives
// the progress bar / "all stops found" state) and PeriChatSheet.tsx
// (PERI_OFFLINE_SPEC_v2.md "Impact on wayfinding" point 10: gates the
// activity-level connect/reflect questions behind hunt completion). Kept
// here, not duplicated, so the two can never disagree about what "done"
// means.

export interface WaypointRequiredness {
  id: string;
  required: boolean;
}

/** True once every REQUIRED waypoint has been reached, or (when none are
 * explicitly marked required) once every waypoint has. */
export function isHuntComplete(
  waypoints: WaypointRequiredness[],
  arrivedIds: Set<string>
): boolean {
  const requiredIds = waypoints.filter((w) => w.required).map((w) => w.id);
  return requiredIds.length > 0
    ? requiredIds.every((id) => arrivedIds.has(id))
    : waypoints.length > 0 && arrivedIds.size >= waypoints.length;
}
