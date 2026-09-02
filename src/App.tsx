import { useEffect, useState } from "react";
import { useAuth } from "./auth/useAuth";
import { useBoard } from "./state/BoardContext";
import { LoginScreen } from "./components/LoginScreen";
import { AppShell } from "./components/AppShell";
import { BoardListView } from "./components/BoardListView";
import { BoardView } from "./components/BoardView";
import { Banner } from "./components/Banner";

export function App() {
  const auth = useAuth();
  const board = useBoard();
  // `view` is purely a view-state concern. The board data lives in
  // BoardContext (board.activeBoard). We keep them in sync by:
  //   - When activeBoard is set, we're in "board" view.
  //   - When the user clicks "back", we clear activeBoard AND view.
  //   - When openBoard is called, it sets activeBoard and view flips.
  const [view, setView] = useState<"list" | "board">(
    board.activeBoard ? "board" : "list",
  );

  // If activeBoard is cleared (back, delete, sign-out), make sure the
  // view follows. This effect is the single source of truth.
  useEffect(() => {
    if (board.activeBoard) {
      setView("board");
    } else {
      setView("list");
    }
  }, [board.activeBoard]);

  // Reset to list view on sign-in / sign-out.
  useEffect(() => {
    setView(board.activeBoard ? "board" : "list");
    // We intentionally depend on auth.profile.id only — we don't want
    // to re-evaluate on every BoardContext change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.profile?.id]);

  if (!auth.profile) {
    return <LoginScreen {...auth} />;
  }

  // Going back to the list: clear the active board AND switch view.
  // We must call closeBoard() so the sidebar stops showing the
  // previous board's labels, custom fields, etc.
  const goToList = () => {
    board.closeBoard();
    setView("list");
  };

  // Choose the right recovery action based on the error message.
  // 401/403 = token missing scopes → force a fresh consent grant.
  // Otherwise = generic "sign in" recovery.
  const errorAction = board.lastError
    ? /\b(401|403)\b/.test(board.lastError) ||
      /insufficient|permission|scope/i.test(board.lastError)
      ? {
          label: "Reconnect to Drive",
          onClick: () => void auth.reauthenticate(),
        }
      : { label: "Sign in with Google", onClick: () => void auth.login() }
    : undefined;

  return (
    <AppShell onNavigateList={goToList}>
      {board.lastError && (
        <Banner
          kind="error"
          message={board.lastError}
          onDismiss={() => void 0}
          action={errorAction}
        />
      )}
      {view === "list" || !board.activeBoard ? (
        <BoardListView />
      ) : (
        <BoardView onBackToList={goToList} />
      )}
    </AppShell>
  );
}
