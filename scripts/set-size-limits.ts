/**
 * Seeds .size-limit.json from a real measurement.
 *
 *   bun scripts/set-size-limits.ts
 *
 * Runs size-limit in JSON mode with the limits removed, then writes each
 * entry's limit at the measured size plus 20% headroom, rounded up to the next
 * whole kB. Guessed budgets are worse than measured ones: a budget that is too
 * tight fails CI on day one, and one that is too loose never catches anything.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface Entry {
  name: string;
  path: string;
  limit?: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfgPath = join(root, ".size-limit.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as Entry[];

// measure with the limits lifted
writeFileSync(
  cfgPath,
  JSON.stringify(
    cfg.map(({ limit: _limit, ...rest }) => rest),
    null,
    2,
  ) + "\n",
);

let measured: { size: number }[];
try {
  const out = execFileSync("bunx", ["size-limit", "--json"], { cwd: root, encoding: "utf8" });
  measured = JSON.parse(out.slice(out.indexOf("["))) as { size: number }[];
} finally {
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
}

const updated = cfg.map((entry, i) => {
  const bytes = measured[i]?.size ?? 0;
  const kb = Math.ceil((bytes * 1.2) / 1000);
  console.log(`${entry.name}: measured ${(bytes / 1000).toFixed(2)} kB -> limit ${kb} kB`);
  return { ...entry, limit: `${kb} kB` };
});
writeFileSync(cfgPath, JSON.stringify(updated, null, 2) + "\n");
