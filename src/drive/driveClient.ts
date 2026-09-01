// Thin wrapper around Google Drive REST API v3.

import { getCurrentToken, requestAccessToken } from "../auth/tokenClient";

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

export class DriveError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  version?: string;
  appProperties?: Record<string, string>;
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  let token = getCurrentToken();
  if (!token) token = await requestAccessToken("");
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 401) {
    // Token expired/revoked mid-call — refresh once and retry.
    token = await requestAccessToken("");
    const retry = await fetch(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    if (!retry.ok) throw await asDriveError(retry);
    return retry;
  }
  if (!res.ok) throw await asDriveError(res);
  return res;
}

async function asDriveError(res: Response): Promise<DriveError> {
  let detail = res.statusText;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message) detail = body.error.message;
  } catch {
    // ignore
  }
  return new DriveError(`Drive API ${res.status}: ${detail}`, res.status);
}

export async function listAppDataFiles(): Promise<DriveFile[]> {
  const url = `${DRIVE_BASE}/files?spaces=appDataFolder&fields=files(id,name,modifiedTime,version,appProperties)&pageSize=200`;
  const res = await authedFetch(url);
  const data = (await res.json()) as { files: DriveFile[] };
  return data.files ?? [];
}

export async function getFile(fileId: string): Promise<DriveFile> {
  const url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,modifiedTime,version,appProperties`;
  const res = await authedFetch(url);
  return (await res.json()) as DriveFile;
}

export async function getFileContent(fileId: string): Promise<string> {
  const url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
  const res = await authedFetch(url);
  return res.text();
}

export interface CreateFileInput {
  name: string;
  mimeType?: string;
  content: string;
  appProperties?: Record<string, string>;
}

export async function createAppDataFile(input: CreateFileInput): Promise<DriveFile> {
  const meta = {
    name: input.name,
    parents: ["appDataFolder"],
    mimeType: input.mimeType ?? "application/json",
    appProperties: input.appProperties,
  };
  const boundary = "-------kboard" + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;
  const body =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(meta) +
    delimiter +
    `Content-Type: ${meta.mimeType}\r\n\r\n` +
    input.content +
    closeDelim;

  const url = `${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,modifiedTime,version,appProperties`;
  const res = await authedFetch(url, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return (await res.json()) as DriveFile;
}

export interface UpdateFileInput {
  fileId: string;
  content: string;
  mimeType?: string;
}

export async function updateFileContent(input: UpdateFileInput): Promise<DriveFile> {
  const url = `${UPLOAD_BASE}/files/${encodeURIComponent(input.fileId)}?uploadType=media&fields=id,name,modifiedTime,version,appProperties`;
  const res = await authedFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": input.mimeType ?? "application/json" },
    body: input.content,
  });
  return (await res.json()) as DriveFile;
}

export async function deleteFile(fileId: string): Promise<void> {
  const url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}`;
  await authedFetch(url, { method: "DELETE" });
}
