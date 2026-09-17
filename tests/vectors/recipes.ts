/**
 * Vector recipes: continuations (plain or encrypted, opened with an
 * expected id, a clock and a recipient; their `'id'` and `'validUntil'`
 * objects as leaves or in other shapes), and sealed requests, responses
 * and events built by a seeded sender, signed, sealed to zero, one or many
 * seeded recipients, and opened by each; parameter reads through named
 * decoders; state on a failed response; messages assembled by hand (a
 * `'sender'` missing, repeated or not a document, an unsigned body, a plain
 * sender continuation); the JavaScript input domain; and post-quantum
 * keys. Everything here draws randomness (nonces, ephemeral
 * keys, signatures), so outcomes are the envelope's format strings — the
 * signed-but-unsealed form shows the whole shape, the sealed form only
 * `ENCRYPTED` — plus the fields of the opened message, and a rejection as
 * `throw:<code>[<inner code>]|<message>`.
 */

/** A leaf value (text, number, boolean, an exact integer, a date, an ARID, bytes) or a small expression. */
export type Value =
  | string
  | number
  | boolean
  | { int: string }
  | { date: string }
  | { arid: string }
  | { bytes: string }
  | { expr: string; params?: [string, string | number][] };

/** How a parameter is read back: the reference's `extract_object_for_parameter::<T>`. */
export type Decoder = "text" | "int" | "date" | "arid" | "bytes" | "bool";

/** The object of a continuation's `'id'` or `'validUntil'` assertion when it is not a plain leaf. */
export type Shape = "wrapped" | "node" | "text";

export interface PeerSpec {
  /** The peer's state, encrypted to the peer's own encryption key (`from`). */
  state: Value;
  from: string;
  validUntil?: string;
  /** `false` leaves the continuation unencrypted (a protocol error on open). */
  encrypt?: boolean;
}

export interface OpenSpec {
  /** The recipient's seed; its private keys decrypt. */
  recipient: string;
  now?: string;
  expectedId?: string;
}

export interface SealedBase {
  /** The sender's PrivateKeyBase seed (Schnorr and X25519 keys, private keys held). */
  sender: string;
  /** ARID hex. */
  id: string;
  state?: Value;
  peer?: PeerSpec;
  /** The sender continuation's validity; ISO 8601. */
  validUntil?: string;
  /** Sign with the sender's inception private keys (default true). */
  sign?: boolean;
  /** Recipient seeds; none leaves the envelope unsealed. */
  recipients?: string[];
  /** Who opens it and when; every recipient plus a non-recipient are tried when omitted. */
  open?: OpenSpec[];
  /**
   * `"pq"`: every party holds ML-DSA44 signing and ML-KEM512 encapsulation
   * keys instead of the seed's Schnorr and X25519 keys. Neither side seeds
   * post-quantum key generation, so every 8-hex fingerprint in the outcome
   * is masked.
   */
  keys?: "pq";
}

export type Recipe =
  | {
      k: "continuation";
      state: Value;
      id?: string;
      validUntil?: string;
      encryptTo?: string;
      /** The `'id'` object's shape; a leaf unless given. */
      idShape?: Shape;
      /** The `'validUntil'` object's shape; a leaf unless given. */
      untilShape?: Shape;
      /** A second `'id'` assertion with this ARID hex. */
      duplicateId?: string;
      /** Also compares the continuation to one whose state is elided: equality is structural. */
      elided?: boolean;
      open: { expectedId?: string; now?: string; recipient?: string }[];
    }
  | {
      k: "sealedEnvelope";
      /** The class that opens it; the body is the minimal message of that kind with `id`. */
      as: "request" | "response" | "event";
      /** ARID hex of the body's id. */
      id: string;
      /** The seed whose document `senders` names and whose private keys sign. */
      by: string;
      /** The `'sender'` objects, in order: the document, or a text leaf; none leaves the assertion out. */
      senders: ("document" | "text")[];
      /** Sign the body (default true). */
      sign?: boolean;
      /** A plain-text `'senderContinuation'`, which a recipient must reject. */
      plainSenderContinuation?: boolean;
      /** Recipient seeds; the signed body is wrapped and encrypted to their keys. */
      recipients: string[];
      open: OpenSpec[];
    }
  | ({
      k: "request";
      func: string;
      params?: [string, Value][];
      note?: string;
      date?: string;
      /** Parameters read back from the opened request, each through a decoder. */
      extract?: [string, Decoder][];
    } & SealedBase)
  | ({
      k: "response";
      kind: "success" | "failure" | "earlyFailure";
      result?: Value;
      error?: Value;
      /** Sets state on the response although it is not a success. */
      stateOnFailure?: boolean;
    } & SealedBase)
  | ({ k: "event"; content: Value; note?: string; date?: string } & SealedBase)
  | {
      k: "domain";
      /** A named JavaScript-only input; see the adapter. */
      case: string;
      /** J3: a value the reference's types cannot express; J4: a surface the port reaches differently. */
      cls: "J3" | "J4";
    };
