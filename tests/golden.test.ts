/**
 * Golden snapshot: the reference's cases and every hand-written
 * exchange, as format strings and opened fields; plus a second suite of
 * freeze snapshots for behaviour the vector corpus does not reach — a
 * continuation whose `'id'` or `'validUntil'` object is not a leaf,
 * envelope failures surfacing as `GstpError`, decoder-based parameter
 * extraction, `StateOnFailedResponse`, the JavaScript input domain,
 * immutable builders, whole-document equality, and the frozen error
 * tables and guard. Reviewable, auto-updatable with -u.
 */
import { ARID, PrivateKeyBase } from "@blockchaincommons/components";
import { CborDate, expectInteger, expectText } from "@blockchaincommons/dcbor";
import { Envelope, EnvelopeError, type EnvelopeInput } from "@blockchaincommons/envelope";
import { Expression, Function } from "@blockchaincommons/envelope/expression";
import { format } from "@blockchaincommons/envelope/format";
import { encryptSubjectToRecipients } from "@blockchaincommons/envelope/recipient";
import { sign } from "@blockchaincommons/envelope/signature";
import { ID, SENDER, VALID_UNTIL } from "@blockchaincommons/known-values";
import { XIDDocument } from "@blockchaincommons/xid";
import { describe, it, expect } from "vitest";
import {
  Continuation,
  GSTP_ERROR_CODES,
  GstpError,
  SealedEvent,
  SealedRequest,
  SealedResponse,
} from "../src";
import { materialize, recipeName } from "./vectors/recipes";
import { currentAdapter } from "./vectors/deps";
import { referenceCases, hand } from "./corpus/corpus";

const api = await currentAdapter();

describe("golden", () => {
  it("reference cases", () => {
    const rows = [...referenceCases()].map((r) => `## ${recipeName(r)}\n${materialize(api, r)}`);
    expect(rows.length).toBeGreaterThan(6);
    expect(rows).toMatchSnapshot();
  });
  it("hand-written exchanges", () => {
    const rows = [...hand()].map((r) => `## ${recipeName(r)}\n${materialize(api, r)}`);
    expect(rows.length).toBeGreaterThan(25);
    expect(rows).toMatchSnapshot();
  });
});

const must = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("expected a value");
  return value;
};
const base = (n: number): PrivateKeyBase =>
  PrivateKeyBase.from(Uint8Array.from({ length: 32 }, () => n));
const docOf = (b: PrivateKeyBase): XIDDocument =>
  XIDDocument.from({
    inceptionKey: { publicKeys: b.schnorrPublicKeys(), privateKeys: b.schnorrPrivateKeys() },
  });
const client = docOf(base(1));
const server = docOf(base(2));
const stranger = docOf(base(3));
const keysOf = (doc: XIDDocument): NonNullable<XIDDocument["inceptionPrivateKeys"]> =>
  must(doc.inceptionPrivateKeys);
const id = ARID.fromHex("c66be27dbad7cd095ca77647406d07976dc0f35f0d4d654bb0e96dd227a1e9fc");
const otherId = ARID.fromHex("9f5a4c1e2b7d8a3c6e0f1b2a3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d");
const now = new Date("2024-07-04T11:11:11Z");
const later = new Date("2030-01-01T00:00:00Z");

const render = (v: unknown): string => {
  if (v === undefined) return "undefined";
  if (v instanceof Envelope) return `Envelope(${format(v, { flat: true })})`;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof ARID) return `ARID(${v.toHex().slice(0, 8)})`;
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "object" && v !== null) return `${v.constructor.name}(${String(v)})`;
  return `${typeof v}:${String(v)}`;
};
const errorName = (e: unknown): string => {
  if (GstpError.isGstpError(e)) return `GstpError[${e.code}]`;
  if (EnvelopeError.isEnvelopeError(e)) return `EnvelopeError[${e.code}]`;
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    return code === undefined ? e.name : `${e.name}[${String(code)}]`;
  }
  return String(e);
};
const outcome = (f: () => unknown): string => {
  try {
    return render(f());
  } catch (e) {
    return `throw:${errorName(e)}|${e instanceof Error ? e.message : String(e)}`;
  }
};
const rows = (cases: Record<string, () => unknown>): string[] =>
  Object.entries(cases).map(([label, f]) => `${label} = ${outcome(f)}`);

const request = (): SealedRequest =>
  SealedRequest.from("f", { id, sender: client })
    .withParameter("p", 42)
    .withParameter("big", 2n ** 60n + 1n)
    .withParameter("dup", 1)
    .withParameter("dup", 2)
    .withParameter("nested", new Expression(Function.named("g")));
const sealedTo = (recipient: XIDDocument, signed = true): Envelope =>
  SealedRequest.from("f", { id, sender: client }).seal({
    ...(signed ? { signer: keysOf(client) } : {}),
    recipients: [recipient],
  });

