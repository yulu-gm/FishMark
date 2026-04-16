import EditorApp from "./editor/App";
import { resolveRuntimeMode } from "./runtime-mode";
import WorkbenchApp from "./workbench/App";

export default function App() {
  const runtimeMode = resolveRuntimeMode({
    search: window.location.search,
    bridgeMode: window.yulora?.runtimeMode
  });

  return runtimeMode === "test-workbench" ? <WorkbenchApp /> : <EditorApp />;
}
