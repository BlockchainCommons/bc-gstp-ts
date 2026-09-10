/**
 * Post-quantum tests, ported from `gstp-rust/tests/pq_tests.rs`: ML-DSA for
 * signing and ML-KEM for encapsulation, in place of the seed-derived
 * Schnorr and X25519 keys the other tests use.
 */
import { describe, it, expect } from "vitest";
import {
  ARID,
  MLKEMLevel,
  SignatureScheme,
  EncapsulationPrivateKey,
  PrivateKeys,
  PublicKeys,
  createKeypair,
} from "@blockchaincommons/components";
import { Expression, Function } from "@blockchaincommons/envelope/expression";
import { format } from "@blockchaincommons/envelope/format";
import { expectInteger, expectText } from "@blockchaincommons/dcbor";
import { XIDDocument } from "@blockchaincommons/xid";
import { Continuation, SealedRequest, SealedResponse, SealedEvent } from "../src";

function requestId(): ARID {
  return ARID.fromHex("c66be27dbad7cd095ca77647406d07976dc0f35f0d4d654bb0e96dd227a1e9fc");
}

function requestDate(): Date {
  return new Date("2024-07-04T11:11:11Z");
}

function requestContinuation(): Continuation {
  const validDuration = 60 * 1000; // 60 seconds in milliseconds
  const validUntil = new Date(requestDate().getTime() + validDuration);
  return Continuation.from({
    state: "The state of things.",
    validId: requestId(),
    validUntil: validUntil,
  });
}

/**
 * Generate PQ keypairs using MLDSA44 for signing and MLKEM512 for encapsulation.
 * Matches the Rust test setup: keypair_opt(SignatureScheme::MLDSA44, EncapsulationScheme::MLKEM512)
 */
function createPQKeypairs(): { privateKeys: PrivateKeys; publicKeys: PublicKeys } {
  // Signing with MLDSA44
  const [signingPrivate, signingPublic] = createKeypair(SignatureScheme.MLDSA44);

  // Encapsulation with MLKEM512
  const [encapsulationPrivate, encapsulationPublic] = EncapsulationPrivateKey.mlkemKeypair(
    MLKEMLevel.MLKEM512,
  );

  const privateKeys = PrivateKeys.from({
    signing: signingPrivate,
    encapsulation: encapsulationPrivate,
  });
  const publicKeys = PublicKeys.from({
    signing: signingPublic,
    encapsulation: encapsulationPublic,
  });

  return { privateKeys, publicKeys };
}

/**
 * Create an XIDDocument with PQ keys.
 */
function createPQXIDDocument(): {
  xid: XIDDocument;
  privateKeys: PrivateKeys;
  publicKeys: PublicKeys;
} {
  const { privateKeys, publicKeys } = createPQKeypairs();
  const xid = XIDDocument.from({ inceptionKey: { privateKeys, publicKeys } });
  return { xid, privateKeys, publicKeys };
}

