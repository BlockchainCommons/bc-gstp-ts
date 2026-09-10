import { ARID, Encrypter, PrivateKeys, Signer } from "@blockchaincommons/components";
import { Envelope, EnvelopeEncodableValue, Event, Expression, Function, ParameterID, Request } from "@blockchaincommons/envelope";
import { XIDDocument } from "@blockchaincommons/xid";
//#region src/error.d.ts
/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 *
 * GSTP Error Types
 *
 * Error types returned when operating on GSTP messages.
 * Ported from gstp-rust/src/error.rs
 */
/**
 * Error codes for GSTP operations.
 */
declare enum GstpErrorCode {
  /** Sender must have an encryption key. */
  SENDER_MISSING_ENCRYPTION_KEY = "SENDER_MISSING_ENCRYPTION_KEY",
  /** Recipient must have an encryption key. */
  RECIPIENT_MISSING_ENCRYPTION_KEY = "RECIPIENT_MISSING_ENCRYPTION_KEY",
  /** Sender must have a verification key. */
  SENDER_MISSING_VERIFICATION_KEY = "SENDER_MISSING_VERIFICATION_KEY",
  /** Continuation has expired. */
  CONTINUATION_EXPIRED = "CONTINUATION_EXPIRED",
  /** Continuation ID is invalid. */
  CONTINUATION_ID_INVALID = "CONTINUATION_ID_INVALID",
  /** Peer continuation must be encrypted. */
  PEER_CONTINUATION_NOT_ENCRYPTED = "PEER_CONTINUATION_NOT_ENCRYPTED",
  /** Requests must contain a peer continuation. */
  MISSING_PEER_CONTINUATION = "MISSING_PEER_CONTINUATION",
  /** Error from envelope operations. */
  ENVELOPE = "ENVELOPE",
  /** Error from XID operations. */
  XID = "XID"
}
/**
 * Error class for GSTP operations.
 *
 * Provides specific error types that can occur during GSTP message
 * creation, sealing, and parsing operations.
 */
declare class GstpError extends Error {
  readonly code: GstpErrorCode;
  readonly cause?: Error;
  constructor(code: GstpErrorCode, message: string, cause?: Error);
  /**
   * Returned when the sender is missing an encryption key.
   */
  static senderMissingEncryptionKey(): GstpError;
  /**
   * Returned when the recipient is missing an encryption key.
   */
  static recipientMissingEncryptionKey(): GstpError;
  /**
   * Returned when the sender is missing a verification key.
   */
  static senderMissingVerificationKey(): GstpError;
  /**
   * Returned when the continuation has expired.
   */
  static continuationExpired(): GstpError;
  /**
   * Returned when the continuation ID is invalid.
   */
  static continuationIdInvalid(): GstpError;
  /**
   * Returned when the peer continuation is not encrypted.
   */
  static peerContinuationNotEncrypted(): GstpError;
  /**
   * Returned when a request is missing the peer continuation.
   */
  static missingPeerContinuation(): GstpError;
  /**
   * Envelope error wrapper.
   */
  static envelope(cause?: Error): GstpError;
  /**
   * XID error wrapper.
   */
  static xid(cause?: Error): GstpError;
}
//#endregion
//#region src/continuation.d.ts
/**
 * Represents an encrypted state continuation.
 *
 * Continuations provide a way to maintain state across message exchanges
 * without requiring local storage. The state is encrypted and embedded
 * directly in the message envelope.
 *
 * @example
 * ```typescript
 * import { Continuation } from '@blockchaincommons/gstp';
 *
 * // Create a continuation with state
 * const continuation = new Continuation("session state data")
 *   .withValidId(requestId)
 *   .withValidUntil(new Date(Date.now() + 60000)); // Valid for 60 seconds
 *
 * // Convert to envelope (optionally encrypted)
 * const envelope = continuation.toEnvelope(recipientPublicKey);
 * ```
 */
