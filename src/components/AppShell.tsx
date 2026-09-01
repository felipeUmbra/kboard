import { useEffect, useState, type ReactNode } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { useViewport } from "../hooks/useViewport";

export function AppShell({
  children,
  onNavigateList,
}: {
  children: ReactNode;
  onNavigateList: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const viewport = useViewport();

  // Close drawer when crossing to desktop
  useEffect(() => {
    if (!viewport.isMobile) setDrawerOpen(false);
  }, [viewport.isMobile]);

  return (
    <div className="app-shell">
      <TopBar
        onOpenMenu={() => {
          if (viewport.isMobile) setDrawerOpen(true);
          else setRailCollapsed((v) => !v);
        }}
        onNavigateList={onNavigateList}
        menuLabel={viewport.isMobile ? "Open menu" : railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      />
      <div className="app-main">
        {viewport.isMobile && drawerOpen && (
          <div className="sidebar__backdrop" onClick={() => setDrawerOpen(false)} />
        )}
        <Sidebar
          open={viewport.isMobile ? drawerOpen : true}
          collapsed={!viewport.isMobile && railCollapsed}
          onClose={() => setDrawerOpen(false)}
        />
        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}
