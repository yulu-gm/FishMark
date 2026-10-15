export function isWorkspaceTabDropTarget(point: Readonly<{ x: number; y: number }>): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  const element = document.elementFromPoint(point.x, point.y);
  const strip = element?.closest<HTMLElement>('[data-fishmark-region="workspace-tab-strip"]');
  return !!strip && strip.dataset.visibility !== "collapsed";
}
