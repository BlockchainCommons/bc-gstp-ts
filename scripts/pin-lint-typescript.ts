/**
 * typescript-eslint (peer `typescript <6.1`), ts-api-utils, and typedoc
 * (peer `<=6.0.x`) cannot load the TypeScript 7 native package - the JS
 * compiler API they require() no longer exists there. Until they ship TS7
 * support, give exactly those packages a nested TypeScript 6 copy (the
 * `typescript6` npm alias devDependency) via node_modules symlinks; `tsc`
 * and tsdown keep resolving the root TypeScript 7.
 *
 * Runs from the root `prepare` hook, which a package manager runs for the
 * project being installed and not for a dependency fetched from the registry
 * (this script is not shipped). It also runs on `npm pack` and `npm publish`,
 * so a missing `typescript6` is a notice, not a failure: inside the
 * `bc-typescript` workspace the dependency is hoisted to the root, which
 * applies the same pin once with `bun run pin`. Remove this script together
 * with the `typescript6` devDependency once upstream supports TS7.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const nodeModules = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules");
const ts6 = join(nodeModules, "typescript6");

if (!existsSync(ts6)) {
  console.log("pin-lint-typescript: no local node_modules/typescript6 - nothing to pin here");
  process.exit(0);
}

const consumers = [
  ...readdirSync(join(nodeModules, "@typescript-eslint")).map((d) => join("@typescript-eslint", d)),
  "ts-api-utils",
  "typedoc",
];

for (const consumer of consumers) {
  const pkgDir = join(nodeModules, consumer);
  if (!existsSync(pkgDir)) continue;
  const nested = join(pkgDir, "node_modules", "typescript");
  rmSync(nested, { recursive: true, force: true });
  mkdirSync(dirname(nested), { recursive: true });
  symlinkSync(ts6, nested, "dir");
}
