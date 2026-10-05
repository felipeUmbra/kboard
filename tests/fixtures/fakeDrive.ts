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
 * The fake exposes window.__kboardDrive so tests can introspect the file map:
 *   page.evaluate(() => window.__kboardDrive.list())
 *
 * The failure-injection switches (`offline`, `force401Once`,
 * `forceNetworkError`) deliberately live in NODE, not on `window` — see the
 * comment on `offline` below for why reading them via page.evaluate() from
 * the route handler was unsafe. Tests flip them through the bindings below
 * (see `BoardPage.setDriveOffline` and friends).
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
  list: () => FakeDriveFile[];
  get: (id: string) => FakeDriveFile | undefined;
  reset: () => void;
}

declare global {
  interface Window {
    __kboardDrive?: FakeDriveGlobal;
    __driveLog?: string[];
  }
}

export async function installFakeDrive(page: Page) {
  // The offline switch lives HERE, in Node, not on the page.
  //
  // Models a network that stays down for MANY calls in a row (a single
  // transient blip is `forceNetworkError`, which self-clears). It does not
  // self-clear: every Drive request fails until the test turns it off.
  //
  // The route handler needs it for every request, including the ones that
  // arrive while the page is mid-navigation. Reading it off `window` via
  // page.evaluate() is a data race by construction: during `page.reload()`
  // the execution context is torn down and the evaluate throws
  // "Execution context was destroyed", failing the test for a reason that
  // has nothing to do with the app. Node-side state has no such window.
  let offline = false;
  // Same reasoning for the two one-shot flags: the route handler reads them on
  // EVERY request, so page.evaluate() here was the same landmine as `offline`
  // and produced unrelated "Execution context was destroyed" failures in
  // search.spec.ts / filters.spec.ts whenever a navigation overlapped a
  // Drive call. Node-side state has no such window.
  let force401Once = false;
  let forceNetworkError = false;

  await page.exposeBinding("__kboardDriveSetOffline", (_source, v: boolean) => {
    offline = !!v;
  });
  await page.exposeBinding("__kboardDriveForce401Once", () => {
    force401Once = true;
  });
  await page.exposeBinding("__kboardDriveForceNetworkError", () => {
    forceNetworkError = true;
  });

  // The file map lives here in Node too, for the same reason. The handler
  // read and wrote it via page.evaluate() on every single Drive call, so any
  // navigation overlapping a request killed the handler mid-flight with
  // "Execution context was destroyed". That surfaced as unrelated failures
  // ("board was not created and no error surfaced") in filters.spec.ts and
  // search.spec.ts.
  //
  // `page.__kboardDrive` is still populated for test introspection, and is
  // refreshed after every mutation so a test that reads it sees current data.
  const files = new Map<string, FakeDriveFile>();

  const syncPage = async () => {
    // Best-effort: the page may be mid-navigation, in which case there is
    // nothing to sync and the next navigation rehydrates from `files`.
    await page
      .evaluate((f) => {
        window.__kboardDrive!.files.clear();
        for (const [k, v] of f) window.__kboardDrive!.files.set(k, v);
      }, Array.from(files.entries()))
      .catch(() => {});
  };
  // Read the real store from Node. Tests MUST use this (via
  // BoardPage.listDriveFiles) rather than reading window.__kboardDrive,
  // because a page reload re-runs the init script and starts the mirror
  // EMPTY. It is only re-populated as a side effect of the next Drive
  // request, so after a reload the page copy can legitimately be blank
  // while Drive is full.
  await page.exposeBinding(
    "__kboardDriveList",
    () => Array.from(files.values()),
  );

  // Same reason: let a test replace a file's content in the real store.
  // Writing to `window.__kboardDrive.files` only edits the mirror, so the
  // route handler would never see the change and a subsequent GET would
  // return the old content. `BoardFilePatch` + `BoardPage.updateDriveFile`
  // wrap this.
  //
  // The patch is PLAIN DATA, not a callback: Playwright serialises arguments
  // across the binding boundary, so a function argument arrives as
  // undefined.
  await page.exposeBinding(
    "__kboardDrivePatch",
    (
      _source,
      id: string,
      patch: { content?: string; modifiedTime?: string; version?: string },
    ) => {
      const file = files.get(id);
      if (!file) throw new Error("file not found: " + id);
      files.set(id, { ...file, ...patch });
      void syncPage();
    },
  );
  await page.addInitScript(() => {
    const w = window;

    // The file map is owned by NODE (see `files` above) and mirrored in here
    // purely so tests can introspect it via `window.__kboardDrive`. It is
    // re-pushed after every Drive mutation by `syncPage()`, and this init
    // script re-runs on every navigation, so the page copy stays current
    // without the route handler ever having to read it.
    w.__kboardDrive = {
      files: new Map<string, FakeDriveFile>(),
      list() {
        return Array.from(this.files.values());
      },
      get(id: string) {
        return this.files.get(id);
      },
      reset() {
        this.files.clear();
      },
    };
  });

  const routeHandler = async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Persistent offline: abort EVERY request until the test turns it off.
    // Checked before the one-shot flags because it models a network that
    // stays down, so a single transient failure must not fall through and
    // accidentally succeed.
    if (offline) {
      await route.abort("internetdisconnected");
      return;
    }

    // Force-network-error path: route.abort
    if (forceNetworkError) {
      forceNetworkError = false;
      await route.abort("failed");
      return;
    }

    // Force-401-once path
    if (force401Once) {
      force401Once = false;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: 401, message: "Fake 401 for retry test" } }),
      });
      return;
    }

    // GET list
    if (method === "GET" && /\/drive\/v3\/files\?/.test(url)) {
      const list = Array.from(files.values());
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ files: list }),
      });
      return;
    }

    // GET single file (metadata or media)
    const idMatch = url.match(/\/drive\/v3\/files\/([^/?]+)/);
    if (method === "GET" && idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      const file = files.get(id);
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
      files.set(id, file);
      await syncPage();
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
      const content = route.request().postData() ?? "";
      const existing = files.get(id);
      const updated: FakeDriveFile | undefined = existing
        ? {
            ...existing,
            content,
            version: incrementVersion(existing.version),
            modifiedTime: new Date().toISOString(),
          }
        : undefined;
      if (updated) files.set(id, updated);
      await syncPage();
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
      files.delete(id);
      await syncPage();
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