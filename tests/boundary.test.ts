/**
 * The JavaScript input domain: an argument that is not what the
 * reference's types demand is a `TypeError` naming it, at the call that
 * receives it; a `CborDate` goes wherever a `Date` goes; the builders
 * return new instances; equality compares whole documents.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ARID, PrivateKeyBase } from "@blockchaincommons/components";
import { CborDate } from "@blockchaincommons/dcbor";
import { Envelope } from "@blockchaincommons/envelope";
import { XIDDocument } from "@blockchaincommons/xid";
import { Continuation, SealedEvent, SealedRequest, SealedResponse } from "../src";

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
const id = ARID.fromHex("c66be27dbad7cd095ca77647406d07976dc0f35f0d4d654bb0e96dd227a1e9fc");
const now = new Date("2024-07-04T11:11:11Z");
const later = new Date("2030-01-01T00:00:00Z");
const request = (): SealedRequest => SealedRequest.from("f", { id, sender: client });
const sealed = (): Envelope =>
  request().seal({ signer: must(client.inceptionPrivateKeys), recipients: [server] });

/** Every guarded call, with the argument its message names. */
const GUARDS: [string, (bogus: unknown) => unknown, string][] = [
  [
    "Continuation.from validId",
    (b) => Continuation.from({ state: "s", validId: b as never }),
    "validId",
  ],
  [
    "Continuation.from validUntil",
    (b) => Continuation.from({ state: "s", validUntil: b as never }),
    "validUntil",
  ],
  ["Continuation.open sealed", (b) => Continuation.open(b as never), "sealed"],
  [
    "Continuation.open recipient",
    (b) => Continuation.open(Envelope.from("s").wrap(), { recipient: b as never }),
    "recipient",
  ],
  [
    "Continuation.open now",
    (b) => Continuation.open(Envelope.from("s").wrap(), { now: b as never }),
    "now",
  ],
  [
    "Continuation.open expectedId",
    (b) => Continuation.open(Envelope.from("s").wrap(), { expectedId: b as never }),
    "expectedId",
  ],
  ["Continuation.isValidAt", (b) => Continuation.from({ state: "s" }).isValidAt(b as never), "now"],
  ["Continuation.isValidId", (b) => Continuation.from({ state: "s" }).isValidId(b as never), "id"],
  ["Continuation.equals", (b) => Continuation.from({ state: "s" }).equals(b as never), "other"],
  [
    "SealedRequest.from id",
    (b) => SealedRequest.from("f", { id: b as never, sender: client }),
    "id",
  ],
  [
    "SealedRequest.from sender",
    (b) => SealedRequest.from("f", { id, sender: b as never }),
    "sender",
  ],
  [
    "SealedRequest.from peerContinuation",
    (b) => SealedRequest.from("f", { id, sender: client, peerContinuation: b as never }),
    "peerContinuation",
  ],
  ["SealedRequest.withDate", (b) => request().withDate(b as never), "date"],
  [
    "SealedRequest.withPeerContinuation",
    (b) => request().withPeerContinuation(b as never),
    "peerContinuation",
  ],
  [
    "SealedRequest.seal validUntil",
    (b) => request().seal({ validUntil: b as never }),
    "validUntil",
  ],
  [
    "SealedRequest.seal recipients[]",
    (b) => request().seal({ recipients: [b as never] }),
    "recipients[]",
  ],
  [
    "SealedRequest.open sealed",
    (b) => SealedRequest.open(b as never, { recipient: must(server.inceptionPrivateKeys) }),
    "sealed",
  ],
  [
    "SealedRequest.open recipient",
    (b) => SealedRequest.open(sealed(), { recipient: b as never }),
    "recipient",
  ],
  [
    "SealedRequest.open expectedId",
    (b) =>
      SealedRequest.open(sealed(), {
        recipient: must(server.inceptionPrivateKeys),
        expectedId: b as never,
      }),
    "expectedId",
  ],
  [
    "SealedRequest.open now",
    (b) =>
      SealedRequest.open(sealed(), {
        recipient: must(server.inceptionPrivateKeys),
        now: b as never,
      }),
    "now",
  ],
  ["SealedRequest.equals", (b) => request().equals(b as never), "other"],
  [
    "SealedResponse.success id",
    (b) => SealedResponse.success(b as never, { sender: client }),
    "id",
  ],
  [
    "SealedResponse.failure id",
    (b) => SealedResponse.failure(b as never, { sender: client }),
    "id",
  ],
  [
    "SealedResponse.earlyFailure sender",
    (b) => SealedResponse.earlyFailure({ sender: b as never }),
    "sender",
  ],
  [
    "SealedResponse.withPeerContinuation",
    (b) => SealedResponse.success(id, { sender: client }).withPeerContinuation(b as never),
    "peerContinuation",
  ],
  [
    "SealedResponse.equals",
    (b) => SealedResponse.success(id, { sender: client }).equals(b as never),
    "other",
  ],
  ["SealedEvent.from id", (b) => SealedEvent.from("e", { id: b as never, sender: client }), "id"],
  ["SealedEvent.from sender", (b) => SealedEvent.from("e", { id, sender: b as never }), "sender"],
  [
    "SealedEvent.withDate",
    (b) => SealedEvent.from("e", { id, sender: client }).withDate(b as never),
    "date",
  ],
  [
    "SealedEvent.equals",
    (b) => SealedEvent.from("e", { id, sender: client }).equals(b as never),
    "other",
  ],
];

