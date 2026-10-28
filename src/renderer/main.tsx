import React from "react";
import ReactDOM from "react-dom/client";

import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/app-ui.css";
import "./styles/editor-source.css";
import "./styles/markdown-render.css";
import "./styles/settings.css";

// 保留应用代码分包，但在模块就绪后才挂载根组件；首屏无需先提交空 fallback 再等待重试。
void import("./App").then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
