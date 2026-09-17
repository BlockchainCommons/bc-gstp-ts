/**
 * The reference's own test cases (`main_tests.rs`): continuations, and
 * requests, responses and events sealed and opened, with their envelope
 * shapes pinned character for character.
 */
import { decryptToRecipient } from "@blockchaincommons/envelope/recipient";
import { format } from "@blockchaincommons/envelope/format";
import { ARID, PrivateKeys, generateKeypair } from "@blockchaincommons/components";
import { Expression, Function } from "@blockchaincommons/envelope/expression";
import type { Envelope } from "@blockchaincommons/envelope";
import { expectInteger, expectText } from "@blockchaincommons/dcbor";
import { XIDDocument } from "@blockchaincommons/xid";
import { SeededRng } from "@blockchaincommons/rand";
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

function responseContinuation(): Continuation {
  const validDuration = 60 * 60 * 1000; // 1 hour in milliseconds
  const validUntil = new Date(requestDate().getTime() + validDuration);
  return Continuation.from({ state: "The state of things.", validUntil: validUntil });
}

describe("Continuation", () => {
  describe("Request continuation", () => {
    it("should create and parse request continuation", () => {
      const continuation = requestContinuation();
      const envelope = continuation.toEnvelope();

      // The envelope shape, as the reference's test pins it.
      // `gstp-rust/tests/main_tests.rs::test_request_continuation`.
      // Any regression to the wrap-then-add-assertion shape, the
      // validUntil tag-1 encoding, or the ARID short description
      // would surface here.
      expect(format(envelope)).toBe(
        [
          "{",
          '    "The state of things."',
          "} [",
          "    'id': ARID(c66be27d)",
          "    'validUntil': 2024-07-04T11:12:11Z",
          "]",
        ].join("\n"),
      );

      // Parse back the continuation
      const parsedContinuation = Continuation.fromEnvelope(envelope, { expectedId: requestId() });

      expect(parsedContinuation.state.digest().equals(continuation.state.digest())).toBe(true);
      const expectedId = continuation.id;
      const actualId = parsedContinuation.id;
      if (expectedId !== undefined && actualId !== undefined) {
        expect(actualId.equals(expectedId)).toBe(true);
      } else {
        expect(actualId).toBe(expectedId);
      }
      expect(parsedContinuation.validUntil?.getTime()).toBe(continuation.validUntil?.getTime());
      expect(continuation.equals(parsedContinuation)).toBe(true);
    });
  });

  describe("Response continuation", () => {
    it("should create and parse response continuation", () => {
      const continuation = responseContinuation();
      const envelope = continuation.toEnvelope();

      // The envelope shape, as the reference's test pins it.
      // `test_response_continuation`. The response continuation has
      // no ID assertion (only validUntil).
      expect(format(envelope)).toBe(
        [
          "{",
          '    "The state of things."',
          "} [",
          "    'validUntil': 2024-07-04T12:11:11Z",
          "]",
        ].join("\n"),
      );

      // Parse back the continuation
      const parsedContinuation = Continuation.fromEnvelope(envelope, {});

      expect(parsedContinuation.state.digest().equals(continuation.state.digest())).toBe(true);
      expect(parsedContinuation.id).toBeUndefined();
      expect(parsedContinuation.validUntil?.getTime()).toBe(continuation.validUntil?.getTime());
      expect(continuation.equals(parsedContinuation)).toBe(true);
    });
  });

  describe("Encrypted continuation", () => {
    it("should create and parse encrypted continuation", () => {
      const senderPrivateKeys = PrivateKeys.random();
      const senderPublicKeys = senderPrivateKeys.publicKeys();

      const continuation = requestContinuation();
      const envelope = continuation.toEnvelope(senderPublicKeys);

      // The envelope shape, as the reference's test pins it.
      // `test_encrypted_continuation`. Universal format (no
      // key-fingerprint in this view).
      expect(format(envelope)).toBe(
        ["ENCRYPTED [", "    'hasRecipient': SealedMessage", "]"].join("\n"),
      );

      // The envelope's subject should be encrypted (the outer envelope is a node with hasRecipient assertion)
      expect(envelope.subject().isEncrypted()).toBe(true);

      // Parse with valid time (30 seconds after request date)
      const validNow = new Date(requestDate().getTime() + 30 * 1000);
      const parsedContinuation = Continuation.fromEnvelope(envelope, {
        expectedId: requestId(),
        now: validNow,
        recipient: senderPrivateKeys,
      });

      expect(parsedContinuation.state.digest().equals(continuation.state.digest())).toBe(true);
      const expectedId = continuation.id;
      const actualId = parsedContinuation.id;
      if (expectedId !== undefined && actualId !== undefined) {
        expect(actualId.equals(expectedId)).toBe(true);
      } else {
        expect(actualId).toBe(expectedId);
      }
      expect(parsedContinuation.validUntil?.getTime()).toBe(continuation.validUntil?.getTime());
      expect(continuation.equals(parsedContinuation)).toBe(true);
    });

    it("should reject expired continuation", () => {
      const senderPrivateKeys = PrivateKeys.random();
      const senderPublicKeys = senderPrivateKeys.publicKeys();

      const continuation = requestContinuation();
      const envelope = continuation.toEnvelope(senderPublicKeys);

      // Parse with invalid time (90 seconds after request date - expired)
      const invalidNow = new Date(requestDate().getTime() + 90 * 1000);

      expect(() => {
        Continuation.fromEnvelope(envelope, {
          expectedId: requestId(),
          now: invalidNow,
          recipient: senderPrivateKeys,
        });
      }).toThrow(expect.objectContaining({ code: "ContinuationExpired" }));
    });

    it("should reject continuation with invalid ID", () => {
      const senderPrivateKeys = PrivateKeys.random();
      const senderPublicKeys = senderPrivateKeys.publicKeys();

      const continuation = requestContinuation();
      const envelope = continuation.toEnvelope(senderPublicKeys);

      // Parse with valid time but invalid ID
      const validNow = new Date(requestDate().getTime() + 30 * 1000);
      const invalidId = ARID.random();

      expect(() => {
        Continuation.fromEnvelope(envelope, {
          expectedId: invalidId,
          now: validNow,
          recipient: senderPrivateKeys,
        });
      }).toThrow(expect.objectContaining({ code: "ContinuationIdInvalid" }));
    });
  });
});

