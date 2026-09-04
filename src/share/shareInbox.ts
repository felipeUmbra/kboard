// Shared-content inbox.
//
// Companion to public/share-capture.html. The flow is:
//
//   1. Android OS POSTs the shared text/url/title to the manifest's
//      `share_target.action` (share-capture.html).
//   2. share-capture.html stores the payload in IndexedDB under a
//      random key, then `location.replace("/?share=" + id)`.
//   3. App.tsx sees the `?share=<id>` query on mount, calls
//      shareInbox.take(id), and pre-fills the new-board modal.
//
// The IndexedDB handshake is required because GitHub Pages does not
// have a backend that could receive the POST body; without this
// handoff, the share would be silently lost. The same shape works on
// any static host.

const DB_NAME = "kboard-share";
const DB_VERSION = 1;
const STORE = "pending";

export interface SharedPayload {
  title: string;
  text: string;
  url: string;
  /** Epoch ms when the share was captured. */
  ts: number;
}

interface ShareRecord {
  id: string;
  payload: SharedPayload;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

/**
 * Read a share record by id and remove it. Returns null if the record
 * is missing (e.g. the user navigated to /?share=abc directly) or if
 * IndexedDB is unavailable (e.g. private mode in some browsers).
 */
export async function take(id: string): Promise<SharedPayload | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  return new Promise<SharedPayload | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const getReq = tx.objectStore(STORE).get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result as ShareRecord | undefined;
        // Best-effort delete; ignore failures (the entry will be GC'd
        // by the browser when the store fills, and a stale entry is
        // harmless on a repeat visit).
        tx.objectStore(STORE).delete(id);
        resolve(rec ? rec.payload : null);
      };
      getReq.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Returns the current `?share=<id>` value from the URL, or null if
 * the page was not opened via a share. Idempotent: the caller is
 * expected to `history.replaceState` to strip the param after reading.
 */
export function getShareIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("share");
    return id && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}
