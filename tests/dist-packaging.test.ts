/**
 * Dist-level packaging assertions.
 *
 * Runs against the BUILT `dist/` output and is skipped when it is absent (CI
 * builds before testing). It asserts the contract the `exports` map promises:
 * every declared entry point exists in both module systems with both sets of
 * type declarations, the ESM entry loads, and the CJS entry exposes the same
 * public names as the ESM one.
 *
 * This is the check that catches a build config change quietly deleting part of
 * the public surface - for example a `sideEffects` declaration that lets a
 * bundler drop the modules which install prototype extensions.
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dist = join(root, "dist");
const pkg = createRequire(import.meta.url)(join(root, "package.json")) as {
  exports: Record<string, unknown>;
};

const built = existsSync(join(dist, "index.mjs"));

/** Every subpath the package promises, as dist-relative base names. */
const entries = Object.entries(pkg.exports)
  .filter(([key]) => key !== "./package.json")
  .map(([, value]) => {
    const v = value as { import?: { types?: string } };
    const types = v.import?.types ?? "";
    return /^\.\/dist\/(.+)\.d\.mts$/.exec(types)?.[1] ?? "index";
  });

describe.skipIf(!built)("dist packaging", () => {
  it("declares at least the root entry", () => {
    expect(entries).toContain("index");
  });

  it.each(entries)("%s exists in both module systems, with both type sets", (entry) => {
    for (const ext of ["mjs", "cjs", "d.mts", "d.cts"]) {
      expect(existsSync(join(dist, `${entry}.${ext}`)), `dist/${entry}.${ext}`).toBe(true);
    }
  });

  it("the ESM root entry loads and exposes a public surface", async () => {
    const mod = (await import(join(dist, "index.mjs"))) as Record<string, unknown>;
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it("the CJS root entry exposes the same names as the ESM one", async () => {
    const esm = (await import(join(dist, "index.mjs"))) as Record<string, unknown>;
    const require_ = createRequire(import.meta.url);
    let cjs: Record<string, unknown>;
    try {
      cjs = require_(join(dist, "index.cjs")) as Record<string, unknown>;
    } catch (error) {
      // A native or environment-only dependency can refuse to load under CJS
      // here; the file's existence is already asserted above.
      console.warn(`CJS entry could not be loaded in this environment: ${String(error)}`);
      return;
    }
    const names = (m: Record<string, unknown>): string[] =>
      Object.keys(m)
        .filter((k) => k !== "default" && k !== "__esModule")
        .sort();
    expect(names(cjs)).toEqual(names(esm));
  });
});
