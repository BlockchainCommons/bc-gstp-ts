/**
 * Public-API snapshot.
 *
 * Snapshots the built public type declarations of the entry point (index)
 * from dist/<entry>.d.mts to api/<entry>.d.mts, so
 * any change to the public surface is a reviewable diff.
 *
 *   bun run api:snapshot   # write/update the snapshots from the current build
 *   bun run api:check      # fail if any built .d.mts differs from its snapshot
 *
 * Run `bun run build` first (the script reads dist/).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const ENTRIES = ["index"];

let failed = false;
for (const entry of ENTRIES) {
  const built = resolve(root, `dist/${entry}.d.mts`);
  const snapshot = resolve(root, `api/${entry}.d.mts`);

  if (!existsSync(built)) {
    console.error(`Missing ${built}. Run \`bun run build\` first.`);
    process.exit(1);
  }
  const current = readFileSync(built, "utf8");

  if (check) {
    if (!existsSync(snapshot)) {
      console.error(`No API snapshot for "${entry}". Run \`bun run api:snapshot\`.`);
      failed = true;
      continue;
    }
    if (readFileSync(snapshot, "utf8") !== current) {
      console.error(
        `Public API changed vs api/${entry}.d.mts.\n` +
          "Review the change; if intended, run `bun run api:snapshot` to update it.",
      );
      failed = true;
    }
  } else {
    mkdirSync(dirname(snapshot), { recursive: true });
    writeFileSync(snapshot, current);
    console.log(`Wrote API snapshot to api/${entry}.d.mts (${current.length} bytes).`);
  }
}

if (check) {
  if (failed) process.exit(1);
  console.log("All API snapshots match the current build.");
}
