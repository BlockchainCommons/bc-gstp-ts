/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 * A response sealed by its sender: the envelope `Response` plus the
 * sender's XID document, optional state (carried as a continuation only
 * the sender can reopen; a failed response carries none) and the peer's
 * continuation handed back. Every `with…` returns a new response; the one
 * it was called on is unchanged.
 */

// Ported from gstp-rust/src/sealed_response.rs

import type { ARID } from "@blockchaincommons/components";
import {
  type CborDecoder,
  Envelope,
  type EnvelopeInput,
  type ToEnvelope,
} from "@blockchaincommons/envelope";
import { Response } from "@blockchaincommons/envelope/expression";
import { format } from "@blockchaincommons/envelope/format";
import { type XIDDocument } from "@blockchaincommons/xid";

import { Continuation } from "./continuation";
import { GstpError, guarded } from "./error";
import { expectArid, expectDocument, expectEnvelope, expectInstance } from "./guards";
import {
  type OpenOptions,
  type SealOptions,
  envelopesEqual,
  openBody,
  sealBody,
  senderEncryptionKey,
} from "./sealing";

/** What the response constructors take besides the id. */
export interface SealedResponseInput {
  /** The sender's document; its encryption key seals the sender's state, its signing key signs. */
  sender: XIDDocument;
  /** The sender's own state, returned in the reply; a response that is not a success carries none. */
  state?: EnvelopeInput | undefined;
  /** The peer's continuation, as received, handed back. */
  peerContinuation?: Envelope | undefined;
}

/** A response with its sender, state and the peer's continuation. */
export class SealedResponse implements ToEnvelope {
  private readonly _response: Response;
  private readonly _sender: XIDDocument;
  private readonly _state: Envelope | undefined;
  private readonly _peerContinuation: Envelope | undefined;

  private constructor(
    response: Response,
    sender: XIDDocument,
    state: Envelope | undefined,
    peerContinuation: Envelope | undefined,
  ) {
    this._response = response;
    this._sender = sender;
    this._state = state;
    this._peerContinuation = peerContinuation;
  }

  private static build(
    response: Response,
    { sender, state, peerContinuation }: SealedResponseInput,
  ): SealedResponse {
    expectDocument(sender, "sender");
    if (peerContinuation !== undefined) expectEnvelope(peerContinuation, "peerContinuation");
    return new SealedResponse(response, sender, undefined, peerContinuation).withState(state);
  }

  /** A successful response to request `id`; an id that is not an `ARID` is a `TypeError`. */
  static success(id: ARID, input: SealedResponseInput): SealedResponse {
    return SealedResponse.build(Response.success(expectArid(id, "id")), input);
  }

  /** A failed response to request `id`; `StateOnFailedResponse` with a state. */
  static failure(id: ARID, input: SealedResponseInput): SealedResponse {
    return SealedResponse.build(Response.failure(expectArid(id, "id")), input);
  }

  /** A failure before the request id was known; `StateOnFailedResponse` with a state. */
  static earlyFailure(input: SealedResponseInput): SealedResponse {
    return SealedResponse.build(Response.earlyFailure(), input);
  }

  private with(response: Response): SealedResponse {
    return new SealedResponse(response, this._sender, this._state, this._peerContinuation);
  }

  // Body ----------------------------------------------------------------------

  /** With a `'result'` (`undefined` leaves the response unchanged). */
  withResult(result: EnvelopeInput | undefined): SealedResponse {
    return this.with(this._response.withOptionalResult(result));
  }

  /** With an `'error'` (`undefined` leaves the response unchanged). */
  withError(error: EnvelopeInput | undefined): SealedResponse {
    return this.with(this._response.withOptionalError(error));
  }

  /** The envelope response. */
  get response(): Response {
    return this._response;
  }

  /** Whether the response is a success. */
  get isOk(): boolean {
    return this._response.isOk();
  }

  /** Whether the response is a failure (early or not). */
  get isErr(): boolean {
    return this._response.isErr();
  }

  /** The request id; `undefined` on an early failure. */
  get id(): ARID | undefined {
    return this._response.id;
  }

  /** The request id; `Envelope[General]` on an early failure, which has none. */
  expectId(): ARID {
    return guarded(() => this._response.expectId());
  }

