/**
 * Golden vector generator. `bun scripts/generate-vectors.ts`.
 * Materialises the golden recipes with the WORKING TREE and writes
 * tests/vectors/vectors.json. With VECTORS_FROM=baseline it materialises
 * with the frozen bundle instead, the way the file was first created.
 *
 * The known-values directory configuration is pinned to no directories
 * before anything runs, as the test setup file pins it, so no vector reads
 * this machine's `~/.known-values`.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DirectoryConfig, setDirectoryConfig } from "@blockchaincommons/known-values";
import { materialize, recipeName, type Recipe } from "../tests/vectors/recipes.ts";
import { goldenRecipes } from "../tests/corpus/corpus.ts";
import {
  baselineAdapterFor,
  baselineDeps,
  baselineModule,
  currentAdapter,
} from "../tests/vectors/deps.ts";

setDirectoryConfig(new DirectoryConfig());

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fromBaseline = process.env["VECTORS_FROM"] === "baseline";
const api = fromBaseline
  ? await (async () => {
      const m = await baselineModule();
      return baselineAdapterFor(m, baselineDeps(m));
    })()
  : await currentAdapter();
const vectors: { name: string; recipe: Recipe; expect: string }[] = [];
for (const recipe of goldenRecipes())
  vectors.push({ name: recipeName(recipe), recipe, expect: materialize(api, recipe) });
writeFileSync(
  join(root, "tests/vectors/vectors.json"),
  JSON.stringify({ count: vectors.length, vectors }, null, 1) + "\n",
);
const throws = vectors.filter((v) => v.expect.startsWith("throw:")).length;
console.log(
  `wrote ${vectors.length} vectors (${throws} throw) from ${fromBaseline ? "the frozen baseline" : "working tree"}`,
);
