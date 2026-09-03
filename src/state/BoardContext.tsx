// In-memory board state + debounced sync to Google Drive.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  listBoards as repoList,
  loadBoard as repoLoad,
  saveBoard as repoSave,
} from "../drive/boardRepository";
import type { Board } from "../models/types";
import { buildActions, type BoardActions } from "./boardActions";
import { useAuth, BOARDS_CACHE_STORAGE_KEY } from "../auth/useAuth";

const DEBOUNCE_MS = 600;

/** Read cached boards from localStorage. Returns null on any failure. */
function loadBoardsCache(): Board[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOARDS_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as Board[];
  } catch {
    return null;
  }
}

/** Persist the current board list to localStorage (best-effort). */
function saveBoardsCache(boards: Board[]): void {
  if (typeof window === "undefined") return;
  try {
    // Drop driveVersion (ETag) — it changes on every save and would
    // invalidate the cache for no useful purpose.
    const sanitized = boards.map((b) => {
      const { driveVersion, ...rest } = b;
      void driveVersion;
      return rest as Board;
    });
    localStorage.setItem(BOARDS_CACHE_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // Ignore quota / serialization errors
  }
}

export interface BoardContextValue extends BoardActions {
  boards: Board[];
  loadingList: boolean;
  activeBoard: Board | null;
  loadingBoard: boolean;
  syncing: boolean;
  lastError: string | null;
  refreshList: () => Promise<void>;
  openBoard: (boardId: string) => Promise<void>;
  closeBoard: () => void;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  // Seed from cache so the user always sees their boards immediately on
  // reload — even before Drive is reachable.
  const [boards, setBoards] = useState<Board[]>(() => loadBoardsCache() ?? []);
  const [loadingList, setLoadingList] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const boardRef = useRef<Board | null>(board);
  boardRef.current = board;

  /**
   * Acquire a valid access token before any Drive call. If the token
   * grant fails (e.g. user has no Google session), `withToken` returns
   * null and the caller is expected to bail out gracefully.
   *
   * If the Drive call returns 403 (insufficient scopes), we trigger
   * a fresh interactive consent grant and retry once. This handles
   * the case where the user previously authorized with fewer scopes
   * than the app currently requests.
   *
   * Note: we intentionally do NOT call this automatically on page load.
   * Modern browsers block OAuth popups that aren't tied to a user
   * gesture. Reloading the page is not a recognized gesture, so any
   * silent grant on mount will fail. Drive calls are only triggered
   * from explicit user actions (clicks) — those work fine.
   */
  const withToken = useCallback(
    async <T,>(op: () => Promise<T>): Promise<T | null> => {
      const ok = await auth.ensureToken();
      if (!ok) return null;
      try {
        return await op();
      } catch (err) {
        // Auto-retry once with a fresh consent grant if Drive rejects
        // the token due to insufficient scopes.
        if (err instanceof Error && /\b(401|403)\b/.test(err.message)) {
          const reauthed = await auth.reauthenticate();
          if (reauthed) {
            try {
              return await op();
            } catch {
              return null;
            }
          }
        }
        return null;
      }
    },
    [auth],
  );

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    setLastError(null);
    try {
      const result = await withToken(async () => {
        const summaries = await repoList();
        return Promise.all(
          summaries.map(async (s) => repoLoad(s.driveFileId)),
        );
      });
      if (result) {
        setBoards(result);
        saveBoardsCache(result);
      } else {
        // Token grant was blocked or failed. Tell the user to sign in.
        setLastError(
          "Please click \"Sign in with Google\" below to connect to Drive.",
        );
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Failed to load boards");
    } finally {
      setLoadingList(false);
    }
  }, [withToken]);

  const openBoard = useCallback(
    async (boardId: string) => {
      setLastError(null);
      const found = boards.find((b) => b.id === boardId);
      // We can open from cache without Drive if we have the full board
      // locally. The Drive round-trip only matters if the cached
      // version is stale.
      if (found) {
        setBoard(found);
        return;
      }
      try {
        const result = await withToken(async () => {
          const summaries = await repoList();
          const summary = summaries.find((s) => s.id === boardId);
          if (!summary) {
            throw new Error("Board not found in Drive");
          }
          return repoLoad(summary.driveFileId);
        });
        if (result) {
          setBoard(result);
          setBoards((prev) => {
            const others = prev.filter((b) => b.id !== result.id);
            return [result, ...others];
          });
        } else {
          setLastError(
            "Please click \"Sign in with Google\" below to connect to Drive.",
          );
        }
      } catch (err) {
        setLastError(err instanceof Error ? err.message : "Failed to open board");
      }
    },
    [boards, withToken],
  );

  const closeBoard = useCallback(() => {
    setBoard(null);
    setLastError(null);
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const current = boardRef.current;
      if (!current || !current.driveFileId) return;
      setSyncing(true);
      setLastError(null);
      try {
        const saved = await withToken(() => repoSave(current));
        if (saved) {
          // CRITICAL: do NOT replace the in-memory board with `saved`.
          // `saved` is a snapshot taken at the moment the timer fired —
          // any mutations the user made *during* the async save round-trip
          // (e.g. clicking the Story radio, editing a title, adding a
          // 4th card) are NOT in `saved`. Replacing the board would
          // silently revert those mutations, which is what was causing
          // flaky failures in board.spec.ts ("Change card type from task
          // to story", "Open card editor and edit title") and in
          // hierarchy-progress.spec.ts ("Drag & drop updates progress
          // bar color" — the 4th addCard was reverted by a stale
          // response from an earlier save).
          //
          // Only carry forward the fields the save actually updates
          // (driveVersion + updatedAt). Everything else stays as-is.
          setBoard((prev) =>
            prev ? { ...prev, driveVersion: saved.driveVersion, updatedAt: saved.updatedAt } : prev,
          );
          setBoards((prev) => {
            const next = prev.map((b) =>
              b.id === saved.id
                ? { ...b, driveVersion: saved.driveVersion, updatedAt: saved.updatedAt }
                : b,
            );
            saveBoardsCache(next);
            return next;
          });
        }
      } catch (err) {
        setLastError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSyncing(false);
      }
    }, DEBOUNCE_MS);
  }, [withToken]);

  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const mutate = useCallback(
    (updater: (b: Board) => Board) => {
      setBoard((prev) => (prev ? updater(prev) : prev));
      scheduleSave();
    },
    [scheduleSave],
  );

  const actions = useMemo(
    () =>
      buildActions({
        mutate,
        setBoard,
        setBoards,
        setLastError,
        withToken,
        reauthenticate: auth.reauthenticate,
      }),
    [mutate, withToken, auth],
  );

  const value = useMemo<BoardContextValue>(
    () => ({
      boards,
      loadingList,
      activeBoard: board,
      loadingBoard: false,
      syncing,
      lastError,
      refreshList,
      openBoard,
      closeBoard,
      ...actions,
    }),
    [boards, loadingList, board, syncing, lastError, refreshList, openBoard, closeBoard, actions],
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used inside <BoardProvider>");
  return ctx;
}
