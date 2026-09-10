//! Replays a vector file against the `gstp` reference at the tracked revision.
//!
//!   cargo run --release --offline -- ../vectors/vectors.json [--verbose]
//!
//! Every recipe is materialised here with the reference and compared to the
//! TypeScript outcome textually. A rejection renders on both sides as
//! `throw:<code>[<inner code>]|<message>`: the reference's error variant, the
//! variant it wraps for `Envelope` and `XID`, and its `Display`. A row the
//! reference cannot run because the input is JavaScript-only is `js-only` in
//! a named class; a row where the reference panics at a call the port rejects
//! with a typed error is `panic-mapped` when `PANIC_MAPPED` names the port's
//! code; a row whose only difference is the event summary's prefix (the
//! reference's `Display` prints `SealedRequest(` for an event) is `S1`; a row
//! whose difference is a known finding not yet fixed in the port is `pending`
//! when `PENDING` names it; a recipe field this program cannot read exactly
//! is `unparsable`. Anything else that differs is a MISMATCH. Unparsable rows
//! and mismatches make the process exit 1.
use bc_components::{
    EncapsulationScheme, Encrypter, PrivateKeyBase, PrivateKeys, PublicKeys, SignatureScheme, Signer, XIDProvider,
    ARID,
};
use bc_envelope::prelude::*;
use bc_xid::{XIDDocument, XIDGenesisMarkOptions, XIDInceptionKeyOptions};
use gstp::prelude::*;
use gstp::Error;
use known_values::DirectoryConfig;
use serde::Deserialize;
use serde_json::Value as J;
use std::collections::BTreeMap;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::mpsc;
use std::time::Duration;

// ---------------------------------------------------------------------------
// Rendering errors the way the TypeScript adapter renders them
// ---------------------------------------------------------------------------

/// The variant name of an error's `Debug` form.
fn variant(e: &impl std::fmt::Debug) -> String {
    let d = format!("{e:?}");
    d.split(|c| c == '(' || c == ' ' || c == '{').next().unwrap_or(&d).to_string()
}
/// `throw:<code>[<inner>]|<message>` for a gstp error.
fn render(e: &Error) -> String {
    let code = match e {
        Error::Envelope(inner) => format!("Envelope[{}]", variant(inner)),
        Error::XID(inner) => format!("XID[{}]", variant(inner)),
        other => variant(other),
    };
    format!("throw:{code}|{e}")
}
/// An envelope failure inside an accessor, as the reference's `Error::Envelope` wraps it.
fn render_envelope(e: bc_envelope::Error) -> String { render(&Error::Envelope(e)) }

// ---------------------------------------------------------------------------
// Reading recipes
// ---------------------------------------------------------------------------

type R<T> = std::result::Result<T, String>;

#[derive(Deserialize)]
struct File { count: usize, vectors: Vec<Vector> }
#[derive(Deserialize, Clone)]
struct Vector { name: String, recipe: J, expect: String }

const NON_RECIPIENT: &str = "f00df00df00df00df00df00df00df00df00df00df00df00df00df00df00df00d";

fn s(v: &J, k: &str) -> Option<String> { v.get(k).and_then(|x| x.as_str()).map(|x| x.to_string()) }
fn arr<'a>(v: &'a J, k: &str) -> &'a [J] { v.get(k).and_then(|a| a.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) }
fn unhex(h: &str) -> R<Vec<u8>> { hex::decode(h).map_err(|_| format!("unparsable:hex {h}")) }
fn date(iso: &str) -> R<Date> { Date::from_string(iso).map_err(|_| format!("unparsable:date {iso}")) }
fn opt_date(v: &J, k: &str) -> R<Option<Date>> { s(v, k).map(|x| date(&x)).transpose() }
fn arid(h: &str) -> R<ARID> { ARID::from_data_ref(unhex(h)?).map_err(|_| format!("unparsable:arid {h}")) }
fn opt_arid(v: &J, k: &str) -> R<Option<ARID>> { s(v, k).map(|x| arid(&x)).transpose() }
/// `Date.toISOString()`: milliseconds always present.
fn iso(d: &Date) -> String {
    let t = d.to_string();
    if t.contains('.') { t } else { t.replace('Z', ".000Z") }
}
fn short(seed: &str) -> String { seed.chars().take(8).collect() }
fn quoted(t: &str) -> String { serde_json::to_string(t).unwrap_or_default() }

