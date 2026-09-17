import { CborDecoder, Envelope, EnvelopeErrorCode, EnvelopeInput, ToEnvelope } from "@blockchaincommons/envelope";
import { XIDDocument, XIDErrorCode } from "@blockchaincommons/xid";
import { ARID, Decrypter, Encrypter, Signer } from "@blockchaincommons/components";
import { CborDate } from "@blockchaincommons/dcbor";
import { Event, Expression, Function, FunctionID, Parameter, ParameterID, Request, Response } from "@blockchaincommons/envelope/expression";
//#region src/error.d.ts
/**
 * The reference's `Error` variants, plus `StateOnFailedResponse` for the
 * one call where the reference panics.
 */
type GstpErrorCode = "SenderMissingEncryptionKey" | "RecipientMissingEncryptionKey" | "SenderMissingVerificationKey" | "ContinuationExpired" | "ContinuationIdInvalid" | "PeerContinuationNotEncrypted" | "MissingPeerContinuation" | "StateOnFailedResponse" | "Envelope" | "XID";
/** Every code, in the reference's order. */
export declare const GSTP_ERROR_CODES: readonly GstpErrorCode[];
/** `details` by code: the protocol rejections carry only their code; the two wrappers carry the wrapped error's code and message. */
interface GstpErrorDetailsByCode {
  /** The sender's document holds no encryption key. */
  SenderMissingEncryptionKey: {
    /** The discriminant. */
    readonly code: "SenderMissingEncryptionKey";
  };
  /** A recipient's document holds no encryption key. */
  RecipientMissingEncryptionKey: {
    /** The discriminant. */
    readonly code: "RecipientMissingEncryptionKey";
  };
  /** The sender's document holds no verification key. */
  SenderMissingVerificationKey: {
    /** The discriminant. */
    readonly code: "SenderMissingVerificationKey";
  };
  /** The continuation's deadline has passed. */
  ContinuationExpired: {
    /** The discriminant. */
    readonly code: "ContinuationExpired";
  };
  /** The continuation is bound to another request id. */
  ContinuationIdInvalid: {
    /** The discriminant. */
    readonly code: "ContinuationIdInvalid";
  };
  /** The peer's continuation arrived in the clear. */
  PeerContinuationNotEncrypted: {
    /** The discriminant. */
    readonly code: "PeerContinuationNotEncrypted";
  };
  /** A request arrived without the peer's continuation. */
  MissingPeerContinuation: {
    /** The discriminant. */
    readonly code: "MissingPeerContinuation";
  };
  /** State was set on a response that is not a success. */
  StateOnFailedResponse: {
    /** The discriminant. */
    readonly code: "StateOnFailedResponse";
  };
  /** An envelope operation failed: `inner` is the envelope error's code. */
  Envelope: {
    /** The discriminant. */
    readonly code: "Envelope";
    /** The envelope error's code. */
    readonly inner: EnvelopeErrorCode | undefined;
    /** The envelope error's message. */
    readonly message: string;
  };
  /** The sender's XID document did not parse: `inner` is the xid error's code. */
  XID: {
    /** The discriminant. */
    readonly code: "XID";
    /** The xid error's code. */
    readonly inner: XIDErrorCode | undefined;
    /** The xid error's message. */
    readonly message: string;
  };
}
/** The `details` of one code. */
type GstpErrorDetailsFor<C extends GstpErrorCode> = GstpErrorDetailsByCode[C];
/** The `details` of any code, discriminated by `code`. */
type GstpErrorDetails = GstpErrorDetailsByCode[GstpErrorCode];
/** A `GstpError` narrowed to one code, as `is(code)` and the factories type it. */
type GstpErrorTyped<C extends GstpErrorCode> = GstpError & {
  /** The code, narrowed. */
  readonly code: C;
  /** The details of that code. */
  readonly details: GstpErrorDetailsFor<C>;
};
/**
 * The error every operation of this package throws.
 *
 * ```ts
 * try {
 *   SealedRequest.open(envelope, { recipient, now });
 * } catch (e) {
 *   if (GstpError.isGstpError(e) && e.is("Envelope")) console.log(e.details.inner);
 * }
 * ```
 */
