/**
 * The adapters: the frozen bundle (the published gstp, xid, envelope and
 * components it inlines) and the working tree with the current siblings.
 * The gstp-facing adapter drives this package's surface; the sibling
 * operations (documents, keys, expressions, formatting, decoders) come
 * from a `SiblingDeps` bound to one side or the other.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ARID,
  EncapsulationPrivateKey,
  MLKEMLevel,
  PrivateKeyBase,
  PrivateKeys,
  PublicKeys,
  SignatureScheme,
  createKeypair,
} from "@blockchaincommons/components";
import {
  CborDate,
  type Cbor,
  expectBoolean,
  expectBytes,
  expectInteger,
  expectText,
} from "@blockchaincommons/dcbor";
import { Envelope } from "@blockchaincommons/envelope";
import { Expression, Function } from "@blockchaincommons/envelope/expression";
import { format, registerTags } from "@blockchaincommons/envelope/format";
import { encryptToRecipients } from "@blockchaincommons/envelope/recipient";
import { ID, VALID_UNTIL } from "@blockchaincommons/known-values";
import { XIDDocument } from "@blockchaincommons/xid";
import {
  type Decoder,
  type Recipe,
  type Shape,
  type Value,
  type VectorApi,
  type Opened,
  attempt,
  engineNeutral,
  opensOf,
  renderOpened,
  unhex,
} from "./recipes";

/** The sibling operations an adapter needs, bound to one side. */
export interface SiblingDeps {
  /** A XID document holding the seed's Schnorr and X25519 keys, private keys included. */
  docOf(seed: string): any;
  /** A XID document holding fresh ML-DSA44 and ML-KEM512 keys (unseeded). */
  pqDocOf?(): any;
  privateKeysOf(doc: any): any;
  encryptionKeyOf(doc: any): any;
  xidHex(doc: any): string;
  expression(expr: string, params: [string, string | number][]): any;
  arid(hex: string): any;
  cborDate(iso: string): any;
  format(envelope: any): string;
  formatFlat(envelope: any): string;
  envelopeFrom(value: any): any;
  functionId(fn: any): string;
  /** A continuation envelope built by hand: the wrapped state with `'id'`/`'validUntil'` objects of any shape. */
  continuationEnvelope?(
    state: any,
    id: any | undefined,
    until: any | undefined,
    encryptTo: any,
  ): any;
  /** The named decoder over a parameter's leaf, rendering the value. */
  decoder?(name: Decoder): (cbor: any) => string;
}

export async function baselineModule(): Promise<any> {
  return await import("../baseline/gstp-baseline.mjs");
}

/** Sibling operations over the frozen bundle's inlined siblings. */
export function baselineDeps(m: any): SiblingDeps {
  return {
    docOf: (seed) => {
      const b = m.PrivateKeyBase.fromData(unhex(seed));
      return m.XIDDocument.new(
        {
          type: "privateKeys",
          privateKeys: b.schnorrPrivateKeys(),
          publicKeys: b.schnorrPublicKeys(),
        },
        { type: "none" },
      );
    },
    privateKeysOf: (doc) => doc.inceptionPrivateKeys(),
    encryptionKeyOf: (doc) => doc.encryptionKey(),
    xidHex: (doc) => doc.xid().toHex(),
    expression: (expr, params) => {
      let e = new m.Expression(m.Function.newNamed(expr));
      for (const [k, x] of params) e = e.withParameter(k, x);
      return e;
    },
    arid: (hex) => m.ARID.fromHex(hex),
    cborDate: (iso) => new Date(iso),
    format: (e) => e.format(),
    formatFlat: (e) => e.formatFlat(),
    envelopeFrom: (v) => m.Envelope.new(v),
    functionId: (fn) => String(fn.id()),
  };
}