describe("Post-Quantum", () => {
  describe("Encrypted continuation", () => {
    it("should create and parse encrypted continuation with MLKEM", () => {
      const { privateKeys, publicKeys } = createPQKeypairs();

      const continuation = requestContinuation();
      const envelope = continuation.seal(publicKeys);

      // The envelope shape, as the reference's `test_encrypted_continuation`
      // pins it: the `SealedMessage` summariser renders the encapsulation
      // scheme for a non-X25519 (default) recipient as `SealedMessage(<SCHEME>)`.
      expect(format(envelope)).toBe(
        ["ENCRYPTED [", "    'hasRecipient': SealedMessage(MLKEM512)", "]"].join("\n"),
      );

      // The envelope's subject should be encrypted (the outer envelope is a node with hasRecipient assertion)
      expect(envelope.subject().isEncrypted()).toBe(true);

      // Parse with valid time (30 seconds after request date)
      const validNow = new Date(requestDate().getTime() + 30 * 1000);
      const parsedContinuation = Continuation.open(envelope, {
        expectedId: requestId(),
        now: validNow,
        recipient: privateKeys,
      });

      expect(parsedContinuation.state.digest().equals(continuation.state.digest())).toBe(true);
      const expectedId = continuation.validId;
      const actualId = parsedContinuation.validId;
      if (expectedId !== undefined && actualId !== undefined) {
        expect(actualId.equals(expectedId)).toBe(true);
      } else {
        expect(actualId).toBe(expectedId);
      }
      expect(parsedContinuation.validUntil?.getTime()).toBe(continuation.validUntil?.getTime());
      expect(continuation.equals(parsedContinuation)).toBe(true);
    });

    it("should reject expired PQ continuation", () => {
      const { privateKeys, publicKeys } = createPQKeypairs();

      const continuation = requestContinuation();
      const envelope = continuation.seal(publicKeys);

      // Parse with invalid time (90 seconds after request date - expired)
      const invalidNow = new Date(requestDate().getTime() + 90 * 1000);

      expect(() => {
        Continuation.open(envelope, {
          expectedId: requestId(),
          now: invalidNow,
          recipient: privateKeys,
        });
      }).toThrow(expect.objectContaining({ code: "ContinuationExpired" }));
    });

    it("should reject PQ continuation with invalid ID", () => {
      const { privateKeys, publicKeys } = createPQKeypairs();

      const continuation = requestContinuation();
      const envelope = continuation.seal(publicKeys);

      // Parse with valid time but invalid ID
      const validNow = new Date(requestDate().getTime() + 30 * 1000);
      const invalidId = ARID.random();

      expect(() => {
        Continuation.open(envelope, {
          expectedId: invalidId,
          now: validNow,
          recipient: privateKeys,
        });
      }).toThrow(expect.objectContaining({ code: "ContinuationIdInvalid" }));
    });
  });

  describe("Sealed request", () => {
    it("should handle full PQ request/response cycle", () => {
      // Generate PQ keypairs for the server and client
      const {
        xid: server,
        privateKeys: serverPrivateKeys,
        publicKeys: serverPublicKeys,
      } = createPQXIDDocument();
      const { xid: client, privateKeys: clientPrivateKeys } = createPQXIDDocument();

      const now = requestDate();

      // Server previously sent this continuation (30 seconds ago)
      const serverResponseDate = new Date(now.getTime() - 30 * 1000);
      const serverContinuationValidUntil = new Date(serverResponseDate.getTime() + 60 * 1000);
      const serverState = new Expression(Function.named("nextPage"))
        .withParameter("fromRecord", 100)
        .withParameter("toRecord", 199);
      const serverContinuation = Continuation.from({
        state: serverState,
        validUntil: serverContinuationValidUntil,
      });
      const serverContinuationEnvelope = serverContinuation.seal(serverPublicKeys);

      // Client composes a request
      const clientContinuationValidUntil = new Date(now.getTime() + 60 * 1000);
      const clientRequest = SealedRequest.from("test", { id: requestId(), sender: client })
        .withParameter("param1", 42)
        .withParameter("param2", "hello")
        .withNote("This is a test")
        .withDate(now)
        .withState("The state of things.")
        .withPeerContinuation(serverContinuationEnvelope);

      // Create sealed envelope (signed by client with MLDSA, encrypted to server with MLKEM)
      const sealedClientRequestEnvelope = clientRequest.seal({
        validUntil: clientContinuationValidUntil,
        signer: clientPrivateKeys,
        recipients: [server],
      });

      // Server receives and parses the envelope
      const parsedClientRequest = SealedRequest.open(sealedClientRequestEnvelope, {
        recipient: serverPrivateKeys,
        now: now,
      });

      // Verify request contents
      expect(parsedClientRequest.function.id).toBe("test");
      expect(parsedClientRequest.extractParameter("param1", expectInteger)).toBe(42);
      expect(parsedClientRequest.extractParameter("param2", expectText)).toBe("hello");
      expect(parsedClientRequest.note).toBe("This is a test");
      expect(parsedClientRequest.date?.getTime()).toBe(now.getTime());

      // Server can access the continuation state
      const state = parsedClientRequest.state;
      expect(state).toBeDefined();

      // Server constructs response
      const responseState = new Expression(Function.named("nextPage"))
        .withParameter("fromRecord", 200)
        .withParameter("toRecord", 299);
      const peerContinuation = parsedClientRequest.peerContinuation;

      const serverResponse = SealedResponse.success(parsedClientRequest.id, { sender: server })
        .withResult("Records retrieved: 100-199")
        .withState(responseState)
        .withPeerContinuation(peerContinuation);

      // Create sealed response envelope
      const serverContinuationValidUntilNew = new Date(now.getTime() + 60 * 1000);
      const sealedServerResponseEnvelope = serverResponse.seal({
        validUntil: serverContinuationValidUntilNew,
        signer: serverPrivateKeys,
        recipients: [client],
      });

      // Client receives and parses the response
      const parsedServerResponse = SealedResponse.open(sealedServerResponseEnvelope, {
        recipient: clientPrivateKeys,
        expectedId: parsedClientRequest.id,
        now: now,
      });

      // Verify response
      expect(parsedServerResponse.isOk).toBe(true);
      expect(parsedServerResponse.result.expectString()).toBe("Records retrieved: 100-199");

      // Client can access the returned state
      const clientState = parsedServerResponse.state;
      expect(clientState).toBeDefined();
      expect(clientState?.expectString()).toBe("The state of things.");
    });
  });

  describe("Sealed event", () => {
    it("should handle PQ sealed event", () => {
      // Generate PQ keypairs for sender and recipient
      const { xid: sender, privateKeys: senderPrivateKeys } = createPQXIDDocument();
      const { xid: recipient, privateKeys: recipientPrivateKeys } = createPQXIDDocument();

      const now = requestDate();

      // Create sealed event
      const event = SealedEvent.from("test", { id: requestId(), sender: sender })
        .withNote("This is a test")
        .withDate(now);

      // Create sealed envelope (signed by sender with MLDSA, encrypted to recipient with MLKEM)
      const sealedEventEnvelope = event.seal({
        signer: senderPrivateKeys,
        recipients: [recipient],
      });

      // Recipient parses the event
      const parsedEvent = SealedEvent.open(sealedEventEnvelope, {
        recipient: recipientPrivateKeys,
      });

      expect(parsedEvent.content).toBe("test");
      expect(parsedEvent.note).toBe("This is a test");
      expect(parsedEvent.date?.getTime()).toBe(now.getTime());
    });
  });
});
