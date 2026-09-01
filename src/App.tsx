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
  const [view, setView] = useState<"list" | "board">("list");

  // Load board list after sign-in AND after silent re-auth completes.
  // Without waiting for `auth.ready`, Drive calls fired on page reload
  // race each other and never get a valid token.
  useEffect(() => {
    if (!auth.profile || !auth.ready) return;
    void board.refreshList();
    setView("list");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.profile?.id, auth.ready]);

  // Switch view when active board changes.
  useEffect(() => {
    if (board.activeBoard) setView("board");
    else setView("list");
  }, [board.activeBoard]);

  if (!auth.profile) {
    return <LoginScreen {...auth} />;
  }

  return (
    <AppShell onNavigateList={() => setView("list")}>
      {board.lastError && (
        <Banner kind="error" message={board.lastError} onDismiss={() => board.refreshList()} />
      )}
      {view === "list" || !board.activeBoard ? (
        <BoardListView />
      ) : (
        <BoardView onBackToList={() => board.closeBoard()} />
      )}
    </AppShell>
  );
}
