/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 * The one error this package throws: a `code` naming what went wrong (the
 * reference's variant names) and `details` typed by that code; envelope
 * and XID failures carry the underlying error as `cause`, its message as
 * the message and its code as `details.inner`, as the reference's
 * transparent wrappers do.
 */

// Ported from gstp-rust/src/error.rs

import { EnvelopeError, type EnvelopeErrorCode } from "@blockchaincommons/envelope";
import { XIDError, type XIDErrorCode } from "@blockchaincommons/xid";

/**
 * The reference's `Error` variants, plus `StateOnFailedResponse` for the
 * one call where the reference panics.
 */
export type GstpErrorCode =
  | "SenderMissingEncryptionKey"
  | "RecipientMissingEncryptionKey"
  | "SenderMissingVerificationKey"
  | "ContinuationExpired"
  | "ContinuationIdInvalid"
  | "PeerContinuationNotEncrypted"
  | "MissingPeerContinuation"
  | "StateOnFailedResponse"
  | "Envelope"
  | "XID";

/** Every code, in the reference's order. */
export const GSTP_ERROR_CODES: readonly GstpErrorCode[] = Object.freeze([
  "SenderMissingEncryptionKey",
  "RecipientMissingEncryptionKey",
  "SenderMissingVerificationKey",
  "ContinuationExpired",
  "ContinuationIdInvalid",
  "PeerContinuationNotEncrypted",
  "MissingPeerContinuation",
  "StateOnFailedResponse",
  "Envelope",
  "XID",
]);

/** `details` by code: the protocol rejections carry only their code; the two wrappers carry the wrapped error's code and message. */
export interface GstpErrorDetailsByCode {
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
export type GstpErrorDetailsFor<C extends GstpErrorCode> = GstpErrorDetailsByCode[C];

/** The `details` of any code, discriminated by `code`. */
export type GstpErrorDetails = GstpErrorDetailsByCode[GstpErrorCode];

/** A `GstpError` narrowed to one code, as `is(code)` and the factories type it. */
export type GstpErrorTyped<C extends GstpErrorCode> = GstpError & {
  /** The code, narrowed. */
  readonly code: C;
  /** The details of that code. */
  readonly details: GstpErrorDetailsFor<C>;
};

type PlainCode = Exclude<GstpErrorCode, "Envelope" | "XID">;

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
export class GstpError extends Error {
  /** Always `"GstpError"`. */
  override readonly name = "GstpError";
  /** Which condition was raised. */
  readonly code: GstpErrorCode;
  /** Structured information, discriminated by `code`; frozen. */
  readonly details: GstpErrorDetails;
  readonly #brand = true;

  private constructor(message: string, details: GstpErrorDetails, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    Object.setPrototypeOf(this, new.target.prototype);
    this.code = details.code;
    this.details = Object.freeze(details);
  }

  /** `true` for an error this package threw: an instance, not a look-alike. */
  static isGstpError(value: unknown): value is GstpError {
    return value instanceof GstpError && #brand in value;
  }

  /** `true` when this error carries `code`; narrows `details`. */
  is<C extends GstpErrorCode>(code: C): this is GstpErrorTyped<C> {
    return this.code === code;
  }

  private static plain<C extends PlainCode>(code: C, message: string): GstpErrorTyped<C> {
    return new GstpError(message, { code }) as GstpErrorTyped<C>;
  }

  /** `SenderMissingEncryptionKey`: the sender's document holds no encryption key. */
  static senderMissingEncryptionKey(): GstpErrorTyped<"SenderMissingEncryptionKey"> {
    return GstpError.plain("SenderMissingEncryptionKey", "sender must have an encryption key");
  }

  /** `RecipientMissingEncryptionKey`: a recipient's document holds no encryption key. */
  static recipientMissingEncryptionKey(): GstpErrorTyped<"RecipientMissingEncryptionKey"> {
    return GstpError.plain(
      "RecipientMissingEncryptionKey",
      "recipient must have an encryption key",
    );
  }

  /** `SenderMissingVerificationKey`: the sender's document holds no verification key. */
  static senderMissingVerificationKey(): GstpErrorTyped<"SenderMissingVerificationKey"> {
    return GstpError.plain("SenderMissingVerificationKey", "sender must have a verification key");
  }

  /** `ContinuationExpired`: the continuation's deadline has passed. */
  static continuationExpired(): GstpErrorTyped<"ContinuationExpired"> {
    return GstpError.plain("ContinuationExpired", "continuation expired");
  }

  /** `ContinuationIdInvalid`: the continuation is bound to another request id. */
  static continuationIdInvalid(): GstpErrorTyped<"ContinuationIdInvalid"> {
    return GstpError.plain("ContinuationIdInvalid", "continuation ID invalid");
  }

  /** `PeerContinuationNotEncrypted`: the peer's continuation arrived in the clear. */
  static peerContinuationNotEncrypted(): GstpErrorTyped<"PeerContinuationNotEncrypted"> {
    return GstpError.plain("PeerContinuationNotEncrypted", "peer continuation must be encrypted");
  }

  /** `MissingPeerContinuation`: a request arrived without the peer's continuation. */
  static missingPeerContinuation(): GstpErrorTyped<"MissingPeerContinuation"> {
    return GstpError.plain("MissingPeerContinuation", "requests must contain a peer continuation");
  }

  /** `StateOnFailedResponse`: state was set on a response that is not a success (the reference panics). */
  static stateOnFailedResponse(): GstpErrorTyped<"StateOnFailedResponse"> {
    return GstpError.plain("StateOnFailedResponse", "Cannot set state on a failed response");
  }

  /**
   * The wrapping codes are transparent, as the reference's
   * `#[error(transparent)]`: the message is the sibling error's, the
   * sibling error is `cause`, and `details.inner` is its code.
   */
  private static wrapped<C extends "Envelope" | "XID">(code: C, cause: unknown): GstpErrorTyped<C> {
    const message = cause instanceof Error ? cause.message : String(cause);
    const inner =
      EnvelopeError.isEnvelopeError(cause) || XIDError.isXIDError(cause) ? cause.code : undefined;
    return new GstpError(
      message,
      { code, inner, message } as GstpErrorDetails,
      cause,
    ) as GstpErrorTyped<C>;
  }

  /** `Envelope`: an envelope that would not decrypt, verify, unwrap or parse; `cause` is the envelope error. */
  static envelope(cause: unknown): GstpErrorTyped<"Envelope"> {
    return GstpError.wrapped("Envelope", cause);
  }

  /** `XID`: a sender document that would not parse; `cause` is the xid error. */
  static xid(cause: unknown): GstpErrorTyped<"XID"> {
    return GstpError.wrapped("XID", cause);
  }
}

/**
 * Runs `f`; an envelope error inside it is `Envelope`, an xid error is
 * `XID`, and everything else (a `GstpError`, a `TypeError`) passes through.
 */
export function guarded<T>(f: () => T): T {
  try {
    return f();
  } catch (error) {
    if (GstpError.isGstpError(error)) throw error;
    if (EnvelopeError.isEnvelopeError(error)) throw GstpError.envelope(error);
    if (XIDError.isXIDError(error)) throw GstpError.xid(error);
    throw error;
  }
}
