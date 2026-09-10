# Frozen baseline build

`gstp-baseline.mjs` is the self-contained ESM bundle of the PUBLISHED
`@bcts/gstp` 1.0.0-beta.6 and its closure (pinned by tests/baseline/package.json,
installed under tests/baseline/node_modules), built at commit `8908143086f4b6ac6da4534ca187265aeb47d6fe` of this
package: the behaviour consumers had before `@blockchaincommons/gstp`. Every sibling is
inlined exactly once. `gstp-baseline.d.mts` is the public surface at that commit.

`tests/differential.test.ts` runs every corpus recipe through this bundle and
the working tree and asserts identical outcomes outside the enumerated
tombstones; it pins the sha256 below so an accidental rebuild cannot turn the
differential into a self-comparison. Rebuild with `bun scripts/build-baseline.ts`
after `npm install` in tests/baseline.

Baseline commit: 8908143086f4b6ac6da4534ca187265aeb47d6fe
Baseline sha256: ca60a1480c54c965fec25b2048bd6f2672120a5b9f2550fb4d75733f0ba5bb17
