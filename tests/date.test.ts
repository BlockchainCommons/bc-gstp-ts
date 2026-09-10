/**
 * Dates travel through requests, events and continuations as `CborDate`:
 * a sub-millisecond date the tag-1 float can hold comes back byte for
 * byte, a JS `Date` encodes exactly as it did when the port stored dates
 * as JS `Date`s, and the `date`/`validUntil` views are JS `Date`s to the
 * millisecond.
 */
import { describe, expect, it } from "vitest";
import { ARID, generateKeypair } from "@blockchaincommons/components";
import { CborDate, decodeCbor } from "@blockchaincommons/dcbor";
import { Envelope } from "@blockchaincommons/envelope";
import { VALID_UNTIL } from "@blockchaincommons/known-values";
import { SeededRng } from "@blockchaincommons/rand";
import { XIDDocument } from "@blockchaincommons/xid";
import { Continuation, SealedEvent, SealedRequest } from "../src";

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const id = ARID.fromHex("c66be27dbad7cd095ca77647406d07976dc0f35f0d4d654bb0e96dd227a1e9fc");
const rng = SeededRng.forTesting();
const [senderPrivateKeys, senderPublicKeys] = generateKeypair({ rng });
const sender = XIDDocument.from({
  inceptionKey: { privateKeys: senderPrivateKeys, publicKeys: senderPublicKeys },
});
const [recipientPrivateKeys, recipientPublicKeys] = generateKeypair({ rng });
const recipient = XIDDocument.from({
  inceptionKey: { privateKeys: recipientPrivateKeys, publicKeys: recipientPublicKeys },
});

/**
 * 122 microseconds past the second (2^-13 s): no JS `Date` holds it, and the
 * tag-1 float carries it exactly, so the decoded date equals the encoded one.
 */
const precise = CborDate.fromEpochSeconds(1703462400 + 2 ** -13);
const preciseView = new Date("2023-12-25T00:00:00Z");
/** A whole-millisecond instant, as a JS `Date` and as the CBOR date it encodes to. */
const wholeMillisecond = new Date("2024-07-04T11:12:11Z");
const wholeMillisecondLeaf = "c11a6686838b";

describe("dates keep their precision", () => {
  it("a sealed request keeps a sub-millisecond date and parameter", () => {
    const sealed = SealedRequest.from("test", { id, sender })
      .withDate(precise)
      .withParameter("when", precise)
      .seal({ signer: senderPrivateKeys, recipients: [recipient] });
    const opened = SealedRequest.open(sealed, { recipient: recipientPrivateKeys });
    expect(opened.cborDate?.equals(precise)).toBe(true);
    expect(opened.date?.getTime()).toBe(preciseView.getTime());
    expect(opened.extractParameter("when", (c) => CborDate.fromTaggedCbor(c)).equals(precise)).toBe(
      true,
    );
    expect(hex(opened.request.body.objectForParameter("when").expectLeaf().toData())).toBe(
      hex(precise.taggedCbor().toData()),
    );
  });

  it("a sealed event keeps a sub-millisecond date", () => {
    const sealed = SealedEvent.from("test", { id, sender })
      .withDate(precise)
      .seal({ signer: senderPrivateKeys, recipients: [recipient] });
    const opened = SealedEvent.open(sealed, { recipient: recipientPrivateKeys });
    expect(opened.cborDate?.equals(precise)).toBe(true);
    expect(opened.date?.getTime()).toBe(preciseView.getTime());
  });

  it("a continuation keeps a sub-millisecond deadline byte for byte", () => {
    const continuation = Continuation.from({ state: "state", validUntil: precise });
    const envelope = continuation.toEnvelope();
    const leaf = envelope.objectForPredicate(VALID_UNTIL).expectLeaf();
    expect(hex(leaf.toData())).toBe(hex(precise.taggedCbor().toData()));
    const opened = Continuation.open(envelope);
    expect(opened.cborValidUntil?.equals(precise)).toBe(true);
    expect(opened.validUntil?.getTime()).toBe(preciseView.getTime());
    expect(opened.equals(continuation)).toBe(true);
  });

  it("a raw 1(1.0000001) deadline is compared exactly", () => {
    const deadline = CborDate.fromEpochSeconds(1.0000001);
    const envelope = Envelope.from("state").wrap().addAssertion(VALID_UNTIL, deadline);
    const opened = Continuation.open(envelope);
    expect(opened.cborValidUntil?.equals(deadline)).toBe(true);
    expect(opened.isValidAt(new Date(1000))).toBe(true);
    expect(opened.isValidAt(CborDate.fromEpochSeconds(1.00000005))).toBe(true);
    expect(opened.isValidAt(CborDate.fromEpochSeconds(1.0000001))).toBe(false);
    expect(opened.isValidAt(new Date(1001))).toBe(false);
    expect(() => Continuation.open(envelope, { now: new Date(1001) })).toThrow(
      expect.objectContaining({ code: "ContinuationExpired" }),
    );
  });

  it("a JS Date encodes as it always did", () => {
    const fromDate = Continuation.from({ state: "state", validUntil: wholeMillisecond });
    const fromCborDate = Continuation.from({
      state: "state",
      validUntil: CborDate.fromDate(wholeMillisecond),
    });
    const leaf = fromDate.toEnvelope().objectForPredicate(VALID_UNTIL).expectLeaf();
    expect(hex(leaf.toData())).toBe(wholeMillisecondLeaf);
    expect(fromDate.toEnvelope().digest().equals(fromCborDate.toEnvelope().digest())).toBe(true);
    expect(fromDate.validUntil?.getTime()).toBe(wholeMillisecond.getTime());
    expect(fromDate.cborValidUntil?.equals(CborDate.fromDate(wholeMillisecond))).toBe(true);
    expect(CborDate.fromTaggedCbor(decodeCbor(leaf.toData())).toDate().getTime()).toBe(
      wholeMillisecond.getTime(),
    );

    const request = SealedRequest.from("test", { id, sender }).withDate(wholeMillisecond);
    const viaCborDate = SealedRequest.from("test", { id, sender }).withDate(
      CborDate.fromDate(wholeMillisecond),
    );
    expect(
      request.request.toEnvelope().digest().equals(viaCborDate.request.toEnvelope().digest()),
    ).toBe(true);
  });
});
