import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = process.cwd();
const SCRIPT = join(REPO, "scripts", "lint-color-literals.js");

const root = mkdtempSync(join(tmpdir(), "kb-lint-"));
mkdirSync(join(root, "scripts"), { recursive: true });
copyFileSync(SCRIPT, join(root, "scripts", "lint-color-literals.js"));

function run(files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, "src", rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  try {
    const out = execFileSync(process.execPath, [join(root, "scripts", "lint-color-literals.js")], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

console.log("=== basic hex ===");
console.log(JSON.stringify(run({ "a.tsx": 'const s = { color: "#eb5a46" };\n' })));

console.log("=== // then later real literal ===");
console.log(JSON.stringify(run({ "f.tsx": '// header comment\nconst a = 1;\nconst bad = "#eb5a46";\n' })));

console.log("=== var fallback ===");
console.log(JSON.stringify(run({ "j.css": '.a { color: var(--color-danger, #eb5a46); }\n' })));

rmSync(root, { recursive: true, force: true });