const pqKeypairs = (): { privateKeys: PrivateKeys; publicKeys: PublicKeys } => {
  const [signingPrivate, signingPublic] = createKeypair(SignatureScheme.MLDSA44);
  const [encapsulationPrivate, encapsulationPublic] = EncapsulationPrivateKey.mlkemKeypair(
    MLKEMLevel.MLKEM512,
  );
  return {
    privateKeys: PrivateKeys.from({ signing: signingPrivate, encapsulation: encapsulationPrivate }),
    publicKeys: PublicKeys.from({ signing: signingPublic, encapsulation: encapsulationPublic }),
  };
};

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
/** `Date.toISOString()`: milliseconds always present, as the harness renders the reference's dates. */
const iso = (d: Date): string => d.toISOString();

/** Sibling operations over the working tree's siblings. */
export const currentDeps: SiblingDeps = {
  docOf: (seed) => {
    const b = PrivateKeyBase.from(unhex(seed));
    return XIDDocument.from({
      inceptionKey: { publicKeys: b.schnorrPublicKeys(), privateKeys: b.schnorrPrivateKeys() },
    });
  },
  pqDocOf: () => XIDDocument.from({ inceptionKey: pqKeypairs() }),
  privateKeysOf: (doc) => doc.inceptionPrivateKeys,
  encryptionKeyOf: (doc) => doc.encryptionKey,
  xidHex: (doc) => doc.xid.toHex(),
  expression: (expr, params) => {
    let e = new Expression(Function.named(expr));
    for (const [k, x] of params) e = e.withParameter(k, x);
    return e;
  },
  arid: (hex) => ARID.fromHex(hex),
  cborDate: (iso) => CborDate.fromString(iso),
  format: (e) => format(e),
  formatFlat: (e) => format(e, { flat: true }),
  envelopeFrom: (v) => Envelope.from(v),
  functionId: (fn) => String(fn.id),
  continuationEnvelope: (state, id, until, encryptTo) => {
    let envelope = Envelope.from(state).wrap();
    for (const object of id ?? []) envelope = envelope.addAssertion(ID, object);
    if (until !== undefined) envelope = envelope.addAssertion(VALID_UNTIL, until);
    return encryptTo === undefined ? envelope : encryptToRecipients(envelope, [encryptTo]);
  },
  decoder: (name) => {
    switch (name) {
      case "text":
        return (cbor: Cbor) => JSON.stringify(expectText(cbor));
      case "int":
        return (cbor: Cbor) => String(expectInteger(cbor));
      case "date":
        return (cbor: Cbor) => iso(CborDate.fromTaggedCbor(cbor).toDate());
      case "arid":
        return (cbor: Cbor) => ARID.fromCbor(cbor).toHex();
      case "bytes":
        return (cbor: Cbor) => hex(expectBytes(cbor));
      case "bool":
        return (cbor: Cbor) => String(expectBoolean(cbor));
    }
  },
};

/** The `PascalCase` spelling of a frozen bundle's `UPPER_SNAKE` code (`XID` stays). */
const pascal = (code: string): string =>
  code === "XID"
    ? code
    : code
        .toLowerCase()
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("");

/**
 * The frozen bundle's surface of this package:
 * `SealedRequest.new(func, id, sender)`, `withX`
 * builders, zero-argument accessors, `toEnvelopeForRecipients(validUntil,
 * signer, recipients)`, `tryFromEnvelope(envelope, id, now, recipient)`.
 * Its errors carry a code and nothing the differential compares beyond it.
 */
