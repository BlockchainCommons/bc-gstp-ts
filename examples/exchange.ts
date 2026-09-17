/**
 * A request/response cycle with the client's state carried in a
 * continuation and handed back, an event, and a rejection with its code.
 *
 *   bun examples/exchange.ts
 */
import { ARID, PrivateKeyBase } from "@blockchaincommons/components";
import { expectInteger, expectText } from "@blockchaincommons/dcbor";
import { format, registerTags } from "@blockchaincommons/envelope/format";
import { XIDDocument } from "@blockchaincommons/xid";
import { GstpError, SealedEvent, SealedRequest, SealedResponse } from "@blockchaincommons/gstp";

registerTags(); // once: envelope's summarisers, so `format()` prints request(…) and event(…)

const party = (n: number): XIDDocument => {
  const base = PrivateKeyBase.from(Uint8Array.from({ length: 32 }, (_, i) => (i + n) % 256));
  return XIDDocument.from({
    inceptionKey: { publicKeys: base.schnorrPublicKeys(), privateKeys: base.schnorrPrivateKeys() },
  });
};
const keysOf = (doc: XIDDocument) => {
  const keys = doc.inceptionPrivateKeys;
  if (keys === undefined) throw new Error("the document must hold its private keys");
  return keys;
};
const client = party(1);
const server = party(2);
const now = new Date("2024-07-04T11:11:11Z");
const inAMinute = new Date(now.getTime() + 60_000);

// The client asks for records, keeping "page 1" in a continuation only it can reopen.
const id = ARID.fromHex("c66be27dbad7cd095ca77647406d07976dc0f35f0d4d654bb0e96dd227a1e9fc");
const request = SealedRequest.from("getRecords", { id, sender: client, state: "page 1" })
  .withParameter("from", 100)
  .withParameter("to", 199)
  .withDate(now);
const sealedRequest = request.toEnvelope({
  signer: keysOf(client),
  recipients: [server],
  validUntil: inAMinute,
});
console.log(format(sealedRequest));

// The server opens it: the signature verifies, the client's continuation is present and encrypted.
const opened = SealedRequest.fromEnvelope(sealedRequest, { recipient: keysOf(server), now });
const from = opened.extractObjectForParameter("from", expectInteger);
const to = opened.extractObjectForParameter("to", expectInteger);
console.log("function:", opened.function.name, "from:", from, "to:", to);

// The server answers, keeping its own state and handing the client's continuation back.
const response = SealedResponse.success(opened.id, {
  sender: server,
  state: "next page from 200",
  peerContinuation: opened.peerContinuation,
}).withResult(`records ${from}-${to}`);
const sealedResponse = response.toEnvelope({
  signer: keysOf(server),
  recipients: [client],
  validUntil: inAMinute,
});

// The client opens the response: its continuation must answer to the request id and be in date.
const answer = SealedResponse.fromEnvelope(sealedResponse, {
  recipient: keysOf(client),
  expectedId: id,
  now,
});
console.log("result:", answer.extractResult(expectText));
console.log("client state back:", answer.state?.expectString());

// An event: one-way, with the sender's state sealed for a later reply.
const event = SealedEvent.from("records read", { id, sender: client, state: "audit 1" }).withDate(
  now,
);
const sealedEvent = event.toEnvelope({ signer: keysOf(client), recipients: [server] });
const heard = SealedEvent.fromEnvelope(sealedEvent, { recipient: keysOf(server) });
console.log("event:", heard.content, "peer continuation:", heard.peerContinuation !== undefined);

// A rejection: the response opened after the continuation's deadline.
try {
  SealedResponse.fromEnvelope(sealedResponse, {
    recipient: keysOf(client),
    expectedId: id,
    now: new Date(inAMinute.getTime() + 1),
  });
} catch (e) {
  if (GstpError.isGstpError(e)) console.log("rejected:", e.code, "-", e.message);
  else throw e;
}
// And one wrapped from envelope: the wrong recipient's keys.
try {
  SealedRequest.fromEnvelope(sealedRequest, { recipient: keysOf(client) });
} catch (e) {
  if (GstpError.isGstpError(e) && e.is("Envelope"))
    console.log("rejected:", e.code, e.details.inner, "-", e.message);
  else throw e;
}
