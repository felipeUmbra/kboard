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
        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}
