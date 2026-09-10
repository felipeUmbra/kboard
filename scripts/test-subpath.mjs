#!/usr/bin/env node
/**
 * Run PWA subpath deployment tests locally.
 *
 * 1. Builds with BASE_PATH=/kboard/ into dist-subpath/
 * 2. Starts `vite preview` on port 5174
 * 3. Runs `npx playwright test --project=pwa-subpath`
 * 4. Cleans up (kills the server)
 *
 * Usage:  npm run test:e2e:subpath
 *   or:  node scripts/test-subpath.mjs [--retries=N]
 */

import { execSync, spawn } from "node:child_process";

const PORT = 5174;
const BASE = "/kboard";
const BASE_PATH = `${BASE}/`;

const extraArgs = process.argv.slice(2).join(" ");

console.log(`\n▸ Building subpath bundle (BASE_PATH=${BASE_PATH})…\n`);
execSync(
  `npm run build -- --outDir dist-subpath`,
  {
    stdio: "inherit",
    env: { ...process.env, BASE_PATH },
  },
);

console.log(`\n▸ Starting vite preview on port ${PORT}…\n`);
const preview = spawn(
  "npx",
  ["vite", "preview", "--port", String(PORT), "--strictPort", "--outDir", "dist-subpath"],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BASE_PATH },
    shell: true,
  },
);

// Wait for the server to be ready.
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    preview.kill();
    reject(new Error("Preview server failed to start within 30 s"));
  }, 30_000);

  preview.stdout.on("data", (chunk) => {
    const line = chunk.toString();
    process.stdout.write(`  [preview] ${line}`);
    if (line.includes("Local:") || line.includes("localhost")) {
      clearTimeout(timeout);
      // Give the server a moment to fully bind.
      setTimeout(resolve, 500);
    }
  });

  preview.stderr.on("data", (chunk) => {
    process.stderr.write(`  [preview:err] ${chunk}`);
  });

  preview.on("error", (err) => {
    clearTimeout(timeout);
    reject(err);
  });

  preview.on("exit", (code) => {
    if (code && code !== null && code !== 0) {
      clearTimeout(timeout);
      reject(new Error(`Preview exited with code ${code}`));
    }
  });
});

console.log(`\n▸ Running pwa-subpath tests…\n`);
let testExitCode = 0;
try {
  execSync(
    `npx playwright test --project=pwa-subpath ${extraArgs}`,
    { stdio: "inherit" },
  );
} catch {
  testExitCode = 1;
} finally {
  console.log("\n▸ Stopping preview server…\n");
    try { preview.kill("SIGTERM"); } catch { /* already dead */ }
    await new Promise((r) => setTimeout(r, 500));
    try { preview.kill("SIGKILL"); } catch { /* already dead */ }
