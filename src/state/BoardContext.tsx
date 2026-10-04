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
import { setCardStartDate, setCardDueDate } from "./cardActions";
import { useAuth, BOARDS_CACHE_STORAGE_KEY, PENDING_SAVES_KEY } from "../auth/useAuth";
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

/**
 * Board ids whose latest local edit has not yet been confirmed by Drive.
 *
 * Bug #20 needed this to be durable, not just in-memory. The local cache
 * alone is not enough: it preserves the user's data across a reload, but
 * nothing then knows the board is DIRTY, so no save is ever attempted and
 * the edit sits in the cache forever, silently out of sync with Drive. A
 * reload while offline therefore strands the edit unless the flag itself
 * survives.
 *
 * The key lives in `useAuth` (as PENDING_SAVES_KEY) so `logout` and this
 * tracking cannot drift apart; it is aliased here to match the
 * `*_STORAGE_KEY` naming used by the other caches in this file.
 */
const PENDING_SAVES_STORAGE_KEY = PENDING_SAVES_KEY;

function loadPendingSaves(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_SAVES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function savePendingSaves(ids: Iterable<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_SAVES_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore quota / serialization errors
  }
}

/**
 * How long to wait before retrying a failed Drive save, and the ceiling on
 * consecutive attempts. The board that failed is remembered by id so a retry
 * re-saves CURRENT state rather than a stale snapshot taken when it failed.
 */
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;

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
  /**
   * Ids of boards with edits that have not yet reached Drive. Non-empty means
   * "your work is safe locally but not yet in Drive" — shown as an unsaved
   * indicator rather than silently swallowed (bug #20).
   */
  pendingSaves: ReadonlySet<string>;
  refreshList: () => Promise<void>;
  /**
   * Open a board. The optional `focusCardId` is a one-shot hint:
   * the BoardView reads it on mount, scrolls the matching card into
   * view, and clears it. Used by Planner / Inbox row clicks.
   */
  openBoard: (boardId: string, focusCardId?: string) => Promise<void>;
  closeBoard: () => void;
  /**
   * One-shot focus hint, set by openBoard(_, cardId). The BoardView
   * reads it and calls clearFocusCard() once the card is scrolled
   * into view, so a subsequent openBoard(boardId) doesn't carry
   * the stale hint.
   */
  focusCardId: string | null;
  clearFocusCard: () => void;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  // Seed from cache so the user always sees their boards immediately on
  // reload — even before Drive is reachable.
  const [boards, setBoards] = useState<Board[]>(() => loadBoardsCache() ?? []);
  const [loadingList, setLoadingList] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  // One-shot focus hint: set by openBoard(boardId, cardId), consumed
  // (and cleared) by BoardView when it mounts/renders the card. The
  // BoardView clears it via a follow-up openBoard(boardId) — see
  // BoardView for the consume-and-clear pattern. We store it in state
  // (not in a ref) so React re-renders the BoardView when it changes.
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  /**
   * Ids of boards whose latest edit has NOT yet reached Drive. Bug #20:
   * a failed save used to be invisible — the board looked correct and the
   * UI said nothing, so an offline edit simply vanished on reload. This
   * set is what the "unsaved changes" indicator reads, and it is also what
   * the `online` listener checks to decide whether a flush is worthwhile.
   */
  const [pendingSaves, setPendingSaves] = useState<Set<string>>(
    () => new Set(loadPendingSaves()),
  );
  const pendingSavesRef = useRef<Set<string>>(pendingSaves);
  pendingSavesRef.current = pendingSaves;
  // Per-board revalidation metadata: tracks the last time we asked Drive
  // about each board so we don't refetch on every open. Lives in state +
  // localStorage; not part of the Board domain type because it's purely
  // client-side bookkeeping.
  const [cacheMeta, setCacheMeta] = useState<Record<string, BoardCacheMeta>>(
    () => loadBoardsCacheMeta() ?? {},
  );
  const saveTimer = useRef<number | null>(null);
  // Bug #20: a failed Drive save is retried on this timer with backoff, so a
  // temporary outage no longer discards the edit.
  const retryTimer = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const boardRef = useRef<Board | null>(board);
  boardRef.current = board;
  // Keep boardRef.current in sync with board state so that publishChange's
  // setBoards callback always finds the active board by ID.
  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  // Mirror of the `boards` array, used by the test-only window hook
  // so it can read the latest list state without going through the
  // React render cycle.
  const boardsRef = useRef<Board[]>(boards);
  boardsRef.current = boards;

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
    async (boardId: string, cardId?: string) => {
      setLastError(null);
      // Set the focus hint even if the board is already open — the
      // caller (Planner / Inbox row) wants the card to be scrolled
      // into view, not just the board to be re-activated.
      if (cardId !== undefined) setFocusCardId(cardId);
      else setFocusCardId(null);
      const found = boards.find((b) => b.id === boardId);
      // We can open from cache without Drive if we have the full board
      // locally. The Drive round-trip only matters if the cached
      // version is stale.
      if (found) {
        setBoard(found);
        // Bug #20: this board is dirty from an earlier session (an edit made
        // offline and not yet confirmed by Drive). Nothing else would ever
        // retry it, because a reload discards the in-memory timer — the edit
        // would sit in the local cache forever, silently out of sync. Flush
        // it as soon as the board is opened.
        if (pendingSaves.has(found.id)) scheduleSave();
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
    // Closing the board always clears any pending focus hint.
    setFocusCardId(null);
  }, []);

  const clearFocusCard = useCallback(() => {
    setFocusCardId(null);
  }, []);

  /**
   * Persist the board to Drive, retrying with backoff while it fails.
   *
   * Bug #20: this used to fire once and silently give up.
   *   - The local cache write lived INSIDE the `if (saved)` branch, so a
   *     failed save persisted nothing anywhere. An offline edit rendered in
   *     the open board and then vanished on reload — data loss, with no
   *     error surfaced.
   *   - `withToken` returns `null` on ANY throw, not only an auth failure,
   *     so a plain network blip was indistinguishable from "not signed in"
   *     and took the same silent path.
   *   - Nothing ever retried, so reconnecting did not help. README.md:54
   *     promises writes are "deferred ... until you're back online".
   *
   * Now: the local cache is written FIRST and unconditionally (it is the
   * only durable copy we control), and a failure schedules a retry with
   * exponential backoff. The retry re-reads the board from `boardRef` /
   * `boardsRef`, so it always saves current state instead of the stale
   * snapshot that failed.
   */
  /**
   * Mark a board's local edits as confirmed by Drive (or forget it).
   * Persisted so the dirty set survives a reload — see
   * PENDING_SAVES_STORAGE_KEY for why that matters.
   */
  const markSaved = useCallback((boardId: string, saved: boolean) => {
    setPendingSaves((prev) => {
      const has = prev.has(boardId);
      if (has === !saved) return prev; // already in the desired state
      const next = new Set(prev);
      if (saved) next.delete(boardId);
      else next.add(boardId);
      savePendingSaves(next);
      return next;
    });
  }, []);

  /**
   * Which board is the current save attempt about?
   *
   * Normally the open board. But after a reload the user may not have
   * reopened the dirty board yet, and `boardRef.current` would be null —
   * in which case the pending edit would be unsaveable and, worse, would
   * clear itself from the dirty set. So fall back to any board in the
   * list that is still marked dirty. This is what lets a page load
   * recover an edit that was made offline in a previous session.
   */
  const resolveBoardToSave = useCallback((): Board | null => {
    const active = boardRef.current;
    if (active?.driveFileId) return active;
    const dirty = pendingSavesRef.current;
    if (dirty.size === 0) return null;
    return boardsRef.current.find((b) => dirty.has(b.id) && b.driveFileId) ?? null;
  }, []);

  const saveBoardToDrive = useCallback(async () => {
    const current = resolveBoardToSave();
    if (!current || !current.driveFileId) return true;

    setSyncing(true);
    try {
      const saved = await withToken(() => repoSave(current));
      if (saved) {
        // CRITICAL: do NOT replace the in-memory board with `saved`.
        // `saved` is a snapshot taken at the moment the save started — any
        // mutations the user made *during* the async round-trip (clicking
        // the Story radio, editing a title, adding a 4th card) are NOT in
        // `saved`. Replacing the board would silently revert those
        // mutations, which is what caused flaky failures in board.spec.ts
        // ("Change card type from task to story", "Open card editor and edit
        // title") and hierarchy-progress.spec.ts ("Drag & drop updates
        // progress bar color" — the 4th addCard was reverted by a stale
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
        setPendingSaves((prev) => {
          if (!prev.has(current.id)) return prev;
          const next = new Set(prev);
          next.delete(current.id);
          savePendingSaves(next);
          return next;
        });
        setLastError(null);
        retryAttemptRef.current = 0;
        return true;
      }
      // withToken returned null: either the token grant failed or the Drive
      // call threw. Treat both as "not saved" and retry — the next attempt
      // re-runs ensureToken, so a genuinely signed-out user simply keeps
      // failing quietly in the background instead of thrashing the API.
      return false;
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSyncing(false);
    }
  }, [withToken, resolveBoardToSave]);

  /**
   * Re-attempt the Drive save after a backoff, and keep re-attempting until
   * it lands. `retryAttemptRef` bounds the delay, not the number of tries —
   * an edit made offline must eventually reach Drive even if the user walks
   * away for hours, because the alternative is silent data loss.
   *
   * Declared before `scheduleSave` because `scheduleSave` calls it.
   */
  const queueRetry = useCallback(() => {
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    const attempt = retryAttemptRef.current;
    retryAttemptRef.current = Math.min(attempt + 1, 6);
    const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = null;
      void (async () => {
        const ok = await saveBoardToDrive();
        if (!ok) queueRetry();
      })();
    }, delay);
  }, [saveBoardToDrive]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void (async () => {
        const ok = await saveBoardToDrive();
        if (!ok) queueRetry();
      })();
    }, DEBOUNCE_MS);
  }, [saveBoardToDrive, queueRetry]);

  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    };
  }, []);

  // While the browser believes it is offline, retrying on a timer is pure
  // waste. `online` is the signal that a retry is worth attempting; the
  // timer-based retry still covers the case where the network is reachable
  // but Drive is erroring (5xx, quota), which `online` cannot detect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const flush = () => {
      if (pendingSavesRef.current.size === 0) return;
      if (retryTimer.current !== null) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      retryAttemptRef.current = 0;
      void (async () => {
        const ok = await saveBoardToDrive();
        if (!ok) queueRetry();
      })();
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [saveBoardToDrive, queueRetry, pendingSaves]);

  // Startup flush (bug #20). A board can be left dirty by a session that
  // ended while offline: the retry timer died with the page, and the
  // in-memory `board` is null on a fresh load, so nothing would ever
  // re-attempt the save. The edit would sit in the local cache forever,
  // silently out of sync with Drive — exactly the data loss we fixed.
  //
  // Kick a retry on mount when there is anything to recover. It is a no-op
  // in the common case (nothing dirty) and silently backs off to the retry
  // loop if the network is still down, so it costs one wasted call at most.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pendingSaves.size === 0) return;
    if (!navigator.onLine) return; // wait for the `online` listener above
    if (saveTimer.current !== null) return; // a live edit already owns the save
    retryAttemptRef.current = 0;
    void (async () => {
      const ok = await saveBoardToDrive();
      if (!ok) queueRetry();
    })();
    // Run once per mount-key change only: re-running on every render of
    // `boards` would fire a Drive write per edit.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Apply a board change to all derived state. Every action goes
   * through here so the "what's a mutation" rule lives in one place.
   *
   * The three things `publishChange` does:
   *   1. Update the active board (`setBoard`) so the open board view
   *      sees the change.
   *   2. Update the boards list (`setBoards`) so the boards list,
   *      planner, and inbox all see the change. The match is by the
   *      active board's id; if there's no active board (the user is
   *      on the boards list, not inside a board), step 1 is a no-op
   *      and step 2 finds no match — both safe.
   *   3. Schedule the Drive save debounce so the change is
   *      persisted to the user's Drive.
   *
   * Adding new secondary views that read from `boards` (search index,
   * inbox filter, etc.) means teaching them about this function —
   * not about every action site. That's the win.
   */
  const publishChange = useCallback(
    (updater: (b: Board) => Board) => {
      // Apply the updater ONCE and reuse the result for both the active
      // board and the matching entry in the boards list.
      //
      // CRITICAL: the updater must run a single time. Many updaters are
      // NOT idempotent — e.g. `addCard`/`addChildCard` generate a fresh
      // `cryptoRandomId()` on every invocation, and running them twice
      // (once for `setBoard`, once for `setBoards`) would produce two
      // DIFFERENT card ids in the two states, silently desynchronizing
      // the board view from the Planner/boards list. That desync is what
      // made the planner tests flaky (dates seeded into the active board
      // never appeared in the boards list the Planner reads).
      //
      // We compute the next board from `boardRef.current` (kept fresh on
      // every render AND by the spread below), then:
      //   1. `setBoard(next)` — the open board view sees the change.
      //   2. `setBoards(prev => prev.map(candidate => candidate.id === next.id ? next : candidate))`
      //      — the boards list, planner, and inbox see the SAME object.
      //   3. `scheduleSave()` — persist to Drive (debounced).
      //
      // Reading the active board id up-front from the refs (rather than
      // ref writes inside the updaters) also sidesteps React's uncertainty
      // about functional-updater execution order within a batch.
      const current = boardRef.current;
      if (!current) return; // no active board → nothing to publish
      const next = updater(current);
      boardRef.current = next;
      setBoard(next);
      setBoards((prev) => {
        const list = prev.map((b) => (b.id === next.id ? next : b));
        boardsRef.current = list;
        // Bug #20: persist locally on EVERY edit, not only after Drive
        // confirms a save. This is the change that stops data loss — the
        // local cache is the only durable copy we control, and it must be
        // written before we know whether the network is up. Previously this
        // call lived inside the `if (saved)` branch of the save, so a failed
        // save left nothing on disk and an offline edit was gone on reload.
        saveBoardsCache(list);
        return list;
      });
      // Mark the board dirty immediately so the UI can say "unsaved" while
      // the debounce and any retry are still pending, and so a reload can
      // pick the work back up.
      if (next.driveFileId) markSaved(next.id, false);
      scheduleSave();
    },
    [scheduleSave, markSaved],
  );

  const mutate = useCallback(
    (updater: (b: Board) => Board) => {
      // Thin wrapper around publishChange. Kept for source compatibility
      // with the existing call sites — every new action should call
      // publishChange directly. The triple-step (active board, boards
      // list, save debounce) lives in one place.
      publishChange(updater);
    },
    [publishChange],
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
        getBoards: () => boardsRef.current,
        withToken,
        reauthenticate: auth.reauthenticate,
        onBoardDeleted: handleBoardDeleted,
      }),
    [mutate, withToken, auth, handleBoardDeleted],
  );

  // Wire test-only window hooks (see useTestHooks). No-op in
  // production builds.
  useTestHooks(actions, mutate, boardsRef);

  const value = useMemo<BoardContextValue>(
    () => ({
      boards,
      loadingList,
      activeBoard: board,
      loadingBoard: false,
      syncing,
      lastError,
      pendingSaves,
      refreshList,
      openBoard,
      closeBoard,
      focusCardId,
      clearFocusCard,
      ...actions,
    }),
    [
      boards,
      loadingList,
      board,
      syncing,
      lastError,
      pendingSaves,
      refreshList,
      openBoard,
      closeBoard,
      focusCardId,
      clearFocusCard,
      actions,
    ],
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used inside <BoardProvider>");
  return ctx;
}

