# Rust reference cross-validation

Replays `tests/vectors/vectors.json` against the `gstp` reference at the
commit the port tracks (`.github/versions.yml`: 0.13.0, `b1296017`), taken
from the repository at that revision — the crates.io `gstp` 0.13.0 predates
it (it is built over bc-envelope 0.39) — over the released `bc-envelope`
0.43.0, `bc-xid` 0.23.0, `bc-components` 0.31.1, `known-values` 0.15.5 and
`dcbor` 0.25.2 that revision resolves. Nothing is patched. The toolchain is
pinned (`rust-toolchain.toml`: 1.98.1).

```sh
cd tests/rust-validation
cargo fetch --locked                                                  # once, with network
cargo run --release --offline -- ../vectors/vectors.json
cargo run --release --offline -- ../vectors/vectors.json --verbose    # every classified row
DUMP=/tmp/rust.json cargo run --release --offline -- ../vectors/vectors.json   # every reference outcome by name
```

Result line on 2026-09-16:

```
177 vectors - 137 match, 18 panic-mapped, 8 js-only (J3 5, J4 3), 14 S1, 0 pending, 0 unparsable, 0 MISMATCH
```

## What is compared

Every recipe (`tests/vectors/recipes.ts`) yields one outcome string on each
side and the two are compared textually. The TypeScript outcome is the
vector's `expect`, materialised by `scripts/generate-vectors.ts` with the
working tree (`tests/vectors/deps.ts`); the reference's is computed by
`src/main.rs`.

- `continuation`: a state with an optional id and deadline, plain or
  encrypted to a party, opened with an expected id, a clock and a
  recipient; the `'id'` and `'validUntil'` objects as leaves, or in a
  shape (`idShape`/`untilShape`: wrapped, a node with an assertion, or
  text), or an `'id'` given twice (`duplicateId`). The outcome is the
  envelope's format and, per open, the fields or the rejection.
- `request`, `response`, `event`: built by a seeded sender (Schnorr and
  X25519 keys from a `PrivateKeyBase` seed), signed, sealed to zero, one or
  many seeded recipients and opened by each — the signed and sealed
  envelope format strings plus the fields of the opened message (summary,
  id, sender, state, peer continuation, and the kind's fields), or the
  rejection. A request's `extract` list reads parameters back through
  named decoders (`text`, `int`, `date`, `arid`, `bytes`, `bool`: the
  reference's `extract_object_for_parameter::<T>`). A response with
  `stateOnFailure` sets state on a response that is not a success. With
  `keys: "pq"` every party holds ML-DSA44 and ML-KEM512 keys, generated
  unseeded on both sides, so every 8-hex fingerprint in the outcome is
  masked as `<h>` (the shapes, `SealedMessage(MLKEM512)`,
  `Signature(MLDSA44)`, the fields and the codes are compared).
- `domain`: a JavaScript-only input by name (`js-only`).
- A rejection is `throw:<code>[<inner code>]|<message>`: the reference's
  `Error` variant, the variant it wraps for `Envelope` and `XID`, and its
  `Display`; the port renders its `GstpError` the same way.

Everything here draws randomness (salts, nonces, ephemeral keys,
signatures), so format strings and opened fields are compared, never bytes.

The program exits 1 on any `MISMATCH` or `unparsable` row. Every other
difference is in a named class:

| Class | Meaning |
|---|---|
| `panic-mapped` | The reference panics where the port throws a coded error (`PANIC_MAPPED` in `src/main.rs`: state on a response that is not a success). Compared by code. |
| `js-only` | A `domain` row: J3 a value the reference's types cannot express (an invalid `Date`, a `NaN` duration, a non-ARID id, a missing recipient), J4 a surface the port reaches differently (an event opened without a content extractor, a `CborDate` at `seal`/`open`). |
| `S1` | An event's `summary`: the reference's `Display` prints `SealedRequest(` (U1); every other character agrees. |
| `pending` | A known finding of the port not yet fixed (`PENDING` in `src/main.rs`), reported with `--verbose`; expected to reach 0. |

The self-check fixtures run in CI: `mismatch.json` (one value flipped: exactly
one MISMATCH), `fixtures/classes.json` (one row of every class) and
`fixtures/malformed.json` (an unreadable recipe: unparsable).

## Mapping notes

- Error codes: the TypeScript `GstpError.code` is the reference's `Error`
  variant name.
- The reference's named-function `name()` is quoted (`"test"`); the
  TypeScript `FunctionID` is the bare name, so the harness strips the quotes.
- Dates: TypeScript renders `Date.toISOString()` (milliseconds always
  present); the harness renders the reference's `Date` the same way. Recipe
  dates are whole seconds: the harness reads them with `Date::from_string`,
  which drops a fractional part (sub-millisecond dates are covered by
  `tests/date.test.ts`).
- Documents are built from seeded `PrivateKeyBase` material (Schnorr and
  X25519 keys as the inception key), so senders and recipients are
  reproducible on both sides.
- A response that is not a success refuses state on both sides (`Cannot set
  state on a failed response`: a coded error here, a panic there): class
  `panic-mapped`.
- The vectors open events with an identity content extractor (the content as
  an envelope, `Event<Envelope>` in the reference) and compare the content
  envelope's flat format.
- A returned `null` state is `Some(null)` for requests and events but `None`
  for responses in the reference (U2); the port mirrors both.

## Reference quirks

- **U1** `SealedEvent`'s `Display` prints `SealedRequest(` (`sealed_event.rs`,
  a copy-paste); the port prints `SealedEvent(`. Class `S1` until fixed upstream.
- **U2** `SealedRequest::try_from_envelope` leaves a returned `null` state as
  `Some(null)` while `SealedResponse::try_from_encrypted_envelope` maps it to
  `None`; the port mirrors both.

## Maintenance

When the upstream reference moves:

1. Port the relevant changes.
2. Update `.github/versions.yml` and the revision in `Cargo.toml`.
3. `cargo fetch --locked` then re-run; add, amend or remove entries here as
   the port requires.
