# Divergences from the Rust reference implementation

This library is a TypeScript port of
[`BlockchainCommons/gstp-rust`](https://github.com/BlockchainCommons/gstp-rust),
tracked at version **0.13.0**
([`b129601`](https://github.com/BlockchainCommons/gstp-rust/commit/b1296017dd31a6845e1fdbd4ea9a0cad17047eb7)).

The tracked version and commit are recorded in
[`.github/versions.yml`](./.github/versions.yml), and the `upstream.yml`
workflow opens a tracking issue whenever the reference implementation moves
ahead of it.

This document is the deliberate record of every place the TypeScript behaviour
differs from the Rust reference. It has three kinds of entry:

1. **True behavioral divergences** - the same input produces a different outcome.
2. **JS-only input domain** - inputs that have no Rust analog, so there is nothing to diverge from.
3. **Mapping equivalences** - JS-specific inputs that are validated through the bytes they produce.

## 1. True behavioral divergences

_None recorded yet for the extraction release. The port was byte-compatible with
the Rust reference at the tracked version when it was extracted from the
`paritytech/bcts` monorepo._

> Any divergence found after extraction must be added here in the same commit
> that introduces or discovers it, with the input, the Rust outcome, the
> TypeScript outcome, and the reason the difference is intentional.

## 2. JS-only input domain

_To be documented as the surface is audited._

## 3. Mapping equivalences

_To be documented as the surface is audited._

## Maintenance

When the upstream reference moves:

1. Review the diff via the link in the `upstream.yml` tracking issue.
2. Port the relevant changes.
3. Update `.github/versions.yml` with the new version and commit.
4. Update the tracked version at the top of this file.
5. Add, amend, or remove divergence entries as the port requires.
