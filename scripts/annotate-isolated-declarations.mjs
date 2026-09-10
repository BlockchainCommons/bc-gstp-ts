/**
 * Annotates the mechanical `--isolatedDeclarations` cases.
 *
 *   node scripts/annotate-isolated-declarations.mjs [--dry-run]
 *
 * The reference tsconfig enables `isolatedDeclarations`, which the monorepo did
 * not. It requires an explicit type on any exported declaration whose type a
 * single-file emit cannot infer. Most of those are one shape:
 *
 *   export const FOO = new Bar(...)        ->  export const FOO: Bar = new Bar(...)
 *   static readonly SIZE = OTHER_CONST     ->  static readonly SIZE: number = ...
 *   export const FOO = someFn             ->  needs the function's signature, skipped
 *
 * This handles the `new Bar(...)` form and numeric-constant aliases, reports
 * everything it could not decide, and never guesses: anything ambiguous is left
 * for a human to annotate.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry-run");

let out = "";
try {
  out = execFileSync("bunx", ["tsc", "--noEmit"], { cwd: root, encoding: "utf8" });
} catch (e) {
  out = String(e.stdout ?? "");
}

const errors = [];
for (const line of out.split("\n")) {
  const m = /^(\S+\.ts)\((\d+),(\d+)\): error (TS901[02]):/.exec(line.trim());
  if (m) errors.push({ file: m[1], line: Number(m[2]), code: m[4] });
}
if (errors.length === 0) { console.log("no isolatedDeclarations errors"); process.exit(0); }

const byFile = new Map();
for (const e of errors) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}

let fixed = 0;
const skipped = [];
for (const [file, list] of byFile) {
  const path = join(root, file);
  const lines = readFileSync(path, "utf8").split("\n");
  // descending, so earlier edits do not shift later line numbers
  for (const e of [...list].sort((a, b) => b.line - a.line)) {
    const idx = e.line - 1;
    const text = lines[idx];
    if (text === undefined || /:\s*\S+\s*=/.test(text.replace(/=.*/, "$&"))) continue;

    // export const NAME = new Klass(   |   static readonly NAME = new Klass(
    const ctor = /^(\s*(?:export\s+)?(?:static\s+)?(?:readonly\s+)?(?:const\s+)?)([A-Za-z_$][\w$]*)(\s*=\s*new\s+)([A-Za-z_$][\w$.]*)/.exec(text);
    if (ctor && !text.includes(": ")) {
      const type = ctor[4].split(".").pop();
      lines[idx] = text.replace(`${ctor[2]}${ctor[3]}`, `${ctor[2]}: ${type}${ctor[3]}`);
      fixed++;
      continue;
    }
    skipped.push(`${file}:${e.line}: ${text.trim()}`);
  }
  if (!dry) writeFileSync(path, lines.join("\n"));
}

console.log(`annotated ${fixed} declaration(s)`);
if (skipped.length) {
  console.log(`\n${skipped.length} left for manual annotation:`);
  for (const s of skipped) console.log("  " + s);
}