declare class Continuation {
  private readonly _state;
  private readonly _validId;
  private readonly _validUntil;
  /**
   * Creates a new Continuation with the given state.
   *
   * The state can be any value that implements EnvelopeEncodable.
   *
   * @param state - The state to embed in the continuation
   * @param validId - Optional ID for validation
   * @param validUntil - Optional expiration date
   */
  constructor(state: EnvelopeEncodableValue, validId?: ARID, validUntil?: Date);
  /**
   * Creates a new continuation with a specific valid ID.
   *
   * @param validId - The ID to use for validation
   * @returns A new Continuation instance with the valid ID set
   */
  withValidId(validId: ARID): Continuation;
  /**
   * Creates a new continuation with an optional valid ID.
   *
   * @param validId - The ID to use for validation, or undefined
   * @returns A new Continuation instance with the valid ID set
   */
  withOptionalValidId(validId: ARID | undefined): Continuation;
  /**
   * Creates a new continuation with a specific valid until date.
   *
   * @param validUntil - The date until which the continuation is valid
   * @returns A new Continuation instance with the valid until date set
   */
  withValidUntil(validUntil: Date): Continuation;
  /**
   * Creates a new continuation with an optional valid until date.
   *
   * @param validUntil - The date until which the continuation is valid, or undefined
   * @returns A new Continuation instance with the valid until date set
   */
  withOptionalValidUntil(validUntil: Date | undefined): Continuation;
  /**
   * Creates a new continuation with a validity duration from now.
   *
   * @param durationMs - The duration in milliseconds for which the continuation is valid
   * @returns A new Continuation instance with the valid until date set
   */
  withValidDuration(durationMs: number): Continuation;
  /**
   * Returns the state envelope of the continuation.
   */
  state(): Envelope;
  /**
   * Returns the valid ID of the continuation, if set.
   */
  id(): ARID | undefined;
  /**
   * Returns the valid until date of the continuation, if set.
   */
  validUntil(): Date | undefined;
  /**
   * Checks if the continuation is valid at the given time.
   *
   * Mirrors Rust `is_valid_date(now)`: at the exact `valid_until`
   * instant, the continuation is **expired** (returns `false`). The
   * earlier port used `<=` here, which differed from Rust by one
   * millisecond at the boundary.
   *
   * @param now - The time to check against, or undefined to skip time validation
   * @returns true if the continuation is valid at the given time
   */
  isValidDate(now?: Date): boolean;
  /**
   * Checks if the continuation has the expected ID.
   *
   * If no valid_id is set, always returns true.
   * If no ID is provided for checking, always returns true.
   *
   * @param id - The ID to check against, or undefined to skip ID validation
   * @returns true if the continuation has the expected ID
   */
  isValidId(id?: ARID): boolean;
  /**
   * Checks if the continuation is valid (both date and ID).
   *
   * @param now - The time to check against, or undefined to skip time validation
   * @param id - The ID to check against, or undefined to skip ID validation
   * @returns true if the continuation is valid
   */
  isValid(now?: Date, id?: ARID): boolean;
  /**
   * Converts the continuation to an envelope.
   *
   * Mirrors Rust `Continuation::to_envelope`:
   *
   * ```rust
   * self.state.wrap()
   *     .add_optional_assertion(ID, self.valid_id)
   *     .add_optional_assertion(VALID_UNTIL, self.valid_until)
   * ```
   *
   * The state is wrapped first; the optional assertions then live on
   * the wrap node. `valid_until` is encoded as a CBOR-tagged Date
   * (tag 1) — never as a plain ISO 8601 string.
   *
   * @param recipient - Optional recipient to encrypt the envelope to
   * @returns The continuation as an envelope
   */
  toEnvelope(recipient?: Encrypter): Envelope;
  /**
   * Parses a continuation from an envelope.
   *
   * Mirrors Rust `Continuation::try_from_envelope`:
   *
   * ```rust
   * state: envelope.try_unwrap()?,                                     // unwrap
   * valid_id: envelope.extract_optional_object_for_predicate(ID)?,
   * valid_until: envelope.extract_optional_object_for_predicate(VALID_UNTIL)?,
   * ```
   *
   * @param encryptedEnvelope - The envelope to parse
   * @param expectedId - Optional ID to validate against
   * @param now - Optional time to validate against
   * @param recipient - Optional private keys to decrypt with
   * @returns The parsed continuation
   * @throws GstpError if validation fails or parsing fails
   */
  static tryFromEnvelope(encryptedEnvelope: Envelope, expectedId?: ARID, now?: Date, recipient?: PrivateKeys): Continuation;
  /**
   * Checks equality with another continuation.
   *
   * Two continuations are equal if they have the same state, ID, and valid_until.
   *
   * @param other - The continuation to compare with
   * @returns true if the continuations are equal
   */
  equals(other: Continuation): boolean;
  /**
   * Returns a string representation of the continuation.
   */
  toString(): string;
}
//#endregion
//#region src/sealed-request.d.ts
/**
 * Interface that defines the behavior of a sealed request.
 *
 * Extends RequestBehavior with additional methods for managing
 * sender information and state continuations.
 */
