/**
 * Properties over random inputs: a continuation survives sealing and
 * opening whatever its state, id and deadline; validity is monotonic in
 * the clock; and no private key of the sender ever leaves in a sealed
 * form.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ARID, PrivateKeyBase, type PrivateKeys } from "@blockchaincommons/components";
import { CborDate } from "@blockchaincommons/dcbor";
import { format } from "@blockchaincommons/envelope/format";
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
const keysOf = (doc: XIDDocument): PrivateKeys => must(doc.inceptionPrivateKeys);

const arbState = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.bigInt({ min: -(2n ** 63n), max: 2n ** 64n - 1n }),
);
const arbArid = fc.uint8Array({ minLength: 32, maxLength: 32 }).map((b) => ARID.from(b));
// Whole seconds between 2001 and 2100: representable exactly on both sides.
const arbInstant = fc.integer({ min: 978_307_200, max: 4_102_444_800 }).map((s) => s * 1000);
const arbDate = arbInstant.map((ms) => new Date(ms));

describe("properties", () => {
  it("a continuation opens to an equal one after sealing", () => {
    fc.assert(
      fc.property(
        arbState,
        fc.option(arbArid, { nil: undefined }),
        fc.option(arbDate, { nil: undefined }),
        fc.boolean(),
        (state, validId, validUntil, encrypt) => {
          const c = Continuation.from({ state, validId, validUntil });
          const sealed = c.toEnvelope(encrypt ? must(server.encryptionKey) : undefined);
          const back = Continuation.fromEnvelope(sealed, {
            recipient: encrypt ? keysOf(server) : undefined,
            expectedId: validId,
          });
          expect(back.equals(c)).toBe(true);
          expect(back.cborValidUntil?.equals(CborDate.fromDate(validUntil ?? new Date(0)))).toBe(
            validUntil === undefined ? undefined : true,
          );
        },
      ),
      { numRuns: 60 },
    );
  });

  it("validity is monotonic in the clock and strict at the deadline", () => {
    fc.assert(
      fc.property(arbInstant, arbInstant, arbInstant, (deadline, t1, t2) => {
        const c = Continuation.from({ state: "s", validUntil: new Date(deadline) });
        const [earlier, later] = t1 <= t2 ? [t1, t2] : [t2, t1];
        if (c.isValidDate(new Date(later))) expect(c.isValidDate(new Date(earlier))).toBe(true);
        expect(c.isValidDate(new Date(deadline))).toBe(false);
        expect(c.isValidDate(new Date(deadline - 1))).toBe(true);
        expect(c.isValidDate()).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("no private key of the sender leaves in any sealed form", () => {
    const id = ARID.fromHex("c66be27dbad7cd095ca77647406d07976dc0f35f0d4d654bb0e96dd227a1e9fc");
    const forms = [
      SealedRequest.from("f", { id, sender: client, state: "s" }).toEnvelope({
        signer: keysOf(client),
      }),
      SealedResponse.success(id, { sender: client, state: "s" }).toEnvelope({
        signer: keysOf(client),
      }),
      SealedEvent.from("e", { id, sender: client, state: "s" }).toEnvelope({
        signer: keysOf(client),
      }),
    ];
    for (const form of forms) {
      const text = format(form);
      expect(text).not.toMatch(/privateKey|PrivateKeys|ENCRYPTED \[\s*'hasSecret'/);
      expect(text).toContain("'sender': XID(");
    }
    const sealed = SealedRequest.from("f", { id, sender: client, state: "s" }).toEnvelope({
      signer: keysOf(client),
      recipients: [server],
    });
    const opened = SealedRequest.fromEnvelope(sealed, { recipient: keysOf(server) });
    expect(opened.sender.inceptionPrivateKeys).toBeUndefined();
    expect(opened.sender.xid.equals(client.xid)).toBe(true);
  });
});