export declare class GstpError extends Error {
  #private;
  /** Always `"GstpError"`. */
  override readonly name = "GstpError";
  /** Which condition was raised. */
  readonly code: GstpErrorCode;
  /** Structured information, discriminated by `code`; frozen. */
  readonly details: GstpErrorDetails;
  private constructor();
  /** `true` for an error this package threw: an instance, not a look-alike. */
  static isGstpError(value: unknown): value is GstpError;
  /** `true` when this error carries `code`; narrows `details`. */
  is<C extends GstpErrorCode>(code: C): this is GstpErrorTyped<C>;
  private static plain;
  /** `SenderMissingEncryptionKey`: the sender's document holds no encryption key. */
  static senderMissingEncryptionKey(): GstpErrorTyped<"SenderMissingEncryptionKey">;
  /** `RecipientMissingEncryptionKey`: a recipient's document holds no encryption key. */
  static recipientMissingEncryptionKey(): GstpErrorTyped<"RecipientMissingEncryptionKey">;
  /** `SenderMissingVerificationKey`: the sender's document holds no verification key. */
  static senderMissingVerificationKey(): GstpErrorTyped<"SenderMissingVerificationKey">;
  /** `ContinuationExpired`: the continuation's deadline has passed. */
  static continuationExpired(): GstpErrorTyped<"ContinuationExpired">;
  /** `ContinuationIdInvalid`: the continuation is bound to another request id. */
  static continuationIdInvalid(): GstpErrorTyped<"ContinuationIdInvalid">;
  /** `PeerContinuationNotEncrypted`: the peer's continuation arrived in the clear. */
  static peerContinuationNotEncrypted(): GstpErrorTyped<"PeerContinuationNotEncrypted">;
  /** `MissingPeerContinuation`: a request arrived without the peer's continuation. */
  static missingPeerContinuation(): GstpErrorTyped<"MissingPeerContinuation">;
  /** `StateOnFailedResponse`: state was set on a response that is not a success (the reference panics). */
  static stateOnFailedResponse(): GstpErrorTyped<"StateOnFailedResponse">;
  /**
   * The wrapping codes are transparent, as the reference's
   * `#[error(transparent)]`: the message is the sibling error's, the
   * sibling error is `cause`, and `details.inner` is its code.
   */
  private static wrapped;
  /** `Envelope`: an envelope that would not decrypt, verify, unwrap or parse; `cause` is the envelope error. */
  static envelope(cause: unknown): GstpErrorTyped<"Envelope">;
  /** `XID`: a sender document that would not parse; `cause` is the xid error. */
  static xid(cause: unknown): GstpErrorTyped<"XID">;
}
//#endregion
//#region src/guards.d.ts
/** A date as a JavaScript `Date` (to the millisecond) or a `CborDate` (exact). */
type DateInput = Date | CborDate;
//#endregion
//#region src/continuation.d.ts
/** What `Continuation.from` takes. */
interface ContinuationInput {
  /** The state to get back; anything an envelope holds. */
  state: EnvelopeInput;
  /** The request id the continuation answers to. */
  validId?: ARID | undefined;
  /** When it stops being valid: a `Date` to the millisecond, a `CborDate` exactly. */
  validUntil?: DateInput | undefined;
  /** Alternatively, how long it stays valid from now, in milliseconds (the reference's `Duration`). */
  validDuration?: number | undefined;
}
/** What `isValid` checks against. */
interface ContinuationCheck {
  /** The clock; no expiry check without one. */
  now?: DateInput | undefined;
  /** The request id; no id check without one. */
  id?: ARID | undefined;
}
/** What `Continuation.fromEnvelope` takes. */
interface ContinuationFromEnvelopeOptions {
  /** The private keys that decrypt a sealed continuation. */
  recipient?: Decrypter | undefined;
  /** The clock the deadline is checked against; no check without one. */
  now?: DateInput | undefined;
  /** The request id the bound id must equal; no check without one. */
  expectedId?: ARID | undefined;
}
/** State bound to an optional request id and deadline; sealed to the party that reopens it. */
export declare class Continuation implements ToEnvelope {
  private readonly _state;
  private readonly _validId;
  private readonly _validUntil;
  private constructor();
  /**
   * A continuation for `state`, bound to `validId` and to `validUntil` (or
   * to now plus `validDuration` milliseconds) when given. An id that is not
   * an `ARID`, a date without a time or a duration that is not a finite
   * non-negative number is a `TypeError`.
   */
  static from({ state, validId, validUntil, validDuration }: ContinuationInput): Continuation;
  /** The state. */
  get state(): Envelope;
  /** The bound request id, when any. */
  get id(): ARID | undefined;
  /** The deadline as a JS `Date` (millisecond view); `cborValidUntil` is the exact value. */
  get validUntil(): Date | undefined;
  /** The deadline exactly, when any. */
  get cborValidUntil(): CborDate | undefined;
  /** Not expired at `now` (strictly before the deadline); always valid without a deadline or without a clock. */
  isValidDate(now?: DateInput): boolean;
  /** Bound to `id`; always valid without a bound id or without an id to check. */
  isValidId(id?: ARID): boolean;
  /** `isValidDate(now)` and `isValidId(id)`. */
  isValid({ now, id }?: ContinuationCheck): boolean;
  /**
   * The state wrapped, with `'id'` and `'validUntil'` assertions when set;
   * encrypted to `recipient` (the party that will reopen it) when given.
   */
  toEnvelope(recipient?: Encrypter): Envelope;
  /**
   * Decrypts (with `recipient`), reads the state, id and deadline (the
   * `'id'` and `'validUntil'` objects' subjects, as the reference's
   * `extract_optional_object_for_predicate`: a wrapped object is
   * `Envelope[InvalidFormat]`, one of the wrong type `Envelope[Cbor]`, two
   * of them `Envelope[AmbiguousPredicate]`), and checks them:
   * `ContinuationExpired` when `now` is past the deadline,
   * `ContinuationIdInvalid` when `expectedId` does not match the bound id.
   */
  static fromEnvelope(sealed: Envelope, { recipient, now, expectedId }?: ContinuationFromEnvelopeOptions): Continuation;
  /** Identical state (digest and structure), same id and deadline, as the reference's `PartialEq`. */
  equals(other: Continuation): boolean;
  /** `Continuation(state: …, id: …, validUntil: …)`; a JavaScript addition (the reference derives `Debug` only). */
  toString(): string;
}
//#endregion
//#region src/sealing.d.ts
/** What `toEnvelope` takes on a sealed request, response or event. */
interface ToEnvelopeOptions {
  /** Signs the message; the sender's private keys, typically. */
  signer?: Signer | undefined;
  /** Encrypts the signed message to each recipient's encryption key. */
  recipients?: readonly XIDDocument[] | undefined;
  /** The deadline of the sender's own continuation. */
  validUntil?: DateInput | undefined;
}
/** What `fromEnvelope` takes on a sealed request, response or event. */
interface FromEnvelopeOptions {
  /** The private keys of the recipient opening the message. */
  recipient: Decrypter;
  /** The request id the recipient's continuation must answer to. */
  expectedId?: ARID | undefined;
  /** The clock the recipient's continuation is checked against; no check without one. */
  now?: DateInput | undefined;
}
//#endregion
//#region src/sealed-request.d.ts
/** What `SealedRequest.from` takes besides the function. */
interface SealedRequestInput {
  /** The request id. */
  id: ARID;
  /** The sender's document, copied at construction; its encryption key seals the sender's state, its signing key signs. */
  sender: XIDDocument;
  /** The sender's own state, returned in the reply. */
  state?: EnvelopeInput | undefined;
  /** The peer's continuation, as received, handed back. */
  peerContinuation?: Envelope | undefined;
}
/** A request with its sender, state and the peer's continuation. */
export declare class SealedRequest implements ToEnvelope {
  private readonly _request;
  private readonly _sender;
  private readonly _state;
  private readonly _peerContinuation;
  private constructor();
  /**
   * A request for `func` (a function, its id, or a whole expression) with
   * `id`, from `sender`. An id that is not an `ARID`, a sender that is not
   * an `XIDDocument` or a peer continuation that is not an `Envelope` is a
   * `TypeError`.
   */
  static from(func: Function | Expression | FunctionID, { id, sender, state, peerContinuation }: SealedRequestInput): SealedRequest;
  private with;
  /** With a `param` argument; unchanged when `value` is `undefined`. */
  withParameter(param: ParameterID | Parameter, value: EnvelopeInput | undefined): SealedRequest;
  /** With a `'note'`. */
  withNote(note: string): SealedRequest;
  /** With a `'date'`: a `Date` is stored to the millisecond, a `CborDate` exactly; a `Date` without a time is a `TypeError`. */
  withDate(date: DateInput): SealedRequest;
  /** The envelope request. */
  get request(): Request;
  /** The function. */
  get function(): Function;
  /** The expression as an envelope. */
  get expressionEnvelope(): Envelope;
  /** The expression. */
  get body(): Expression;
  /** The request id. */
  get id(): ARID;
  /** The `'note'`, empty when none. */
  get note(): string;
  /** The `'date'` as a JS `Date` (millisecond view); `cborDate` is the exact value. */
  get date(): Date | undefined;
  /** The `'date'` exactly, when any. */
  get cborDate(): CborDate | undefined;
  /** The single `param` argument, or `undefined`; two of them are `Envelope[AmbiguousPredicate]`. */
  parameter(param: ParameterID | Parameter): Envelope | undefined;
  /** The single `param` argument; `Envelope[NonexistentPredicate]` when absent, `Envelope[AmbiguousPredicate]` when repeated. */
  objectForParameter(param: ParameterID | Parameter): Envelope;
  /** Every `param` argument. */
  objectsForParameter(param: ParameterID | Parameter): Envelope[];
  /**
   * The single `param` argument's leaf, decoded by `decoder` (dcbor's
   * `expectText`, `expectInteger`, …, `CborDate.fromTaggedCbor`,
   * `ARID.fromCbor`, or any `(cbor) => T`), as the reference's
   * `extract_object_for_parameter::<T>`: `Envelope[NonexistentPredicate]`
   * when absent, `Envelope[AmbiguousPredicate]` when repeated,
   * `Envelope[NotLeaf]` when the argument is not a leaf, `Envelope[Cbor]`
   * when the decoder rejects it.
   */
  extractObjectForParameter<T>(param: ParameterID | Parameter, decoder: CborDecoder<T>): T;
  /** `extractObjectForParameter`, or `undefined` when the parameter is absent. */
  extractOptionalObjectForParameter<T>(param: ParameterID | Parameter, decoder: CborDecoder<T>): T | undefined;
  /** Every `param` argument's leaf, decoded. */
  extractObjectsForParameter<T>(param: ParameterID | Parameter, decoder: CborDecoder<T>): T[];
  /** With the sender's state (`undefined` clears it). */
  withState(state: EnvelopeInput | undefined): SealedRequest;
  /** With the peer's continuation (`undefined` clears it); not an `Envelope` is a `TypeError`. */
  withPeerContinuation(peerContinuation: Envelope | undefined): SealedRequest;
  /** The sender's document. */
  get sender(): XIDDocument;
  /** The sender's state, when any. */
  get state(): Envelope | undefined;
  /** The peer's continuation, when any. */
  get peerContinuation(): Envelope | undefined;
  /**
   * The request with `'sender'`, the sender's continuation (the state —
   * `null` without one — bound to the request id and `validUntil`,
   * encrypted to the sender) and the peer continuation; signed by
   * `signer` and encrypted to `recipients` when given. With no options:
   * unsigned, unsealed.
   */
  toEnvelope({ signer, recipients, validUntil }?: ToEnvelopeOptions): Envelope;
  /**
   * Decrypts to the recipient, verifies the sender's signature, requires
   * an encrypted sender continuation, opens the recipient's own
   * continuation (`expectedId`, `now`) and parses the request.
   */
  static fromEnvelope(sealed: Envelope, options: FromEnvelopeOptions): SealedRequest;
  /** `SealedRequest(<summary>, state: <flat>, peer_continuation: None|Some)`, the reference's `Display`. */
  toString(): string;
  /** Same request and sender document, identical state and peer continuation (digest and structure), as the reference's `PartialEq`. */
  equals(other: SealedRequest): boolean;
}
//#endregion
//#region src/sealed-response.d.ts
/** What the response constructors take besides the id. */
interface SealedResponseInput {
  /** The sender's document, copied at construction; its encryption key seals the sender's state, its signing key signs. */
  sender: XIDDocument;
  /** The sender's own state, returned in the reply; a response that is not a success carries none. */
  state?: EnvelopeInput | undefined;
  /** The peer's continuation, as received, handed back. */
  peerContinuation?: Envelope | undefined;
}
/** What `ok` gives on a success: the reference's `(ARID, Envelope)` pair. */
interface ResponseOk {
  /** The request id. */
  readonly id: ARID;
  /** The `'result'`. */
  readonly result: Envelope;
}
/** What `err` gives on a failure: the reference's `(Option<ARID>, Envelope)` pair. */
interface ResponseErr {
  /** The request id; `undefined` on an early failure. */
  readonly id: ARID | undefined;
  /** The `'error'`. */
  readonly error: Envelope;
}
/** A response with its sender, state and the peer's continuation. */
export declare class SealedResponse implements ToEnvelope {
  private readonly _response;
  private readonly _sender;
  private readonly _state;
  private readonly _peerContinuation;
  private constructor();
  private static build;
  /** A successful response to request `id`; an id that is not an `ARID` is a `TypeError`. */
  static success(id: ARID, input: SealedResponseInput): SealedResponse;
  /** A failed response to request `id`; `StateOnFailedResponse` with a state. */
  static failure(id: ARID, input: SealedResponseInput): SealedResponse;
  /** A failure before the request id was known; `StateOnFailedResponse` with a state. */
  static earlyFailure(input: SealedResponseInput): SealedResponse;
  private with;
  /**
   * With a `'result'`; `undefined` sets a `null` result, as the reference's
   * `with_optional_result(None)`. `Envelope[General]` on a response that is
   * not a success, where the reference panics.
   */
  withResult(result: EnvelopeInput | undefined): SealedResponse;
  /**
   * With an `'error'`; `undefined` leaves the response unchanged, as the
   * reference's `with_optional_error(None)`. `Envelope[General]` on a
   * success, where the reference panics.
   */
  withError(error: EnvelopeInput | undefined): SealedResponse;
  /** The envelope response. */
  get response(): Response;
  /** Whether the response is a success. */
  get isOk(): boolean;
  /** Whether the response is a failure (early or not). */
  get isErr(): boolean;
  /** The request id and the `'result'` of a success; `undefined` on a failure. */
  get ok(): ResponseOk | undefined;
  /** The request id and the `'error'` of a failure; `undefined` on a success. */
  get err(): ResponseErr | undefined;
  /** The request id; `undefined` on an early failure. */
  get id(): ARID | undefined;
  /** The request id; `Envelope[General]` on an early failure, which has none. */
  expectId(): ARID;
  /** The `'result'`; `Envelope[General]` on a failure. */
  get result(): Envelope;
  /** The `'error'`; `Envelope[General]` on a success. */
  get error(): Envelope;
  /** The `'result'` leaf decoded by `decoder`, as the reference's `extract_result::<T>`. */
  extractResult<T>(decoder: CborDecoder<T>): T;
  /** The `'error'` leaf decoded by `decoder`, as the reference's `extract_error::<T>`. */
  extractError<T>(decoder: CborDecoder<T>): T;
  /** With the sender's state (`undefined` clears it); `StateOnFailedResponse` unless the response is a success. */
  withState(state: EnvelopeInput | undefined): SealedResponse;
  /** With the peer's continuation (`undefined` clears it); not an `Envelope` is a `TypeError`. */
  withPeerContinuation(peerContinuation: Envelope | undefined): SealedResponse;
  /** The sender's document. */
  get sender(): XIDDocument;
  /** The sender's state, when any. */
  get state(): Envelope | undefined;
  /** The peer's continuation, when any. */
  get peerContinuation(): Envelope | undefined;
  /**
   * The response with `'sender'`, the sender's continuation when there is
   * state (with `validUntil`, encrypted to the sender) and the peer
   * continuation; signed by `signer` and encrypted to `recipients`. With
   * no options: unsigned, unsealed.
   */
  toEnvelope({ signer, recipients, validUntil }?: ToEnvelopeOptions): Envelope;
  /**
   * Decrypts to the recipient, verifies the sender's signature, checks
   * the sender continuation (when present it must be encrypted), opens
   * the recipient's own continuation and parses the response; a `null`
   * state reads as no state.
   */
  static fromEnvelope(sealed: Envelope, options: FromEnvelopeOptions): SealedResponse;
  /** `SealedResponse(<summary>, state: <flat>, peer_continuation: None|Some)`, the reference's `Display`. */
  toString(): string;
  /** Same response and sender document, identical state and peer continuation (digest and structure), as the reference's `PartialEq`. */
  equals(other: SealedResponse): boolean;
}
//#endregion
//#region src/sealed-event.d.ts
/** What `SealedEvent.from` takes besides the content. */
interface SealedEventInput {
  /** The event id. */
  id: ARID;
  /** The sender's document, copied at construction; its encryption key seals the sender's state, its signing key signs. */
  sender: XIDDocument;
  /** The sender's own state, returned in a reply. */
  state?: EnvelopeInput | undefined;
  /** The peer's continuation, as received, handed back. */
  peerContinuation?: Envelope | undefined;
}
/** What `SealedEvent.fromEnvelope` takes to read the content as `T` rather than as text. */
interface FromEnvelopeEventOptions<T extends EnvelopeInput> extends FromEnvelopeOptions {
  /** Reads the `'content'` envelope; the reference's `T: TryFrom<Envelope>`. */
  content: (envelope: Envelope) => T;
}
/** An event with its sender, state and the peer's continuation. */
export declare class SealedEvent<T extends EnvelopeInput> implements ToEnvelope {
  private readonly _event;
  private readonly _sender;
  private readonly _state;
  private readonly _peerContinuation;
  private constructor();
  /**
   * An event with `content` and `id`, from `sender`. An id that is not an
   * `ARID`, a sender that is not an `XIDDocument` or a peer continuation
   * that is not an `Envelope` is a `TypeError`.
   */
  static from<T extends EnvelopeInput>(content: T, { id, sender, state, peerContinuation }: SealedEventInput): SealedEvent<T>;
  private with;
  /** With a `'note'`. */
  withNote(note: string): SealedEvent<T>;
  /** With a `'date'`: a `Date` is stored to the millisecond, a `CborDate` exactly; a `Date` without a time is a `TypeError`. */
  withDate(date: DateInput): SealedEvent<T>;
  /** The envelope event. */
  get event(): Event<T>;
  /** The content. */
  get content(): T;
  /** The event id. */
  get id(): ARID;
  /** The `'note'`, empty when none. */
  get note(): string;
  /** The `'date'` as a JS `Date` (millisecond view); `cborDate` is the exact value. */
  get date(): Date | undefined;
  /** The `'date'` exactly, when any. */
  get cborDate(): CborDate | undefined;
  /** With the sender's state (`undefined` clears it). */
  withState(state: EnvelopeInput | undefined): SealedEvent<T>;
  /** With the peer's continuation (`undefined` clears it); not an `Envelope` is a `TypeError`. */
  withPeerContinuation(peerContinuation: Envelope | undefined): SealedEvent<T>;
  /** The sender's document. */
  get sender(): XIDDocument;
  /** The sender's state, when any. */
  get state(): Envelope | undefined;
  /** The peer's continuation, when any. */
  get peerContinuation(): Envelope | undefined;
  /**
   * The event with `'sender'`, the sender's continuation when there is
   * state or a `validUntil` (a `null` state then), and the peer
   * continuation; signed by `signer` and encrypted to `recipients`. With
   * no options: unsigned, unsealed.
   */
  toEnvelope({ signer, recipients, validUntil }?: ToEnvelopeOptions): Envelope;
  /**
   * Decrypts to the recipient, verifies the sender's signature, checks the
   * sender continuation (when present it must be encrypted), opens the
   * recipient's own continuation and parses the event, reading the
   * content as text, or with `content` (`Envelope[General]` when it fails).
   */
  static fromEnvelope(sealed: Envelope, options: FromEnvelopeOptions): SealedEvent<string>;
  /** `fromEnvelope`, reading the content with `content` as `T`. */
  static fromEnvelope<T extends EnvelopeInput>(sealed: Envelope, options: FromEnvelopeEventOptions<T>): SealedEvent<T>;
  /** `SealedEvent(<summary>, state: <flat>, peer_continuation: None|Some)`; the reference's `Display` prints `SealedRequest(` here. */
  toString(): string;
  /** Same event and sender document, identical state and peer continuation (digest and structure), as the reference's `PartialEq`. */
  equals(other: SealedEvent<T>): boolean;
}
//#endregion
export type { ContinuationCheck, ContinuationFromEnvelopeOptions, ContinuationInput, DateInput, FromEnvelopeEventOptions, FromEnvelopeOptions, GstpErrorCode, GstpErrorDetails, GstpErrorDetailsByCode, GstpErrorDetailsFor, GstpErrorTyped, ResponseErr, ResponseOk, SealedEventInput, SealedRequestInput, SealedResponseInput, ToEnvelopeOptions };
//# sourceMappingURL=index.d.mts.map