export function baselineAdapterFor(m: any, d: SiblingDeps): VectorApi {
  const docs = new Map<string, any>();
  const docOf = (seed: string): any => {
    let doc = docs.get(seed);
    if (doc === undefined) {
      doc = d.docOf(seed);
      docs.set(seed, doc);
    }
    return doc;
  };
  const value = (v: Value): any => {
    if (typeof v !== "object") return v;
    if ("expr" in v) return d.expression(v.expr, v.params ?? []);
    throw new Error(`the frozen bundle is not driven with ${JSON.stringify(v)}`);
  };
  const date = (s: string | undefined): Date | undefined =>
    s === undefined ? undefined : new Date(s);
  const arid = (hex: string | undefined): any => (hex === undefined ? undefined : d.arid(hex));
  const flat = (env: any): string => (env === undefined ? "-" : d.formatFlat(env));
  const peerEnvelope = (r: Extract<Recipe, { sender: string }>): any => {
    if (r.peer === undefined) return undefined;
    const c = new m.Continuation(value(r.peer.state), undefined, date(r.peer.validUntil));
    return c.toEnvelope(
      r.peer.encrypt === false ? undefined : d.encryptionKeyOf(docOf(r.peer.from)),
    );
  };
  const build = (r: Extract<Recipe, { sender: string }>): any => {
    const sender = docOf(r.sender);
    const id = d.arid(r.id);
    let x: any;
    if (r.k === "request") {
      x = m.SealedRequest.new(r.func, id, sender);
      for (const [k, v] of r.params ?? []) x = x.withParameter(k, value(v));
      if (r.note !== undefined) x = x.withNote(r.note);
      if (r.date !== undefined) x = x.withDate(new Date(r.date));
    } else if (r.k === "response") {
      x =
        r.kind === "success"
          ? m.SealedResponse.newSuccess(id, sender)
          : r.kind === "failure"
            ? m.SealedResponse.newFailure(id, sender)
            : m.SealedResponse.newEarlyFailure(sender);
      if (r.result !== undefined) x = x.withResult(value(r.result));
      if (r.error !== undefined) x = x.withError(value(r.error));
    } else {
      x = m.SealedEvent.new(value(r.content), id, sender);
      if (r.note !== undefined) x = x.withNote(r.note);
      if (r.date !== undefined) x = x.withDate(new Date(r.date));
    }
    if (r.state !== undefined) x = x.withState(value(r.state));
    const peer = peerEnvelope(r);
    if (peer !== undefined) x = x.withPeerContinuation(peer);
    return x;
  };
  const openedOf = (r: Extract<Recipe, { sender: string }>, p: any): Opened => {
    const base: Opened = {
      summary: p.toString(),
      id: r.k === "response" ? (p.id() === undefined ? "-" : p.id().toHex()) : p.id().toHex(),
      sender: d.xidHex(p.sender()).slice(0, 8),
      state: flat(p.state()),
      peer: p.peerContinuation() === undefined ? "-" : flat(p.peerContinuation()),
      detail: "",
    };
    if (r.k === "request") {
      base.detail = `function=${d.functionId(p.function())}; params=${(r.params ?? []).map(([k]) => `${k}:${flat(p.objectForParameter(k))}`).join(",")}; note=${p.note()}; date=${p.date()?.toISOString() ?? "-"}`;
    } else if (r.k === "response") {
      base.detail = `ok=${p.isOk()}; ${p.isOk() ? `result=${flat(p.result())}` : `error=${flat(p.error())}`}`;
    } else {
      base.detail = `content=${flat(d.envelopeFrom(p.content()))}; note=${p.note()}; date=${p.date()?.toISOString() ?? "-"}`;
    }
    return base;
  };
  const api: VectorApi = {
    continuation: (r, open) => {
      const c = new m.Continuation(value(r.state), arid(r.id), date(r.validUntil));
      const env = c.toEnvelope(
        r.encryptTo === undefined ? undefined : d.encryptionKeyOf(docOf(r.encryptTo)),
      );
      const opened = attempt(api, () => {
        const back = m.Continuation.tryFromEnvelope(
          env,
          arid(open.expectedId),
          date(open.now),
          open.recipient === undefined ? undefined : d.privateKeysOf(docOf(open.recipient)),
        );
        return `state=${flat(back.state())}; id=${back.id()?.toHex() ?? "-"}; validUntil=${back.validUntil()?.toISOString() ?? "-"}; equals=${c.equals(back)}`;
      });
      return { format: d.format(env), opened };
    },
    sealed: (r) => {
      const x = build(r);
      const sender = docOf(r.sender);
      const signer = r.sign === false ? undefined : d.privateKeysOf(sender);
      const validUntil = date(r.validUntil);
      const signed = d.format(x.toEnvelopeForRecipients(validUntil, signer, []));
      const recipients = (r.recipients ?? []).map(docOf);
      const sealedEnv = x.toEnvelopeForRecipients(validUntil, signer, recipients);
      const opens = opensOf(r).map((o) => ({
        by: o.recipient.slice(0, 8),
        outcome: attempt(api, () => {
          const keys = d.privateKeysOf(docOf(o.recipient));
          const p =
            r.k === "request"
              ? m.SealedRequest.tryFromEnvelope(sealedEnv, arid(o.expectedId), date(o.now), keys)
              : r.k === "response"
                ? m.SealedResponse.tryFromEncryptedEnvelope(
                    sealedEnv,
                    arid(o.expectedId),
                    date(o.now),
                    keys,
                  )
                : m.SealedEvent.tryFromEnvelope(
                    sealedEnv,
                    arid(o.expectedId),
                    date(o.now),
                    keys,
                    (env: any) => env,
                  );
          return renderOpened(openedOf(r, p));
        }),
      }));
      return { signed, sealed: d.format(sealedEnv), opens };
    },
    domain: (name) => {
      throw new Error(`the frozen bundle does not run domain rows (${name})`);
    },
    errorOutcome: (e) => {
      const x: any = e;
      if (x?.name === "GstpError") return `throw:${pascal(String(x.code))}`;
      return engineNeutral(e);
    },
  };
  return api;
}

