import { useEffect, useState } from "react";
import { useAuth } from "./auth/useAuth";
import { useBoard } from "./state/BoardContext";
import { LoginScreen } from "./components/LoginScreen";
import { AppShell } from "./components/AppShell";
import { BoardListView } from "./components/BoardListView";
import { BoardView } from "./components/BoardView";
import { Banner } from "./components/Banner";
import { UpdateToast } from "./components/UpdateToast";
import { ShareToBoardModal } from "./components/ShareToBoardModal";
import { PlannerView } from "./views/PlannerView";
import {
  getShareIdFromUrl,
  take as takeShare,
  type SharedPayload,
} from "./share/shareInbox";
import { applyPwaUpdate } from "./pwa";

export function App() {
  const auth = useAuth();
  const board = useBoard();
  // `view` is purely a view-state concern. The board data lives in
  // BoardContext (board.activeBoard). We keep them in sync by:
  //   - When activeBoard is set, we're in "board" view.
  //   - When the user clicks "back", we clear activeBoard AND view.
  //   - When openBoard is called, it sets activeBoard and view flips.
  const [view, setView] = useState<"list" | "board" | "planner">(
    board.activeBoard ? "board" : "list",
  );

  // Shared-content handoff from the PWA share_target flow. Set once on
  // mount if the page was opened via Android "Share to Kboard". After
  // the user dismisses the share modal we clear it.
  const [sharePayload, setSharePayload] = useState<SharedPayload | null>(null);

  // If activeBoard is set, the user is in "board" view. If the user
  // explicitly navigated to the planner (which closes the active
  // board) we keep them there. Otherwise we fall back to the list.
  useEffect(() => {
    if (board.activeBoard) {
      setView("board");
      return;
    }
    // activeBoard was cleared. Don't yank the user away from the
    // planner — that's an explicit user choice that closeBoard()
    // was just used to support.
    setView((v) => (v === "planner" ? v : "list"));
  }, [board.activeBoard]);

  // Reset to list view on sign-in / sign-out.
  useEffect(() => {
    setView(board.activeBoard ? "board" : "list");
    // We intentionally depend on auth.profile.id only — we don't want
    // to re-evaluate on every BoardContext change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.profile?.id]);

  // On first mount, check for ?share=<id>. If present, fetch the
  // payload from IndexedDB (written by public/share-capture.html)
  // and pre-open the share modal. We only do this once and only
  // after the user is signed in, so an unauthenticated user sharing
  // into the app lands on the login screen first and is re-prompted
  // on the next mount after they sign in.
  useEffect(() => {
    if (!auth.profile) return;
    const id = getShareIdFromUrl();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const payload = await takeShare(id);
      if (cancelled) return;
      if (payload) {
        setSharePayload(payload);
      }
      // Always strip the param so reload / back doesn't re-trigger.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("share");
        window.history.replaceState({}, "", url.toString());
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
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

  // Switching to the planner: clear any active board so the sidebar
  // doesn't show stale labels/fields, and render the planner.
  const goToPlanner = () => {
    board.closeBoard();
    setView("planner");
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

  // Create a board from a shared payload. After the board is created
  // and made active, we add a card to the first column with the
  // shared text as its description, so the share content is right
  // there waiting for the user to triage.
  const handleShareCreate = async (input: {
    name: string;
    description: string;
  }) => {
    const created = await board.createNewBoard(input.name);
    // createNewBoard sets activeBoard. From there the rest is a
    // normal edit: addCard returns the new card id; updateCard writes
    // the description. The new card's title comes from the share
    // payload's title (or a sensible default), and the description
    // carries the text/url so it's immediately usable.
    const todoColumnId = created?.columns[0]?.id;
    if (todoColumnId) {
      const titleFromShare =
        sharePayload?.title?.trim() || "Shared item";
      const newCardId = board.addCard(todoColumnId, titleFromShare);
      if (newCardId && input.description) {
        // descriptionHtml: the editor renders sanitized HTML via
        // DOMPurify (RichTextEditor). We escape plain text here and
        // use <br> for line breaks; the sanitizer cleans on render.
        const escaped = input.description
          .split(/\r?\n/)
          .map((line) =>
            line
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;"),
          )
          .join("<br>");
        board.updateCard(newCardId, {
          descriptionHtml: `<p>${escaped}</p>`,
        });
      }
    }
    setSharePayload(null);
  };

  return (
    <AppShell onNavigateList={goToList} onNavigatePlanner={goToPlanner}>
      {board.lastError && (
        <Banner
          kind="error"
          message={board.lastError}
          onDismiss={() => void 0}
          action={errorAction}
        />
      )}
      {view === "planner" ? (
        <PlannerView />
      ) : view === "list" || !board.activeBoard ? (
        <BoardListView onNavigatePlanner={goToPlanner} />
      ) : (
        <BoardView onBackToList={goToList} />
      )}
      {sharePayload && (
        <ShareToBoardModal
          payload={sharePayload}
          onCreate={handleShareCreate}
          onClose={() => setSharePayload(null)}
        />
      )}
      <UpdateToast onReload={() => void applyPwaUpdate()} />
    </AppShell>
  );
}