thread_local! {
    /// Post-quantum documents by seed for the vector being run (each vector runs on its own thread):
    /// unseeded key generation, so the same party must keep its keys from sealing to opening.
    static PQ_DOCS: std::cell::RefCell<BTreeMap<String, XIDDocument>> = Default::default();
}
fn doc_of(seed: &str, pq: bool) -> R<XIDDocument> {
    if pq {
        return Ok(PQ_DOCS.with(|docs| {
            docs.borrow_mut()
                .entry(seed.to_string())
                .or_insert_with(|| {
                    // Unseeded on both sides: the outcome's fingerprints are masked.
                    let (private_keys, public_keys): (PrivateKeys, PublicKeys) =
                        bc_components::keypair_opt(SignatureScheme::MLDSA44, EncapsulationScheme::MLKEM512);
                    XIDDocument::new(XIDInceptionKeyOptions::PublicAndPrivateKeys(public_keys, private_keys), XIDGenesisMarkOptions::None)
                })
                .clone()
        }));
    }
    let b = PrivateKeyBase::from_data(unhex(seed)?);
    Ok(XIDDocument::new(
        XIDInceptionKeyOptions::PublicAndPrivateKeys(b.schnorr_public_keys(), b.schnorr_private_keys()),
        XIDGenesisMarkOptions::None,
    ))
}
fn private_keys(doc: &XIDDocument) -> PrivateKeys { doc.inception_private_keys().expect("a seeded document holds private keys").clone() }

/// A recipe value as an envelope: text, boolean, number, an exact integer, a date, an ARID, bytes, or an expression.
fn value_envelope(v: &J) -> R<Envelope> {
    Ok(match v {
        J::String(t) => Envelope::new(t.clone()),
        J::Bool(b) => Envelope::new(*b),
        J::Number(n) => {
            if let Some(i) = n.as_i64() { Envelope::new(i) } else { Envelope::new(n.as_f64().ok_or("unparsable:number")?) }
        }
        J::Object(o) => {
            if let Some(i) = o.get("int").and_then(|x| x.as_str()) {
                Envelope::new(i.parse::<i64>().map_err(|_| format!("unparsable:int {i}"))?)
            } else if let Some(d) = o.get("date").and_then(|x| x.as_str()) {
                Envelope::new(date(d)?)
            } else if let Some(a) = o.get("arid").and_then(|x| x.as_str()) {
                Envelope::new(arid(a)?)
            } else if let Some(b) = o.get("bytes").and_then(|x| x.as_str()) {
                Envelope::new(ByteString::from(unhex(b)?))
            } else {
                let name = o.get("expr").and_then(|x| x.as_str()).ok_or("unparsable:value object")?;
                let mut e = Expression::new(name);
                for p in o.get("params").and_then(|p| p.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
                    let k = p[0].as_str().ok_or("unparsable:param name")?;
                    match &p[1] {
                        J::String(t) => e = e.with_parameter(k, t.clone()),
                        J::Number(n) => e = e.with_parameter(k, n.as_i64().ok_or("unparsable:param number")?),
                        J::Bool(b) => e = e.with_parameter(k, *b),
                        other => return Err(format!("unparsable:param value {other}")),
                    }
                }
                e.into_envelope()
            }
        }
        other => return Err(format!("unparsable:value {other}")),
    })
}
fn flat(e: Option<&Envelope>) -> String { e.map_or("-".to_string(), |e| e.format_flat()) }

/// The object of an `'id'`/`'validUntil'` assertion in the recipe's shape.
fn shaped(shape: Option<&str>, leaf: Envelope, text: &str) -> R<Envelope> {
    Ok(match shape {
        None => leaf,
        Some("wrapped") => leaf.wrap(),
        Some("node") => leaf.add_assertion("x", 1),
        Some("text") => Envelope::new(text),
        Some(other) => return Err(format!("unparsable:shape {other}")),
    })
}

