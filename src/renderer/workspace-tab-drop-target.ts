export function isWorkspaceTabDropTarget(point: Readonly<{ x: number; y: number }>): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  const element = document.elementFromPoint(point.x, point.y);
  const strip = element?.closest<HTMLElement>('[data-fishmark-region="workspace-tab-strip"]');
  if (strip) return strip.dataset.visibility !== "collapsed";
  // 首页不显示页签栏，仍允许把其他窗口的页签拖入首页空白区域。
  return !!element?.closest('[data-fishmark-region="workspace-canvas"][data-fishmark-has-document="false"]') &&
    !element.closest('button, a, input, textarea, select, [role="button"]');
}
