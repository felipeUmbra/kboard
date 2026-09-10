// PWA subpath deployment checks.
//
// Verifies that when BASE_PATH is set to /kboard/ all manifest URLs
// are correctly prefixed so the PWA remains installable.
//
// Run via: npm run test:e2e:subpath
// (starts the preview server, runs these tests, cleans up.)

import { test, expect } from "@playwright/test";

const BASE = "/kboard";

test.describe("PWA subpath deployment", () => {
  test("manifest is served under the subpath with correct URLs", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);

    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    expect(manifestHref).toBeTruthy();
    expect(manifestHref).toBe(`${BASE}/manifest.webmanifest`);

    const manifest = await page.evaluate(async (href) => {
      const res = await fetch(href!);
      return res.json();
    }, manifestHref);

    expect(manifest.name).toBe("Kboard");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe(`${BASE}/`);
    expect(manifest.scope).toBe(`${BASE}/`);
    expect(manifest.theme_color).toBe("#0079bf");
    expect(manifest.background_color).toBe("#f4f5f7");

    expect(Array.isArray(manifest.icons)).toBe(true);
    const iconSrcs = (manifest.icons as Array<{ src: string }>).map(
      (i) => i.src,
    );
    for (const src of iconSrcs) {
      expect(src).toMatch(new RegExp(`^${BASE}/icons/`));
    }

    expect(manifest.share_target).toBeTruthy();
    expect(manifest.share_target.action).toBe(`${BASE}/share-capture.html`);

    for (const icon of manifest.icons as Array<{ src: string }>) {
      const res = await page.request.get(icon.src);
      expect(res.status(), `icon ${icon.src}`).toBe(200);
    }
  });

  test("service worker registers under the subpath scope", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);

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
    expect(ready.scriptUrl).toContain(`${BASE}/sw.js`);
    expect(ready.scope).toContain(`${BASE}/`);
  });
});