fn continuation_vector(r: &J) -> R<String> {
    let state = value_envelope(&r["state"])?;
    let id = opt_arid(r, "id")?;
    let until = opt_date(r, "validUntil")?;
    let c = Continuation::new(state.clone()).with_optional_valid_id(id).with_optional_valid_until(until);
    let encrypt_to = s(r, "encryptTo").map(|seed| doc_of(&seed, false)).transpose()?;
    let recipient_key = encrypt_to.as_ref().map(|d| d.encryption_key().expect("the document holds an encryption key") as &dyn Encrypter);
    let id_shape = s(r, "idShape");
    let until_shape = s(r, "untilShape");
    let duplicate = opt_arid(r, "duplicateId")?;
    let env = if id_shape.is_some() || until_shape.is_some() || duplicate.is_some() {
        let mut env = state.wrap();
        if let Some(id) = id { env = env.add_assertion(known_values::ID, shaped(id_shape.as_deref(), Envelope::new(id), "not an arid")?); }
        if let Some(dup) = duplicate { env = env.add_assertion(known_values::ID, dup); }
        if let Some(until) = until { env = env.add_assertion(known_values::VALID_UNTIL, shaped(until_shape.as_deref(), Envelope::new(until), "not a date")?); }
        match recipient_key { Some(k) => env.encrypt_to_recipient(k), None => env }
    } else {
        c.to_envelope(recipient_key)
    };
    let mut parts = vec![];
    for o in arr(r, "open") {
        let recipient = s(o, "recipient").map(|seed| doc_of(&seed, false).map(|d| private_keys(&d))).transpose()?;
        let opened = match Continuation::try_from_envelope(&env, opt_arid(o, "expectedId")?, opt_date(o, "now")?, recipient.as_ref()) {
            Ok(back) => {
                let equals = back.state().digest() == c.state().digest() && back.id() == c.id() && back.valid_until() == c.valid_until();
                format!(
                    "state={}; id={}; validUntil={}; equals={equals}",
                    back.state().format_flat(),
                    back.id().map_or("-".to_string(), |i| hex::encode(i.data())),
                    back.valid_until().map_or("-".to_string(), |d| iso(&d)),
                )
            }
            Err(e) => render(&e),
        };
        parts.push(format!(
            "format={}\nopen({},{},{})={opened}",
            env.format(),
            if s(o, "expectedId").is_some() { "id" } else { "-" },
            s(o, "now").unwrap_or("-".to_string()),
            s(o, "recipient").map_or("-".to_string(), |x| short(&x)),
        ));
    }
    Ok(parts.join("\n---\n"))
}

enum Built { Req(SealedRequest), Res(SealedResponse), Ev(SealedEvent<Envelope>) }

fn peer_envelope(r: &J, pq: bool) -> R<Option<Envelope>> {
    let Some(p) = r.get("peer") else { return Ok(None) };
    let c = Continuation::new(value_envelope(&p["state"])?).with_optional_valid_until(opt_date(p, "validUntil")?);
    let encrypt = p.get("encrypt").and_then(|x| x.as_bool()).unwrap_or(true);
    let doc = if encrypt { Some(doc_of(&s(p, "from").ok_or("unparsable:peer.from")?, pq)?) } else { None };
    Ok(Some(c.to_envelope(doc.as_ref().map(|d| d.encryption_key().expect("the document holds an encryption key") as &dyn Encrypter))))
}

