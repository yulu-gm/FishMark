import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles/base.css";
import "./styles/app-ui.css";
import "./styles/editor-source.css";
import "./styles/markdown-render.css";
import "./styles/settings.css";
import "./styles/workbench.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
