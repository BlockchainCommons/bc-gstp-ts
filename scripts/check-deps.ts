/**
 * Dependency hygiene gate.
 *
 *   bun scripts/check-deps.ts
 *
 * A published package must not depend on `@bcts/*` (the packages this
 * library was extracted from) or use a `workspace:` protocol range. Every
 * `@blockchaincommons/*` package `src/` imports must be a declared runtime
 * dependency, and every declared runtime dependency must be imported by
 * `src/`: a package that resolves only through the workspace hoist cannot
 * be installed from the registry.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<
  string,
  Record<string, string> | undefined
>;

const groups = ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"];
let failed = false;

for (const group of groups) {
  for (const [name, range] of Object.entries(pkg[group] ?? {})) {
    if (name.startsWith("@bcts/")) {
      console.error(`${group}: "${name}" is an unpublished package and cannot be depended on.`);
      failed = true;
    }
    if (typeof range === "string" && range.startsWith("workspace:")) {
      console.error(`${group}: "${name}" uses the workspace: protocol ("${range}").`);
      failed = true;
    }
  }
}

/** Every `.ts` file under `dir`. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return entry.endsWith(".ts") && !entry.endsWith(".d.ts") ? [path] : [];
  });
}

const imported = new Set<string>();
for (const file of sources(join(root, "src"))) {
  for (const m of readFileSync(file, "utf8").matchAll(/from\s+"(@blockchaincommons\/[^/"]+)/g)) {
    imported.add(m[1]);
  }
}
const declared = new Set(Object.keys(pkg["dependencies"] ?? {}));
for (const name of imported) {
  if (!declared.has(name)) {
    console.error(`src/ imports "${name}", which is not a declared dependency.`);
    failed = true;
  }
}
for (const name of declared) {
  if (name.startsWith("@blockchaincommons/") && !imported.has(name)) {
    console.error(`"${name}" is declared as a dependency but src/ never imports it.`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`no unpublishable dependencies; ${imported.size} sibling imports all declared`);
