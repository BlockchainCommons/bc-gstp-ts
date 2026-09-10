/**
 * Build the frozen baseline bundle: the published `@bcts/gstp` 1.0.0-beta.6
 * and its closure (installed under tests/baseline from its package.json), as
 * one self-contained ESM file.
 *
 *   bun scripts/build-baseline.ts
 *
 * Bundles tests/baseline/entry.ts with every dependency INLINED, so the
 * bundle keeps behaving as the published packages did even after the
 * workspace's siblings change. The entry also re-exports the sibling values
 * the differential drives the bundle with (keys, documents, envelopes,
 * expressions), so they are the bundle's own classes. Writes
 * tests/baseline/<pkg>-baseline.mjs, the .d.mts API snapshot, and README.md
 * with the commit and sha256 pinned.
 */
import { build } from "tsdown";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name: string };
const short: string = pkg.name.replace("@blockchaincommons/", "");
const outDir = join(root, "tests", "baseline");
mkdirSync(outDir, { recursive: true });
if (!existsSync(join(outDir, "node_modules", "@bcts", "gstp"))) {
  console.error("tests/baseline/node_modules/@bcts/gstp missing: run `npm install` in tests/baseline first.");
  process.exit(1);
}

await build({
  // Never load the package's own tsdown.config.ts: its externals would keep
  // the siblings out of the bundle.
  config: false,
  entry: { [`${short}-baseline`]: join(outDir, "entry.ts") },
  outDir,
  format: ["esm"],
  dts: false,
  sourcemap: false,
  clean: false,
  target: "es2022",
  // Everything but Node builtins is inlined: the bundle is self-contained.
  deps: { alwaysBundle: [/^(?!node:)/] },
  inputOptions: {
    onwarn(w, d) {
      if (w.code !== "SOURCEMAP_BROKEN" && w.code !== "EMPTY_IMPORT_META") d(w);
    },
  },
});

const bundle = join(outDir, `${short}-baseline.mjs`);
const text = readFileSync(bundle, "utf8").replace(/\n\/\/# sourceMappingURL=.*\n?$/, "\n");
writeFileSync(bundle, text);
const sha = createHash("sha256").update(text).digest("hex");
const commit = execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
if (existsSync(join(root, "api/index.d.mts")))
  copyFileSync(join(root, "api/index.d.mts"), join(outDir, `${short}-baseline.d.mts`));
writeFileSync(
  join(outDir, "README.md"),
  `# Frozen baseline build

\`${short}-baseline.mjs\` is the self-contained ESM bundle of the PUBLISHED
\`@bcts/gstp\` 1.0.0-beta.6 and its closure (pinned by tests/baseline/package.json,
installed under tests/baseline/node_modules), built at commit \`${commit}\` of this
package: the behaviour consumers had before \`${pkg.name}\`. Every sibling is
inlined exactly once. \`${short}-baseline.d.mts\` is the public surface at that commit.

\`tests/differential.test.ts\` runs every corpus recipe through this bundle and
the working tree and asserts identical outcomes outside the enumerated
tombstones; it pins the sha256 below so an accidental rebuild cannot turn the
differential into a self-comparison.

Baseline commit: ${commit}
Baseline sha256: ${sha}
`,
);
console.log(`wrote ${bundle}\nsha256 ${sha}\ncommit ${commit}`);
