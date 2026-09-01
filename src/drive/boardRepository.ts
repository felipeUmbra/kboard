// Board repository: lists, reads, creates, updates boards stored as JSON
// in the user's appDataFolder.

import { normalizeBoard } from "../models/migrations";
import type { Board, BoardSummary } from "../models/types";
import {
  createAppDataFile,
  deleteFile,
  getFileContent,
  listAppDataFiles,
  updateFileContent,
} from "./driveClient";

const APP_PROPERTY_KIND = "kboard.board.v1";
const FILE_PREFIX = "board-";

export async function listBoards(): Promise<BoardSummary[]> {
  const files = await listAppDataFiles();
  return files
    .filter((f) => f.appProperties?.kind === APP_PROPERTY_KIND && f.name.startsWith(FILE_PREFIX))
    .map<BoardSummary>((f) => ({
      id: f.appProperties?.boardId ?? f.id,
      name: f.appProperties?.boardName ?? f.name,
      updatedAt: new Date(f.modifiedTime).getTime(),
      driveFileId: f.id,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadBoard(driveFileId: string): Promise<Board> {
  const raw = await getFileContent(driveFileId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  return normalizeBoard({ ...((parsed as object) ?? {}), driveFileId });
}

export async function createBoard(board: Board): Promise<Board> {
  const file = await createAppDataFile({
    name: `${FILE_PREFIX}${board.id}.json`,
    content: JSON.stringify(board, null, 2),
    appProperties: {
      kind: APP_PROPERTY_KIND,
      boardId: board.id,
      boardName: board.name,
    },
  });
  return { ...board, driveFileId: file.id, driveVersion: file.version };
}

export async function saveBoard(board: Board): Promise<Board> {
  if (!board.driveFileId) {
    return createBoard(board);
  }
  const updated = { ...board, updatedAt: Date.now() };
  const file = await updateFileContent({
    fileId: board.driveFileId,
    content: JSON.stringify(updated, null, 2),
  });
  return { ...updated, driveVersion: file.version };
}

export async function removeBoard(driveFileId: string): Promise<void> {
  await deleteFile(driveFileId);
}