describe("freeze", () => {
  it("continuation fields that are not leaves", () => {
    const wrapped = (predicate: EnvelopeInput, object: Envelope): Envelope =>
      Envelope.from("s").wrap().addAssertion(predicate, object);
    expect(
      rows({
        "wrapped id, opened with it": () =>
          Continuation.open(wrapped(ID, Envelope.from(id).wrap()), { expectedId: id }).validId,
        "id with an assertion, opened with another id": () =>
          Continuation.open(wrapped(ID, Envelope.from(id).addAssertion("x", 1)), {
            expectedId: otherId,
          }).validId,
        "wrapped validUntil, opened later": () =>
          Continuation.open(wrapped(VALID_UNTIL, Envelope.from(CborDate.fromDate(now)).wrap()), {
            now: later,
          }).validUntil,
        "validUntil that is not a date": () =>
          Continuation.open(wrapped(VALID_UNTIL, Envelope.from("not a date"))),
        "id that is not an ARID": () =>
          Continuation.open(wrapped(ID, Envelope.from("not an arid"))),
        "two ids": () =>
          Continuation.open(
            Envelope.from("s").wrap().addAssertion(ID, id).addAssertion(ID, otherId),
          ),
        "not wrapped": () => Continuation.open(Envelope.from("s")),
      }),
    ).toMatchSnapshot();
  });

  it("envelope failures and parameter extraction", () => {
    const r = request();
    expect(
      rows({
        "parameter(dup)": () => r.parameter("dup"),
        "extractParameter(dup)": () => r.extractParameter("dup", expectInteger),
        "extractParameters(dup)": () =>
          r.extractParameters("dup", expectInteger).map(render).join(","),
        "extractParameter(nested)": () => r.extractParameter("nested", expectText),
        "extractParameter(missing)": () => r.extractParameter("missing", expectText),
        "extractOptionalParameter(missing)": () =>
          r.extractOptionalParameter("missing", expectText),
        "extractParameters(p, expectInteger)[0]": () => r.extractParameters("p", expectInteger)[0],
        "extractParameter(big, expectInteger)": () => r.extractParameter("big", expectInteger),
        "extractParameter(p, expectText)": () => r.extractParameter("p", expectText),
        "objectForParameter(missing)": () => r.objectForParameter("missing"),
        "failure.result": () => SealedResponse.failure(id, { sender: client }).result,
        "success.error": () => SealedResponse.success(id, { sender: client }).error,
      }),
    ).toMatchSnapshot();
  });

  it("wrapped-error messages", () => {
    const bogusSender = encryptSubjectToRecipients(
      sign(Envelope.from("body").addAssertion(SENDER, "nope"), keysOf(client)).wrap(),
      [must(server.encryptionKey)],
    );
    expect(
      rows({
        "wrong recipient": () =>
          SealedRequest.open(sealedTo(server), { recipient: keysOf(stranger) }),
        "unsigned message": () =>
          SealedRequest.open(sealedTo(server, false), { recipient: keysOf(server) }),
        "numeric event content read as text": () =>
          SealedEvent.open(
            SealedEvent.from(7, { id, sender: client }).seal({
              signer: keysOf(client),
              recipients: [server],
            }),
            { recipient: keysOf(server) },
          ),
        "sender that is not a document": () =>
          SealedRequest.open(bogusSender, { recipient: keysOf(server) }),
      }),
    ).toMatchSnapshot();
  });

  it("state on a failed response", () => {
    expect(
      rows({
        "failure.withState": () => SealedResponse.failure(id, { sender: client }).withState("x"),
        "failure with state": () => SealedResponse.failure(id, { sender: client, state: "x" }),
        "earlyFailure.withState": () =>
          SealedResponse.earlyFailure({ sender: client }).withState("x"),
      }),
    ).toMatchSnapshot();
  });

  it("the JavaScript input domain", () => {
    const sealed = sealedTo(server);
    expect(
      rows({
        "Continuation.from validUntil NaN": () =>
          Continuation.from({ state: "s", validUntil: new Date(NaN) }),
        "Continuation.from validFor NaN": () => Continuation.from({ state: "s", validFor: NaN }),
        "SealedRequest.from id string": () =>
          SealedRequest.from("f", { id: "nope" as never, sender: client }).seal(),
        "withDate NaN": () =>
          SealedRequest.from("f", { id, sender: client }).withDate(new Date(NaN)),
        "open without recipient": () => SealedRequest.open(sealed, {} as never),
        "SealedEvent.open without content": () =>
          SealedEvent.open(
            SealedEvent.from("text", { id, sender: client }).seal({
              signer: keysOf(client),
              recipients: [server],
            }),
            { recipient: keysOf(server) },
          ).content,
        "seal validUntil CborDate": () =>
          format(
            SealedRequest.from("f", { id, sender: client }).seal({
              validUntil: CborDate.fromDate(later) as never,
            }),
            { flat: true },
          ).slice(0, 40),
        "open now CborDate": () =>
          SealedRequest.open(sealed, {
            recipient: keysOf(server),
            now: CborDate.fromDate(now) as never,
          }).id,
      }),
    ).toMatchSnapshot();
  });

  it("builders, equality, tables and the guard", () => {
    const a = SealedRequest.from("f", { id, sender: client });
    const b = a.withNote("note");
    const withMethod = docOf(base(1));
    withMethod.addResolutionMethod("https://resolver.example.com");
    expect(
      rows({
        "a.withNote(note) changes a": () => `${a === b} ${JSON.stringify(a.note)}`,
        "equals across documents with the same XID": () =>
          SealedRequest.from("f", { id, sender: client }).equals(
            SealedRequest.from("f", { id, sender: withMethod }),
          ),
        "XIDDocument.equals of those documents": () => client.equals(withMethod),
        "GSTP_ERROR_CODES frozen": () => Object.isFrozen(GSTP_ERROR_CODES),
        "details frozen": () => Object.isFrozen(GstpError.continuationExpired().details),
        "forged error passes the guard": () =>
          GstpError.isGstpError(Object.assign(new Error("x"), { name: "GstpError", code: "Nope" })),
        "envelope(cause) message": () => GstpError.envelope(new Error("boom")).message,
      }),
    ).toMatchSnapshot();
  });
});