  /** The `'result'`; `Envelope[General]` on a failure. */
  get result(): Envelope {
    return guarded(() => this._response.result);
  }

  /** The `'error'`; `Envelope[General]` on a success. */
  get error(): Envelope {
    return guarded(() => this._response.error);
  }

  /** The `'result'` leaf decoded by `decoder`, as the reference's `extract_result::<T>`. */
  extractResult<T>(decoder: CborDecoder<T>): T {
    return guarded(() => this._response.extractResult(decoder));
  }

  /** The `'error'` leaf decoded by `decoder`, as the reference's `extract_error::<T>`. */
  extractError<T>(decoder: CborDecoder<T>): T {
    return guarded(() => this._response.extractError(decoder));
  }

  // State and continuation ----------------------------------------------------

  /** With the sender's state (`undefined` clears it); `StateOnFailedResponse` unless the response is a success. */
  withState(state: EnvelopeInput | undefined): SealedResponse {
    if (state !== undefined && !this._response.isOk()) throw GstpError.stateOnFailedResponse();
    return new SealedResponse(
      this._response,
      this._sender,
      state === undefined ? undefined : Envelope.from(state),
      this._peerContinuation,
    );
  }

  /** With the peer's continuation (`undefined` clears it); not an `Envelope` is a `TypeError`. */
  withPeerContinuation(peerContinuation: Envelope | undefined): SealedResponse {
    if (peerContinuation !== undefined) expectEnvelope(peerContinuation, "peerContinuation");
    return new SealedResponse(this._response, this._sender, this._state, peerContinuation);
  }

  /** The sender's document. */
  get sender(): XIDDocument {
    return this._sender;
  }

  /** The sender's state, when any. */
  get state(): Envelope | undefined {
    return this._state;
  }

  /** The peer's continuation, when any. */
  get peerContinuation(): Envelope | undefined {
    return this._peerContinuation;
  }

  // Sealing -------------------------------------------------------------------

  /**
   * The response with `'sender'`, the sender's continuation when there is
   * state (with `validUntil`, encrypted to the sender) and the peer
   * continuation; signed by `signer` and encrypted to `recipients`.
   */
  seal({ signer, recipients, validUntil }: SealOptions = {}): Envelope {
    let senderContinuation: Envelope | undefined;
    if (this._state !== undefined) {
      const continuation = Continuation.from({ state: this._state, validUntil });
      senderContinuation = continuation.seal(senderEncryptionKey(this._sender));
    }
    return sealBody(
      this._response.toEnvelope(),
      this._sender,
      senderContinuation,
      this._peerContinuation,
      { signer, recipients },
    );
  }

  /** `seal` with nothing: unsigned, unsealed. */
  toEnvelope(): Envelope {
    return this.seal();
  }

  /**
   * Decrypts to the recipient, verifies the sender's signature, checks
   * the sender continuation (when present it must be encrypted), opens
   * the recipient's own continuation and parses the response; a `null`
   * state reads as no state.
   */
  static open(sealed: Envelope, options: OpenOptions): SealedResponse {
    const { envelope, sender, peerContinuation, state } = openBody(sealed, options, false);
    const response = guarded(() => Response.fromEnvelope(envelope));
    return new SealedResponse(
      response,
      sender,
      state?.isNull() === true ? undefined : state,
      peerContinuation,
    );
  }

  /** `SealedResponse(<summary>, state: <flat>, peer_continuation: None|Some)`, the reference's `Display`. */
  toString(): string {
    const stateStr = this._state !== undefined ? format(this._state, { flat: true }) : "None";
    const peerStr = this._peerContinuation !== undefined ? "Some" : "None";
    return `SealedResponse(${this._response.summary()}, state: ${stateStr}, peer_continuation: ${peerStr})`;
  }

  /** Same response, sender document, state digest and peer continuation digest, as the reference's equality. */
  equals(other: SealedResponse): boolean {
    expectInstance(other, SealedResponse, "other");
    return (
      this._response.equals(other._response) &&
      this._sender.equals(other._sender) &&
      envelopesEqual(this._state, other._state) &&
      envelopesEqual(this._peerContinuation, other._peerContinuation)
    );
  }
}
