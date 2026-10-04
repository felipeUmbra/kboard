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
  const { activeBoard, syncing, pendingSaves } = useBoard();
  // Bug #20: a save that failed (typically because the network is down) used
  // to be invisible — the board looked right and nothing said otherwise, so
  // the edit was lost on reload. Say so explicitly instead.
  const hasUnsaved =
    activeBoard != null && pendingSaves.has(activeBoard.id);

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__menu-btn btn--ghost"
        onClick={onOpenMenu}
        aria-label={menuLabel}
        title={menuLabel}
        style={{ color: "var(--color-on-accent)" }}
      >
        <MenuIcon />
      </button>
      <button
        type="button"
        onClick={onNavigateList}
        style={{
          color: "var(--color-on-accent)",
          fontWeight: 600,
          fontSize: "var(--text-lg)",
        }}
        className="btn btn--ghost"
      >
        📋 Kboard
      </button>
      {activeBoard && (
        <span
          className="topbar__board"
          style={{ color: "var(--color-on-accent)", fontSize: "var(--text-sm)" }}
        >
          / {activeBoard.name}
          {syncing && (
            /* Not `opacity` — dimming white text on the accent bar that way
               composites it to 4.39:1, under the 4.5:1 AA floor (found by
               axe-core, Sprint 4.1). A solid lighter tint of the same hue
               keeps the "de-emphasised but legible" intent. */
            <span style={{ marginLeft: 8, color: "var(--color-accent-muted)" }}>
              · syncing…
            </span>
          )}
          {hasUnsaved && !syncing && (
            /* Bug #20. Deliberately NOT a live region: this updates on
               every save tick, which would make a screen reader interrupt
               itself. `title` (and the visually-hidden text below) carries
               the same information for hover and for assistive tech.

               Rendered as a fixed-size DOT, not a word. The whole board label
               sits inside `.topbar__board`, which is `white-space: nowrap`
               inside a flex row that already exactly fills a 360px viewport.
               Any extra width here does not truncate - it pushes the later
               siblings left, which made the topbar's own hamburger overlap
               the adjacent "Kboard" button. Clicking the hamburger then hit
               "Kboard" (onNavigateList) instead, silently navigating to the
               boards list and losing the open board. A dot has a fixed
               footprint, so the header cannot grow. */
            <span
              style={{
                marginLeft: 8,
                color: "var(--color-accent-muted)",
                display: "inline-flex",
                alignItems: "center",
              }}
              data-testid="unsaved-indicator"
              title="Saved on this device. It will sync to Drive automatically when you're back online."
            >
              <span aria-hidden="true">●</span>
              <span className="sr-only">
                Unsaved changes. Saved on this device and waiting to sync to
                Drive.
              </span>
            </span>
          )}
        </span>
      )}
      <span className="topbar__spacer" />
      {onNavigatePlanner && (
        <button
          type="button"
          onClick={onNavigatePlanner}
          className="btn btn--ghost"
          style={{ color: "var(--color-on-accent)" }}
          data-testid="topbar-planner"
        >
          📅<span className="topbar__planner-label"> Planner</span>
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
            style={{ color: "var(--color-on-accent)" }}
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
