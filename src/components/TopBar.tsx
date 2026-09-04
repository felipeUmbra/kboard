import { useAuth } from "../auth/useAuth";
import { useBoard } from "../state/BoardContext";

export function TopBar({
  onOpenMenu,
  onNavigateList,
  onNavigatePlanner,
  menuLabel,
}: {
  onOpenMenu: () => void;
  onNavigateList: () => void;
  onNavigatePlanner?: () => void;
  menuLabel: string;
}) {
  const { profile, logout } = useAuth();
  const { activeBoard, syncing } = useBoard();

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__menu-btn btn--ghost"
        onClick={onOpenMenu}
        aria-label={menuLabel}
        title={menuLabel}
        style={{ color: "#fff" }}
      >
        <MenuIcon />
      </button>
      <button
        type="button"
        onClick={onNavigateList}
        style={{ color: "#fff", fontWeight: 600, fontSize: "var(--text-lg)" }}
        className="btn btn--ghost"
      >
        📋 Kboard
      </button>
      {activeBoard && (
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "var(--text-sm)" }}>
          / {activeBoard.name}
          {syncing && <span style={{ marginLeft: 8, opacity: 0.7 }}>· syncing…</span>}
        </span>
      )}
      <span className="topbar__spacer" />
      {onNavigatePlanner && (
        <button
          type="button"
          onClick={onNavigatePlanner}
          className="btn btn--ghost"
          style={{ color: "#fff" }}
          data-testid="topbar-planner"
        >
          📅 Planner
        </button>
      )}
      {profile && (
        <div className="topbar__user">
          <span className="topbar__name">{profile.name}</span>
          <div className="topbar__avatar" aria-hidden>
            {profile.picture ? (
              <img src={profile.picture} alt="" />
            ) : (
              <span>{(profile.name?.[0] ?? "?").toUpperCase()}</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={logout}
            aria-label="Sign out"
            style={{ color: "#fff" }}
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
