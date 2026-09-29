/**
 * Tests for scripts/lint-color-literals.js.
 *
 * The script gates CI, so a bug in it is worse than no rule: an over-eager
 * mask hides real violations (it did — a `//` comment masked to end-of-file,
 * which silently cleared src/models/types.ts), and an under-eager mask blocks
 * legitimate work. Both failure modes are invisible without a test.
 *
 * The script is a CLI, so it is driven as a subprocess against temp fixtures
 * rather than by importing internals. That is deliberate: the comment-mask
 * logic is private, and testing through the real entry point also covers the
 * exit code, which is what CI actually depends on.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, "scripts", "lint-color-literals.js");

/**
 * Each run gets a FRESH temp tree. Sharing one tree across tests makes
 * violations accumulate — an early "flags a hex" test leaves a blocking
 * violation behind and every later "passes cleanly" assertion then fails for
 * the wrong reason, which reads exactly like a broken linter.
 */
function run(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "kboard-lint-"));
  try {
    // The script resolves src/ relative to its own location, so the fixture
    // needs its own copy of the script under scripts/.
    mkdirSync(join(root, "scripts"), { recursive: true });
    copyFileSync(SCRIPT, join(root, "scripts", "lint-color-literals.js"));

    for (const [rel, content] of Object.entries(files)) {
      const full = join(root, "src", rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content, "utf8");
    }

    try {
      const stdout = execFileSync(
        process.execPath,
        [join(root, "scripts", "lint-color-literals.js")],
        {
          cwd: root,
          encoding: "utf8",
          // The linter writes violations to stderr; capture both without
          // letting a non-zero exit become a thrown exception.
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      return { code: 0, out: stdout };
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      return { code: e.status, out: (e.stdout ?? "") + (e.stderr ?? "") };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("hex colour rule", () => {
  it("flags a hex literal in a component", () => {
    const r = run({ "a.tsx": `const s = { color: "#eb5a46" };\n` });
    expect(r.code).toBe(1);
    expect(r.out).toContain("src/a.tsx");
  });

  it("passes a component that uses a token", () => {
    const r = run({ "b.tsx": `const s = { color: "var(--color-accent)" };\n` });
    expect(r.code).toBe(0);
  });

  it("flags 3-digit hex", () => {
    expect(run({ "c.tsx": `color: "#fff";\n` }).code).toBe(1);
  });

  it("does not treat a URL fragment or an id selector as a colour", () => {
    const r = run({
      "d.css": `.thing { content: "#anchor"; }\n#component { color: var(--color-text); }\n`,
    });
    expect(r.code).toBe(0);
    // The success banner also contains the words "hardcoded colour", so
    // assert on the violation marker rather than the phrase.
    expect(r.out).not.toContain(":1");
  });
});

describe("comment masking", () => {
  it("ignores a hex inside a // line comment", () => {
    const r = run({ "e.tsx": `// was #eb5a46 before the fix\nconst a = 1;\n` });
    expect(r.code).toBe(0);
  });

  it("ignores a hex inside a // comment WITHOUT hiding later real literals", () => {
    // Regression: a `//` comment used to mask to end-of-file, so every hex
    // after the first // comment line in a file was silently ignored. That
    // is exactly how src/models/types.ts came back "clean".
    const r = run({
      "f.tsx": `// header comment\nconst a = 1;\nconst bad = "#eb5a46";\n`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("hardcoded colour");
  });

  it("ignores a hex on a wrapped block-comment continuation line", () => {
    const r = run({
      "g.css": `/* danger #c62828 on #fdeaea = 4.85:1,\n   success #276b2b on #e8f5e9 */\n.a { color: var(--color-text); }\n`,
    });
    expect(r.code).toBe(0);
  });

  it("flags a hex after a block comment closes", () => {
    const r = run({
      "h.css": `/* docs mentioning #eb5a46 */\n.a { color: "#eb5a46"; }\n`,
    });
    expect(r.code).toBe(1);
  });

  it("handles CRLF line endings without drifting", () => {
    const r = run({
      "i.tsx": `// header\r\nconst a = 1;\r\nconst bad = "#eb5a46";\r\n`,
    });
    expect(r.code).toBe(1);
  });
});

describe("var() fallback rule", () => {
  it("flags var(--token, #fallback)", () => {
    const r = run({ "j.css": `.a { color: var(--color-danger, #eb5a46); }\n` });
    expect(r.code).toBe(1);
    expect(r.out).toContain("fallback");
  });

  it("allows a plain var(--token)", () => {
    expect(run({ "k.css": `.a { color: var(--color-danger); }\n` }).code).toBe(0);
  });
});

describe("allowlist", () => {
  it("exempts tokens.css", () => {
    const r = run({ "styles/tokens.css": `:root { --color-danger: #c62828; }\n` });
    expect(r.code).toBe(0);
  });

  it("exempts test fixtures but still reports the file", () => {
    const r = run({ "m.test.ts": `const c = "#00ff00";\n` });
    expect(r.code).toBe(0);
    expect(r.out).toContain("test fixture");
  });

  it("exempts the Google logo brand colours", () => {
    const r = run({
      "components/LoginScreen.tsx": `<path fill="#FFC107" />\n`,
    });
    expect(r.code).toBe(0);
  });
});

describe("exit code", () => {
  it("exits 0 when every occurrence is allowlisted", () => {
    // Regression: the exit status keyed off the total violation count rather
    // than the blocking count, so a fully allowlisted repo still failed.
    const r = run({ "styles/tokens.css": `:root { --a: #c62828; --b: #276b2b; }\n` });
    expect(r.out).toContain("Allowlisted");
    expect(r.code).toBe(0);
  });
});

describe("the real repository is clean", () => {
  it("has no blocking colour literals in src/", () => {
    let out = "";
    let code = 0;
    try {
      out = execFileSync(process.execPath, [SCRIPT], {
        cwd: REPO,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      code = e.status;
      out = (e.stdout ?? "") + (e.stderr ?? "");
    }
    // Violations are printed as "\n<path>:<line>" blocks; the path line is
    // the only one matching this shape, so it identifies the real hits.
    const offending = out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^src\/.+\.(ts|tsx|css):\d+$/.test(l));
    expect(offending, `blocking violations:\n${out}`).toEqual([]);
    expect(code, out).toBe(0);
  });
});