interface SealedRequestBehavior {
  /**
   * Adds state to the request that the receiver must return in the response.
   */
  withState(state: EnvelopeEncodableValue): SealedRequest;
  /**
   * Adds optional state to the request.
   */
  withOptionalState(state: EnvelopeEncodableValue | undefined): SealedRequest;
  /**
   * Adds a continuation previously received from the recipient.
   */
  withPeerContinuation(peerContinuation: Envelope): SealedRequest;
  /**
   * Adds an optional continuation previously received from the recipient.
   */
  withOptionalPeerContinuation(peerContinuation: Envelope | undefined): SealedRequest;
  /**
   * Returns the underlying request.
   */
  request(): Request;
  /**
   * Returns the sender of the request.
   */
  sender(): XIDDocument;
  /**
   * Returns the state to be sent to the recipient.
   */
  state(): Envelope | undefined;
  /**
   * Returns the continuation received from the recipient.
   */
  peerContinuation(): Envelope | undefined;
}
/**
 * A sealed request that combines a Request with sender information and
 * state continuations for secure communication.
 *
 * @example
 * ```typescript
 * import { SealedRequest, ARID } from '@blockchaincommons/gstp';
 * import { XIDDocument } from '@blockchaincommons/xid';
 *
 * // Create sender XID document
 * const sender = XIDDocument.new();
 * const requestId = ARID.new();
 *
 * // Create a sealed request
 * const request = SealedRequest.new("getBalance", requestId, sender)
 *   .withParameter("account", "alice")
 *   .withState("session-state-data")
 *   .withNote("Balance check");
 *
 * // Convert to sealed envelope
 * const envelope = request.toEnvelope(
 *   new Date(Date.now() + 60000), // Valid for 60 seconds
 *   senderPrivateKey,
 *   recipientXIDDocument
 * );
 * ```
 */
