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
  getFile as driveGetFile,
} from "../drive/driveClient";
import {
  listBoards as repoList,
  loadBoard as repoLoad,
  saveBoard as repoSave,
} from "../drive/boardRepository";
import type { Board } from "../models/types";
import { buildActions, type BoardActions } from "./boardActions";
import { useAuth, BOARDS_CACHE_STORAGE_KEY } from "../auth/useAuth";
import { cardDrafts } from "./cardDrafts";

const DEBOUNCE_MS = 600;

/**
 * Skip Drive revalidation for a board if we asked Drive about it less than
 * this many ms ago. Keeps the per-open call rate low while still catching
 * changes that happened between sessions.
 */
const REVALIDATE_TTL_MS = 60_000;

/** Client-side cache metadata: when we last asked Drive if a board changed. */
interface BoardCacheMeta {
  /** Epoch ms of the last time we asked Drive about this board. */
  lastCheckedAt: number;
}

const CACHE_META_STORAGE_KEY = "kboard:boards-cache-meta";

/** Read cached revalidation metadata from localStorage. */
function loadBoardsCacheMeta(): Record<string, BoardCacheMeta> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_META_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, BoardCacheMeta>;
  } catch {
    return null;
  }
}

/** Persist revalidation metadata to localStorage (best-effort). */
function saveBoardsCacheMeta(meta: Record<string, BoardCacheMeta>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Ignore quota / serialization errors
  }
}

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
  // Per-board revalidation metadata: tracks the last time we asked Drive
  // about each board so we don't refetch on every open. Lives in state +
  // localStorage; not part of the Board domain type because it's purely
  // client-side bookkeeping.
  const [cacheMeta, setCacheMeta] = useState<Record<string, BoardCacheMeta>>(
    () => loadBoardsCacheMeta() ?? {},
  );
  const saveTimer = useRef<number | null>(null);
  const boardRef = useRef<Board | null>(board);
  boardRef.current = board;

  /** True if there's a debounced save scheduled (i.e. local edits in flight). */
  function isBoardMutatingLocally(): boolean {
    return saveTimer.current !== null;
  }

  /** Mark a board as recently revalidated so subsequent opens skip the check. */
  const bumpLastChecked = useCallback((boardId: string) => {
    setCacheMeta((prev) => {
      const next = { ...prev, [boardId]: { lastCheckedAt: Date.now() } };
      saveBoardsCacheMeta(next);
      return next;
    });
  }, []);

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
        // Mark all boards as just-revalidated so the next openBoard
        // doesn't immediately re-check each one against Drive.
        const now = Date.now();
        setCacheMeta((prev) => {
          const next: Record<string, BoardCacheMeta> = {};
          for (const b of result) {
            // Preserve an existing, more-recent check (defensive — shouldn't happen).
            next[b.id] = prev[b.id]?.lastCheckedAt
              ? { lastCheckedAt: Math.max(prev[b.id].lastCheckedAt, now) }
              : { lastCheckedAt: now };
          }
          saveBoardsCacheMeta(next);
          return next;
        });
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

  /**
   * Background revalidation: compare the cached board against Drive's
   * `modifiedTime`. If Drive is newer, fetch the full board and swap it in.
   *
   * Two-step fetch (metadata first, content only if newer) keeps the
   * common case cheap: the daily reopen of a board you've been editing
   * today is just one tiny GET against files.get.
   *
   * Idempotent w.r.t. local edits: if the user starts editing between
   * the metadata check and the full load, the local mutation wins.
   */
  const reconcileBoard = useCallback(
    async (boardId: string, driveFileId: string, localUpdatedAt: number) => {
      // Stamp the TTL up-front to coalesce concurrent opens. We update
      // again on success below; the early stamp prevents a burst of
      // openBoard calls from firing multiple reconciles.
      bumpLastChecked(boardId);

      const meta = await withToken(() => driveGetFile(driveFileId));
      if (!meta) return; // token grant failed; UI already has lastError

      const driveUpdatedAt = new Date(meta.modifiedTime).getTime();
      if (driveUpdatedAt <= localUpdatedAt) return; // cache is current

      const fresh = await withToken(() => repoLoad(driveFileId));
      if (!fresh) return;

      // Final guard: don't clobber edits that landed during the fetch.
      if (isBoardMutatingLocally()) return;
      // Don't replace a board the user has navigated away from. We use
      // `cur?.id` inside the setter below as the source of truth — by
      // the time the await resolves, React has typically flushed the
      // setBoard(found) from openBoard and boardRef points to the
      // opened board. If the user has since opened a different board
      // the setter's id check rejects the swap.
      setBoard((cur) => (cur?.id === boardId ? fresh : cur));
      setBoards((prev) => {
        const next = prev.map((b) => (b.id === boardId ? fresh : b));
        saveBoardsCache(next);
        return next;
      });
    },
    [withToken, bumpLastChecked],
  );

  const openBoard = useCallback(
    async (boardId: string) => {
      setLastError(null);
      const found = boards.find((b) => b.id === boardId);
      // We can open from cache without Drive if we have the full board
      // locally. The Drive round-trip only matters if the cached
      // version is stale.
      if (found) {
        setBoard(found);
        // Background revalidation: if Drive has a newer version, swap it in.
        // Gated by:
        //  - driveFileId (can't reconcile a never-committed board)
        //  - no local edits in flight (avoids clobbering pending changes)
        //  - a per-board TTL (avoids hammering the API on every open)
        if (found.driveFileId && !isBoardMutatingLocally()) {
          const meta = cacheMeta[found.id];
          const stale =
            !meta || Date.now() - meta.lastCheckedAt >= REVALIDATE_TTL_MS;
          if (stale) {
            void reconcileBoard(found.id, found.driveFileId, found.updatedAt);
          }
        }
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
          // Mark as just-revalidated so subsequent opens don't re-check.
          bumpLastChecked(result.id);
        } else {
          setLastError(
            "Please click \"Sign in with Google\" below to connect to Drive.",
          );
        }
      } catch (err) {
        setLastError(err instanceof Error ? err.message : "Failed to open board");
      }
    },
    [boards, withToken, cacheMeta, bumpLastChecked],
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

  /**
   * Drop a board's revalidation metadata and per-card drafts when it's
   * deleted. Keeps the cache meta from accumulating entries for boards
   * that no longer exist and stops drafts from being resurrected for
   * cards that will never reappear.
   */
  const handleBoardDeleted = useCallback((deletedBoard: Board) => {
    setCacheMeta((prev) => {
      if (!(deletedBoard.id in prev)) return prev;
      const next = { ...prev };
      delete next[deletedBoard.id];
      saveBoardsCacheMeta(next);
      return next;
    });
    for (const cardId of Object.keys(deletedBoard.cards)) {
      cardDrafts.delete(cardId);
    }
  }, []);

  const actions = useMemo(
    () =>
      buildActions({
        mutate,
        setBoard,
        setBoards,
        setLastError,
        withToken,
        reauthenticate: auth.reauthenticate,
        onBoardDeleted: handleBoardDeleted,
      }),
    [mutate, withToken, auth, handleBoardDeleted],
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
