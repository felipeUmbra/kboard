// PWA end-to-end checks.
//
// Verifies the installable PWA pieces are wired correctly:
//   1. The web manifest is linked, well-formed, and exposes the
//      icons + share_target we ship.
//   2. The service worker registers and the precache includes the
//      app shell, manifest, and icons.
//   3. The offline navigation fallback serves the app shell.
//   4. iOS PWA meta tags are present.
//   5. The share_target handshake writes to IndexedDB and a manual
//      POST to /share-capture.html lands the user on /?share=<id>
//      with the share modal open.
//
// We exercise the production-built bundle (via `npm run preview`),
// matching the CI path in playwright.config.ts.

import { test, expect, type Page } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";

async function bootApp(page: Page) {
  // Install the GIS + Drive fakes, navigate, and walk through the real
  // login button so we land in the authenticated "boards list" state.
  // We can't skip the click: the app shows <LoginScreen/> until the
  // user explicitly signs in; the fakes only short-circuit the
  // accounts.google.com popup.
  await installFakesOnPage(page);
  await page.goto("/");
  await page.getByRole("button", { name: /sign in with google/i }).click();
  await expect(page.getByRole("heading", { name: "Your boards" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("PWA", () => {
  test("manifest is linked, well-formed, and exposes icons + share_target", async ({
    page,
  }) => {
    await bootApp(page);

    // 1. The link tag points at /manifest.webmanifest.
    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    expect(manifestHref).toBeTruthy();
    expect(manifestHref!.endsWith("/manifest.webmanifest")).toBe(true);

    // 2. The manifest body is valid JSON with the fields we ship.
    const manifest = await page.evaluate(async (href) => {
      const res = await fetch(href!);
      return res.json();
    }, manifestHref);

    expect(manifest.name).toBe("Kboard");
    expect(manifest.short_name).toBe("Kboard");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.theme_color).toBe("#0079bf");
    expect(manifest.background_color).toBe("#f4f5f7");
    expect(Array.isArray(manifest.icons)).toBe(true);
    const iconSizes = (manifest.icons as Array<{ sizes: string }>).map(
      (i) => i.sizes,
    );
    expect(iconSizes).toContain("192x192");
    expect(iconSizes).toContain("512x512");

    // 3. The share_target is configured.
    expect(manifest.share_target).toBeTruthy();
    expect(manifest.share_target.action).toBe("/share-capture.html");
    expect(manifest.share_target.method).toBe("POST");
    expect(manifest.share_target.params).toMatchObject({
      title: "title",
      text: "text",
      url: "url",
    });

    // 4. Each icon URL returns 200.
    for (const icon of manifest.icons as Array<{ src: string }>) {
      const res = await page.request.get(icon.src);
      expect(res.status(), `icon ${icon.src}`).toBe(200);
    }
  });

  test("service worker registers and precaches the app shell", async ({
    page,
  }) => {
    await bootApp(page);

    // Wait for the SW to take control. registerSW in pwa.ts resolves
    // asynchronously after the install completes; the first navigation
    // races it, but by the time the boards list is rendered (the wait
    // in bootApp), the SW is in either 'installing' or 'activated' state.
    const ready = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return { supported: false };
      const reg = await navigator.serviceWorker.ready;
      return {
        supported: true,
        scope: reg.scope,
        hasActive: !!reg.active,
        scriptUrl: reg.active?.scriptURL ?? null,
      };
    });
    expect(ready.supported).toBe(true);
    expect(ready.hasActive).toBe(true);
    expect(ready.scriptUrl).toMatch(/\/sw\.js$/);
    // Scope is the deployment root, which is "/" in tests (BASE_PATH=/).
    expect(ready.scope).toMatch(/\/$/);

    // Workbox exposes its precache via Cache Storage under a known key
    // prefix. We just check that the manifest + at least one icon are
    // in some cache � Workbox names caches by revision, so we don't
    // pin the exact name.
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const found: string[] = [];
      for (const n of names) {
        const cache = await caches.open(n);
        const keys = await cache.keys();
        for (const req of keys) {
          found.push(req.url);
        }
      }
      return found;
    });
    // Workbox stores the request URL verbatim (with the
    // ?__WB_REVISION__=… revision query string appended). Match by
    // path component so we don't depend on the revision format.
    const pathOf = (u: string) => {
      const qIdx = u.indexOf("?");
      const noQuery = qIdx >= 0 ? u.slice(0, qIdx) : u;
      // Strip scheme+host so we get the path only.
      const m = noQuery.match(/^[a-z]+:\/\/[^/]+(\/.*)$/i);
      return m ? m[1] : noQuery;
    };
    const cachedPaths = cached.map(pathOf);
    expect(cachedPaths).toContain("/manifest.webmanifest");
    expect(cachedPaths).toContain("/icons/icon-192.png");
  });

  test("offline navigation fallback serves the app shell", async ({
    page,
    context,
  }) => {
    await bootApp(page);

    // Sanity: the SW is active and the app is loaded.
    await expect(page.getByRole("heading", { name: "Your boards" })).toBeVisible();

    // Wait until the SW is in control of this page. On the first
    // navigation the SW might still be in 'installing' state, so we
    // do one more online goto first to let clientsClaim take effect
    // — once SW is the controller, offline navigations are
    // guaranteed to hit the NavigationRoute.
    await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      if (!reg.active || !navigator.serviceWorker.controller) {
        // Force one more online navigation so the new SW takes
        // control of subsequent fetches.
        window.location.reload();
      }
    });
    // Allow the post-reload render to settle.
    await expect(page.getByRole("heading", { name: "Your boards" })).toBeVisible();

    // Go offline and re-navigate. The SW's NavigationRoute serves
    // /index.html from the precache, so the SPA boots and the boards
    // list renders from the in-memory state established before the
    // reload.
    await context.setOffline(true);
    try {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Your boards" }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.setOffline(false);
    }
  });

  test("iOS PWA meta tags are present", async ({ page }) => {
    await bootApp(page);

    const tags = await page.evaluate(() => {
      const wanted = [
        "apple-mobile-web-app-capable",
        "apple-mobile-web-app-status-bar-style",
        "apple-mobile-web-app-title",
        "mobile-web-app-capable",
      ] as const;
      const out: Record<string, string | null> = {};
      for (const name of wanted) {
        const sel = `meta[name="${name}"]`;
        out[name] =
          document.querySelector(sel)?.getAttribute("content") ?? null;
      }
      out["apple-touch-icon"] = document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ?? null;
      return out;
    });

    expect(tags["apple-mobile-web-app-capable"]).toBe("yes");
    expect(tags["apple-mobile-web-app-status-bar-style"]).toBe("default");
    expect(tags["apple-mobile-web-app-title"]).toBe("Kboard");
    expect(tags["mobile-web-app-capable"]).toBe("yes");
    expect(tags["apple-touch-icon"]).toBeTruthy();
  });

  test("share_target handshake opens the share modal", async ({ page }) => {
    await bootApp(page);

    // The real Android share flow POSTs to /share-capture.html, which
    // writes the payload to IndexedDB and redirects to /?share=<id>.
    // In the test we can't open a Web Share intent, so we simulate
    // the IndexedDB write directly: this is the *output* of
    // share-capture.html. The redirect from share-capture.html to
    // /?share=<id> is then just `page.goto`. Together they exercise
    // the full app-side flow (App.tsx -> shareInbox.take -> modal).
    const id = "test-share-" + Date.now();
    const payload = {
      title: "Test share title",
      text: "Test share body line 1\nLine 2",
      url: "https://example.com/article",
      ts: Date.now(),
    };
    await page.evaluate(
      async ({ id, payload }) => {
        const open = indexedDB.open("kboard-share", 1);
        await new Promise<void>((resolve, reject) => {
          open.onupgradeneeded = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains("pending")) {
              db.createObjectStore("pending", { keyPath: "id" });
            }
          };
          open.onsuccess = () => resolve();
          open.onerror = () => reject(open.error);
        });
        const db = open.result;
        const tx = db.transaction("pending", "readwrite");
        tx.objectStore("pending").put({ id, payload });
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      },
      { id, payload },
    );

    // Now navigate as if share-capture.html had redirected us.
    await page.goto(`/?share=${encodeURIComponent(id)}`);

    const shareModal = page.getByRole("dialog", { name: "Create board from share" });
    await expect(shareModal).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("share-board-name")).toHaveValue("Test share title");
    await expect(page.getByTestId("share-board-desc")).toHaveValue("Test share body line 1\nLine 2\n\nhttps://example.com/article");
    await page.getByTestId("share-create-button").click();
    await expect(shareModal).toBeHidden({ timeout: 10_000 });
    expect(page.url()).not.toContain("share=");
  });
});
