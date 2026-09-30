/**
 * Structural guard against the `pickForeground` bug returning.
 *
 * Sprint 1 fixed a wrong foreground-colour calculation in LabelPill. The
 * same function, with the same wrong maths, was still present in CardEditor
 * and FieldChip — it was only found when a new lint rule flagged hardcoded
 * colour literals across `src/`. Correcting three copies independently is
 * not durable, so the implementation now lives in one module and these
 * tests assert that it stays that way.
 *
 * This is a source-level test on purpose: the defect we are guarding against
 * is duplication, and no runtime assertion can observe it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pickForeground, DARK_FG, LIGHT_FG } from "../../src/models/colorContrast";
import { contrastRatio } from "./helpers/contrast";

const SRC = join(__dirname, "..", "..", "src");
const AA = 4.5;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === "dist") return [];
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const allSources = walk(SRC);

describe("pickForeground is defined in exactly one place", () => {
  it("only src/models/colorContrast.ts defines it", () => {
    const definitions = allSources.filter(
      (f) =>
        relative(SRC, f) !== join("models", "colorContrast.ts") &&
        /function\s+pickForeground\s*\(/.test(readFileSync(f, "utf8")),
    );
    expect(
      definitions.map((f) => relative(SRC, f)),
      "these files redefine pickForeground; import it from models/colorContrast instead",
    ).toEqual([]);
  });

  it("is consumed at every call site rather than reimplemented", () => {
    const users = allSources
      .filter((f) => /pickForeground\s*\(/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f))
      .sort();
    // The module itself, plus the three components that render coloured chips.
    expect(users).toEqual([
      join("components", "CardEditor.tsx"),
      join("components", "fields", "FieldChip.tsx"),
      join("components", "fields", "LabelPill.tsx"),
      join("models", "colorContrast.ts"),
    ]);
  });
});

describe("pickForeground output is always readable", () => {
  it("never picks a foreground worse than the best available one", () => {
    // Note what this does and does not claim. Two fixed candidates cannot
    // clear 4.5:1 for *every* background: in the mid-grey band (roughly
    // #7a-#91) near-black gives ~3.8:1 and white gives ~4.2:1, so no choice
    // of two colours reaches AA. That is a property of the two-candidate
    // approach, not a bug to fix here, and it is why the label palette is
    // restricted to hues that stay out of the dead zone.
    //
    // The guarantee that does hold, and that the old heuristic broke, is that
    // we always take the better of the two. Sweeping the full greyscale is
    // enough to catch an off-by-one at the crossover.
    const DARK = "#172b4d";
    const LIGHT = "#ffffff";
    const failures: string[] = [];
    for (let v = 0; v <= 255; v++) {
      const bg = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      const chosen = contrastRatio(pickForeground(bg), bg);
      const best = Math.max(contrastRatio(DARK, bg), contrastRatio(LIGHT, bg));
      if (Math.abs(chosen - best) > 1e-9) {
        failures.push(`${bg}: chose ${chosen.toFixed(2)}, best ${best.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("clears AA outright on the light and dark halves of the range", () => {
    // Outside the dead zone the better of the two is genuinely AA, so this
    // is a real readability guarantee rather than a relative one. The bounds
    // below are measured, not guessed: greys #77-#91 are the 27 levels where
    // the best achievable ratio bottoms out at 3.77:1.
    const DEAD_BAND: [number, number] = [119, 145];
    const failures: string[] = [];
    let skipped = 0;
    for (let v = 0; v <= 255; v++) {
      if (v >= DEAD_BAND[0] && v <= DEAD_BAND[1]) {
        skipped++;
        continue;
      }
      const bg = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      const ratio = contrastRatio(pickForeground(bg), bg);
      if (ratio < AA) failures.push(`${bg} -> ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
    // Guard against the exclusion silently swallowing the whole sweep.
    expect(skipped).toBe(DEAD_BAND[1] - DEAD_BAND[0] + 1);
    expect(skipped).toBeLessThan(256 / 2);
  });

  it("always picks the better of the two candidate foregrounds", () => {
    const DARK = DARK_FG;
    const LIGHT = LIGHT_FG;
    for (const bg of ["#61bd4f", "#00c2e0", "#f2d600", "#4a5769", "#7b3fb0"]) {
      const chosen = contrastRatio(pickForeground(bg), bg);
      const best = Math.max(
        contrastRatio(DARK, bg),
        contrastRatio(LIGHT, bg),
      );
      expect(chosen, `${bg}: chose ${chosen.toFixed(2)} but ${best.toFixed(2)} was available`)
        .toBeCloseTo(best, 5);
    }
  });

  it("falls back to the dark foreground for anything unparseable", () => {
    // pickForeground is called with palette values in production, but the
    // call sites are not typed against the palette, so a malformed value
    // must degrade to a readable foreground rather than throw.
    for (const bad of ["", "#", "12345", "#12345g", "rgb(0,0,0)", "not a colour"]) {
      expect(pickForeground(bad), bad).toBe("#172b4d");
    }
  });

  it("accepts a hex value with or without the leading hash", () => {
    // Same colour, both spellings: the hash is stripped before validation.
    expect(pickForeground("ffffff")).toBe(pickForeground("#ffffff"));
  });

  it("handles the boundary luminance where neither foreground is great", () => {
    // The mid-grey band is where the two candidates are closest. Whatever
    // pickForeground chooses, the better ratio must be the one taken.
    for (const bg of ["#767676", "#7a7a7a", "#808080", "#858585"]) {
      const chosen = contrastRatio(pickForeground(bg), bg);
      const best = Math.max(contrastRatio(DARK_FG, bg), contrastRatio(LIGHT_FG, bg));
      expect(chosen, bg).toBeCloseTo(best, 5);
    }
  });
});
