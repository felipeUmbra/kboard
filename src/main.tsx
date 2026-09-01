import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { BoardProvider } from "./state/BoardContext";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/responsive.css";
import "./styles/components.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BoardProvider>
      <App />
    </BoardProvider>
  </React.StrictMode>,
);
