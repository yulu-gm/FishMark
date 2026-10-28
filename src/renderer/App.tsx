import { Suspense, lazy } from "react";

import { resolveRuntimeMode } from "./runtime-mode";
import EditorApp from "./editor/App";

// 编辑器外壳是生产启动必经路径，直接加载，避免首次 Suspense 重试延迟工作区初始化。
const canRenderWorkbench = import.meta.env.DEV || import.meta.env.MODE === "test";
const WorkbenchApp = canRenderWorkbench ? lazy(() => import("./workbench/App")) : null;

export default function App() {
  const runtimeMode = resolveRuntimeMode({
    search: window.location.search,
    bridgeMode: window.fishmark?.runtimeMode
  });
  const shouldRenderWorkbench =
    canRenderWorkbench && runtimeMode === "test-workbench" && WorkbenchApp;

  return (
    <Suspense fallback={null}>
      {shouldRenderWorkbench ? <WorkbenchApp /> : <EditorApp />}
    </Suspense>
  );
}
