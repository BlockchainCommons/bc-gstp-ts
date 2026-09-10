/**
 * Differential harness: every corpus recipe the frozen baseline bundle
 * (the published packages it inlines) can run is run with it AND with the
 * working tree; the signed and sealed format strings and every opened
 * outcome must be identical outside the enumerated tombstones. The bundle
 * reports a rejection by code alone, so the working tree's
 * `throw:<code>[<inner>]|<message>` is reduced to its code first.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { isBaselineSupported, materialize, recipeName, type Recipe } from "./vectors/recipes";
import { baselineAdapterFor, baselineDeps, baselineModule, currentAdapter } from "./vectors/deps";
import { categories } from "./corpus/corpus";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_SHA256 = readFileSync(join(here, "baseline/README.md"), "utf8").match(
  /Baseline sha256: ([0-9a-f]{64})/,
)?.[1];

/**
 * Tombstones: the only allowed differences. One that has not landed
 * documents a change to come and excuses nothing yet.
 */
const TOMBSTONES: {
  id: string;
  landed: boolean;
  matches: (r: Recipe, baselineOutcome: string, currentOutcome: string) => boolean;
}[] = [
  {
    // Opening an unsigned message: the frozen bundle reported the
    // failed unwrap as an XID error; the reference reports an envelope
    // error (only the sender document's parse is an XID failure).
    id: "T1 unsigned message is an envelope error",
    landed: true,
    matches: (_r, a, b) =>
      a.includes("=throw:XID") && a.replace(/=throw:XID/g, "=throw:Envelope") === b,
  },
  {
    // A failure response's summary: the reference's `Response::summary`
    // writes `id: <id> error: <error>` with no comma, and envelope's
    // `summary()` now does the same; the baseline bundle wrote `id: <id>,
    // error: <error>`.
    id: "T2 failure summary separator",
    landed: true,
    matches: (_r, a, b) =>
      a.includes(", error: ") &&
      a.replace(/(SealedResponse\(id: [^,]+), error: /g, "$1 error: ") === b,
  },
  {
    // A continuation whose `'id'` or `'validUntil'` object is not a leaf:
    // the bundle ignores the field; the reference reads a node's subject
    // and rejects a wrapper (`Envelope[InvalidFormat]`).
    id: "T3 non-leaf continuation fields are read or rejected",
    landed: true,
    matches: (r) =>
      r.k === "continuation" && (r.idShape !== undefined || r.untilShape !== undefined),
  },
  {
    // Envelope failures inside the accessors and `Continuation.open`
    // (two `'id'`s, a duplicated parameter, the wrong response kind)
    // escaped as raw `EnvelopeError`s; they are `Envelope` errors.
    id: "T4 envelope failures are Envelope errors",
    landed: true,
    matches: (_r, a, b) => a.startsWith("throw:EnvelopeError") && b.startsWith("throw:Envelope"),
  },
  {
    // The wrapping errors' messages were prefixed (`envelope error: …`);
    // the reference's are transparent. Codes only are compared here, so
    // this tombstone names the change without ever matching a code diff.
    id: "T5 transparent wrapped-error messages",
    landed: true,
    matches: () => false,
  },
  {
    // `extractParameter` of a missing parameter invented its message and
    // `extractParameters` returned CBOR; the decoders read every parameter
    // the reference's way. The bundle does not run `extract` rows.
    id: "T6 parameter extraction through decoders",
    landed: true,
    matches: () => false,
  },
  {
    // State on a failed response threw a bare `Error`; it is
    // `StateOnFailedResponse`. The bundle does not run those rows.
    id: "T7 state on a failed response is a GstpError",
    landed: true,
    matches: (_r, a, b) =>
      a.startsWith("throw:Error") && b.startsWith("throw:StateOnFailedResponse"),
  },
  {
    // JavaScript-only inputs threw sibling or engine errors; they are
    // `TypeError`s at the boundary. The bundle does not run `domain` rows.
    id: "T8 domain faults are TypeErrors",
    landed: true,
    matches: () => false,
  },
];

/** The rejection code alone: `throw:Code[inner]|message` → `throw:Code`; the bundle's `XID` spelling. */
const codesOnly = (s: string): string =>
  s.replace(
    /throw:([A-Za-z_]+)(?:\[[^\]\n]*\])?(?:\|[^\n]*)?/g,
    (_m, code: string) => `throw:${code === "Xid" ? "XID" : code}`,
  );

const baselineMod = await baselineModule();
const baseline = baselineAdapterFor(baselineMod, baselineDeps(baselineMod));
const current = await currentAdapter();

describe("differential: baseline vs working tree", () => {
  it("baseline bundle integrity", () => {
    const sha = createHash("sha256")
      .update(readFileSync(join(here, "baseline/gstp-baseline.mjs")))
      .digest("hex");
    expect(sha).toBe(BASELINE_SHA256);
  });
  for (const [name, gen] of Object.entries(categories)) {
    it(`category ${name}`, { timeout: 1_800_000 }, () => {
      let n = 0;
      let skipped = 0;
      const diffs: string[] = [];
      for (const recipe of gen()) {
        if (!isBaselineSupported(recipe)) {
          skipped++;
          continue;
        }
        n++;
        const a = codesOnly(materialize(baseline, recipe));
        const b = codesOnly(materialize(current, recipe));
        const tomb = TOMBSTONES.find((t) => t.matches(recipe, a, b));
        if (a !== b && tomb?.landed !== true)
          diffs.push(`${recipeName(recipe)}: ${a.slice(0, 120)} !== ${b.slice(0, 120)}`);
      }
      expect(n).toBeGreaterThan(0);
      if (name === "hand") expect(skipped).toBeGreaterThan(0);
      expect(diffs).toEqual([]);
    });
  }
});
