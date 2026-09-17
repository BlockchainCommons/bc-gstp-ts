# Gordian Sealed Transaction Protocol (GSTP)

### _by Leonardo Custodio_

**`bc-gstp-ts`** is a secure, authenticated, transport-agnostic request/response protocol with distributed state held in Encrypted State Continuations.

Gordian Sealed Transaction Protocol (GSTP) is a secure, transport-agnostic communication method enabling encrypted and signed data exchange between multiple parties. Built upon the Gordian Envelope specification, GSTP supports various transport mediums—including HTTP, raw TCP/IP, air-gapped protocols using QR codes, and NFC cards—by implementing its own encryption and signing protocols.

A key feature of GSTP is Encrypted State Continuations (ESC), which embed encrypted state data directly into messages, eliminating the need for local state storage and enhancing security for devices with limited storage or requiring distributed state management. It facilitates both client-server and peer-to-peer architectures, ensuring secure and flexible communication across diverse platforms.

## Installation Instructions

Install [@blockchaincommons/gstp](https://www.npmjs.com/package/@blockchaincommons/gstp) with your package manager of choice:

```sh
npm install @blockchaincommons/gstp
# or
pnpm add @blockchaincommons/gstp
# or
yarn add @blockchaincommons/gstp
# or
bun add @blockchaincommons/gstp
```

**Requirements:** TypeScript >= 5.7 is required to consume the published types. Node >= 22.12 is required.

## Usage Instructions

```typescript
import { ARID, PrivateKeyBase } from "@blockchaincommons/components";
import { expectInteger, expectText } from "@blockchaincommons/dcbor";
import { registerTags } from "@blockchaincommons/envelope/format";
import { XIDDocument } from "@blockchaincommons/xid";
import { GstpError, SealedRequest, SealedResponse } from "@blockchaincommons/gstp";

registerTags(); // once, for `format()`
const client = XIDDocument.from({ inceptionKey: PrivateKeyBase.random() });
const server = XIDDocument.from({ inceptionKey: PrivateKeyBase.random() });
const clientKeys = client.inceptionPrivateKeys!;
const serverKeys = server.inceptionPrivateKeys!;

// The client seals a request to the server, keeping its own state in a
// continuation only it can reopen; every `with…` returns a new request.
const id = ARID.random();
const request = SealedRequest.from("getRecords", { id, sender: client, state: "page 1" })
  .withParameter("from", 100)
  .withParameter("to", 199);
const sealed = request.toEnvelope({
  signer: clientKeys,
  recipients: [server],
  validUntil: new Date(Date.now() + 60_000), // or a CborDate
});

// The server opens it (signature, then the continuations, in the reference's
// order), reads the parameters through decoders, and answers, handing the
// client's continuation back.
const opened = SealedRequest.fromEnvelope(sealed, { recipient: serverKeys, now: new Date() });
const from = opened.extractObjectForParameter("from", expectInteger); // 100
const response = SealedResponse.success(opened.id, {
  sender: server,
  peerContinuation: opened.peerContinuation,
}).withResult(`records ${from}-${opened.extractObjectForParameter("to", expectInteger)}`);
const sealedResponse = response.toEnvelope({ signer: serverKeys, recipients: [client] });

// The client's continuation must answer to the request id.
const answer = SealedResponse.fromEnvelope(sealedResponse, {
  recipient: clientKeys,
  expectedId: id,
});
answer.ok?.id.equals(id); // true
answer.extractResult(expectText); // "records 100-199"
answer.state?.expectString(); // "page 1"

// Every rejection is a GstpError with the reference's code; an envelope or
// xid failure is transparent: its message, `cause` and `details.inner`.
try {
  SealedRequest.fromEnvelope(sealed, { recipient: clientKeys });
} catch (e) {
  if (GstpError.isGstpError(e) && e.is("Envelope")) e.details.inner; // "UnknownRecipient"
}
```

`fromEnvelope` checks the continuation's deadline only against the `now` you pass,
as the reference's `Option<Date>`: pass the current time to enforce expiry.
A message copies its sender document when it is built, as the reference
does, so a document edited afterwards does not reach the `'sender'`
assertion. `equals` is structural, as the reference's `PartialEq`: an
envelope and its elided form share a digest and are not equal.
Every argument is checked at the boundary: a value that is not what the API
names (a non-`ARID` id, a `Date` without a time, a missing recipient, a plain
object where a document or envelope goes) is a `TypeError` naming the
argument.

Runnable examples live in the [`examples/`](https://github.com/BlockchainCommons/bc-gstp-ts/tree/master/examples) directory: [`exchange.ts`](./examples/exchange.ts) runs a request/response cycle with a returned continuation, an event, and a rejection with its code.

## Status - Beta

`bc-gstp-ts` is currently under active development and in beta testing. It should not be used for production tasks until it has had further testing and auditing. See [Blockchain Commons' Development Phases](https://github.com/BlockchainCommons/Community/blob/master/release-path.md).

### Version History

- **1.0.0-beta.1** - Initial beta implementation.

### Roadmap

- Continued testing and auditing on the path from beta to a stable **1.0.0** release.
- Continued parity with the Rust reference implementation as it evolves (see [`tests/rust-validation/README.md`](./tests/rust-validation/README.md) for what is compared and the current result).

### Dependencies

`@blockchaincommons/gstp` depends on `@blockchaincommons/components`, `@blockchaincommons/dcbor`, `@blockchaincommons/envelope`, `@blockchaincommons/known-values` and `@blockchaincommons/xid` at runtime.

To build and work on this library, you'll need the following tools:

- [Node.js](https://nodejs.org/) >= 22.12 - JavaScript runtime.
- [Bun](https://bun.sh/) - used in CI to install dependencies and run scripts (any Node-compatible package manager also works).
- [TypeScript](https://www.typescriptlang.org/) >= 5.7 - language and type checker.

### Derived from ...

This `bc-gstp-ts` project is either derived from or was inspired by:

- [BlockchainCommons/gstp-rust](https://github.com/BlockchainCommons/gstp-rust) - The reference Rust implementation, by [Wolf McNally](https://github.com/wolfmcnally).
- [paritytech/bcts](https://github.com/paritytech/bcts) - A TypeScript port covering many Blockchain Commons' implementations, by [Parity Technologies](https://github.com/paritytech).

## Financial Support

`bc-gstp-ts` is a project of [Blockchain Commons](https://www.blockchaincommons.com/). We are proudly a "not-for-profit" social benefit corporation committed to open source & open development. Our work is funded entirely by donations and collaborative partnerships with people like you. Every contribution will be spent on building open tools, technologies, and techniques that sustain and advance blockchain and internet security infrastructure and promote an open web.

To financially support further development of `bc-gstp-ts` and other projects, please consider becoming a Patron of Blockchain Commons through ongoing monthly patronage as a [GitHub Sponsor](https://github.com/sponsors/BlockchainCommons). You can also support Blockchain Commons with bitcoins at our [BTCPay Server](https://btcpay.blockchaincommons.com/).

## Contributing

We encourage public contributions through issues and pull requests! Please review [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our development process. All contributions to this repository require a GPG signed [Contributor License Agreement](./CLA.md).

### Discussions

The best place to talk about Blockchain Commons and its projects is in our GitHub Discussions areas.

[**Gordian Developer Community**](https://github.com/BlockchainCommons/Gordian-Developer-Community/discussions). For standards and open-source developers who want to talk about interoperable wallet specifications, please use the Discussions area of the [Gordian Developer Community repo](https://github.com/BlockchainCommons/Gordian-Developer-Community/discussions). This is where you talk about Gordian specifications such as [Gordian Envelope](https://github.com/BlockchainCommons/Gordian/tree/master/Envelope#articles), [bc-shamir](https://github.com/BlockchainCommons/bc-shamir), [Sharded Secret Key Reconstruction](https://github.com/BlockchainCommons/bc-sskr), and [bc-ur](https://github.com/BlockchainCommons/bc-ur) as well as the larger [Gordian Architecture](https://github.com/BlockchainCommons/Gordian/blob/master/Docs/Overview-Architecture.md), its [Principles](https://github.com/BlockchainCommons/Gordian#gordian-principles) of independence, privacy, resilience, and openness, and its macro-architectural ideas such as functional partition (including airgapping, the original name of this community).

[**Gordian User Community**](https://github.com/BlockchainCommons/Gordian/discussions). For users of the Gordian reference apps, including [Gordian Coordinator](https://github.com/BlockchainCommons/iOS-GordianCoordinator), [Gordian Seed Tool](https://github.com/BlockchainCommons/GordianSeedTool-iOS), [Gordian Server](https://github.com/BlockchainCommons/GordianServer-macOS), [Gordian Wallet](https://github.com/BlockchainCommons/GordianWallet-iOS), and [SpotBit](https://github.com/BlockchainCommons/spotbit) as well as our whole series of [CLI apps](https://github.com/BlockchainCommons/Gordian/blob/master/Docs/Overview-Apps.md#cli-apps). This is a place to talk about bug reports and feature requests as well as to explore how our reference apps embody the [Gordian Principles](https://github.com/BlockchainCommons/Gordian#gordian-principles).

[**Blockchain Commons Discussions**](https://github.com/BlockchainCommons/Community/discussions). For developers, interns, and patrons of Blockchain Commons, please use the discussions area of the [Community repo](https://github.com/BlockchainCommons/Community) to talk about general Blockchain Commons issues, the intern program, or topics other than those covered by the [Gordian Developer Community](https://github.com/BlockchainCommons/Gordian-Developer-Community/discussions) or the 
[Gordian User Community](https://github.com/BlockchainCommons/Gordian/discussions).

### Other Questions & Problems

As an open-source, open-development community, Blockchain Commons does not have the resources to provide direct support of our projects. Please consider the discussions area as a locale where you might get answers to questions. Alternatively, please use this repository's [issues](https://github.com/BlockchainCommons/bc-gstp-ts/issues) feature. Unfortunately, we can not make any promises on response time.

If your company requires support to use our projects, please feel free to contact us directly about options. We may be able to offer you a contract for support from one of our contributors, or we might be able to point you to another entity who can offer the contractual support that you need.

### Credits

The following people directly contributed to this repository. You can add your name here by getting involved. The first step is learning how to contribute from our [CONTRIBUTING.md](./CONTRIBUTING.md) documentation.

| Name              | Role                | Github                                            | Email                                 | GPG Fingerprint                                    |
| ----------------- | ------------------- | ------------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| Christopher Allen | Principal Architect | [@ChristopherA](https://github.com/ChristopherA) | \<ChristopherA@LifeWithAlacrity.com\> | FDFE 14A5 4ECB 30FC 5D22  74EF F8D3 6C91 3574 05ED |
| Wolf McNally      | Lead Researcher/Engineer | [@wolfmcnally](https://github.com/wolfmcnally) | \<Wolf@WolfMcNally.com\> | 9436 52EE 3844 1760 C3DC  3536 4B6C 2FCF 8947 80AE |
| Leonardo Custodio | Software Engineer | [@leonardocustodio](https://github.com/leonardocustodio) | \<leonardo@snowpine.io\> | 59DA D997 67EF 3BAB 2B90 D057 5384 DEF3 B582 450D |

### Contributing Sponsor

**Gordian Sealed Transaction Protocol (GSTP) for TypeScript** was produced as a collaboration between Blockchain Commons and one of our patrons, [Parity Technologies](https://parity.io): Parity wrote the wrappers based on Blockchain Commons' specifications and reference libraries. Blockchain Commons is dedicated to not just creating open infrastructure on our own, but also coordinating the work of other companies in benefiting the Commons. Thanks to Parity for working directly with us in this manner.

![](.github/assets/parity.svg)

## Responsible Disclosure

We want to keep all of our software safe for everyone. If you have discovered a security vulnerability, we appreciate your help in disclosing it to us in a responsible manner. We are unfortunately not able to offer bug bounties at this time.

We do ask that you offer us good faith and use best efforts not to leak information or harm any user, their data, or our developer community. Please give us a reasonable amount of time to fix the issue before you publish it. Do not defraud our users or us in the process of discovery. We promise not to bring legal action against researchers who point out a problem provided they do their best to follow the these guidelines.

### Reporting a Vulnerability

Please report suspected security vulnerabilities in private via email to ChristopherA@BlockchainCommons.com (do not use this email for support). Please do NOT create publicly viewable issues for suspected security vulnerabilities.

The following keys may be used to communicate sensitive information to developers:

| Name              | Fingerprint                                        |
| ----------------- | -------------------------------------------------- |
| Christopher Allen | FDFE 14A5 4ECB 30FC 5D22  74EF F8D3 6C91 3574 05ED |

You can import a key by running the following command with that individual’s fingerprint: `gpg --recv-keys "<fingerprint>"` Ensure that you put quotes around fingerprints that contain spaces.