const PLAIN_VALUES: unknown[] = [{}, "x", 1, [], null, new Date(NaN), () => {}];

describe("the JavaScript boundary", () => {
  describe.each(GUARDS)("%s", (_name, call, argument) => {
    it.each(
      PLAIN_VALUES.map((v) => [
        v instanceof Date ? "Invalid Date" : (JSON.stringify(v) ?? String(v)),
        v,
      ]),
    )("rejects %s with a TypeError naming the argument", (_label, value) => {
      expect(() => call(value)).toThrow(TypeError);
      expect(() => call(value)).toThrow(`${argument} must be `);
    });
  });

  it("rejects a duration that is not a finite, non-negative number", () => {
    for (const bogus of [NaN, Infinity, -1, "60000", {}, null]) {
      expect(() => Continuation.from({ state: "s", validFor: bogus as never })).toThrow(
        "validFor must be a finite, non-negative number of milliseconds",
      );
    }
    expect(Continuation.from({ state: "s", validFor: 0 }).validUntil).toBeInstanceOf(Date);
  });

  it("rejects any non-instance value with a TypeError (property; undefined is an absent option)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...GUARDS),
        fc
          .anything({ withObjectString: true, withMap: true, withSet: true, withDate: false })
          .filter((v) => v !== undefined),
        ([, call, argument], value) => {
          let thrown: unknown;
          try {
            call(value);
          } catch (e) {
            thrown = e;
          }
          return thrown instanceof TypeError && thrown.message.startsWith(`${argument} must be `);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("takes a CborDate wherever a Date goes", () => {
    const deadline = CborDate.fromDate(later);
    const c = Continuation.from({ state: "s", validUntil: deadline });
    expect(c.isValidAt(CborDate.fromDate(now))).toBe(true);
    expect(c.isValidAt(deadline)).toBe(false);
    const withCbor = request().withDate(CborDate.fromDate(now));
    expect(withCbor.date?.getTime()).toBe(now.getTime());
    const env = request().seal({
      signer: must(client.inceptionPrivateKeys),
      recipients: [server],
      validUntil: deadline,
    });
    const opened = SealedRequest.open(env, {
      recipient: must(server.inceptionPrivateKeys),
      now: CborDate.fromDate(now),
    });
    expect(opened.id.equals(id)).toBe(true);
    expect(
      SealedEvent.from("e", { id, sender: client }).withDate(deadline).cborDate?.equals(deadline),
    ).toBe(true);
  });

  it("builders return new instances and leave the receiver unchanged", () => {
    const a = request();
    const b = a.withNote("note").withParameter("p", 1).withDate(now).withState("s");
    expect(b).not.toBe(a);
    expect(a.note).toBe("");
    expect(a.parameter("p")).toBeUndefined();
    expect(a.date).toBeUndefined();
    expect(a.state).toBeUndefined();
    expect(b.note).toBe("note");
    expect(b.parameter("p")).toBeDefined();
    expect(b.state).toBeDefined();
    expect(a.withParameter("p", undefined)).toBe(a);
    const r = SealedResponse.success(id, { sender: client });
    const r2 = r.withResult("ok").withState("s");
    expect(r.isOk && r2.isOk).toBe(true);
    expect(r.state).toBeUndefined();
    expect(r2.state).toBeDefined();
    const e = SealedEvent.from("e", { id, sender: client });
    expect(e.withNote("n")).not.toBe(e);
    expect(e.note).toBe("");
  });

  it("reads an event's content as text unless told how", () => {
    const env = SealedEvent.from("text", { id, sender: client }).seal({
      signer: must(client.inceptionPrivateKeys),
      recipients: [server],
    });
    const asText: SealedEvent<string> = SealedEvent.open(env, {
      recipient: must(server.inceptionPrivateKeys),
    });
    expect(asText.content).toBe("text");
    const asEnvelope: SealedEvent<Envelope> = SealedEvent.open(env, {
      recipient: must(server.inceptionPrivateKeys),
      content: (e: Envelope) => e,
    });
    expect(asEnvelope.content.expectString()).toBe("text");
  });

  it("compares the whole sender document", () => {
    const withMethod = docOf(1);
    withMethod.addResolutionMethod("https://resolver.example.com");
    expect(request().equals(SealedRequest.from("f", { id, sender: withMethod }))).toBe(false);
    expect(request().equals(request())).toBe(true);
    // Two documents built from the same seed differ in the private keys' salt, as the reference's do.
    expect(client.equals(docOf(1))).toBe(false);
    expect(request().equals(SealedRequest.from("f", { id, sender: docOf(1) }))).toBe(false);
  });
});