declare class SealedRequest implements SealedRequestBehavior {
  private _request;
  private readonly _sender;
  private _state;
  private _peerContinuation;
  private constructor();
  /**
   * Creates a new sealed request with the given function, ID, and sender.
   *
   * @param func - The function to call (string name or Function object)
   * @param id - The request ID
   * @param sender - The sender's XID document
   */
  static new(func: string | number | Function, id: ARID, sender: XIDDocument): SealedRequest;
  /**
   * Creates a new sealed request with an expression body.
   *
   * @param body - The expression body
   * @param id - The request ID
   * @param sender - The sender's XID document
   */
  static newWithBody(body: Expression, id: ARID, sender: XIDDocument): SealedRequest;
  /**
   * Adds a parameter to the request.
   */
  withParameter(parameter: ParameterID, value: EnvelopeEncodableValue): SealedRequest;
  /**
   * Adds an optional parameter to the request.
   */
  withOptionalParameter(parameter: ParameterID, value: EnvelopeEncodableValue | undefined): SealedRequest;
  /**
   * Returns the function of the request.
   */
  function(): Function;
  /**
   * Returns the expression envelope of the request.
   */
  expressionEnvelope(): Envelope;
  /**
   * Returns the object for a parameter.
   */
  objectForParameter(param: ParameterID): Envelope | undefined;
  /**
   * Returns all objects for a parameter.
   *
   * Mirrors Rust `SealedRequest::objects_for_parameter` which delegates
   * to `Expression::objects_for_parameter`. GSTP requests can carry
   * multiple parameters with the same ID — e.g. a DKG invite has
   * one `participant` per group member — and a decoder must see
   * every one of them.
   */
  objectsForParameter(param: ParameterID): Envelope[];
  /**
   * Extracts an object for a parameter as a specific type.
   *
   * Mirrors Rust `SealedRequest::extract_object_for_parameter` — Rust
   * uses a `T: TryFrom<CBOR>` constraint and dispatches to whatever
   * `From<CBOR> for T` impl is in scope (e.g. tag-1 CBOR decodes to
   * `chrono::DateTime`, tag-40012 to `ARID`, etc.). TS lacks that
   * trait dispatch, so we recognise the most common tagged types
   * (`Date` via tag 1, `ARID` via tag 40012) plus the primitive
   * fall-through. Callers needing other typed extraction should use
   * `objectForParameter()` directly and decode the envelope themselves.
   */
  extractObjectForParameter<T>(param: ParameterID): T;
  /**
   * Extracts an optional object for a parameter.
   */
  extractOptionalObjectForParameter<T>(param: ParameterID): T | undefined;
  /**
   * Extracts all objects for a parameter as a specific type.
   */
  extractObjectsForParameter<T>(param: ParameterID): T[];
  /**
   * Adds a note to the request.
   */
  withNote(note: string): SealedRequest;
  /**
   * Adds a date to the request.
   */
  withDate(date: Date): SealedRequest;
  /**
   * Returns the body of the request.
   */
  body(): Expression;
  /**
   * Returns the ID of the request.
   */
  id(): ARID;
  /**
   * Returns the note of the request.
   */
  note(): string;
  /**
   * Returns the date of the request.
   */
  date(): Date | undefined;
  /**
   * Adds state to the request that the receiver must return in the response.
   */
  withState(state: EnvelopeEncodableValue): SealedRequest;
  /**
   * Adds optional state to the request.
   */
  withOptionalState(state: EnvelopeEncodableValue | undefined): SealedRequest;
  /**
   * Adds a continuation previously received from the recipient.
   */
  withPeerContinuation(peerContinuation: Envelope): SealedRequest;
  /**
   * Adds an optional continuation previously received from the recipient.
   */
  withOptionalPeerContinuation(peerContinuation: Envelope | undefined): SealedRequest;
  /**
   * Returns the underlying request.
   */
  request(): Request;
  /**
   * Returns the sender of the request.
   */
  sender(): XIDDocument;
  /**
   * Returns the state to be sent to the recipient.
   */
  state(): Envelope | undefined;
  /**
   * Returns the continuation received from the recipient.
   */
  peerContinuation(): Envelope | undefined;
  /**
   * Converts the sealed request to a Request.
   */
  toRequest(): Request;
  /**
   * Converts the sealed request to an Expression.
   */
  toExpression(): Expression;
  /**
   * Creates an envelope that can be decrypted by zero or one recipient.
   *
   * @param validUntil - Optional expiration date for the continuation
   * @param signer - Optional signer for the envelope
   * @param recipient - Optional recipient XID document for encryption
   * @returns The sealed request as an envelope
   */
  toEnvelope(validUntil?: Date, signer?: Signer, recipient?: XIDDocument): Envelope;
  /**
   * Creates an envelope that can be decrypted by zero or more recipients.
   *
   * @param validUntil - Optional expiration date for the continuation
   * @param signer - Optional signer for the envelope
   * @param recipients - Array of recipient XID documents for encryption
   * @returns The sealed request as an envelope
   */
  toEnvelopeForRecipients(validUntil?: Date, signer?: Signer, recipients?: XIDDocument[]): Envelope;
  /**
   * Parses a sealed request from an encrypted envelope.
   *
   * @param encryptedEnvelope - The encrypted envelope to parse
   * @param expectedId - Optional expected request ID for validation
   * @param now - Optional current time for continuation validation
   * @param recipient - The recipient's private keys for decryption
   * @returns The parsed sealed request
   */
  static tryFromEnvelope(encryptedEnvelope: Envelope, expectedId: ARID | undefined, now: Date | undefined, recipient: PrivateKeys): SealedRequest;
  /**
   * Returns a string representation of the sealed request.
   */
  toString(): string;
  /**
   * Checks equality with another sealed request.
   */
  equals(other: SealedRequest): boolean;
}
//#endregion
//#region src/sealed-response.d.ts
/**
 * Interface that defines the behavior of a sealed response.
 *
 * Extends ResponseBehavior with additional methods for managing
 * sender information and state continuations.
 */
