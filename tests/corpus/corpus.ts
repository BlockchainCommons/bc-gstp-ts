/**
 * Differential corpus and the golden subset: the
 * reference's request/response/event cycle and multi-recipient cases,
 * continuations plain/encrypted/expired/mis-identified, every error path
 * of opening (unsigned, no peer continuation, unencrypted peer
 * continuation, wrong recipient, expired, wrong id), and generated
 * exchanges.
 */
import { NON_RECIPIENT, type Recipe, type Value } from "../vectors/recipes";

export const SEEDS: readonly string[] = [
  "7eb559bbbf6cce2632cf9f194aeb50943de7e1cbad54dcfab27a42759f5e2fed",
  "518684c556472008a67932f7c682125b50cb72e8216f6906358fdaf28d354553",
  "0000000000000000000000000000000000000000000000000000000000000001",
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
];
const [CLIENT, SERVER, AUDITOR, THIRD] = SEEDS;
export const REQUEST_ID = "c66be27dbad7cd095ca77647406d07976dc0f35f0d4d654bb0e96dd227a1e9fc";
const OTHER_ID = "9f5a4c1e2b7d8a3c6e0f1b2a3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d";
export const NOW = "2024-07-04T11:11:11Z";
const plus = (seconds: number): string =>
  new Date(Date.parse(NOW) + seconds * 1000).toISOString().replace(".000Z", "Z");

const serverState: Value = {
  expr: "nextPage",
  params: [
    ["fromRecord", 100],
    ["toRecord", 199],
  ],
};
const peer = { state: serverState, from: SERVER, validUntil: plus(30) };
type RequestRecipe = Extract<Recipe, { k: "request" }>;
const request = (
  extra: Partial<RequestRecipe> = {},
  omit: (keyof RequestRecipe)[] = [],
): Recipe => {
  const r: RequestRecipe = {
    k: "request",
    func: "test",
    params: [
      ["param1", 42],
      ["param2", "hello"],
    ],
    note: "This is a test",
    date: NOW,
    sender: CLIENT,
    id: REQUEST_ID,
    state: "The state of things.",
    peer,
    validUntil: plus(60),
    recipients: [SERVER],
    open: [{ recipient: SERVER, now: NOW }],
    ...extra,
  };
  for (const key of omit) delete r[key];
  return r;
};

/** The reference's own cases. */
export function* referenceCases(): Generator<Recipe> {
  yield {
    k: "continuation",
    state: "The state of things.",
    id: REQUEST_ID,
    validUntil: plus(60),
    open: [{ expectedId: REQUEST_ID }],
  };
  yield { k: "continuation", state: "The state of things.", validUntil: plus(3600), open: [{}] };
  yield {
    k: "continuation",
    state: "The state of things.",
    id: REQUEST_ID,
    validUntil: plus(60),
    encryptTo: SERVER,
    open: [
      { expectedId: REQUEST_ID, now: plus(30), recipient: SERVER },
      { expectedId: REQUEST_ID, now: plus(90), recipient: SERVER },
      { expectedId: OTHER_ID, now: plus(30), recipient: SERVER },
      { expectedId: REQUEST_ID, now: plus(30), recipient: CLIENT },
      { expectedId: REQUEST_ID, now: plus(30) },
    ],
  };
  yield request();
  yield request({ recipients: [], open: [] });
  yield {
    k: "response",
    kind: "success",
    result: "Records retrieved: 100-199",
    sender: SERVER,
    id: REQUEST_ID,
    state: {
      expr: "nextPage",
      params: [
        ["fromRecord", 200],
        ["toRecord", 299],
      ],
    },
    peer: { state: "The state of things.", from: CLIENT, validUntil: plus(60) },
    validUntil: plus(3600),
    recipients: [CLIENT],
    open: [{ recipient: CLIENT, now: NOW, expectedId: REQUEST_ID }],
  };
  yield request({
    recipients: [SERVER, AUDITOR],
    open: [
      { recipient: SERVER, now: NOW },
      { recipient: AUDITOR, now: NOW },
      { recipient: CLIENT, now: NOW },
    ],
  });
  yield {
    k: "event",
    content: "Something happened.",
    note: "Event note",
    date: NOW,
    sender: CLIENT,
    id: REQUEST_ID,
    state: "Event state",
    validUntil: plus(60),
    recipients: [SERVER],
    open: [{ recipient: SERVER, now: NOW }],
  };
  yield {
    k: "event",
    content: "Multi",
    sender: CLIENT,
    id: REQUEST_ID,
    recipients: [SERVER, AUDITOR, THIRD],
    open: [
      { recipient: SERVER },
      { recipient: AUDITOR },
      { recipient: THIRD },
      { recipient: NON_RECIPIENT },
    ],
  };
}

