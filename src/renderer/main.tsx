import React from "react";
import ReactDOM from "react-dom/client";

import EditorApp from "./editor/App";
import "./styles.css";
import { resolveRuntimeMode } from "./runtime-mode";
import WorkbenchApp from "./workbench/App";

const runtimeMode = resolveRuntimeMode({
  search: window.location.search,
  bridgeMode: window.yulora?.runtimeMode
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {runtimeMode === "test-workbench" ? <WorkbenchApp /> : <EditorApp />}
  </React.StrictMode>
);