interface SealedResponseBehavior {
  /**
   * Adds state to the response that the peer may return at some future time.
   */
  withState(state: EnvelopeEncodableValue): SealedResponse;
  /**
   * Adds optional state to the response.
   */
  withOptionalState(state: EnvelopeEncodableValue | undefined): SealedResponse;
  /**
   * Adds a continuation previously received from the recipient.
   */
  withPeerContinuation(peerContinuation: Envelope | undefined): SealedResponse;
  /**
   * Returns the sender of the response.
   */
  sender(): XIDDocument;
  /**
   * Returns the state to be sent to the peer.
   */
  state(): Envelope | undefined;
  /**
   * Returns the continuation received from the peer.
   */
  peerContinuation(): Envelope | undefined;
}
/**
 * A sealed response that combines a Response with sender information and
 * state continuations for secure communication.
 *
 * @example
 * ```typescript
 * import { SealedResponse, ARID } from '@blockchaincommons/gstp';
 * import { XIDDocument } from '@blockchaincommons/xid';
 *
 * // Create sender XID document
 * const sender = XIDDocument.new();
 * const requestId = ARID.new();
 *
 * // Create a successful sealed response
 * const response = SealedResponse.newSuccess(requestId, sender)
 *   .withResult("Operation completed")
 *   .withState("next-page-state");
 *
 * // Convert to sealed envelope
 * const envelope = response.toEnvelope(
 *   new Date(Date.now() + 60000), // Valid for 60 seconds
 *   senderPrivateKey,
 *   recipientXIDDocument
 * );
 * ```
 */
declare class SealedResponse implements SealedResponseBehavior {
  private _response;
  private readonly _sender;
  private _state;
  private _peerContinuation;
  private constructor();
  /**
   * Creates a new successful sealed response.
   *
   * @param id - The request ID this response is for
   * @param sender - The sender's XID document
   */
  static newSuccess(id: ARID, sender: XIDDocument): SealedResponse;
  /**
   * Creates a new failure sealed response.
   *
   * @param id - The request ID this response is for
   * @param sender - The sender's XID document
   */
  static newFailure(id: ARID, sender: XIDDocument): SealedResponse;
  /**
   * Creates a new early failure sealed response.
   *
   * An early failure takes place before the message has been decrypted,
   * and therefore the ID and sender public key are not known.
   *
   * @param sender - The sender's XID document
   */
  static newEarlyFailure(sender: XIDDocument): SealedResponse;
  /**
   * Adds state to the response that the peer may return at some future time.
   *
   * @throws Error if called on a failed response
   */
  withState(state: EnvelopeEncodableValue): SealedResponse;
  /**
   * Adds optional state to the response.
   */
  withOptionalState(state: EnvelopeEncodableValue | undefined): SealedResponse;
  /**
   * Adds a continuation previously received from the recipient.
   */
  withPeerContinuation(peerContinuation: Envelope | undefined): SealedResponse;
  /**
   * Returns the sender of the response.
   */
  sender(): XIDDocument;
  /**
   * Returns the state to be sent to the peer.
   */
  state(): Envelope | undefined;
  /**
   * Returns the continuation received from the peer.
   */
  peerContinuation(): Envelope | undefined;
  /**
   * Sets the result value for a successful response.
   */
  withResult(result: EnvelopeEncodableValue): SealedResponse;
  /**
   * Sets an optional result value for a successful response.
   * If the result is undefined, the value of the response will be the null envelope.
   */
  withOptionalResult(result: EnvelopeEncodableValue | undefined): SealedResponse;
  /**
   * Sets the error value for a failure response.
   */
  withError(error: EnvelopeEncodableValue): SealedResponse;
  /**
   * Sets an optional error value for a failure response.
   * If the error is undefined, the value of the response will be the unknown value.
   */
  withOptionalError(error: EnvelopeEncodableValue | undefined): SealedResponse;
  /**
   * Returns true if this is a successful response.
   */
  isOk(): boolean;
  /**
   * Returns true if this is a failure response.
   */
  isErr(): boolean;
  /**
   * Returns the ID of the request this response is for, if known.
   */
  id(): ARID | undefined;
  /**
   * Returns the ID of the request this response is for.
   * @throws Error if the ID is not known
   */
  expectId(): ARID;
  /**
   * Returns the result envelope if this is a successful response.
   * @throws Error if this is a failure response
   */
  result(): Envelope;
  /**
   * Extracts the result as a specific type.
   */
  extractResult<T>(decoder: (cbor: unknown) => T): T;
  /**
   * Returns the error envelope if this is a failure response.
   * @throws Error if this is a successful response
   */
  error(): Envelope;
  /**
   * Extracts the error as a specific type.
   */
  extractError<T>(decoder: (cbor: unknown) => T): T;
  /**
   * Creates an envelope that can be decrypted by zero or one recipient.
   *
   * @param validUntil - Optional expiration date for the continuation
   * @param signer - Optional signer for the envelope
   * @param recipient - Optional recipient XID document for encryption
   * @returns The sealed response as an envelope
   */
  toEnvelope(validUntil?: Date, signer?: Signer, recipient?: XIDDocument): Envelope;
  /**
   * Creates an envelope that can be decrypted by zero or more recipients.
   *
   * @param validUntil - Optional expiration date for the continuation
   * @param signer - Optional signer for the envelope
   * @param recipients - Array of recipient XID documents for encryption
   * @returns The sealed response as an envelope
   */
  toEnvelopeForRecipients(validUntil?: Date, signer?: Signer, recipients?: XIDDocument[]): Envelope;
  /**
   * Parses a sealed response from an encrypted envelope.
   *
   * @param encryptedEnvelope - The encrypted envelope to parse
   * @param expectedId - Optional expected request ID for validation
   * @param now - Optional current time for continuation validation
   * @param recipientPrivateKey - The recipient's private keys for decryption
   * @returns The parsed sealed response
   */
  static tryFromEncryptedEnvelope(encryptedEnvelope: Envelope, expectedId: ARID | undefined, now: Date | undefined, recipientPrivateKey: PrivateKeys): SealedResponse;
  /**
   * Returns a string representation of the sealed response.
   */
  toString(): string;
  /**
   * Checks equality with another sealed response.
   */
  equals(other: SealedResponse): boolean;
}
//#endregion
//#region src/sealed-event.d.ts
/**
 * Interface that defines the behavior of a sealed event.
 *
 * Extends EventBehavior with additional methods for managing
 * sender information and state continuations.
 */
