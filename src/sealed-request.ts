/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 * A request sealed by its sender: the envelope `Request` plus the sender's
 * XID document, the sender's own state (carried as an encrypted
 * continuation that only the sender can reopen), and the peer's
 * continuation handed back as it was received. Every `with…` returns a new
 * request; the one it was called on is unchanged.
 */

// Ported from gstp-rust/src/sealed_request.rs

import type { ARID } from "@blockchaincommons/components";
import type { CborDate } from "@blockchaincommons/dcbor";
import {
  type CborDecoder,
  Envelope,
  type EnvelopeInput,
  type ToEnvelope,
} from "@blockchaincommons/envelope";
import {
  Request,
  type Expression,
  type Function,
  type FunctionID,
  type Parameter,
  type ParameterID,
} from "@blockchaincommons/envelope/expression";
import { format } from "@blockchaincommons/envelope/format";
import { type XIDDocument } from "@blockchaincommons/xid";

import { Continuation } from "./continuation";
import { guarded } from "./error";
import {
  type DateInput,
  expectArid,
  expectDateInput,
  expectDocument,
  expectEnvelope,
  expectInstance,
} from "./guards";
import {
  type FromEnvelopeOptions,
  type ToEnvelopeOptions,
  envelopesEqual,
  openBody,
  sealBody,
  senderEncryptionKey,
} from "./sealing";

/** What `SealedRequest.from` takes besides the function. */
export interface SealedRequestInput {
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
export class SealedRequest implements ToEnvelope {
  private readonly _request: Request;
  private readonly _sender: XIDDocument;
  private readonly _state: Envelope | undefined;
  private readonly _peerContinuation: Envelope | undefined;

  private constructor(
    request: Request,
    sender: XIDDocument,
    state: Envelope | undefined,
    peerContinuation: Envelope | undefined,
  ) {
    this._request = request;
    this._sender = sender;
    this._state = state;
    this._peerContinuation = peerContinuation;
  }

  /**
   * A request for `func` (a function, its id, or a whole expression) with
   * `id`, from `sender`. An id that is not an `ARID`, a sender that is not
   * an `XIDDocument` or a peer continuation that is not an `Envelope` is a
   * `TypeError`.
   */
  static from(
    func: Function | Expression | FunctionID,
    { id, sender, state, peerContinuation }: SealedRequestInput,
  ): SealedRequest {
    expectArid(id, "id");
    if (peerContinuation !== undefined) expectEnvelope(peerContinuation, "peerContinuation");
    return new SealedRequest(
      Request.from(func, id),
      expectDocument(sender, "sender").clone(),
      state === undefined ? undefined : Envelope.from(state),
      peerContinuation,
    );
  }

  private with(request: Request): SealedRequest {
    return new SealedRequest(request, this._sender, this._state, this._peerContinuation);
  }

  // Body ----------------------------------------------------------------------

  /** With a `param` argument; unchanged when `value` is `undefined`. */
  withParameter(param: ParameterID | Parameter, value: EnvelopeInput | undefined): SealedRequest {
    return value === undefined ? this : this.with(this._request.withParameter(param, value));
  }

  /** With a `'note'`. */
  withNote(note: string): SealedRequest {
    return this.with(this._request.withNote(note));
  }

  /** With a `'date'`: a `Date` is stored to the millisecond, a `CborDate` exactly; a `Date` without a time is a `TypeError`. */
  withDate(date: DateInput): SealedRequest {
    return this.with(this._request.withDate(expectDateInput(date, "date")));
  }

  /** The envelope request. */
  get request(): Request {
    return this._request;
  }

  /** The function. */
  get function(): Function {
    return this._request.function;
  }

  /** The expression as an envelope. */
  get expressionEnvelope(): Envelope {
    return this._request.expressionEnvelope;
  }

  /** The expression. */
  get body(): Expression {
    return this._request.body;
  }

  /** The request id. */
  get id(): ARID {
    return this._request.id;
  }

  /** The `'note'`, empty when none. */
  get note(): string {
    return this._request.note;
  }

  /** The `'date'` as a JS `Date` (millisecond view); `cborDate` is the exact value. */
  get date(): Date | undefined {
    return this._request.date;
  }

  /** The `'date'` exactly, when any. */
  get cborDate(): CborDate | undefined {
    return this._request.cborDate;
  }

  /** The single `param` argument, or `undefined`; two of them are `Envelope[AmbiguousPredicate]`. */
  parameter(param: ParameterID | Parameter): Envelope | undefined {
    return guarded(() => this._request.body.parameter(param));
  }

