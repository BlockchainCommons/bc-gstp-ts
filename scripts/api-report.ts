/**
 * Public API report via @microsoft/api-extractor.
 *
 * Usage:
 *   bun scripts/api-report.ts --local   # (re)generate api/gstp.api.md
 *   bun scripts/api-report.ts           # verify the committed report matches
 *
 * api-extractor requires a `.d.ts` entry point; tsdown emits `.d.mts`, so a
 * transient copy is made inside dist/ first. The committed report
 * (api/gstp.api.md) is the reviewable record of the public surface: every
 * surface change is a visible diff here and in api/index.d.mts.
 */

import { copyFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const local = process.argv.includes("--local");

const dmts = join(root, "dist", "index.d.mts");
const dts = join(root, "dist", "index.d.ts");

if (!existsSync(dmts)) {
  console.error("dist/index.d.mts not found - run `bun run build` first.");
  process.exit(1);
}
copyFileSync(dmts, dts);

try {
  const config = ExtractorConfig.loadFileAndPrepare(join(root, "api-extractor.json"));
  const result = Extractor.invoke(config, {
    localBuild: local,
    showVerboseMessages: false,
  });

  if (!result.succeeded) {
    console.error(
      `api-extractor failed with ${result.errorCount} error(s) and ${result.warningCount} warning(s).`,
    );
    process.exit(1);
  }
  if (result.apiReportChanged && !local) {
    console.error(
      "Public API surface changed but api/gstp.api.md was not updated.\n" +
        "Review the change, then run `bun run api:snapshot` to accept it.",
    );
    process.exit(1);
  }
  console.log(
    local
      ? "API report (api/gstp.api.md) is up to date."
      : "API report matches the committed snapshot.",
  );
} finally {
  rmSync(dts, { force: true });
  rmSync(join(root, "dist", "api-temp"), { recursive: true, force: true });
}
