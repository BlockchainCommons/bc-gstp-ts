/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 * An event sealed by its sender: the envelope `Event` plus the sender's
 * XID document, optional state and the peer's continuation. Every `with…`
 * returns a new event; the one it was called on is unchanged.
 */

// Ported from gstp-rust/src/sealed_event.rs

import type { ARID } from "@blockchaincommons/components";
import type { CborDate } from "@blockchaincommons/dcbor";
import { Envelope, type EnvelopeInput, type ToEnvelope } from "@blockchaincommons/envelope";
import { Event } from "@blockchaincommons/envelope/expression";
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

/** What `SealedEvent.from` takes besides the content. */
export interface SealedEventInput {
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
export interface FromEnvelopeEventOptions<T extends EnvelopeInput> extends FromEnvelopeOptions {
  /** Reads the `'content'` envelope; the reference's `T: TryFrom<Envelope>`. */
  content: (envelope: Envelope) => T;
}

/** An event with its sender, state and the peer's continuation. */
export class SealedEvent<T extends EnvelopeInput> implements ToEnvelope {
  private readonly _event: Event<T>;
  private readonly _sender: XIDDocument;
  private readonly _state: Envelope | undefined;
  private readonly _peerContinuation: Envelope | undefined;

  private constructor(
    event: Event<T>,
    sender: XIDDocument,
    state: Envelope | undefined,
    peerContinuation: Envelope | undefined,
  ) {
    this._event = event;
    this._sender = sender;
    this._state = state;
    this._peerContinuation = peerContinuation;
  }

  /**
   * An event with `content` and `id`, from `sender`. An id that is not an
   * `ARID`, a sender that is not an `XIDDocument` or a peer continuation
   * that is not an `Envelope` is a `TypeError`.
   */
  static from<T extends EnvelopeInput>(
    content: T,
    { id, sender, state, peerContinuation }: SealedEventInput,
  ): SealedEvent<T> {
    expectArid(id, "id");
    if (peerContinuation !== undefined) expectEnvelope(peerContinuation, "peerContinuation");
    return new SealedEvent(
      Event.from(content, id),
      expectDocument(sender, "sender").clone(),
      state === undefined ? undefined : Envelope.from(state),
      peerContinuation,
    );
  }

  private with(event: Event<T>): SealedEvent<T> {
    return new SealedEvent(event, this._sender, this._state, this._peerContinuation);
  }

  /** With a `'note'`. */
  withNote(note: string): SealedEvent<T> {
    return this.with(this._event.withNote(note));
  }

  /** With a `'date'`: a `Date` is stored to the millisecond, a `CborDate` exactly; a `Date` without a time is a `TypeError`. */
  withDate(date: DateInput): SealedEvent<T> {
    return this.with(this._event.withDate(expectDateInput(date, "date")));
  }

  /** The envelope event. */
  get event(): Event<T> {
    return this._event;
  }

  /** The content. */
  get content(): T {
    return this._event.content;
  }

  /** The event id. */
  get id(): ARID {
    return this._event.id;
  }

  /** The `'note'`, empty when none. */
  get note(): string {
    return this._event.note;
  }

  /** The `'date'` as a JS `Date` (millisecond view); `cborDate` is the exact value. */
  get date(): Date | undefined {
    return this._event.date;
  }

  /** The `'date'` exactly, when any. */
  get cborDate(): CborDate | undefined {
    return this._event.cborDate;
  }

  /** With the sender's state (`undefined` clears it). */
  withState(state: EnvelopeInput | undefined): SealedEvent<T> {
    return new SealedEvent(
      this._event,
      this._sender,
      state === undefined ? undefined : Envelope.from(state),
      this._peerContinuation,
    );
  }

  /** With the peer's continuation (`undefined` clears it); not an `Envelope` is a `TypeError`. */
  withPeerContinuation(peerContinuation: Envelope | undefined): SealedEvent<T> {
    if (peerContinuation !== undefined) expectEnvelope(peerContinuation, "peerContinuation");
    return new SealedEvent(this._event, this._sender, this._state, peerContinuation);
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

  /**
   * The event with `'sender'`, the sender's continuation when there is
   * state or a `validUntil` (a `null` state then), and the peer
   * continuation; signed by `signer` and encrypted to `recipients`. With
   * no options: unsigned, unsealed.
   */
  toEnvelope({ signer, recipients, validUntil }: ToEnvelopeOptions = {}): Envelope {
    const key = senderEncryptionKey(this._sender);
    let senderContinuation: Envelope | undefined;
    if (this._state !== undefined) {
      senderContinuation = Continuation.from({ state: this._state, validUntil }).toEnvelope(key);
    } else if (validUntil !== undefined) {
      senderContinuation = Continuation.from({
        state: Envelope.from(null),
        validUntil,
      }).toEnvelope(key);
    }
    return sealBody(
      this._event.toEnvelope(),
      this._sender,
      senderContinuation,
      this._peerContinuation,
      { signer, recipients },
    );
  }

  /**
   * Decrypts to the recipient, verifies the sender's signature, checks the
   * sender continuation (when present it must be encrypted), opens the
   * recipient's own continuation and parses the event, reading the
   * content as text, or with `content` (`Envelope[General]` when it fails).
   */
  static fromEnvelope(sealed: Envelope, options: FromEnvelopeOptions): SealedEvent<string>;
  /** `fromEnvelope`, reading the content with `content` as `T`. */
  static fromEnvelope<T extends EnvelopeInput>(
    sealed: Envelope,
    options: FromEnvelopeEventOptions<T>,
  ): SealedEvent<T>;
  static fromEnvelope<T extends EnvelopeInput>(
    sealed: Envelope,
    options: FromEnvelopeOptions & { content?: ((envelope: Envelope) => T) | undefined },
  ): SealedEvent<T | string> {
    const { envelope, sender, peerContinuation, state } = openBody(sealed, options, false);
    const extractor: (env: Envelope) => T | string =
      options.content ?? ((env: Envelope): string => env.expectString());
    const event = guarded(() => Event.fromEnvelope<T | string>(envelope, extractor));
    return new SealedEvent<T | string>(event, sender, state, peerContinuation);
  }

  /** `SealedEvent(<summary>, state: <flat>, peer_continuation: None|Some)`; the reference's `Display` prints `SealedRequest(` here. */
  toString(): string {
    const stateStr = this._state !== undefined ? format(this._state, { flat: true }) : "None";
    const peerStr = this._peerContinuation !== undefined ? "Some" : "None";
    return `SealedEvent(${this._event.summary()}, state: ${stateStr}, peer_continuation: ${peerStr})`;
  }

  /** Same event and sender document, identical state and peer continuation (digest and structure), as the reference's `PartialEq`. */
  equals(other: SealedEvent<T>): boolean {
    expectInstance(other, SealedEvent, "other");
    return (
      this._event.equals(other._event) &&
      this._sender.equals(other._sender) &&
      envelopesEqual(this._state, other._state) &&
      envelopesEqual(this._peerContinuation, other._peerContinuation)
    );
  }
}
