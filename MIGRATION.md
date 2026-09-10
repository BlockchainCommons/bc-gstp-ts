# Migrating to `@blockchaincommons/gstp`

`@blockchaincommons/gstp` 1.0.0-beta.1 is the first release of this package,
the canonical home of the Gordian Sealed Transaction Protocol for TypeScript.
It replaces `@bcts/gstp` 1.0.0-beta.6, published from the
[`paritytech/bcts`](https://github.com/paritytech/bcts) monorepo. Every wire
form — the sealed envelope (the request, response or event with `'sender'`,
`'senderContinuation'` and `'recipientContinuation'`, signed, wrapped and
encrypted to the recipients), the continuation envelope (`'id'`,
`'validUntil'`, encrypted to its reader) and the order of the checks when
opening — is unchanged: `tests/differential.test.ts` runs every corpus recipe
through the frozen `@bcts/gstp` bundle (`tests/baseline`) and this package,
and `tests/rust-validation` replays the golden vectors against `gstp-rust`
0.13.0. What changed is the API and what the package rejects.

## TL;DR checklist

- [ ] Replace the `@bcts/gstp` dependency with `@blockchaincommons/gstp` `^1.0.0-beta.1`, and every `@bcts/<name>` sibling with `@blockchaincommons/<name>` (one copy of each shared type).
- [ ] Rewrite import specifiers: `@bcts/gstp` becomes `@blockchaincommons/gstp`.
- [ ] Move to the constructors, options objects, getters, `seal`/`open` and decoders below.
- [ ] Treat every `with…` result as a new value: the receiver is unchanged.
- [ ] Raise your Node floor to **22.12** and TypeScript to **>= 5.7**.
- [ ] Use the ESM or CJS entry point; the IIFE / global-script build is gone.

## 1. Sealed messages

| Before | After |
|---|---|
| `SealedRequest.new(func, id, sender)` / `newWithBody(body, id, sender)` | `SealedRequest.from(func \| expression, { id, sender, state?, peerContinuation? })` |
| `SealedResponse.newSuccess(id, sender)` / `newFailure(id, sender)` / `newEarlyFailure(sender)` | `SealedResponse.success(id, { sender, state?, peerContinuation? })` / `failure(id, …)` / `earlyFailure({ sender, … })` |
| `SealedEvent.new(content, id, sender)` | `SealedEvent.from(content, { id, sender, state?, peerContinuation? })` |
| `withState(s)` / `withOptionalState(s)` / `withPeerContinuation(p)` / `withOptionalPeerContinuation(p)` | `withState(s \| undefined)` / `withPeerContinuation(p \| undefined)` |
| `withResult(r)` / `withOptionalResult(r)` / `withError(e)` / `withOptionalError(e)` | `withResult(r \| undefined)` / `withError(e \| undefined)` |
| `withParameter(p, v)` / `withOptionalParameter(p, v)` | `withParameter(p, v \| undefined)` |
| `withNote`, `withDate(Date)` | `withNote`; `withDate(Date \| CborDate)` — a `Date` to the millisecond, a `CborDate` exactly |
| `with…` mutating the receiver and returning it | `with…` returning a new instance; the receiver is unchanged |
| `request()`, `sender()`, `state()`, `peerContinuation()`, `id()`, `body()`, `note()`, `date()`, `function()`, `expressionEnvelope()`, `response()`, `isOk()`, `isErr()`, `result()`, `error()`, `event()`, `content()` | getters; `cborDate` is the exact date (`expectId()`, `extractResult(decoder)`, `extractError(decoder)` stay methods) |
| `objectForParameter(p)` (throwing) / `objectsForParameter(p)` / `extractObjectForParameter<T>(p)` / `extractOptionalObjectForParameter<T>(p)` / `extractObjectsForParameter<T>(p)` (casts) | `objectForParameter(p)` / `parameter(p)` (optional) / `parameters(p)` / `extractParameter(p, decoder)` / `extractOptionalParameter(p, decoder)` / `extractParameters(p, decoder)` — `decoder` is dcbor's `expectText`, `expectInteger`, `expectBytes`, …, `CborDate.fromTaggedCbor`, `ARID.fromCbor` or any `(cbor) => T`; exact integers, the reference's errors (`Envelope[NonexistentPredicate]`, `[AmbiguousPredicate]`, `[NotLeaf]`, `[Cbor]`) |
| `toEnvelope(validUntil?, signer?, recipient?)` / `toEnvelopeForRecipients(validUntil?, signer?, recipients?)` | `seal({ signer?, recipients?, validUntil?: Date \| CborDate })`; `toEnvelope()` is `seal()` (unsigned, unsealed — `ToEnvelope`) |
| `toRequest()` / `toExpression()` | `request` / `body` |
| `SealedRequest.tryFromEnvelope(envelope, expectedId, now, recipient)` / `SealedResponse.tryFromEncryptedEnvelope(…)` / `SealedEvent.tryFromEnvelope<T>(…, contentExtractor?)` | `SealedRequest.open(envelope, { recipient, expectedId?, now?: Date \| CborDate })` / `SealedResponse.open(…)` / `SealedEvent.open(envelope, { recipient, … })` reads the content as text, `SealedEvent.open(envelope, { …, content: (envelope) => T })` as `T` |
| `equals` comparing the senders' XIDs | `equals` comparing the whole sender document (`XIDDocument.equals`) |
| `SealedRequestBehavior`, `SealedResponseBehavior`, `SealedEventBehavior` | gone (they mirrored Rust traits) |

## 2. Continuations

| Before | After |
|---|---|
| `new Continuation(state, validId?, validUntil?)` | `Continuation.from({ state, validId?, validUntil?: Date \| CborDate \| validFor?: ms })` |
| `withValidId`, `withOptionalValidId`, `withValidUntil`, `withOptionalValidUntil`, `withValidDuration(ms)` | build once with `from` (`validFor` replaces `withValidDuration`) |
| `state()`, `id()`, `validUntil()` | `state`, `validId`, `validUntil` (`Date` view), `cborValidUntil` (exact) |
| `isValidDate(now)` / `isValidId(id)` / `isValid(now, id)` | `isValidAt(now)` / `isValidId(id)` / `isValid({ now, id })` |
| `toEnvelope(recipient?)` | `seal(recipient?)`; `toEnvelope()` is the plain form |
| `Continuation.tryFromEnvelope(envelope, expectedId, now, recipient)` | `Continuation.open(envelope, { recipient?, now?, expectedId? })` |
| an `'id'` or `'validUntil'` object that is not a leaf ignored | read as its subject (a node) or rejected (`Envelope[InvalidFormat]` for a wrapper), as the reference |

## 3. Errors

| Before | After |
|---|---|
| `GstpErrorCode.SENDER_MISSING_ENCRYPTION_KEY` … (enum), `error.code` | `error.code` is `"SenderMissingEncryptionKey"` … `"Envelope"`, `"XID"` (the reference's variant names; `GstpErrorCode`, `GSTP_ERROR_CODES`, frozen) |
| `error.message` `envelope error: <message>` / `XID error: <message>` for wrapped errors | the sibling error's own message (the reference's transparent wrappers); the sibling error is `error.cause`, its code `error.details.inner` |
| `EnvelopeError` escaping from `parameter`, `extractParameter`, `result`, `error`, `expectId`, `Continuation.open` | `GstpError` code `Envelope` |
| `Error("Cannot set state on a failed response")` | `GstpError` code `StateOnFailedResponse` |
| `details` as two loose interfaces | `GstpErrorDetailsByCode`, `GstpErrorDetailsFor<C>`, `GstpErrorTyped<C>`; `error.is(code)` narrows `details` |
| `GstpError.isGstpError` by `name` | `instanceof` with a private brand: only this package's instances pass |
| a `CborError` or engine `TypeError` for `new Date(NaN)`, `validFor: NaN`, a non-`ARID` id, a missing recipient | a `TypeError` naming the argument, at the call that receives it |
| `prelude` namespace, `VERSION`, `extractCborAs` | gone |
| `EnvelopeEncodableValue` in signatures | envelope's `EnvelopeInput` |

## 4. Dependencies

`@blockchaincommons/components`, `dcbor`, `envelope`, `known-values` and
`xid` at `^1.0.0-beta.3` are the runtime dependencies (`envelope`'s
`/expression`, `/recipient`, `/signature` and `/format` entry points).
`@blockchaincommons/dcbor-compat` and `rand` are not dependencies.
Formatting needs `registerTags()` from `@blockchaincommons/envelope/format`
once, as the reference's tests call `bc_envelope::register_tags()`.

## 5. Node and TypeScript floors

| | `@bcts/gstp` | `@blockchaincommons/gstp` |
|---|---|---|
| Node | `>= 18` | `>= 22.12` |
| TypeScript (consumers) | 6.x | `>= 5.7` |

`@bcts/gstp` shipped an additional IIFE bundle through the `browser` field.
That build is dropped: use the ESM entry (`import`) or the CJS entry
(`require`); both are declared in `exports` and validated in CI by `publint`
and `@arethetypeswrong/cli`.
