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
192 vectors - 148 match, 21 panic-mapped, 8 js-only (J3 5, J4 3), 15 S1, 0 pending, 0 unparsable, 0 MISMATCH
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
  envelope's format and, per open, the fields or the rejection, with
  `equals` (the reopened continuation against the original: `PartialEq`
  there, `equals` here). With `elided` the original is also compared to a
  continuation whose state is elided: `elidedEquals=false` on both sides,
  because equality is structural.
- `request`, `response`, `event`: built by a seeded sender (Schnorr and
  X25519 keys from a `PrivateKeyBase` seed), signed, sealed to zero, one or
  many seeded recipients and opened by each — the signed and sealed
  envelope format strings plus the fields of the opened message (summary,
  id, sender, state, peer continuation, and the kind's fields), or the
  rejection. A request's `extract` list reads parameters back through
  named decoders (`text`, `int`, `date`, `arid`, `bytes`, `bool`: the
  reference's `extract_object_for_parameter::<T>`). A response with
  `stateOnFailure` sets state on a response that is not a success; a
  `result` on a failure or an `error` on a success reaches the setters the
  reference panics on. With `keys: "pq"` every party holds ML-DSA44 and
  ML-KEM512 keys, generated unseeded on both sides, so every 8-hex
  fingerprint in the outcome is masked as `<h>` (the shapes,
  `SealedMessage(MLKEM512)`, `Signature(MLDSA44)`, the fields and the codes
  are compared).
- `sealedEnvelope`: a message assembled by hand — the minimal request,
  response or event body with the recipe's id, one `'sender'` assertion per
  entry of `senders` (the seeded document, or a text leaf; none leaves the
  assertion out), a plain-text `'senderContinuation'` when asked, signed
  unless `sign` is false, wrapped and encrypted to the recipients — opened
  with the class `as` names. These rows reach the checks that run before
  the body is parsed: the `'sender'` lookup (`Envelope[NonexistentPredicate]`,
  `Envelope[AmbiguousPredicate]`), the document's parse (`XID[Cbor]`), the
  unwrap of an unsigned body (`Envelope[NotWrapped]`), the sender
  continuation (`PeerContinuationNotEncrypted`, `MissingPeerContinuation`),
  a stranger opening (`Envelope[UnknownRecipient]`), and a well-formed body
  opening as a response or an event.
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
| `panic-mapped` | The reference panics where the port throws a coded error (`PANIC_MAPPED` in `src/main.rs`). Three sites: gstp's `with_state` on a response that is not a success (`StateOnFailedResponse` here), and bc-envelope's `with_result` on a failure and `with_error` on a success (`Envelope`, inner code `General`, with the panic's text here). Compared by code. |
| `js-only` | A `domain` row: J3 a value the reference's types cannot express (an invalid `Date`, a `NaN` duration, a non-ARID id, a missing recipient); J4 a surface this program cannot compare (an event opened with the default text decoder, which is the reference's `SealedEvent<String>`; a JavaScript `Date` at `toEnvelope`/`fromEnvelope`, which this library accepts beside the reference's only date type, `dcbor::Date`). |
| `S1` | An event's `summary`: the reference's `Display` prints `SealedRequest(` (U1); every other character agrees. The class goes when the fix is released. |
| `pending` | A known finding of the port not yet fixed (`PENDING` in `src/main.rs`), reported with `--verbose`; expected to reach 0. |

The self-check fixtures run in CI: `mismatch.json` (one value flipped: exactly
one MISMATCH), `fixtures/classes.json` (one row of every class) and
`fixtures/malformed.json` (an unreadable recipe: unparsable).

## Mapping notes

- Error codes: the TypeScript `GstpError.code` is the reference's `Error`
  variant name. The `'sender'` lookup is an envelope failure
  (`Envelope[NonexistentPredicate]`, `Envelope[AmbiguousPredicate]`); only
  the document's parse is an xid failure (`XID[Cbor]`), as the reference's
  `?` conversions have it.
- The reference's named-function `name()` is quoted (`"test"`); the
  TypeScript `FunctionID` is the bare name, so the harness strips the quotes.
- Dates: TypeScript renders `Date.toISOString()` (milliseconds always
  present); the harness renders the reference's `Date` the same way. Recipe
  dates are whole seconds: the harness reads them with `Date::from_string`,
  which drops a fractional part (sub-millisecond dates are covered by
  `tests/date.test.ts`).
- Documents are built from seeded `PrivateKeyBase` material (Schnorr and
  X25519 keys as the inception key), so senders and recipients are
  reproducible on both sides. Both sides copy the sender document when a
  message is built (`sender.as_ref().clone()` there, `clone()` here); the
  corpus builds each sender once, and `tests/boundary.test.ts` checks that a
  document edited afterwards does not reach the `'sender'` assertion.
- Equality is structural on both sides (`PartialEq` on `Envelope` is
  `is_identical_to`; `equals` uses `isIdenticalTo`): an envelope and its
  elided form share a digest and are not equal. The `elided` continuation
  rows pin it.
- A response that is not a success refuses state on both sides (`Cannot set
  state on a failed response`: a coded error here, a panic there), and
  refuses a result; a success refuses an error (bc-envelope's panics, an
  `Envelope` error here): class `panic-mapped`.
- The vectors open events with an identity content extractor (the content as
  an envelope, `Event<Envelope>` in the reference) and compare the content
  envelope's flat format.
- A returned `null` state is `Some(null)` for requests and events but `None`
  for responses in the reference (U2); the port mirrors both.

## Reference behaviours reproduced or carried on purpose

- **U1** `SealedEvent`'s `Display` prints `SealedRequest(` (`sealed_event.rs`,
  a copy of the request's `impl`); this library prints `SealedEvent(`. Class
  `S1` until fixed upstream. To file.
- **U2** `SealedRequest::try_from_envelope` and `SealedEvent::try_from_envelope`
  keep a returned `null` state as `Some(null)`; `SealedResponse::try_from_encrypted_envelope`
  maps it to `None`. This library mirrors both. To file.
- **U3** The response's constructor is `try_from_encrypted_envelope` beside the
  request's and event's `try_from_envelope`, although all three decrypt. One
  name here (`fromEnvelope`). To file as a naming nit.

## Kept differences

- The JavaScript input domain is checked (`TypeError`, class `js-only`); a
  JavaScript `Date` is accepted wherever the reference takes a `dcbor::Date`;
  a `content` decoder stands for the event's `T`; `StateOnFailedResponse` is
  thrown where the reference panics.

## Maintenance

When the upstream reference moves:

1. Port the relevant changes.
2. Update `.github/versions.yml` and the revision in `Cargo.toml`.
3. `cargo fetch --locked` then re-run; add, amend or remove entries here as
   the port requires.

A new difference is a bug on one side: fix it. A JavaScript-only input
becomes a class in `src/main.rs` and here, never a difference. When an item
above is fixed upstream, the port follows and the entry goes.
