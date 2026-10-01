import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { BoardProvider } from "./state/BoardContext";
import { AuthProvider } from "./auth/useAuth";
import { registerPwa } from "./pwa";
import "./styles/tokens.css";
import "./styles/global.css";
// components.css BEFORE responsive.css, deliberately.
//
// responsive.css is almost entirely `max-width` overrides of rules declared in
// components.css, and those two selectors have EQUAL specificity — so the
// cascade decides on SOURCE ORDER alone. With responsive.css imported first,
// components.css landed later and silently won, and every override in the
// responsive file was dead on arrival.
//
// This was found the hard way: the mobile filter sheet declared
// `width: 100%; max-width: none` inside `@media (max-width: 640px)` and still
// measured 328px on a 360px viewport, because the base
// `width: min(360px, calc(100vw - 32px))` in components.css was emitted after
// it. Responsive overrides must therefore be imported LAST. If a
// `max-width` rule here ever stops taking effect, check this order first.
import "./styles/components.css";
import "./styles/responsive.css";

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
