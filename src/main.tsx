import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { BoardProvider } from "./state/BoardContext";
import { AuthProvider } from "./auth/useAuth";
import { registerPwa } from "./pwa";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/responsive.css";
import "./styles/components.css";

// Register the service worker in production. No-op in dev (the plugin
// is disabled there). Failures are swallowed inside registerPwa; the
// app continues to work as a normal SPA even if the SW never comes up.
registerPwa();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BoardProvider>
        <App />
      </BoardProvider>
    </AuthProvider>
  </React.StrictMode>,
);