fn build(r: &J, sender: &XIDDocument, pq: bool) -> R<Built> {
    let id = arid(&s(r, "id").ok_or("unparsable:id")?)?;
    let kind = s(r, "k").ok_or("unparsable:k")?;
    let state = r.get("state").map(value_envelope).transpose()?;
    let peer = peer_envelope(r, pq)?;
    Ok(match kind.as_str() {
        "request" => {
            let func = s(r, "func").ok_or("unparsable:func")?;
            let mut x = SealedRequest::new(func.as_str(), id, sender);
            for p in arr(r, "params") {
                x = x.with_parameter(p[0].as_str().ok_or("unparsable:param name")?, value_envelope(&p[1])?);
            }
            if let Some(n) = s(r, "note") { x = x.with_note(n); }
            if let Some(d) = opt_date(r, "date")? { x = x.with_date(d); }
            if let Some(st) = state { x = x.with_state(st); }
            if let Some(pc) = peer { x = x.with_peer_continuation(pc); }
            Built::Req(x)
        }
        "response" => {
            let mut x = match s(r, "kind").ok_or("unparsable:kind")?.as_str() {
                "success" => SealedResponse::new_success(id, sender),
                "failure" => SealedResponse::new_failure(id, sender),
                "earlyFailure" => SealedResponse::new_early_failure(sender),
                other => return Err(format!("unparsable:response kind {other}")),
            };
            if let Some(v) = r.get("result") { x = x.with_result(value_envelope(v)?); }
            if let Some(v) = r.get("error") { x = x.with_error(value_envelope(v)?); }
            // State on a response that is not a success: the reference panics (`panic-mapped`).
            if r.get("stateOnFailure").and_then(|x| x.as_bool()) == Some(true) { x = x.with_state("S"); }
            if let Some(st) = state { x = x.with_state(st); }
            x = x.with_peer_continuation(peer.as_ref());
            Built::Res(x)
        }
        "event" => {
            let mut x: SealedEvent<Envelope> = SealedEvent::new(value_envelope(&r["content"])?, id, sender);
            if let Some(n) = s(r, "note") { x = x.with_note(n); }
            if let Some(d) = opt_date(r, "date")? { x = x.with_date(d); }
            if let Some(st) = state { x = x.with_state(st); }
            if let Some(pc) = peer { x = x.with_peer_continuation(pc); }
            Built::Ev(x)
        }
        other => return Err(format!("unparsable:kind {other}")),
    })
}

fn seal(b: &Built, valid_until: Option<Date>, signer: Option<&dyn Signer>, recipients: &[&XIDDocument]) -> gstp::Result<Envelope> {
    match b {
        Built::Req(x) => x.to_envelope_for_recipients(valid_until, signer, recipients),
        Built::Res(x) => x.to_envelope_for_recipients(valid_until, signer, recipients),
        Built::Ev(x) => x.to_envelope_for_recipients(valid_until, signer, recipients),
    }
}

/// A parameter read back through the named decoder: the reference's `extract_object_for_parameter::<T>`.
fn extracted(p: &SealedRequest, k: &str, decoder: &str) -> R<String> {
    Ok(match decoder {
        "text" => p.extract_object_for_parameter::<String>(k).map(|t| quoted(&t)),
        "int" => p.extract_object_for_parameter::<i64>(k).map(|i| i.to_string()),
        "date" => p.extract_object_for_parameter::<Date>(k).map(|d| iso(&d)),
        "arid" => p.extract_object_for_parameter::<ARID>(k).map(|a| hex::encode(a.data())),
        "bytes" => p.extract_object_for_parameter::<ByteString>(k).map(|b| hex::encode(b.as_ref())),
        "bool" => p.extract_object_for_parameter::<bool>(k).map(|b| b.to_string()),
        other => return Err(format!("unparsable:decoder {other}")),
    }
    .unwrap_or_else(render_envelope))
}

