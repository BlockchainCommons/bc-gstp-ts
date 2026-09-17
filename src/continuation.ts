/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 * A continuation: state a party hands to its peer to get back later,
 * optionally bound to a request id and a validity deadline, and encrypted
 * to the party that will read it again.
 */

// Ported from gstp-rust/src/continuation.rs

import { ARID, type Decrypter, type Encrypter } from "@blockchaincommons/components";
import { CborDate } from "@blockchaincommons/dcbor";
import { Envelope, type EnvelopeInput, type ToEnvelope } from "@blockchaincommons/envelope";
import { format } from "@blockchaincommons/envelope/format";
import { encryptToRecipients, decryptToRecipient } from "@blockchaincommons/envelope/recipient";
import { ID, VALID_UNTIL } from "@blockchaincommons/known-values";

import { GstpError, guarded } from "./error";
import {
  type DateInput,
  expectArid,
  expectDateInput,
  expectDecrypter,
  expectDuration,
  expectEnvelope,
  expectInstance,
} from "./guards";

/** What `Continuation.from` takes. */
export interface ContinuationInput {
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
export interface ContinuationCheck {
  /** The clock; no expiry check without one. */
  now?: DateInput | undefined;
  /** The request id; no id check without one. */
  id?: ARID | undefined;
}

/** What `Continuation.fromEnvelope` takes. */
export interface ContinuationFromEnvelopeOptions {
  /** The private keys that decrypt a sealed continuation. */
  recipient?: Decrypter | undefined;
  /** The clock the deadline is checked against; no check without one. */
  now?: DateInput | undefined;
  /** The request id the bound id must equal; no check without one. */
  expectedId?: ARID | undefined;
}

const toCborDate = (date: DateInput): CborDate =>
  date instanceof Date ? CborDate.fromDate(date) : date;

/** State bound to an optional request id and deadline; sealed to the party that reopens it. */
export class Continuation implements ToEnvelope {
  private readonly _state: Envelope;
  private readonly _validId: ARID | undefined;
  private readonly _validUntil: CborDate | undefined;

  private constructor(
    state: Envelope,
    validId: ARID | undefined,
    validUntil: CborDate | undefined,
  ) {
    this._state = state;
    this._validId = validId;
    this._validUntil = validUntil;
  }

  /**
   * A continuation for `state`, bound to `validId` and to `validUntil` (or
   * to now plus `validDuration` milliseconds) when given. An id that is not
   * an `ARID`, a date without a time or a duration that is not a finite
   * non-negative number is a `TypeError`.
   */
  static from({ state, validId, validUntil, validDuration }: ContinuationInput): Continuation {
    if (validId !== undefined) expectArid(validId, "validId");
    let deadline: CborDate | undefined;
    if (validUntil !== undefined) {
      deadline = toCborDate(expectDateInput(validUntil, "validUntil"));
    } else if (validDuration !== undefined) {
      deadline = CborDate.fromDate(
        new Date(Date.now() + expectDuration(validDuration, "validDuration")),
      );
    }
    return new Continuation(Envelope.from(state), validId, deadline);
  }

  /** The state. */
  get state(): Envelope {
    return this._state;
  }

  /** The bound request id, when any. */
  get id(): ARID | undefined {
    return this._validId;
  }

  /** The deadline as a JS `Date` (millisecond view); `cborValidUntil` is the exact value. */
  get validUntil(): Date | undefined {
    return this._validUntil?.toDate();
  }

  /** The deadline exactly, when any. */
  get cborValidUntil(): CborDate | undefined {
    return this._validUntil;
  }

  /** Not expired at `now` (strictly before the deadline); always valid without a deadline or without a clock. */
  isValidDate(now?: DateInput): boolean {
    if (now !== undefined) expectDateInput(now, "now");
    if (this._validUntil === undefined || now === undefined) return true;
    return toCborDate(now).compare(this._validUntil) < 0;
  }