interface SealedEventBehavior<T extends EnvelopeEncodableValue> {
  /**
   * Adds state to the event that the receiver must return in the response.
   */
  withState(state: EnvelopeEncodableValue): SealedEvent<T>;
  /**
   * Adds optional state to the event.
   */
  withOptionalState(state: EnvelopeEncodableValue | undefined): SealedEvent<T>;
  /**
   * Adds a continuation previously received from the recipient.
   */
  withPeerContinuation(peerContinuation: Envelope): SealedEvent<T>;
  /**
   * Adds an optional continuation previously received from the recipient.
   */
  withOptionalPeerContinuation(peerContinuation: Envelope | undefined): SealedEvent<T>;
  /**
   * Returns the underlying event.
   */
  event(): Event<T>;
  /**
   * Returns the sender of the event.
   */
  sender(): XIDDocument;
  /**
   * Returns the state to be sent to the recipient.
   */
  state(): Envelope | undefined;
  /**
   * Returns the continuation received from the recipient.
   */
  peerContinuation(): Envelope | undefined;
}
/**
 * A sealed event that combines an Event with sender information and
 * state continuations for secure communication.
 *
 * @typeParam T - The type of content this event carries
 *
 * @example
 * ```typescript
 * import { SealedEvent, ARID } from '@blockchaincommons/gstp';
 * import { XIDDocument } from '@blockchaincommons/xid';
 *
 * // Create sender XID document
 * const sender = XIDDocument.new();
 * const eventId = ARID.new();
 *
 * // Create a sealed event
 * const event = SealedEvent.new("System notification", eventId, sender)
 *   .withNote("Status update")
 *   .withDate(new Date());
 *
 * // Convert to sealed envelope
 * const envelope = event.toEnvelope(
 *   new Date(Date.now() + 60000), // Valid for 60 seconds
 *   senderPrivateKey,
 *   recipientXIDDocument
 * );
 * ```
 */