fn opened(r: &J, b: &Built, env: &Envelope, o: &J, pq: bool) -> R<String> {
    let keys = private_keys(&doc_of(&s(o, "recipient").ok_or("unparsable:recipient")?, pq)?);
    let expected_id = opt_arid(o, "expectedId")?;
    let now = opt_date(o, "now")?;
    let base = |summary: String, id: String, sender: &XIDDocument, state: Option<&Envelope>, peer: Option<&Envelope>, detail: String| {
        format!("summary={summary}; id={id}; sender={}; state={}; peer={}; {detail}", &hex::encode(sender.xid().data())[..8], flat(state), flat(peer))
    };
    Ok(match b {
        Built::Req(_) => match SealedRequest::try_from_envelope(env, expected_id, now, &keys) {
            Ok(p) => {
                let mut params = vec![];
                for q in arr(r, "params") {
                    let k = q[0].as_str().ok_or("unparsable:param name")?;
                    params.push(format!("{k}:{}", p.object_for_parameter(k).map_or_else(render_envelope, |e| e.format_flat())));
                }
                let mut extract = vec![];
                for q in arr(r, "extract") {
                    let k = q[0].as_str().ok_or("unparsable:extract name")?;
                    let decoder = q[1].as_str().ok_or("unparsable:extract decoder")?;
                    extract.push(format!("{k}:{decoder}={}", extracted(&p, k, decoder)?));
                }
                // The reference's named-function `name()` is quoted; the TS `FunctionID` is the bare name.
                let function_name = p.function().name().trim_matches('"').to_string();
                let detail = format!(
                    "function={function_name}; params={}; note={}; date={}{}",
                    params.join(","),
                    p.note(),
                    p.date().map_or("-".to_string(), |d| iso(&d)),
                    if extract.is_empty() { String::new() } else { format!("; extract={}", extract.join(",")) },
                );
                base(p.to_string(), hex::encode(p.id().data()), p.sender(), p.state(), p.peer_continuation(), detail)
            }
            Err(e) => render(&e),
        },
        Built::Res(_) => match SealedResponse::try_from_encrypted_envelope(env, expected_id, now, &keys) {
            Ok(p) => {
                let detail = if p.is_ok() {
                    format!("ok=true; result={}", p.result().map_or("-".to_string(), |e| e.format_flat()))
                } else {
                    format!("ok=false; error={}", p.error().map_or("-".to_string(), |e| e.format_flat()))
                };
                base(p.to_string(), p.id().map_or("-".to_string(), |i| hex::encode(i.data())), p.sender(), p.state(), p.peer_continuation(), detail)
            }
            Err(e) => render(&e),
        },
        Built::Ev(_) => match SealedEvent::<Envelope>::try_from_envelope(env, expected_id, now, &keys) {
            Ok(p) => {
                let detail = format!(
                    "content={}; note={}; date={}",
                    p.content().format_flat(),
                    p.note(),
                    p.date().map_or("-".to_string(), |d| iso(&d)),
                );
                base(p.to_string(), hex::encode(p.id().data()), p.sender(), p.state(), p.peer_continuation(), detail)
            }
            Err(e) => render(&e),
        },
    })
}

/// Post-quantum keys are generated unseeded on both sides: every 8-hex word is masked, as the TS side masks it.
fn mask_fingerprints(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut run = String::new();
    let flush = |run: &mut String, out: &mut String| {
        if run.len() == 8 && run.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) { out.push_str("<h>"); } else { out.push_str(run); }
        run.clear();
    };
    for c in text.chars() {
        if c.is_ascii_alphanumeric() || c == '_' { run.push(c); } else { flush(&mut run, &mut out); out.push(c); }
    }
    flush(&mut run, &mut out);
    out
}

fn sealed_vector(r: &J) -> R<String> {
    let pq = s(r, "keys").as_deref() == Some("pq");
    let sender = doc_of(&s(r, "sender").ok_or("unparsable:sender")?, pq)?;
    let b = build(r, &sender, pq)?;
    let signer_keys = if r.get("sign").and_then(|x| x.as_bool()) == Some(false) { None } else { Some(private_keys(&sender)) };
    let signer = signer_keys.as_ref().map(|k| k as &dyn Signer);
    let valid_until = opt_date(r, "validUntil")?;
    let signed = match seal(&b, valid_until, signer, &[]) { Ok(e) => e.format(), Err(e) => return Ok(render(&e)) };
    let recipient_seeds: Vec<String> = arr(r, "recipients").iter().map(|x| x.as_str().unwrap_or_default().to_string()).collect();
    let recipient_docs: Vec<XIDDocument> = recipient_seeds.iter().map(|x| doc_of(x, pq)).collect::<R<_>>()?;
    let refs: Vec<&XIDDocument> = recipient_docs.iter().collect();
    let sealed = match seal(&b, valid_until, signer, &refs) { Ok(e) => e, Err(e) => return Ok(render(&e)) };
    let opens: Vec<J> = match r.get("open").and_then(|a| a.as_array()) {
        Some(a) => a.clone(),
        None => {
            let mut v: Vec<J> = recipient_seeds.iter().map(|x| serde_json::json!({ "recipient": x })).collect();
            v.push(serde_json::json!({ "recipient": NON_RECIPIENT }));
            v
        }
    };
    let mut lines = vec![format!("signed={signed}"), format!("sealed={}", sealed.format())];
    for o in &opens {
        lines.push(format!("open({})={}", short(&s(o, "recipient").ok_or("unparsable:recipient")?), opened(r, &b, &sealed, o, pq)?));
    }
    // The TS renderer joins an empty open list after a newline, leaving a trailing one.
    if opens.is_empty() { lines.push(String::new()); }
    let out = lines.join("\n");
    Ok(if pq { mask_fingerprints(&out) } else { out })
}