/**
 * The working tree's surface: `SealedRequest.from(func, { id, sender, state,
 * peerContinuation })`, `SealedResponse.success/failure/earlyFailure(id, { sender })`,
 * `SealedEvent.from(content, { id, sender })`, getters, `seal({ signer,
 * recipients, validUntil })`, `open(envelope, { recipient, expectedId, now })`,
 * `Continuation.from({ state, validId, validUntil })`, `seal(recipient)`,
 * `open(envelope, { recipient, now, id })`. A `GstpError` renders as
 * `throw:<code>[<inner code>]|<message>`, the inner code being the wrapped
 * envelope or xid error's.
 */
export function currentAdapterFor(m: any, d: SiblingDeps): VectorApi {
  const docs = new Map<string, any>();
  const docOf = (seed: string, pq = false): any => {
    const key = pq ? `pq:${seed}` : seed;
    let doc = docs.get(key);
    if (doc === undefined) {
      doc = pq ? d.pqDocOf?.() : d.docOf(seed);
      docs.set(key, doc);
    }
    return doc;
  };
  const value = (v: Value): any => {
    if (typeof v !== "object") return v;
    if ("expr" in v) return d.expression(v.expr, v.params ?? []);
    if ("int" in v) return BigInt(v.int);
    if ("date" in v) return d.cborDate(v.date);
    if ("arid" in v) return d.arid(v.arid);
    return unhex(v.bytes);
  };
  const date = (s: string | undefined): Date | undefined =>
    s === undefined ? undefined : new Date(s);
  const arid = (hex: string | undefined): any => (hex === undefined ? undefined : d.arid(hex));
  const flat = (env: any): string => (env === undefined ? "-" : d.formatFlat(env));
  const shaped = (shape: Shape | undefined, leaf: any, text: string): any => {
    if (shape === undefined) return leaf;
    if (shape === "text") return text;
    const env = d.envelopeFrom(leaf);
    return shape === "wrapped" ? env.wrap() : env.addAssertion("x", 1);
  };
  const peerEnvelope = (r: Extract<Recipe, { sender: string }>): any => {
    if (r.peer === undefined) return undefined;
    const c = m.Continuation.from({
      state: value(r.peer.state),
      validUntil: date(r.peer.validUntil),
    });
    return c.seal(
      r.peer.encrypt === false ? undefined : d.encryptionKeyOf(docOf(r.peer.from, r.keys === "pq")),
    );
  };
  const build = (r: Extract<Recipe, { sender: string }>): any => {
    const sender = docOf(r.sender, r.keys === "pq");
    const id = d.arid(r.id);
    const common = { sender, peerContinuation: peerEnvelope(r) };
    let x: any;
    if (r.k === "request") {
      x = m.SealedRequest.from(r.func, { id, ...common });
      for (const [k, v] of r.params ?? []) x = x.withParameter(k, value(v));
      if (r.note !== undefined) x = x.withNote(r.note);
      if (r.date !== undefined) x = x.withDate(new Date(r.date));
    } else if (r.k === "response") {
      x =
        r.kind === "success"
          ? m.SealedResponse.success(id, common)
          : r.kind === "failure"
            ? m.SealedResponse.failure(id, common)
            : m.SealedResponse.earlyFailure(common);
      if (r.result !== undefined) x = x.withResult(value(r.result));
      if (r.error !== undefined) x = x.withError(value(r.error));
      if (r.stateOnFailure === true) x = x.withState("S");
    } else {
      x = m.SealedEvent.from(value(r.content), { id, ...common });
      if (r.note !== undefined) x = x.withNote(r.note);
      if (r.date !== undefined) x = x.withDate(new Date(r.date));
    }
    if (r.state !== undefined) x = x.withState(value(r.state));
    return x;
  };
  const extracted = (p: any, k: string, decoder: Decoder): string =>
    attempt(api, () => String(p.extractParameter(k, d.decoder?.(decoder))));
  const openedOf = (r: Extract<Recipe, { sender: string }>, p: any): Opened => {
    const base: Opened = {
      summary: p.toString(),
      id: r.k === "response" ? (p.id === undefined ? "-" : p.id.toHex()) : p.id.toHex(),
      sender: d.xidHex(p.sender).slice(0, 8),
      state: flat(p.state),
      peer: p.peerContinuation === undefined ? "-" : flat(p.peerContinuation),
      detail: "",
    };
    if (r.k === "request") {
      const params = (r.params ?? [])
        .map(([k]) => `${k}:${attempt(api, () => flat(p.parameter(k)))}`)
        .join(",");
      const extract = (r.extract ?? []).map(([k, dec]) => `${k}:${dec}=${extracted(p, k, dec)}`);
      base.detail = `function=${d.functionId(p.function)}; params=${params}; note=${p.note}; date=${p.date?.toISOString() ?? "-"}${extract.length > 0 ? `; extract=${extract.join(",")}` : ""}`;
    } else if (r.k === "response") {
      base.detail = `ok=${p.isOk}; ${p.isOk ? `result=${flat(p.result)}` : `error=${flat(p.error)}`}`;
    } else {
      base.detail = `content=${flat(d.envelopeFrom(p.content))}; note=${p.note}; date=${p.date?.toISOString() ?? "-"}`;
    }
    return base;
  };
  const api: VectorApi = {
    continuation: (r, open) => {
      const c = m.Continuation.from({
        state: value(r.state),
        validId: arid(r.id),
        validUntil: date(r.validUntil),
      });
      const recipient =
        r.encryptTo === undefined ? undefined : d.encryptionKeyOf(docOf(r.encryptTo));
      const byHand =
        r.idShape !== undefined || r.untilShape !== undefined || r.duplicateId !== undefined;
      const env = byHand
        ? d.continuationEnvelope?.(
            value(r.state),
            [
              ...(r.id === undefined ? [] : [shaped(r.idShape, arid(r.id), "not an arid")]),
              ...(r.duplicateId === undefined ? [] : [arid(r.duplicateId)]),
            ],
            r.validUntil === undefined
              ? undefined
              : shaped(r.untilShape, d.cborDate(r.validUntil), "not a date"),
            recipient,
          )
        : c.seal(recipient);
      const opened = attempt(api, () => {
        const back = m.Continuation.open(env, {
          expectedId: arid(open.expectedId),
          now: date(open.now),
          recipient:
            open.recipient === undefined ? undefined : d.privateKeysOf(docOf(open.recipient)),
        });
        return `state=${flat(back.state)}; id=${back.validId?.toHex() ?? "-"}; validUntil=${back.validUntil?.toISOString() ?? "-"}; equals=${c.equals(back)}`;
      });
      return { format: d.format(env), opened };
    },
    sealed: (r) => {
      const pq = r.keys === "pq";
      const x = build(r);
      const sender = docOf(r.sender, pq);
      const signer = r.sign === false ? undefined : d.privateKeysOf(sender);
      const validUntil = date(r.validUntil);
      const signed = d.format(x.seal({ signer, validUntil }));
      const recipients = (r.recipients ?? []).map((s) => docOf(s, pq));
      const sealedEnv = x.seal({ signer, validUntil, recipients });
      const opens = opensOf(r).map((o) => ({
        by: o.recipient.slice(0, 8),
        outcome: attempt(api, () => {
          const options = {
            recipient: d.privateKeysOf(docOf(o.recipient, pq)),
            expectedId: arid(o.expectedId),
            now: date(o.now),
          };
          const p =
            r.k === "request"
              ? m.SealedRequest.open(sealedEnv, options)
              : r.k === "response"
                ? m.SealedResponse.open(sealedEnv, options)
                : m.SealedEvent.open(sealedEnv, { ...options, content: (env: any) => env });
          return renderOpened(openedOf(r, p));
        }),
      }));
      return { signed, sealed: d.format(sealedEnv), opens };
    },
    domain: (name) => {
      const sender = docOf("0000000000000000000000000000000000000000000000000000000000000001");
      const server = docOf("0000000000000000000000000000000000000000000000000000000000000002");
      const id = d.arid("c66be27dbad7cd095ca77647406d07976dc0f35f0d4d654bb0e96dd227a1e9fc");
      const request = (): any => m.SealedRequest.from("f", { id, sender });
      const sealedToServer = (): any =>
        request().seal({ signer: d.privateKeysOf(sender), recipients: [server] });
      switch (name) {
        case "continuation.validUntil.nan":
          return String(m.Continuation.from({ state: "s", validUntil: new Date(NaN) }));
        case "continuation.validFor.nan":
          return String(m.Continuation.from({ state: "s", validFor: NaN }));
        case "request.id.string":
          return d.format(m.SealedRequest.from("f", { id: "nope", sender }).seal());
        case "request.withDate.nan":
          return String(request().withDate(new Date(NaN)));
        case "open.noRecipient":
          return String(m.SealedRequest.open(sealedToServer(), {}));
        case "event.open.noContent": {
          const sealedEvent = m.SealedEvent.from("text", { id, sender }).seal({
            signer: d.privateKeysOf(sender),
            recipients: [server],
          });
          const content: unknown = m.SealedEvent.open(sealedEvent, {
            recipient: d.privateKeysOf(server),
          }).content;
          return `${typeof content}:${String(content)}`;
        }
        case "seal.validUntil.cborDate":
          return d
            .format(request().seal({ validUntil: d.cborDate("2030-01-01T00:00:00Z") }))
            .split("\n")[0];
        case "open.now.cborDate":
          return m.SealedRequest.open(sealedToServer(), {
            recipient: d.privateKeysOf(server),
            now: d.cborDate("2024-07-04T11:11:11Z"),
          }).id.toHex();
        default:
          throw new Error(`unknown domain case ${name}`);
      }
    },
    errorOutcome: (e) => {
      const x: any = e;
      if (x?.name === "GstpError") {
        const inner = x.cause?.code;
        return `throw:${String(x.code)}${inner === undefined ? "" : `[${String(inner)}]`}|${String(x.message)}`;
      }
      return engineNeutral(e);
    },
  };
  return api;
}

export async function currentModule(): Promise<any> {
  return await import("../../src");
}

/**
 * The working-tree adapter. Registers envelope's tags and summarisers first,
 * as the reference's tests and harness call `bc_envelope::register_tags()`,
 * so requests and events format as `request(…)` and `event(…)`.
 */
export async function currentAdapter(): Promise<VectorApi> {
  registerTags();
  return currentAdapterFor(await currentModule(), currentDeps);
}
