import { Buffer } from "node:buffer";
import type { Page, Route } from "@playwright/test";

/**
 * Minimal in-memory implementation of the subset of Google Drive v3 that
 * kboard actually uses (see src/drive/driveClient.ts).
 *
 * Implements:
 *   GET    /drive/v3/files?spaces=appDataFolder&fields=…&pageSize=200
 *   GET    /drive/v3/files/:id?fields=…
 *   GET    /drive/v3/files/:id?alt=media
 *   POST   /upload/drive/v3/files?uploadType=multipart&fields=…
 *   PATCH  /upload/drive/v3/files/:id?uploadType=media&fields=…
 *   DELETE /drive/v3/files/:id
 *
 * The fake exposes window.__kboardDrive so tests can introspect state:
 *   page.evaluate(() => window.__kboardDrive.list())
 *   page.evaluate(() => window.__kboardDrive.setForce401Once())
 *   page.evaluate(() => window.__kboardDrive.setForceNetworkError())
 */

export interface FakeDriveFile {
  id: string;
  name: string;
  content: string;
  appProperties?: Record<string, string>;
  version: string;
  modifiedTime: string;
}

/** Minimal shape of the fake Drive map installed on `window`. */
export interface FakeDriveGlobal {
  files: Map<string, FakeDriveFile>;
  force401Once: boolean;
  forceNetworkError: boolean;
  list: () => FakeDriveFile[];
  get: (id: string) => FakeDriveFile | undefined;
  setForce401Once: () => void;
  setForceNetworkError: () => void;
  reset: () => void;
}

declare global {
  interface Window {
    __kboardDrive?: FakeDriveGlobal;
    __driveLog?: string[];
  }
}