export type Outcome = string;

/** The fields of an opened message, in a fixed order. */
export interface Opened {
  summary: string;
  id: string;
  sender: string;
  state: string;
  peer: string;
  /** Kind-specific: request function/params/note/date/extract, response ok/result/error, event content/note/date. */
  detail: string;
}

export interface VectorApi {
  continuation(
    r: Extract<Recipe, { k: "continuation" }>,
    open: { expectedId?: string; now?: string; recipient?: string },
  ): { format: string; opened: string };
  /** The signed (unsealed) format, the sealed format, and one opened outcome per `open` entry. */
  sealed(r: Extract<Recipe, { sender: string }>): {
    signed: string;
    sealed: string;
    opens: { by: string; outcome: string }[];
  };
  /** The sealed format and one opened outcome per `open` entry of a hand-assembled message. */
  sealedEnvelope(r: Extract<Recipe, { k: "sealedEnvelope" }>): {
    sealed: string;
    opens: { by: string; outcome: string }[];
  };
  /** A JavaScript-only input by name; the rendered value, or it throws. */
  domain(name: string): string;
  /** `throw:<code>[<inner>]|<message>` for a thrown value. */
  errorOutcome(e: unknown): string;
}

export const unhex = (h: string): Uint8Array => Uint8Array.from(Buffer.from(h, "hex"));
export const valueName = (v: Value): string => {
  if (typeof v !== "object") return JSON.stringify(v);
  if ("expr" in v) return `${v.expr}(${(v.params ?? []).map(([k, x]) => `${k}=${x}`).join(",")})`;
  if ("int" in v) return `int:${v.int}`;
  if ("date" in v) return `date:${v.date}`;
  if ("arid" in v) return `arid:${v.arid.slice(0, 8)}`;
  return `bytes:${v.bytes}`;
};

const sealedTail = (r: Extract<Recipe, { sender: string }>): string =>
  `${r.validUntil ? ` until ${r.validUntil}` : ""}${r.sign === false ? " unsigned" : ""}${r.keys === "pq" ? " pq" : ""} → ${(r.recipients ?? []).map((s) => s.slice(0, 8)).join("+") || "nobody"}`;

export function recipeName(r: Recipe): string {
  switch (r.k) {
    case "continuation":
      return `continuation ${valueName(r.state)}${r.id ? ` id${r.idShape ? `(${r.idShape})` : ""}` : ""}${r.duplicateId ? " id×2" : ""}${r.validUntil ? ` until ${r.validUntil}${r.untilShape ? `(${r.untilShape})` : ""}` : ""}${r.encryptTo ? ` to ${r.encryptTo.slice(0, 8)}` : ""}${r.elided ? " vs elided" : ""} ×${r.open.length}`;
    case "request":
      return `request ${r.func}(${(r.params ?? []).map(([k, v]) => `${k}=${valueName(v)}`).join(",")}) from ${r.sender.slice(0, 8)}${r.state !== undefined ? ` state` : ""}${r.peer ? ` peer${r.peer.encrypt === false ? "!" : ""}` : ""}${r.extract ? ` extract ${r.extract.map(([k, d]) => `${k}:${d}`).join(",")}` : ""}${sealedTail(r)}`;
    case "response":
      return `response ${r.kind}${r.result !== undefined ? ` ${valueName(r.result)}` : ""}${r.error !== undefined ? ` !${valueName(r.error)}` : ""} from ${r.sender.slice(0, 8)}${r.state !== undefined ? " state" : ""}${r.stateOnFailure ? " state-on-failure" : ""}${r.peer ? " peer" : ""}${sealedTail(r)}`;
    case "event":
      return `event ${valueName(r.content)} from ${r.sender.slice(0, 8)}${r.state !== undefined ? " state" : ""}${r.peer ? " peer" : ""}${sealedTail(r)}`;
    case "sealedEnvelope":
      return `hand-built ${r.as} by ${r.by.slice(0, 8)} senders=${r.senders.join("+") || "none"}${r.sign === false ? " unsigned" : ""}${r.plainSenderContinuation ? " plain-continuation" : ""} → ${r.recipients.map((s) => s.slice(0, 8)).join("+")} ×${r.open.length}`;
    case "domain":
      return `domain ${r.case} (${r.cls})`;
  }
}

