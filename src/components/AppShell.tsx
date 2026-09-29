import { useState, type ReactNode } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { useViewport } from "../hooks/useViewport";

export function AppShell({
  children,
  onNavigateList,
  onNavigatePlanner,
}: {
  children: ReactNode;
  onNavigateList: () => void;
  onNavigatePlanner?: () => void;
}) {
  const viewport = useViewport();
  // Single source of truth for the sidebar's horizontal collapse state on ALL
  // viewports. On mobile the rail starts collapsed (icons only); desktop and
  // tablet start expanded. The topbar hamburger toggles it.
  const [railCollapsed, setRailCollapsed] = useState(viewport.isMobile);

  return (
    <div className="app-shell">
      {/* WCAG 2.4.1 Bypass Blocks. Without this, a keyboard user has to tab
          through the topbar and the whole sidebar on every view change. The
          link is visually hidden until focused, then pinned to the top-left
          so it is the first thing announced and visible on Tab. */}
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <TopBar
        onOpenMenu={() => setRailCollapsed((v) => !v)}
        onNavigateList={onNavigateList}
        onNavigatePlanner={onNavigatePlanner}
        menuLabel={railCollapsed ? "Expand menu" : "Collapse menu"}
      />
      <div className="app-main">
        {viewport.isMobile && !railCollapsed && (
          <div className="sidebar__backdrop" onClick={() => setRailCollapsed(true)} />
        )}
        <Sidebar
          open={true}
          collapsed={railCollapsed}
          onClose={() => setRailCollapsed(true)}
          onExpand={() => setRailCollapsed(false)}
          onToggle={() => setRailCollapsed((v) => !v)}
        />
        {/* tabIndex={-1} so the skip link's target can actually receive focus.
            Without it, activating the link scrolls but leaves focus in the
            sidebar, which is the behaviour 2.4.1 exists to prevent. */}
        <main
          id="main-content"
          className="app-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