  /** The single `param` argument; `Envelope[NonexistentPredicate]` when absent, `Envelope[AmbiguousPredicate]` when repeated. */
  objectForParameter(param: ParameterID | Parameter): Envelope {
    return guarded(() => this._request.body.objectForParameter(param));
  }

  /** Every `param` argument. */
  objectsForParameter(param: ParameterID | Parameter): Envelope[] {
    return guarded(() => this._request.body.objectsForParameter(param));
  }

  /**
   * The single `param` argument's leaf, decoded by `decoder` (dcbor's
   * `expectText`, `expectInteger`, …, `CborDate.fromTaggedCbor`,
   * `ARID.fromCbor`, or any `(cbor) => T`), as the reference's
   * `extract_object_for_parameter::<T>`: `Envelope[NonexistentPredicate]`
   * when absent, `Envelope[AmbiguousPredicate]` when repeated,
   * `Envelope[NotLeaf]` when the argument is not a leaf, `Envelope[Cbor]`
   * when the decoder rejects it.
   */
  extractObjectForParameter<T>(param: ParameterID | Parameter, decoder: CborDecoder<T>): T {
    return guarded(() => this._request.body.objectForParameter(param).expectSubject(decoder));
  }

  /** `extractObjectForParameter`, or `undefined` when the parameter is absent. */
  extractOptionalObjectForParameter<T>(
    param: ParameterID | Parameter,
    decoder: CborDecoder<T>,
  ): T | undefined {
    return guarded(() => {
      const envelope = this._request.body.parameter(param);
      return envelope === undefined ? undefined : envelope.expectSubject(decoder);
    });
  }

  /** Every `param` argument's leaf, decoded. */
  extractObjectsForParameter<T>(param: ParameterID | Parameter, decoder: CborDecoder<T>): T[] {
    return guarded(() =>
      this._request.body.objectsForParameter(param).map((env) => env.expectSubject(decoder)),
    );
  }

  // State and continuation ----------------------------------------------------

  /** With the sender's state (`undefined` clears it). */
  withState(state: EnvelopeInput | undefined): SealedRequest {
    return new SealedRequest(
      this._request,
      this._sender,
      state === undefined ? undefined : Envelope.from(state),
      this._peerContinuation,
    );
  }

  /** With the peer's continuation (`undefined` clears it); not an `Envelope` is a `TypeError`. */
  withPeerContinuation(peerContinuation: Envelope | undefined): SealedRequest {
    if (peerContinuation !== undefined) expectEnvelope(peerContinuation, "peerContinuation");
    return new SealedRequest(this._request, this._sender, this._state, peerContinuation);
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
   * The request with `'sender'`, the sender's continuation (the state —
   * `null` without one — bound to the request id and `validUntil`,
   * encrypted to the sender) and the peer continuation; signed by
   * `signer` and encrypted to `recipients` when given. With no options:
   * unsigned, unsealed.
   */
  toEnvelope({ signer, recipients, validUntil }: ToEnvelopeOptions = {}): Envelope {
    const continuation = Continuation.from({
      state: this._state ?? Envelope.from(null),
      validId: this.id,
      validUntil,
    });
    const senderContinuation = continuation.toEnvelope(senderEncryptionKey(this._sender));
    return sealBody(
      this._request.toEnvelope(),
      this._sender,
      senderContinuation,
      this._peerContinuation,
      { signer, recipients },
    );
  }

  /**
   * Decrypts to the recipient, verifies the sender's signature, requires
   * an encrypted sender continuation, opens the recipient's own
   * continuation (`expectedId`, `now`) and parses the request.
   */
  static fromEnvelope(sealed: Envelope, options: FromEnvelopeOptions): SealedRequest {
    const { envelope, sender, peerContinuation, state } = openBody(sealed, options, true);
    const request = guarded(() => Request.fromEnvelope(envelope));
    return new SealedRequest(request, sender, state, peerContinuation);
  }

  /** `SealedRequest(<summary>, state: <flat>, peer_continuation: None|Some)`, the reference's `Display`. */
  toString(): string {
    const stateStr = this._state !== undefined ? format(this._state, { flat: true }) : "None";
    const peerStr = this._peerContinuation !== undefined ? "Some" : "None";
    return `SealedRequest(${this._request.summary()}, state: ${stateStr}, peer_continuation: ${peerStr})`;
  }

  /** Same request and sender document, identical state and peer continuation (digest and structure), as the reference's `PartialEq`. */
  equals(other: SealedRequest): boolean {
    expectInstance(other, SealedRequest, "other");
    return (
      this._request.equals(other._request) &&
      this._sender.equals(other._sender) &&
      envelopesEqual(this._state, other._state) &&
      envelopesEqual(this._peerContinuation, other._peerContinuation)
    );
  }
}