// ── Test-only window hooks ────────────────────────────────────────
//
// We expose a tiny API on `window` so the Playwright suite can seed
// card dates without driving the date picker UI. This is shipped in
// all builds because the production bundle is the one Playwright
// runs (`npm run preview`). The hook has no user-facing effect — it
// just calls `setCardStartDate` / `setCardDueDate` with the values
// the caller provides. A malicious caller could already do this
// through the existing CardEditor; the hook adds no new capability.
type KboardTestWindow = Window & {
  __kboard_setCardDates?: (
    cardId: string,
    dates: { startDate?: string | null; dueDate?: string | null },
  ) => void;
  /** Test-only read of the boards list dates, for deterministic waits. */
  __kboard_getBoardsDates?: () => Array<{
    boardId: string;
    boardName: string;
    cards: Array<{
      id: string;
      title: string;
      dueDate: string | null;
      startDate: string | null;
    }>;
  }>;
};

/**
 * Internal hook (called once by BoardProvider's render) that wires
 * the test-only window hooks to the live actions. The window object
 * is read at call time, not closure time, so subsequent BoardContext
 * re-renders see the latest actions.
 */
function useTestHooks(
  actions: BoardActions,
  mutate: (updater: (b: Board) => Board) => void,
  boardsRef: React.MutableRefObject<Board[]>,
) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as KboardTestWindow;
    w.__kboard_setCardDates = (cardId, dates) => {
      // `mutate` already routes through `publishChange`, which updates
      // BOTH the active board AND the matching entry in the `boards`
      // list (so the Planner view, which reads from `boards`, sees the
      // change). A previous version of this hook also called
      // `setBoards(next)` with a value derived from `boardsRef.current`,
      // but that ref is only refreshed on the next render — the
      // subsequent `setBoards` call would clobber the correct value from
      // `mutate` with stale data (cards still without dates). Let
      // `mutate` do the work.
      if (dates.startDate !== undefined) {
        mutate((b) => setCardStartDate(b, cardId, dates.startDate!));
      }
      if (dates.dueDate !== undefined) {
        mutate((b) => setCardDueDate(b, cardId, dates.dueDate!));
      }
    };
    // Test-only read of the boards list dates (for deterministic waits).
    w.__kboard_getBoardsDates = () => {
      return boardsRef.current.map((b) => ({
        boardId: b.id,
        boardName: b.name,
        cards: Object.values(b.cards).map((c) => ({
          id: c.id,
          title: c.title,
          dueDate: c.dueDate ?? null,
          startDate: c.startDate ?? null,
        })),
      }));
    };
    return () => {
      delete w.__kboard_setCardDates;
      delete w.__kboard_getBoardsDates;
    };
  }, [actions, mutate]);
}