declare class SealedEvent<T extends EnvelopeEncodableValue> implements SealedEventBehavior<T> {
  private _event;
  private readonly _sender;
  private _state;
  private _peerContinuation;
  private constructor();
  /**
   * Creates a new sealed event with the given content, ID, and sender.
   *
   * @param content - The content of the event
   * @param id - The event ID
   * @param sender - The sender's XID document
   */
  static new<T extends EnvelopeEncodableValue>(content: T, id: ARID, sender: XIDDocument): SealedEvent<T>;
  /**
   * Adds a note to the event.
   */
  withNote(note: string): SealedEvent<T>;
  /**
   * Adds a date to the event.
   */
  withDate(date: Date): SealedEvent<T>;
  /**
   * Returns the content of the event.
   */
  content(): T;
  /**
   * Returns the ID of the event.
   */
  id(): ARID;
  /**
   * Returns the note of the event.
   */
  note(): string;
  /**
   * Returns the date of the event.
   */
  date(): Date | undefined;
  /**
   * Adds state to the event that the receiver must return in the response.
   */
  withState(state: EnvelopeEncodableValue): SealedEvent<T>;
  /**
   * Adds optional state to the event.
   */
  withOptionalState(state: EnvelopeEncodableValue | undefined): SealedEvent<T>;
  /**
   * Adds a continuation previously received from the recipient.
   */
  withPeerContinuation(peerContinuation: Envelope): SealedEvent<T>;
  /**
   * Adds an optional continuation previously received from the recipient.
   */
  withOptionalPeerContinuation(peerContinuation: Envelope | undefined): SealedEvent<T>;
  /**
   * Returns the underlying event.
   */
  event(): Event<T>;
  /**
   * Returns the sender of the event.
   */
  sender(): XIDDocument;
  /**
   * Returns the state to be sent to the recipient.
   */
  state(): Envelope | undefined;
  /**
   * Returns the continuation received from the recipient.
   */
  peerContinuation(): Envelope | undefined;
  /**
   * Converts the sealed event to an Event.
   */
  toEvent(): Event<T>;
  /**
   * Creates an envelope that can be decrypted by zero or one recipient.
   *
   * @param validUntil - Optional expiration date for the continuation
   * @param signer - Optional signer for the envelope
   * @param recipient - Optional recipient XID document for encryption
   * @returns The sealed event as an envelope
   */
  toEnvelope(validUntil?: Date, signer?: Signer, recipient?: XIDDocument): Envelope;
  /**
   * Creates an envelope that can be decrypted by zero or more recipients.
   *
   * @param validUntil - Optional expiration date for the continuation
   * @param signer - Optional signer for the envelope
   * @param recipients - Array of recipient XID documents for encryption
   * @returns The sealed event as an envelope
   */
  toEnvelopeForRecipients(validUntil?: Date, signer?: Signer, recipients?: XIDDocument[]): Envelope;
  /**
   * Parses a sealed event from an encrypted envelope.
   *
   * @param encryptedEnvelope - The encrypted envelope to parse
   * @param expectedId - Optional expected event ID for validation
   * @param now - Optional current time for continuation validation
   * @param recipientPrivateKey - The recipient's private keys for decryption
   * @param contentExtractor - Function to extract content from envelope
   * @returns The parsed sealed event
   */
  static tryFromEnvelope<T extends EnvelopeEncodableValue>(encryptedEnvelope: Envelope, expectedId: ARID | undefined, now: Date | undefined, recipientPrivateKey: PrivateKeys, contentExtractor?: (env: Envelope) => T): SealedEvent<T>;
  /**
   * Returns a string representation of the sealed event.
   */
  toString(): string;
  /**
   * Checks equality with another sealed event.
   */
  equals(other: SealedEvent<T>): boolean;
}
declare namespace prelude_d_exports {
  export { Continuation, GstpError, GstpErrorCode, SealedEvent, SealedEventBehavior, SealedRequest, SealedRequestBehavior, SealedResponse, SealedResponseBehavior };
}
//#endregion
//#region src/index.d.ts
declare const VERSION = "0.13.0";
//#endregion
export { Continuation, GstpError, GstpErrorCode, SealedEvent, type SealedEventBehavior, SealedRequest, type SealedRequestBehavior, SealedResponse, type SealedResponseBehavior, VERSION, prelude_d_exports as prelude };
//# sourceMappingURL=index.d.mts.map