  /** Bound to `id`; always valid without a bound id or without an id to check. */
  isValidId(id?: ARID): boolean {
    if (id !== undefined) expectArid(id, "id");
    if (this._validId === undefined || id === undefined) return true;
    return this._validId.equals(id);
  }

  /** `isValidDate(now)` and `isValidId(id)`. */
  isValid({ now, id }: ContinuationCheck = {}): boolean {
    return this.isValidDate(now) && this.isValidId(id);
  }

  /**
   * The state wrapped, with `'id'` and `'validUntil'` assertions when set;
   * encrypted to `recipient` (the party that will reopen it) when given.
   */
  toEnvelope(recipient?: Encrypter): Envelope {
    let envelope = this._state.wrap();
    if (this._validId !== undefined) envelope = envelope.addAssertion(ID, this._validId);
    if (this._validUntil !== undefined) {
      envelope = envelope.addAssertion(VALID_UNTIL, this._validUntil);
    }
    return recipient === undefined
      ? envelope
      : guarded(() => encryptToRecipients(envelope, [recipient]));
  }

  /**
   * Decrypts (with `recipient`), reads the state, id and deadline (the
   * `'id'` and `'validUntil'` objects' subjects, as the reference's
   * `extract_optional_object_for_predicate`: a wrapped object is
   * `Envelope[InvalidFormat]`, one of the wrong type `Envelope[Cbor]`, two
   * of them `Envelope[AmbiguousPredicate]`), and checks them:
   * `ContinuationExpired` when `now` is past the deadline,
   * `ContinuationIdInvalid` when `expectedId` does not match the bound id.
   */
  static fromEnvelope(
    sealed: Envelope,
    { recipient, now, expectedId }: ContinuationFromEnvelopeOptions = {},
  ): Continuation {
    expectEnvelope(sealed, "sealed");
    if (recipient !== undefined) expectDecrypter(recipient, "recipient");
    if (now !== undefined) expectDateInput(now, "now");
    if (expectedId !== undefined) expectArid(expectedId, "expectedId");
    const envelope =
      recipient === undefined ? sealed : guarded(() => decryptToRecipient(sealed, recipient));
    const state = guarded(() => envelope.unwrap());
    const validId = guarded(() =>
      envelope.optionalObjectForPredicateAs(ID, (cbor) => ARID.fromCbor(cbor)),
    );
    const validUntil = guarded(() =>
      envelope.optionalObjectForPredicateAs(VALID_UNTIL, (cbor) => CborDate.fromTaggedCbor(cbor)),
    );
    const continuation = new Continuation(state, validId, validUntil);
    if (!continuation.isValidDate(now)) throw GstpError.continuationExpired();
    if (!continuation.isValidId(expectedId)) throw GstpError.continuationIdInvalid();
    return continuation;
  }

  /** Identical state (digest and structure), same id and deadline, as the reference's `PartialEq`. */
  equals(other: Continuation): boolean {
    expectInstance(other, Continuation, "other");
    if (!this._state.isIdenticalTo(other._state)) return false;
    if ((this._validId === undefined) !== (other._validId === undefined)) return false;
    if (
      this._validId !== undefined &&
      other._validId !== undefined &&
      !this._validId.equals(other._validId)
    ) {
      return false;
    }
    if ((this._validUntil === undefined) !== (other._validUntil === undefined)) return false;
    return (
      this._validUntil === undefined ||
      other._validUntil === undefined ||
      this._validUntil.equals(other._validUntil)
    );
  }

  /** `Continuation(state: …, id: …, validUntil: …)`; a JavaScript addition (the reference derives `Debug` only). */
  toString(): string {
    const parts = [`Continuation(state: ${format(this._state, { flat: true })}`];
    if (this._validId !== undefined) parts.push(`id: ${this._validId.shortDescription()}`);
    if (this._validUntil !== undefined) {
      parts.push(`validUntil: ${this._validUntil.toDate().toISOString()}`);
    }
    return `${parts.join(", ")})`;
  }
}
