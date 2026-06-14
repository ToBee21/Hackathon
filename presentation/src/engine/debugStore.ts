// tiny shared mutable store for the debug overlay (no re-render churn)
export const debugState = {
  z: 1,
  tx: 0,
  ty: 0,
  targetId: "—",
  keyframe: "—",
  section: "—",
  progress: 0,
  reduced: false,
  issues: 0,
}
