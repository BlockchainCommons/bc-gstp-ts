/**
 * `GstpError`: the reference's codes and messages, the transparent
 * wrappers (the sibling error's message, `cause` and `details.inner`),
 * the frozen tables and details, the narrowing `is(code)`, and a guard
 * that admits only this package's own instances.
 */
import { describe, expect, it } from "vitest";
import { ARID, PrivateKeyBase } from "@blockchaincommons/components";
import { Envelope, EnvelopeError } from "@blockchaincommons/envelope";
import { encryptSubjectToRecipients } from "@blockchaincommons/envelope/recipient";
import { sign } from "@blockchaincommons/envelope/signature";
import { SENDER } from "@blockchaincommons/known-values";
import { XIDDocument, XIDError } from "@blockchaincommons/xid";
import { GSTP_ERROR_CODES, GstpError, SealedRequest, SealedResponse } from "../src";

const must = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("expected a value");
  return value;
};
const docOf = (n: number): XIDDocument => {
  const b = PrivateKeyBase.from(Uint8Array.from({ length: 32 }, () => n));
  return XIDDocument.from({
    inceptionKey: { publicKeys: b.schnorrPublicKeys(), privateKeys: b.schnorrPrivateKeys() },
  });
};
const client = docOf(1);
const server = docOf(2);
const stranger = docOf(3);
const id = ARID.fromHex("c66be27dbad7cd095ca77647406d07976dc0f35f0d4d654bb0e96dd227a1e9fc");

const thrown = (f: () => unknown): unknown => {
  try {
    f();
  } catch (e) {
    return e;
  }
  throw new Error("expected a throw");
};

describe("GstpError", () => {
  it("carries the reference's codes and messages", () => {
    const expected: [GstpError, string, string][] = [
      [
        GstpError.senderMissingEncryptionKey(),
        "SenderMissingEncryptionKey",
        "sender must have an encryption key",
      ],
      [
        GstpError.recipientMissingEncryptionKey(),
        "RecipientMissingEncryptionKey",
        "recipient must have an encryption key",
      ],
      [
        GstpError.senderMissingVerificationKey(),
        "SenderMissingVerificationKey",
        "sender must have a verification key",
      ],
      [GstpError.continuationExpired(), "ContinuationExpired", "continuation expired"],
      [GstpError.continuationIdInvalid(), "ContinuationIdInvalid", "continuation ID invalid"],
      [
        GstpError.peerContinuationNotEncrypted(),
        "PeerContinuationNotEncrypted",
        "peer continuation must be encrypted",
      ],
      [
        GstpError.missingPeerContinuation(),
        "MissingPeerContinuation",
        "requests must contain a peer continuation",
      ],
      [
        GstpError.stateOnFailedResponse(),
        "StateOnFailedResponse",
        "Cannot set state on a failed response",
      ],
    ];
    for (const [error, code, message] of expected) {
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
      expect(error.details).toEqual({ code });
      expect(error.name).toBe("GstpError");
      expect(error).toBeInstanceOf(GstpError);
      expect(error).toBeInstanceOf(Error);
      expect(error.cause).toBeUndefined();
    }
    expect(GSTP_ERROR_CODES).toEqual([...expected.map(([, code]) => code), "Envelope", "XID"]);
  });

  it("wraps envelope and xid errors transparently", () => {
    const sealed = SealedRequest.from("f", { id, sender: client }).seal({
      signer: must(client.inceptionPrivateKeys),
      recipients: [server],
    });
    const wrongRecipient = thrown(() =>
      SealedRequest.open(sealed, { recipient: must(stranger.inceptionPrivateKeys) }),
    );
    expect(GstpError.isGstpError(wrongRecipient)).toBe(true);
    const e = wrongRecipient as GstpError;
    expect(e.is("Envelope")).toBe(true);
    if (e.is("Envelope")) {
      expect(e.details.inner).toBe("UnknownRecipient");
      expect(e.details.message).toBe("unknown recipient");
    }
    expect(e.message).toBe("unknown recipient");
    expect(EnvelopeError.isEnvelopeError(e.cause)).toBe(true);

    const bogusSender = encryptSubjectToRecipients(
      sign(
        Envelope.from("body").addAssertion(SENDER, "nope"),
        must(client.inceptionPrivateKeys),
      ).wrap(),
      [must(server.encryptionKey)],
    );
    const xid = thrown(() =>
      SealedRequest.open(bogusSender, { recipient: must(server.inceptionPrivateKeys) }),
    ) as GstpError;
    expect(xid.is("XID")).toBe(true);
    if (xid.is("XID")) expect(xid.details.inner).toBe("Cbor");
    expect(xid.message).toBe("CBOR error");
    expect(XIDError.isXIDError(xid.cause)).toBe(true);
  });

  it("names the failed accessor's condition", () => {
    const failure = SealedResponse.failure(id, { sender: client });
    const result = thrown(() => failure.result) as GstpError;
    expect(result.is("Envelope") && result.details.inner).toBe("General");
    expect(result.message).toBe("general error: Cannot get result from failed response");
    const early = thrown(() =>
      SealedResponse.earlyFailure({ sender: client }).expectId(),
    ) as GstpError;
    expect(early.is("Envelope") && early.details.inner).toBe("General");
    const state = thrown(() => failure.withState("x")) as GstpError;
    expect(state.is("StateOnFailedResponse")).toBe(true);
  });

  it("freezes the tables and the details", () => {
    expect(Object.isFrozen(GSTP_ERROR_CODES)).toBe(true);
    expect(Object.isFrozen(GstpError.continuationExpired().details)).toBe(true);
    expect(Object.isFrozen(GstpError.envelope(new Error("x")).details)).toBe(true);
  });

  it("admits only its own instances", () => {
    expect(GstpError.isGstpError(GstpError.continuationExpired())).toBe(true);
    expect(
      GstpError.isGstpError(Object.assign(new Error("x"), { name: "GstpError", code: "Nope" })),
    ).toBe(false);
    expect(GstpError.isGstpError({ name: "GstpError", code: "ContinuationExpired" })).toBe(false);
    expect(GstpError.isGstpError(Object.create(GstpError.prototype))).toBe(false);
    expect(GstpError.isGstpError(undefined)).toBe(false);
  });
});