fn run(recipe: &J) -> R<String> {
    match s(recipe, "k").as_deref() {
        Some("continuation") => continuation_vector(recipe),
        Some("request") | Some("response") | Some("event") => sealed_vector(recipe),
        Some("domain") => Ok(format!("js-only:{}", s(recipe, "cls").ok_or("unparsable:cls")?)),
        Some(other) => Err(format!("unparsable:kind {other}")),
        None => Err("unparsable:kind".into()),
    }
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

/// (recipe kind, panic text, port code): panics the port rejects with a typed error.
const PANIC_MAPPED: &[(&str, &str, &str)] = &[
    // `with_state` on a response that is not a success panics; the port throws `StateOnFailedResponse`.
    ("response", "Cannot set state on a failed response", "StateOnFailedResponse"),
];
fn panic_mapped(kind: &str, text: &str) -> Option<&'static str> {
    PANIC_MAPPED.iter().find(|(k, needle, _)| *k == kind && text.contains(needle)).map(|(_, _, code)| *code)
}
/// (recipe kind or `*`, needle in the recipe's JSON or the port's outcome, finding): rows whose
/// difference is a known finding not yet fixed in the port.
const PENDING: &[(&str, &str, &str)] = &[];
fn pending(kind: &str, recipe: &J, want: &str) -> Option<&'static str> {
    let text = recipe.to_string();
    PENDING
        .iter()
        .find(|(k, needle, _)| (*k == kind || *k == "*") && (text.contains(needle) || want.contains(needle)))
        .map(|(_, _, what)| *what)
}
/// S1: an event's summary is printed `SealedRequest(` by the reference's `Display` (U1); every other character agrees.
fn s1(kind: &str, got: &str, want: &str) -> bool {
    kind == "event" && got.contains("summary=SealedRequest(") && got.replace("summary=SealedRequest(", "summary=SealedEvent(") == want
}
/// The port's code in a `throw:<code>[<inner>]|<message>` outcome.
fn ts_code(want: &str) -> Option<&str> {
    let rest = want.strip_prefix("throw:")?;
    Some(rest.split(|c| c == '[' || c == '|').next().unwrap_or(rest))
}
fn payload(p: Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = p.downcast_ref::<&str>() { return s.to_string(); }
    if let Some(s) = p.downcast_ref::<String>() { return s.clone(); }
    "non-string panic payload".into()
}
enum Got { Value(String), Panic(String), Hang }
fn run_guarded(v: &Vector, timeout: Duration) -> Got {
    let (tx, rx) = mpsc::channel();
    let recipe = v.recipe.clone();
    std::thread::spawn(move || {
        let got = match catch_unwind(AssertUnwindSafe(|| match run(&recipe) { Ok(s) => s, Err(e) => e })) {
            Ok(s) => Got::Value(s),
            Err(p) => Got::Panic(payload(p)),
        };
        let _ = tx.send(got);
    });
    rx.recv_timeout(timeout).unwrap_or(Got::Hang)
}