export const NON_RECIPIENT = "f00df00df00df00df00df00df00df00df00df00df00df00df00df00df00df00d";

/** The open attempts of a sealed recipe: the given ones, else every recipient and a stranger. */
export function opensOf(r: Extract<Recipe, { sender: string }>): OpenSpec[] {
  if (r.open !== undefined) return r.open;
  const recipients = r.recipients ?? [];
  return [...recipients.map((recipient) => ({ recipient })), { recipient: NON_RECIPIENT }];
}

/** Post-quantum keys are generated unseeded on both sides: every 8-hex fingerprint is masked. */
export const maskFingerprints = (s: string): string => s.replace(/\b[0-9a-f]{8}\b/g, "<h>");

export function materialize(api: VectorApi, r: Recipe): Outcome {
  try {
    if (r.k === "domain") return api.domain(r.case);
    if (r.k === "sealedEnvelope") {
      const s = api.sealedEnvelope(r);
      return `sealed=${s.sealed}\n${s.opens.map((o) => `open(${o.by})=${o.outcome}`).join("\n")}`;
    }
    if (r.k === "continuation") {
      return r.open
        .map((o) => {
          const c = api.continuation(r, o);
          return `format=${c.format}\nopen(${o.expectedId ? "id" : "-"},${o.now ?? "-"},${o.recipient?.slice(0, 8) ?? "-"})=${c.opened}`;
        })
        .join("\n---\n");
    }
    const s = api.sealed(r);
    const out = `signed=${s.signed}\nsealed=${s.sealed}\n${s.opens.map((o) => `open(${o.by})=${o.outcome}`).join("\n")}`;
    return r.keys === "pq" ? maskFingerprints(out) : out;
  } catch (e) {
    return api.errorOutcome(e);
  }
}

/** Engine errors word their messages per engine; report the name alone. */
export const engineNeutral = (e: unknown): string =>
  (e instanceof TypeError || e instanceof RangeError) && !("code" in e)
    ? `throw:${e.name}`
    : e instanceof Error
      ? `throw:${"code" in e ? `${e.name}[${String(e.code)}]` : e.name}|${e.message}`
      : `throw:${String(e)}`;

export const attempt = (api: VectorApi, f: () => string): string => {
  try {
    return f();
  } catch (e) {
    return api.errorOutcome(e);
  }
};

export const renderOpened = (o: Opened): string =>
  `summary=${o.summary}; id=${o.id}; sender=${o.sender}; state=${o.state}; peer=${o.peer}; ${o.detail}`;

/** Whether the frozen bundle can run a recipe: not the JavaScript-only, decoder, shape, elision, hand-built or post-quantum rows. */
export const isBaselineSupported = (r: Recipe): boolean => {
  if (r.k === "domain" || r.k === "sealedEnvelope") return false;
  if (r.k === "continuation")
    return (
      r.idShape === undefined &&
      r.untilShape === undefined &&
      r.duplicateId === undefined &&
      r.elided !== true
    );
  if (r.keys === "pq") return false;
  if (r.k === "request" && r.extract !== undefined) return false;
  if (r.k === "response" && r.stateOnFailure === true) return false;
  return true;
};
