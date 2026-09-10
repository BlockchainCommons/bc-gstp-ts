/**
 * The source module graph has no value-import cycles: every `import` that
 * is not type-only forms a DAG.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const files: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) files.push(p);
  }
};
walk(src);

const resolveImport = (from: string, spec: string): string | undefined => {
  if (!spec.startsWith(".")) return undefined;
  const base = resolve(dirname(from), spec.replace(/\.js$/, ""));
  for (const candidate of [`${base}.ts`, join(base, "index.ts")])
    if (files.includes(candidate)) return candidate;
  throw new Error(`unresolved import ${spec} from ${relative(src, from)}`);
};

const valueImports = new Map<string, string[]>();
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const deps: string[] = [];
  for (const m of text.matchAll(/^import\s+(type\s+)?([^;]*?)\s+from\s+"([^"]+)";/gms)) {
    const [, typeOnly, clause, spec] = m;
    const allTypeSpecifiers =
      /^\{[^}]*\}$/.test(clause.trim()) &&
      clause
        .replace(/[{}\s]/g, "")
        .split(",")
        .filter(Boolean)
        .every((s) => s.startsWith("type"));
    if (typeOnly || allTypeSpecifiers) continue;
    const target = resolveImport(f, spec);
    if (target !== undefined) deps.push(target);
  }
  valueImports.set(f, deps);
}

describe("module graph", () => {
  it("covers every source module", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("has no value-import cycles", () => {
    const state = new Map<string, "visiting" | "done">();
    const stack: string[] = [];
    const cycles: string[] = [];
    const visit = (f: string): void => {
      const s = state.get(f);
      if (s === "done") return;
      if (s === "visiting") {
        cycles.push(
          [...stack.slice(stack.indexOf(f)), f].map((x) => relative(src, x)).join(" -> "),
        );
        return;
      }
      state.set(f, "visiting");
      stack.push(f);
      for (const d of valueImports.get(f) ?? []) visit(d);
      stack.pop();
      state.set(f, "done");
    };
    for (const f of files) visit(f);
    expect(cycles).toEqual([]);
  });
});