export function* hand(): Generator<Recipe> {
  yield* referenceCases();
  // Continuation shapes: no id, no validity, expression state, plain vs encrypted.
  yield {
    k: "continuation",
    state: serverState,
    open: [{}, { now: NOW }, { expectedId: OTHER_ID }],
  };
  yield {
    k: "continuation",
    state: 42,
    id: OTHER_ID,
    open: [{ expectedId: OTHER_ID }, { expectedId: REQUEST_ID }, {}],
  };
  yield {
    k: "continuation",
    state: "s",
    validUntil: NOW,
    open: [{ now: NOW }, { now: plus(-1) }, {}],
  };
  yield {
    k: "continuation",
    state: "s",
    encryptTo: CLIENT,
    open: [{ recipient: CLIENT }, { recipient: SERVER }, {}],
  };
  // Request error paths.
  yield request({ sign: false });
  yield request({}, ["peer"]);
  yield request({ peer: { ...peer, encrypt: false } });
  yield request({ open: [{ recipient: SERVER, now: plus(120) }] });
  yield request({ open: [{ recipient: SERVER, now: NOW, expectedId: OTHER_ID }] });
  yield request({ open: [{ recipient: SERVER, now: NOW, expectedId: REQUEST_ID }] });
  yield request({}, ["state", "validUntil"]);
  yield request({ params: [] }, ["note", "date"]);
  yield request({
    params: [
      ["nested", serverState],
      ["flag", true],
    ],
  });
  // Responses of every kind, with and without state/peer/signature.
  for (const kind of ["success", "failure", "earlyFailure"] as const)
    for (const withState of [false, true]) {
      yield {
        k: "response",
        kind,
        ...(kind === "success" ? { result: "ok" } : kind === "failure" ? { error: "bad" } : {}),
        sender: SERVER,
        id: REQUEST_ID,
        ...(withState ? { state: "S", validUntil: plus(60) } : {}),
        recipients: [CLIENT],
        open: [{ recipient: CLIENT, now: NOW }],
      };
    }
  yield {
    k: "response",
    kind: "success",
    result: serverState,
    sender: SERVER,
    id: REQUEST_ID,
    peer: { state: "p", from: CLIENT },
    sign: false,
    recipients: [CLIENT],
    open: [{ recipient: CLIENT }],
  };
  yield {
    k: "response",
    kind: "success",
    result: "late",
    sender: SERVER,
    id: REQUEST_ID,
    state: "S",
    validUntil: plus(60),
    recipients: [CLIENT],
    open: [{ recipient: CLIENT, now: plus(120) }],
  };
  yield {
    k: "response",
    kind: "failure",
    error: "e",
    sender: SERVER,
    id: REQUEST_ID,
    recipients: [],
    open: [],
  };
  // Events: state only, validUntil only, unsigned, no recipients.
  yield {
    k: "event",
    content: "v",
    sender: CLIENT,
    id: REQUEST_ID,
    validUntil: plus(60),
    recipients: [SERVER],
    open: [
      { recipient: SERVER, now: NOW },
      { recipient: SERVER, now: plus(120) },
    ],
  };
  yield {
    k: "event",
    content: serverState,
    sender: CLIENT,
    id: REQUEST_ID,
    sign: false,
    recipients: [SERVER],
    open: [{ recipient: SERVER }],
  };
  yield { k: "event", content: 7, sender: CLIENT, id: REQUEST_ID, recipients: [], open: [] };
  yield {
    k: "event",
    content: "peer",
    sender: CLIENT,
    id: REQUEST_ID,
    peer: { state: "ps", from: SERVER, encrypt: false },
    recipients: [SERVER],
    open: [{ recipient: SERVER }],
  };
  // Continuation fields that are not plain leaves: an id or deadline that is
  // wrapped, a node with an assertion, or text; two ids.
  yield {
    k: "continuation",
    state: "s",
    id: REQUEST_ID,
    idShape: "wrapped",
    open: [{ expectedId: REQUEST_ID }, {}],
  };
  yield {
    k: "continuation",
    state: "s",
    id: REQUEST_ID,
    idShape: "node",
    open: [{ expectedId: REQUEST_ID }, { expectedId: OTHER_ID }],
  };
  yield { k: "continuation", state: "s", id: REQUEST_ID, idShape: "text", open: [{}] };
  yield {
    k: "continuation",
    state: "s",
    validUntil: NOW,
    untilShape: "wrapped",
    open: [{ now: plus(3600) }, {}],
  };
  yield {
    k: "continuation",
    state: "s",
    validUntil: NOW,
    untilShape: "node",
    open: [{ now: plus(-1) }, { now: plus(1) }],
  };
  yield { k: "continuation", state: "s", validUntil: NOW, untilShape: "text", open: [{}] };
  yield {
    k: "continuation",
    state: "s",
    id: REQUEST_ID,
    duplicateId: OTHER_ID,
    open: [{}, { expectedId: REQUEST_ID }],
  };
  yield {
    k: "continuation",
    state: "s",
    id: REQUEST_ID,
    idShape: "wrapped",
    encryptTo: SERVER,
    open: [{ expectedId: REQUEST_ID, recipient: SERVER }],
  };
  // Parameters read back through decoders: exact integers, dates, ARIDs,
  // bytes, booleans; a missing, a duplicated and a nested parameter; the
  // wrong decoder.
  yield request({
    params: [
      ["p", 42],
      ["big", { int: "1152921504606846977" }],
      ["neg", { int: "-9007199254740993" }],
      ["dup", 1],
      ["dup", 2],
      ["nested", serverState],
      ["when", { date: "2024-07-04T11:11:11Z" }],
      ["who", { arid: OTHER_ID }],
      ["raw", { bytes: "0102ff" }],
      ["flag", true],
    ],
    extract: [
      ["p", "int"],
      ["p", "text"],
      ["big", "int"],
      ["big", "text"],
      ["neg", "int"],
      ["missing", "text"],
      ["dup", "int"],
      ["nested", "text"],
      ["when", "date"],
      ["when", "int"],
      ["who", "arid"],
      ["who", "text"],
      ["raw", "bytes"],
      ["flag", "bool"],
      ["flag", "int"],
    ],
  });
  // State on a response that is not a success.
  for (const kind of ["failure", "earlyFailure"] as const) {
    yield {
      k: "response",
      kind,
      ...(kind === "failure" ? { error: "e" } : {}),
      sender: SERVER,
      id: REQUEST_ID,
      stateOnFailure: true,
      recipients: [CLIENT],
      open: [],
    };
  }
  // The JavaScript input domain.
  for (const [name, cls] of [
    ["continuation.validUntil.nan", "J3"],
    ["continuation.validFor.nan", "J3"],
    ["request.id.string", "J3"],
    ["request.withDate.nan", "J3"],
    ["open.noRecipient", "J3"],
    ["event.open.noContent", "J4"],
    ["seal.validUntil.cborDate", "J4"],
    ["open.now.cborDate", "J4"],
  ] as const) {
    yield { k: "domain", case: name, cls };
  }
  // Post-quantum keys (ML-DSA44 signing, ML-KEM512 encapsulation), as the
  // reference's `pq_tests.rs`: a request cycle, a response and an event.
  yield request({ keys: "pq" });
  yield {
    k: "response",
    kind: "success",
    result: "Records retrieved: 100-199",
    sender: SERVER,
    id: REQUEST_ID,
    state: "S",
    peer: { state: "The state of things.", from: CLIENT, validUntil: plus(60) },
    validUntil: plus(3600),
    recipients: [CLIENT],
    keys: "pq",
    open: [{ recipient: CLIENT, now: NOW, expectedId: REQUEST_ID }],
  };
  yield {
    k: "event",
    content: "Something happened.",
    note: "Event note",
    date: NOW,
    sender: CLIENT,
    id: REQUEST_ID,
    state: "Event state",
    validUntil: plus(60),
    recipients: [SERVER],
    keys: "pq",
    open: [{ recipient: SERVER, now: NOW }],
  };
}