export async function installFakeDrive(page: Page) {
  await page.addInitScript(() => {
    const w = window;

    // Persist the fake-drive file map across page reloads via sessionStorage.
    // The init script re-runs on every navigation, so we rehydrate from
    // sessionStorage each time and serialize back on every mutation.
    const STORAGE_KEY = "kboard-test-drive";
    type Stored = { entries: [string, FakeDriveFile][] };

    function load(): Map<string, FakeDriveFile> {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return new Map();
        const parsed = JSON.parse(raw) as Stored;
        return new Map(parsed.entries);
      } catch {
        return new Map();
      }
    }
    function save(map: Map<string, FakeDriveFile>) {
      try {
        const entries: [string, FakeDriveFile][] = Array.from(map.entries());
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ entries }));
      } catch {
        // ignore
      }
    }

    const files = load();
    w.__kboardDrive = {
      files,
      force401Once: false,
      forceNetworkError: false,
      list() {
        return Array.from(this.files.values());
      },
      get(id: string) {
        return this.files.get(id);
      },
      setForce401Once() {
        this.force401Once = true;
      },
      setForceNetworkError() {
        this.forceNetworkError = true;
      },
      reset() {
        this.files.clear();
        this.force401Once = false;
        this.forceNetworkError = false;
        save(this.files);
      },
    };

    // Save back to sessionStorage whenever the map mutates. We use a
    // Proxy so any set/delete is caught without having to wrap every method.
    const origSet = files.set.bind(files);
    const origDelete = files.delete.bind(files);
    const origClear = files.clear.bind(files);
    files.set = (k: string, v: FakeDriveFile) => {
      origSet(k, v);
      save(files);
      return files;
    };
    files.delete = (k: string) => {
      const r = origDelete(k);
      save(files);
      return r;
    };
    files.clear = () => {
      origClear();
      save(files);
    };
  });

  const routeHandler = async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Force-network-error path: route.abort
    const forceNetwork = await readDriveFlag(page, "forceNetworkError");
    if (forceNetwork) {
      await writeDriveFlag(page, "forceNetworkError", false);
      await route.abort("failed");
      return;
    }

    // Force-401-once path
    const force401 = await readDriveFlag(page, "force401Once");
    if (force401) {
      await writeDriveFlag(page, "force401Once", false);
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: 401, message: "Fake 401 for retry test" } }),
      });
      return;
    }

    // GET list
    if (method === "GET" && /\/drive\/v3\/files\?/.test(url)) {
      const files = await page.evaluate(() => window.__kboardDrive!.list());
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ files }),
      });
      return;
    }

    // GET single file (metadata or media)
    const idMatch = url.match(/\/drive\/v3\/files\/([^/?]+)/);
    if (method === "GET" && idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      const file = await page.evaluate((fid: string) => window.__kboardDrive!.get(fid), id);
      if (!file) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: 404, message: "File not found" } }) });
        return;
      }
      const isMedia = /[?&]alt=media/.test(url);
      if (isMedia) {
        await route.fulfill({ status: 200, contentType: "application/json", body: file.content });
      } else {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            id: file.id, name: file.name, modifiedTime: file.modifiedTime,
            version: file.version, appProperties: file.appProperties,
          }),
        });
      }
      return;
    }

    // POST create (multipart upload)
    if (method === "POST" && /\/upload\/drive\/v3\/files/.test(url)) {
      const body: Buffer = route.request().postDataBuffer() ?? Buffer.from("");
      const parsed = parseMultipart(body);
      const meta = JSON.parse(parsed.jsonPart) as {
        name: string; parents: string[]; appProperties?: Record<string, string>;
      };
      const id = `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const file: FakeDriveFile = {
        id, name: meta.name, content: parsed.bodyPart,
        appProperties: meta.appProperties, version: "v1",
        modifiedTime: new Date().toISOString(),
      };
      await page.evaluate((f: FakeDriveFile) => { window.__kboardDrive!.files.set(f.id, f); }, file);
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          id: file.id, name: file.name, modifiedTime: file.modifiedTime,
          version: file.version, appProperties: file.appProperties,
        }),
      });
      return;
    }

    // PATCH update
    if (method === "PATCH" && /\/upload\/drive\/v3\/files\//.test(url)) {
      const id = decodeURIComponent(url.match(/\/files\/([^/?]+)/)![1]);
      const newContent = route.request().postData() ?? "";
      const updated = await page.evaluate(
        ({ fid, content }) => {
          const k = window.__kboardDrive!;
          const existing = k.files.get(fid);
          if (!existing) return null;
          // Inline incrementVersion (cannot import from here — runs in browser).
          const n = Number(existing.version.replace(/^v/, ""));
          const nextVersion = Number.isFinite(n) ? `v${n + 1}` : "v2";
          const next: FakeDriveFile = {
            ...existing, content,
            version: nextVersion,
            modifiedTime: new Date().toISOString(),
          };
          k.files.set(fid, next);
          return next;
        },
        { fid: id, content: newContent },
      );
      if (!updated) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: 404, message: "File not found" } }) });
        return;
      }
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          id: updated.id, name: updated.name, modifiedTime: updated.modifiedTime,
          version: updated.version, appProperties: updated.appProperties,
        }),
        headers: { ETag: `"${updated.version}"` },
      });
      return;
    }

    // DELETE
    if (method === "DELETE" && /\/drive\/v3\/files\//.test(url)) {
      const id = decodeURIComponent(url.match(/\/files\/([^/?]+)/)![1]);
      await page.evaluate((fid: string) => { window.__kboardDrive!.files.delete(fid); }, id);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    // Fallback — fail loudly so misrouted calls are obvious.
    await route.fulfill({
      status: 404, contentType: "application/json",
      body: JSON.stringify({ error: { code: 404, message: `Unmocked Drive call: ${method} ${url}` } }),
    });
  };

  await page.route("**/www.googleapis.com/drive/v3/**", routeHandler);
  await page.route("**/www.googleapis.com/upload/drive/v3/**", routeHandler);
}

async function readDriveFlag(page: Page, key: "force401Once" | "forceNetworkError"): Promise<boolean> {
  return page.evaluate((k) => (window.__kboardDrive as unknown as Record<string, boolean>)[k] === true, key);
}

async function writeDriveFlag(page: Page, key: "force401Once" | "forceNetworkError", value: boolean): Promise<void> {
  await page.evaluate(
    ({ k, v }) => { (window.__kboardDrive as unknown as Record<string, unknown>)[k] = v; },
    { k: key, v: value },
  );
}

function incrementVersion(v: string): string {
  const n = Number(v.replace(/^v/, ""));
  return Number.isFinite(n) ? `v${n + 1}` : "v2";
}

/**
 * Minimal multipart/related parser used for Drive file uploads.
 *
 * Accepts bodies with or without a leading CRLF before the first boundary.
 * Splits on `--<boundary>`, then for each chunk, strips the headers (everything
 * up to the first blank line) and trims trailing CRLF.
 */
function parseMultipart(raw: Buffer): { jsonPart: string; bodyPart: string } {
  const text = raw.toString("utf8");
  // The boundary line is the first `--XXXX\r\n` sequence anywhere in the body.
  const delimMatch = text.match(/--([A-Za-z0-9_\-]+)\r?\n/);
  if (!delimMatch) throw new Error("Could not parse multipart: missing boundary");
  const boundary = delimMatch[1];
  // Split by the boundary line (without the leading `--`). The trailing closing
  // boundary `--<boundary>--` becomes `--` after split — drop it.
  const parts = text.split(`--${boundary}`).map((p: string) => p.replace(/^\r?\n/, "").replace(/\r?\n$/, ""));
  // parts[0] is preamble (empty or whitespace); parts[1] is JSON; parts[2] is body.
  const jsonChunk = parts[1] ?? "";
  const bodyChunk = parts[2] ?? "";
  // Each chunk looks like:
  //   Content-Type: application/json; charset=UTF-8\r\n\r\n
  //   {json}
  // We strip everything up to the first blank line.
  const extractBody = (chunk: string): string => {
    const sep = chunk.indexOf("\r\n\r\n");
    if (sep < 0) {
      // Fallback to LF-only line endings.
      const lfSep = chunk.indexOf("\n\n");
      if (lfSep < 0) return chunk.trim();
      return chunk.slice(lfSep + 2).trim();
    }
    return chunk.slice(sep + 4).trim();
  };
  return {
    jsonPart: extractBody(jsonChunk),
    bodyPart: extractBody(bodyChunk),
  };
}