fn main() {
    // No registry directory: the vectors never depend on the runner's home.
    known_values::set_directory_config(DirectoryConfig::new()).expect("the directory configuration is set before any access");
    bc_envelope::register_tags();
    let args: Vec<String> = std::env::args().collect();
    let path = args.get(1).expect("usage: gstp-validation <vectors.json> [--verbose]");
    let verbose = args.iter().any(|a| a == "--verbose") || std::env::var("VERBOSE").is_ok();
    let file: File = serde_json::from_str(&std::fs::read_to_string(path).expect("read vectors")).expect("parse vectors");
    assert_eq!(file.count, file.vectors.len(), "the file's count must equal its vectors");
    std::panic::set_hook(Box::new(|_| {}));

    let (mut ok, mut mapped, mut js_only, mut s1_rows, mut mismatch, mut unparsable, mut pend) = (0usize, 0usize, 0usize, 0usize, 0usize, 0usize, 0usize);
    let mut js_by: BTreeMap<String, usize> = Default::default();
    let mut dump: BTreeMap<String, String> = Default::default();
    let cut = |x: &str| if verbose { x.to_string() } else { x.chars().take(200).collect::<String>() };
    let report_mismatch = |name: &str, detail: String| eprintln!("MISMATCH {name}\n  {detail}");

    for v in &file.vectors {
        let kind = s(&v.recipe, "k").unwrap_or_default();
        let want = v.expect.as_str();
        match run_guarded(v, Duration::from_secs(300)) {
            Got::Value(got) => {
                dump.insert(v.name.clone(), got.clone());
                if got == want { ok += 1; continue; }
                if let Some(class) = got.strip_prefix("js-only:") { js_only += 1; *js_by.entry(class.to_string()).or_default() += 1; continue; }
                if let Some(what) = got.strip_prefix("unparsable:") { unparsable += 1; eprintln!("UNPARSABLE {} ({what})", v.name); continue; }
                if s1(&kind, &got, want) { s1_rows += 1; continue; }
                if let Some(what) = pending(&kind, &v.recipe, want) { pend += 1; if verbose { eprintln!("PENDING {} ({what})\n  rust: {}\n  ts:   {}", v.name, cut(&got), cut(want)); } continue; }
                let (g, w): (Vec<&str>, Vec<&str>) = (got.lines().collect(), want.lines().collect());
                let line = (0..g.len().max(w.len())).find(|&i| g.get(i) != w.get(i)).unwrap_or(0);
                mismatch += 1;
                report_mismatch(&v.name, format!("[line {line}/{}]\n  rust: {}\n  ts:   {}", w.len(), cut(g.get(line).unwrap_or(&"")), cut(w.get(line).unwrap_or(&""))));
            }
            Got::Panic(text) => match panic_mapped(&kind, &text) {
                Some(code) if ts_code(want) == Some(code) => mapped += 1,
                Some(code) => {
                    if let Some(what) = pending(&kind, &v.recipe, want) { pend += 1; if verbose { eprintln!("PENDING {} ({what})\n  rust: panic {}\n  ts:   {}", v.name, cut(&text), cut(want)); } continue; }
                    mismatch += 1;
                    report_mismatch(&v.name, format!("reference panicked ({}) mapped to {code}\n  ts: {}", cut(&text), cut(want)))
                }
                None => { mismatch += 1; report_mismatch(&v.name, format!("unhandled reference panic: {}\n  ts: {}", cut(&text), cut(want))) }
            },
            Got::Hang => { mismatch += 1; report_mismatch(&v.name, format!("reference did not return within 300s\n  ts: {}", cut(want))) }
        }
    }
    if let Ok(path) = std::env::var("DUMP") { std::fs::write(path, serde_json::to_string_pretty(&dump).unwrap()).unwrap(); }
    let js_detail: Vec<String> = js_by.iter().map(|(k, n)| format!("{k} {n}")).collect();
    println!(
        "{} vectors - {ok} match, {mapped} panic-mapped, {js_only} js-only ({}), {s1_rows} S1, {pend} pending, {unparsable} unparsable, {mismatch} MISMATCH",
        file.vectors.len(), js_detail.join(", ")
    );
    std::process::exit(if mismatch == 0 && unparsable == 0 { 0 } else { 1 });
}