function* prng(seed: number): Generator<number> {
  let x = seed >>> 0 || 1;
  for (;;) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    yield x;
  }
}

export function* generated(): Generator<Recipe> {
  const g = prng(0x6e57);
  const next = (): number => g.next().value as number;
  const pick = <T>(xs: readonly T[]): T => xs[next() % xs.length];
  const values: Value[] = ["x", 1, true, serverState, { expr: "f", params: [["a", "b"]] }];
  for (let i = 0; i < 120; i++) {
    const kind = pick(["request", "response", "event"] as const);
    const sender = pick(SEEDS);
    const recipients = [...new Set(Array.from({ length: next() % 3 }, () => pick(SEEDS)))].filter(
      (s) => s !== sender,
    );
    const validUntil = next() % 2 === 0 ? plus(60 * (1 + (next() % 3))) : undefined;
    const nowOffset = next() % 4 === 0 ? 3600 : next() % 60;
    const open = recipients.map((recipient) => ({
      recipient,
      now: plus(nowOffset),
      ...(next() % 3 === 0 ? { expectedId: pick([REQUEST_ID, OTHER_ID]) } : {}),
    }));
    const base = {
      sender,
      id: pick([REQUEST_ID, OTHER_ID]),
      ...(next() % 2 === 0 ? { state: pick(values) } : {}),
      ...(next() % 2 === 0
        ? {
            peer: {
              state: pick(values),
              from: pick(recipients.length ? recipients : SEEDS),
              ...(next() % 2 === 0 ? { validUntil: plus(30) } : {}),
            },
          }
        : {}),
      ...(validUntil !== undefined ? { validUntil } : {}),
      ...(next() % 7 === 0 ? { sign: false } : {}),
      recipients,
      open,
    };
    if (kind === "request") {
      yield {
        k: "request",
        func: pick(["test", "getRecords", "ping"]),
        params: Array.from(
          { length: next() % 3 },
          (_, j) => [`p${j}`, pick(values)] as [string, Value],
        ),
        ...(next() % 2 === 0 ? { note: `note ${i}` } : {}),
        ...(next() % 2 === 0 ? { date: NOW } : {}),
        ...base,
      };
    } else if (kind === "response") {
      const rk = pick(["success", "failure", "earlyFailure"] as const);
      yield {
        k: "response",
        kind: rk,
        ...(rk === "success"
          ? { result: pick(values) }
          : rk === "failure"
            ? { error: pick(values) }
            : {}),
        ...base,
      };
    } else {
      yield {
        k: "event",
        content: pick(values),
        ...(next() % 2 === 0 ? { note: `n${i}` } : {}),
        ...base,
      };
    }
  }
}

export const categories: Record<string, () => Generator<Recipe>> = {
  hand: () => hand(),
  generated: () => generated(),
};

/** The golden set: every hand-written recipe and every generated one. */
export function* goldenRecipes(): Generator<Recipe> {
  yield* hand();
  yield* generated();
}
