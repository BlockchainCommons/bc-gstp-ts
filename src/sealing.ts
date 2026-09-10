/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 * What the three sealed messages share: the `'sender'`,
 * `'senderContinuation'` and `'recipientContinuation'` assertions, signing,
 * sealing to recipients, and the reverse — decrypt, find the sender, verify,
 * check the continuations — with the checks in the reference's order.
 */

import type { ARID, Decrypter, Signer } from "@blockchaincommons/components";
import { type Envelope } from "@blockchaincommons/envelope";
import { sign, verify } from "@blockchaincommons/envelope/signature";
import {
  encryptSubjectToRecipients,
  decryptToRecipient,
} from "@blockchaincommons/envelope/recipient";
import {
  SENDER,
  SENDER_CONTINUATION,
  RECIPIENT_CONTINUATION,
} from "@blockchaincommons/known-values";
import { XIDDocument } from "@blockchaincommons/xid";

import { Continuation } from "./continuation";
import { GstpError, guarded } from "./error";
import {
  type DateInput,
  expectArid,
  expectDateInput,
  expectDecrypter,
  expectDocument,
  expectEnvelope,
} from "./guards";

/** What `seal` takes on a sealed request, response or event. */
export interface SealOptions {
  /** Signs the message; the sender's private keys, typically. */
  signer?: Signer | undefined;
  /** Encrypts the signed message to each recipient's encryption key. */
  recipients?: readonly XIDDocument[] | undefined;
  /** The deadline of the sender's own continuation. */
  validUntil?: DateInput | undefined;
}

/** What `open` takes on a sealed request, response or event. */
export interface OpenOptions {
  /** The private keys of the recipient opening the message. */
  recipient: Decrypter;
  /** The request id the recipient's continuation must answer to. */
  expectedId?: ARID | undefined;
  /** The clock the recipient's continuation is checked against; no check without one. */
  now?: DateInput | undefined;
}

/** Same digest, or both absent. */
export const envelopesEqual = (a: Envelope | undefined, b: Envelope | undefined): boolean =>
  a === undefined || b === undefined ? a === b : a.digest().equals(b.digest());

// Sealing ------------------------------------------------------------------------

/** The sender's encryption key, or `SenderMissingEncryptionKey`. */
export function senderEncryptionKey(
  sender: XIDDocument,
): NonNullable<XIDDocument["encryptionKey"]> {
  const key = sender.encryptionKey;
  if (key === undefined) throw GstpError.senderMissingEncryptionKey();
  return key;
}

/**
 * Adds `'sender'`, the sender continuation (when there is one) and the
 * peer continuation to `body`, signs, and encrypts the wrapped result to
 * the recipients (`RecipientMissingEncryptionKey` for one without a key).
 */
export function sealBody(
  body: Envelope,
  sender: XIDDocument,
  senderContinuation: Envelope | undefined,
  peerContinuation: Envelope | undefined,
  { signer, recipients }: SealOptions,
): Envelope {
  let result = body.addAssertion(SENDER, sender.toEnvelope());
  if (senderContinuation !== undefined) {
    result = result.addAssertion(SENDER_CONTINUATION, senderContinuation);
  }
  if (peerContinuation !== undefined) {
    result = result.addAssertion(RECIPIENT_CONTINUATION, peerContinuation);
  }
  if (signer !== undefined) result = guarded(() => sign(result, signer));
  if (recipients !== undefined && recipients.length > 0) {
    const keys = recipients.map((recipient) => {
      const key = expectDocument(recipient, "recipients[]").encryptionKey;
      if (key === undefined) throw GstpError.recipientMissingEncryptionKey();
      return key;
    });
    result = guarded(() => encryptSubjectToRecipients(result.wrap(), keys));
  }
  return result;
}

/** What `openBody` recovers before the message-specific parse. */
export interface OpenedBody {
  /** The verified, unwrapped message envelope. */
  envelope: Envelope;
  /** The sender's document, as it travelled. */
  sender: XIDDocument;
  /** The sender's continuation, kept for the reply. */
  peerContinuation: Envelope | undefined;
  /** The recipient's own continuation's state, when one came back. */
  state: Envelope | undefined;
}

/**
 * Decrypts to the recipient, reads the sender (`XID`), verifies the
 * sender's signature (`SenderMissingVerificationKey`, `Envelope`), checks
 * the sender continuation (`PeerContinuationNotEncrypted`;
 * `MissingPeerContinuation` when `requirePeer`), and opens the recipient's
 * continuation with the recipient's keys, expected id and clock.
 */
export function openBody(
  sealed: Envelope,
  { recipient, expectedId, now }: OpenOptions,
  requirePeer: boolean,
): OpenedBody {
  expectEnvelope(sealed, "sealed");
  expectDecrypter(recipient, "recipient");
  if (expectedId !== undefined) expectArid(expectedId, "expectedId");
  if (now !== undefined) expectDateInput(now, "now");
  const signed = guarded(() => decryptToRecipient(sealed, recipient));
  // An unsigned message does not unwrap: an envelope failure, as the
  // reference reports it; only the sender document's parse is an XID failure.
  const unwrapped = guarded(() => signed.unwrap());
  let sender: XIDDocument;
  try {
    sender = XIDDocument.fromEnvelope(unwrapped.objectForPredicate(SENDER));
  } catch (e) {
    throw GstpError.xid(e);
  }
  const verificationKey = sender.verificationKey;
  if (verificationKey === undefined) throw GstpError.senderMissingVerificationKey();
  const envelope = guarded(() => verify(signed, verificationKey));
  const peerContinuation = guarded(() => envelope.optionalObjectForPredicate(SENDER_CONTINUATION));
  if (peerContinuation !== undefined) {
    if (!peerContinuation.subject().isEncrypted()) throw GstpError.peerContinuationNotEncrypted();
  } else if (requirePeer) {
    throw GstpError.missingPeerContinuation();
  }
  let state: Envelope | undefined;
  const ownContinuation = guarded(() =>
    envelope.optionalObjectForPredicate(RECIPIENT_CONTINUATION),
  );
  if (ownContinuation !== undefined) {
    state = Continuation.open(ownContinuation, { recipient, expectedId, now }).state;
  }
  return { envelope, sender, peerContinuation, state };
}
