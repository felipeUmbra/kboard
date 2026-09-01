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

const DEBOUNCE_MS = 600;

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
  const [boards, setBoards] = useState<Board[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const boardRef = useRef<Board | null>(board);
  boardRef.current = board;

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const summaries = await repoList();
      const fullBoards = await Promise.all(
        summaries.map(async (s) => repoLoad(s.driveFileId)),
      );
      setBoards(fullBoards);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Failed to load boards");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const openBoard = useCallback(
    async (boardId: string) => {
      setBoard(null);
      setLastError(null);
      const found = boards.find((b) => b.id === boardId);
      if (found) {
        setBoard(found);
        return;
      }
      try {
        const summaries = await repoList();
        const summary = summaries.find((s) => s.id === boardId);
        if (!summary) {
          setLastError("Board not found");
          return;
        }
        const loaded = await repoLoad(summary.driveFileId);
        setBoard(loaded);
      } catch (err) {
        setLastError(err instanceof Error ? err.message : "Failed to open board");
      }
    },
    [boards],
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
        const saved = await repoSave(current);
        setBoard(saved);
        setBoards((prev) => prev.map((b) => (b.id === saved.id ? saved : b)));
      } catch (err) {
        setLastError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSyncing(false);
      }
    }, DEBOUNCE_MS);
  }, []);

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
    () => buildActions({ mutate, setBoard, setBoards, setLastError }),
    [mutate],
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