describe("SealedRequest", () => {
  it("should handle full request/response cycle", () => {
    // Use deterministic RNG so XID/PublicKeys fingerprints match Rust
    // `gstp-rust/tests/main_tests.rs::test_sealed_request` exactly.
    // Server is generated first, then client, mirroring Rust's order.
    const rng = SeededRng.forTesting();
    const [serverPrivateKeys, serverPublicKeys] = generateKeypair({ rng: rng });
    const server = XIDDocument.from({
      inceptionKey: { privateKeys: serverPrivateKeys, publicKeys: serverPublicKeys },
    });

    const [clientPrivateKeys, clientPublicKeys] = generateKeypair({ rng: rng });
    const client = XIDDocument.from({
      inceptionKey: { privateKeys: clientPrivateKeys, publicKeys: clientPublicKeys },
    });

    // Sanity-check the deterministic XIDs match Rust's expected
    // values — if these ever drift, the format() pins below will
    // also fail and may need to be regenerated.
    expect(server.xid.toHex().slice(0, 8)).toBe("57a4c9d8");
    expect(client.xid.toHex().slice(0, 8)).toBe("c017c16f");

    const now = requestDate();

    // Server previously sent this continuation
    const serverResponseDate = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
    const serverContinuationValidUntil = new Date(serverResponseDate.getTime() + 60 * 1000); // Valid for 60 seconds
    const serverState = new Expression(Function.named("nextPage"))
      .withParameter("fromRecord", 100)
      .withParameter("toRecord", 199);
    const serverContinuation = Continuation.from({
      state: serverState,
      validUntil: serverContinuationValidUntil,
    });
    const serverContinuationEnvelope = serverContinuation.toEnvelope(serverPublicKeys);

    // Client composes a request
    const clientContinuationValidUntil = new Date(now.getTime() + 60 * 1000);
    const clientRequest = SealedRequest.from("test", { id: requestId(), sender: client })
      .withParameter("param1", 42)
      .withParameter("param2", "hello")
      .withNote("This is a test")
      .withDate(now)
      .withState("The state of things.")
      .withPeerContinuation(serverContinuationEnvelope);

    // The signed-but-not-encrypted envelope (no recipient, so the inner
    // shape is visible), as the reference's `test_sealed_request` pins it.
    const signedClientRequestEnvelope = clientRequest.toEnvelope({
      validUntil: clientContinuationValidUntil,
      signer: clientPrivateKeys,
    });
    expect(format(signedClientRequestEnvelope)).toBe(
      [
        "{",
        "    request(ARID(c66be27d)) [",
        "        'body': «\"test\"» [",
        '            ❰"param1"❱: 42',
        '            ❰"param2"❱: "hello"',
        "        ]",
        "        'date': 2024-07-04T11:11:11Z",
        "        'note': \"This is a test\"",
        "        'recipientContinuation': ENCRYPTED [",
        "            'hasRecipient': SealedMessage",
        "        ]",
        "        'sender': XID(c017c16f) [",
        "            'key': PublicKeys(f0d6b2fc, SigningPublicKey(c017c16f, SchnorrPublicKey(92f53715)), EncapsulationPublicKey(57b57f13, X25519PublicKey(57b57f13))) [",
        "                'allow': 'All'",
        "            ]",
        "        ]",
        "        'senderContinuation': ENCRYPTED [",
        "            'hasRecipient': SealedMessage",
        "        ]",
        "    ]",
        "} [",
        "    'signed': Signature",
        "]",
      ].join("\n"),
    );

    // Create sealed envelope (signed by client, encrypted to server)
    const sealedClientRequestEnvelope = clientRequest.toEnvelope({
      validUntil: clientContinuationValidUntil,
      signer: clientPrivateKeys,
      recipients: [server],
    });

    // Server receives and parses the envelope
    const parsedClientRequest = SealedRequest.fromEnvelope(sealedClientRequestEnvelope, {
      recipient: serverPrivateKeys,
      now: now,
    });

    // Verify request contents
    expect(parsedClientRequest.function.id).toBe("test");
    expect(parsedClientRequest.extractObjectForParameter("param1", expectInteger)).toBe(42);
    expect(parsedClientRequest.extractObjectForParameter("param2", expectText)).toBe("hello");
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

    // The signed-but-not-encrypted server response, as the reference's
    // `test_sealed_request` pins it.
    const serverContinuationValidUntilNew = new Date(now.getTime() + 60 * 1000);
    const signedServerResponseEnvelope = serverResponse.toEnvelope({
      validUntil: serverContinuationValidUntilNew,
      signer: serverPrivateKeys,
    });
    expect(format(signedServerResponseEnvelope)).toBe(
      [
        "{",
        "    response(ARID(c66be27d)) [",
        "        'recipientContinuation': ENCRYPTED [",
        "            'hasRecipient': SealedMessage",
        "        ]",
        "        'result': \"Records retrieved: 100-199\"",
        "        'sender': XID(57a4c9d8) [",
        "            'key': PublicKeys(f53a5f32, SigningPublicKey(57a4c9d8, SchnorrPublicKey(d5edb8ba)), EncapsulationPublicKey(822c6133, X25519PublicKey(822c6133))) [",
        "                'allow': 'All'",
        "            ]",
        "        ]",
        "        'senderContinuation': ENCRYPTED [",
        "            'hasRecipient': SealedMessage",
        "        ]",
        "    ]",
        "} [",
        "    'signed': Signature",
        "]",
      ].join("\n"),
    );

    // Create sealed response envelope (signed and encrypted to client)
    const sealedServerResponseEnvelope = serverResponse.toEnvelope({
      validUntil: serverContinuationValidUntilNew,
      signer: serverPrivateKeys,
      recipients: [client],
    });

    // Client receives and parses the response
    const parsedServerResponse = SealedResponse.fromEnvelope(sealedServerResponseEnvelope, {
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

  it("should handle multi-recipient requests", () => {
    // Generate keypairs for server, auditor, and client
    const serverPrivateKeys = PrivateKeys.random();
    const serverPublicKeys = serverPrivateKeys.publicKeys();
    const server = XIDDocument.from({
      inceptionKey: { privateKeys: serverPrivateKeys, publicKeys: serverPublicKeys },
    });

    const auditorPrivateKeys = PrivateKeys.random();
    const auditorPublicKeys = auditorPrivateKeys.publicKeys();
    const auditor = XIDDocument.from({
      inceptionKey: { privateKeys: auditorPrivateKeys, publicKeys: auditorPublicKeys },
    });

    const clientPrivateKeys = PrivateKeys.random();
    const clientPublicKeys = clientPrivateKeys.publicKeys();
    const client = XIDDocument.from({
      inceptionKey: { privateKeys: clientPrivateKeys, publicKeys: clientPublicKeys },
    });

    const now = requestDate();

    // Server previously provided this continuation
    const serverState = new Expression(Function.named("nextPage"))
      .withParameter("fromRecord", 100)
      .withParameter("toRecord", 199);
    const serverContinuation = Continuation.from({
      state: serverState,
      validUntil: new Date(now.getTime() + 60 * 1000),
    });
    const serverContinuationEnvelope = serverContinuation.toEnvelope(serverPublicKeys);

    // Client composes request
    const clientContinuationValidUntil = new Date(now.getTime() + 60 * 1000);
    const clientRequest = SealedRequest.from("test", { id: requestId(), sender: client })
      .withParameter("param1", 42)
      .withParameter("param2", "hello")
      .withNote("This is a test")
      .withDate(now)
      .withState("The state of things.")
      .withPeerContinuation(serverContinuationEnvelope);

    // Create sealed envelope to multiple recipients
    const recipients = [server, auditor];
    const sealedClientRequestEnvelope = clientRequest.toEnvelope({
      validUntil: clientContinuationValidUntil,
      signer: clientPrivateKeys,
      recipients: recipients,
    });

    // The envelope shape, as the reference's test pins it.
    // `test_multi_recipient_request_and_response` (request side).
    // Two `'hasRecipient'` assertions, one per recipient.
    expect(format(sealedClientRequestEnvelope)).toBe(
      [
        "ENCRYPTED [",
        "    'hasRecipient': SealedMessage",
        "    'hasRecipient': SealedMessage",
        "]",
      ].join("\n"),
    );

    // Both server and auditor can decrypt
    expect(() => {
      decryptToRecipient(sealedClientRequestEnvelope, serverPrivateKeys);
    }).not.toThrow();

    expect(() => {
      decryptToRecipient(sealedClientRequestEnvelope, auditorPrivateKeys);
    }).not.toThrow();

    // Server parses the request
    const parsedClientRequestServer = SealedRequest.fromEnvelope(sealedClientRequestEnvelope, {
      recipient: serverPrivateKeys,
      now: now,
    });

    expect(parsedClientRequestServer.extractObjectForParameter("param1", expectInteger)).toBe(42);
    expect(parsedClientRequestServer.extractObjectForParameter("param2", expectText)).toBe("hello");

    // Server creates response to multiple recipients
    const serverStateNew = new Expression(Function.named("nextPage"))
      .withParameter("fromRecord", 200)
      .withParameter("toRecord", 299);
    const peerContinuation = parsedClientRequestServer.peerContinuation;
    const serverResponse = SealedResponse.success(parsedClientRequestServer.id, { sender: server })
      .withResult("Records retrieved: 100-199")
      .withState(serverStateNew)
      .withPeerContinuation(peerContinuation);

    const responseRecipients = [client, auditor];
    const sealedServerResponseEnvelope = serverResponse.toEnvelope({
      validUntil: new Date(now.getTime() + 60 * 1000),
      signer: serverPrivateKeys,
      recipients: responseRecipients,
    });

    // The envelope shape, as the reference's test pins it.
    // `test_multi_recipient_request_and_response` (response side).
    expect(format(sealedServerResponseEnvelope)).toBe(
      [
        "ENCRYPTED [",
        "    'hasRecipient': SealedMessage",
        "    'hasRecipient': SealedMessage",
        "]",
      ].join("\n"),
    );

    // Client parses the response
    const parsedServerResponseClient = SealedResponse.fromEnvelope(sealedServerResponseEnvelope, {
      recipient: clientPrivateKeys,
      expectedId: parsedClientRequestServer.id,
      now: now,
    });

    expect(parsedServerResponseClient.result.expectString()).toBe("Records retrieved: 100-199");

    // Auditor can also decrypt
    expect(() => {
      decryptToRecipient(sealedServerResponseEnvelope, auditorPrivateKeys);
    }).not.toThrow();
  });
});

describe("SealedEvent", () => {
  it("should handle events", () => {
    // Use deterministic RNG so XID/PublicKeys fingerprints match Rust
    // `gstp-rust/tests/main_tests.rs::test_sealed_event` exactly.
    const rng = SeededRng.forTesting();
    const [senderPrivateKeys, senderPublicKeys] = generateKeypair({ rng: rng });
    const sender = XIDDocument.from({
      inceptionKey: { privateKeys: senderPrivateKeys, publicKeys: senderPublicKeys },
    });
    const [recipientPrivateKeys, recipientPublicKeys] = generateKeypair({ rng: rng });
    const recipient = XIDDocument.from({
      inceptionKey: { privateKeys: recipientPrivateKeys, publicKeys: recipientPublicKeys },
    });

    // Sanity-check the deterministic XIDs (the sender XID matches
    // Rust's `XID(57a4c9d8)` because the fake RNG is reset).
    expect(sender.xid.toHex().slice(0, 8)).toBe("57a4c9d8");

    const now = requestDate();

    // Create sealed event
    const event = SealedEvent.from("test", { id: requestId(), sender: sender })
      .withNote("This is a test")
      .withDate(now);

    // The signed-but-not-encrypted event, as the reference's
    // `test_sealed_event` pins it.
    const signedEventEnvelope = event.toEnvelope({ signer: senderPrivateKeys });
    expect(format(signedEventEnvelope)).toBe(
      [
        "{",
        "    event(ARID(c66be27d)) [",
        "        'content': \"test\"",
        "        'date': 2024-07-04T11:11:11Z",
        "        'note': \"This is a test\"",
        "        'sender': XID(57a4c9d8) [",
        "            'key': PublicKeys(f53a5f32, SigningPublicKey(57a4c9d8, SchnorrPublicKey(d5edb8ba)), EncapsulationPublicKey(822c6133, X25519PublicKey(822c6133))) [",
        "                'allow': 'All'",
        "            ]",
        "        ]",
        "    ]",
        "} [",
        "    'signed': Signature",
        "]",
      ].join("\n"),
    );

    // Create sealed envelope (signed by sender, encrypted to recipient)
    const sealedEventEnvelope = event.toEnvelope({
      signer: senderPrivateKeys,
      recipients: [recipient],
    });

    // Recipient parses the event
    const parsedEvent = SealedEvent.fromEnvelope(sealedEventEnvelope, {
      recipient: recipientPrivateKeys,
    });

    expect(parsedEvent.content).toBe("test");
    expect(parsedEvent.note).toBe("This is a test");
    expect(parsedEvent.date?.getTime()).toBe(now.getTime());
  });

  it("should handle multi-recipient events", () => {
    // Generate keypairs for sender and recipients
    const senderPrivateKeys = PrivateKeys.random();
    const senderPublicKeys = senderPrivateKeys.publicKeys();
    const sender = XIDDocument.from({
      inceptionKey: { privateKeys: senderPrivateKeys, publicKeys: senderPublicKeys },
    });

    const recipientAPrivateKeys = PrivateKeys.random();
    const recipientAPublicKeys = recipientAPrivateKeys.publicKeys();
    const recipientA = XIDDocument.from({
      inceptionKey: { privateKeys: recipientAPrivateKeys, publicKeys: recipientAPublicKeys },
    });

    const recipientBPrivateKeys = PrivateKeys.random();
    const recipientBPublicKeys = recipientBPrivateKeys.publicKeys();
    const recipientB = XIDDocument.from({
      inceptionKey: { privateKeys: recipientBPrivateKeys, publicKeys: recipientBPublicKeys },
    });

    const recipients = [recipientA, recipientB];
    const validUntil = new Date("2024-07-04T11:12:11Z");

    // Create sealed event with Expression content
    const event = SealedEvent.from(new Expression(Function.named("sync")), {
      id: requestId(),
      sender: sender,
    })
      .withNote("Escrow update")
      .withState("state");

    const sealedEventEnvelope = event.toEnvelope({
      validUntil: validUntil,
      signer: senderPrivateKeys,
      recipients: recipients,
    });

    // The envelope shape, as the reference's test pins it.
    // `test_sealed_event_multiple_recipients`.
    expect(format(sealedEventEnvelope)).toBe(
      [
        "ENCRYPTED [",
        "    'hasRecipient': SealedMessage",
        "    'hasRecipient': SealedMessage",
        "]",
      ].join("\n"),
    );

    // Both recipients can parse the event
    const parsedEventA = SealedEvent.fromEnvelope<Envelope>(sealedEventEnvelope, {
      recipient: recipientAPrivateKeys,
      expectedId: requestId(),
      content: (env) => env,
    });

    const parsedEventB = SealedEvent.fromEnvelope<Envelope>(sealedEventEnvelope, {
      recipient: recipientBPrivateKeys,
      expectedId: requestId(),
      content: (env) => env,
    });

    expect(parsedEventA.note).toBe(parsedEventB.note);
  });
});
