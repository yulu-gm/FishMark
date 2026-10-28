import { useEffect, useState, type ComponentProps } from "react";
import type { CodeEditorView } from "../code-editor-view";

type EditorView = typeof CodeEditorView;
let loadedView: EditorView | undefined;
let pendingView: Promise<EditorView> | undefined;

function loadView(): Promise<EditorView> {
  return pendingView ??= import("../code-editor-view").then(module => {
    loadedView = module.CodeEditorView;
    return loadedView;
  }).catch(error => {
    pendingView = undefined;
    throw error;
  });
}

// 保留编辑器分包；首次文档到达时加载，通过普通状态更新呈现，避免 Suspense 的重试节流。
// 模块缓存供后续标签使用，ref 和全部文档协议参数原样传给实际编辑器。
export function DeferredCodeEditorView(props: ComponentProps<EditorView>) {
  const [View, setView] = useState<EditorView | undefined>(() => loadedView);
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  useEffect(() => {
    if (View) return;
    let cancelled = false;
    void loadView().then(view => {
      if (!cancelled) setView(() => view);
    }, error => {
      if (!cancelled) setFailure({ error });
    });
    return () => { cancelled = true; };
  }, [View]);
  // 保留原来由应用错误边界呈现加载失败的行为。
  if (failure) throw failure.error;
  return View ? <View {...props} /> : null;
}
