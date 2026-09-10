/**
 * Seeds vitest.config.ts coverage thresholds from a measured run.
 *
 *   bun run test:coverage && bun scripts/set-coverage-floors.ts
 *
 * Reads coverage/coverage-summary.json and writes each metric's floor a few
 * points below the measured value. Thresholds are raise-only by policy: this
 * script refuses to lower a floor that is already higher.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const summaryPath = join(root, "coverage", "coverage-summary.json");
if (!existsSync(summaryPath)) {
  console.error("coverage/coverage-summary.json not found - run `bun run test:coverage` first.");
  process.exit(1);
}
const total = (
  JSON.parse(readFileSync(summaryPath, "utf8")) as {
    total: Record<string, { pct: number }>;
  }
).total;
const HEADROOM = 2;
const measured = {
  statements: Math.max(0, Math.floor(total["statements"].pct) - HEADROOM),
  branches: Math.max(0, Math.floor(total["branches"].pct) - HEADROOM),
  functions: Math.max(0, Math.floor(total["functions"].pct) - HEADROOM),
  lines: Math.max(0, Math.floor(total["lines"].pct) - HEADROOM),
};

const cfgPath = join(root, "vitest.config.ts");
let cfg = readFileSync(cfgPath, "utf8");
for (const [metric, value] of Object.entries(measured)) {
  const re = new RegExp(`(${metric}:\\s*)(\\d+)`);
  const m = re.exec(cfg);
  if (!m) {
    console.error(`no ${metric} threshold found in vitest.config.ts`);
    process.exit(1);
  }
  const current = Number(m[2]);
  const next = Math.max(current, value);
  cfg = cfg.replace(re, `$1${next}`);
  console.log(`${metric}: ${current} -> ${next} (measured ${total[metric]?.pct}%)`);
}
writeFileSync(cfgPath, cfg);
