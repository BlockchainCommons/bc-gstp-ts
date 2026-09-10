/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 * The JavaScript boundary: an argument that is not what the reference's
 * types demand is a `TypeError` naming it, never a crash three layers down
 * or a value stored as if it were right.
 */

import { ARID, type Decrypter } from "@blockchaincommons/components";
import { CborDate } from "@blockchaincommons/dcbor";
import { Envelope } from "@blockchaincommons/envelope";
import { XIDDocument } from "@blockchaincommons/xid";

/** A date as a JavaScript `Date` (to the millisecond) or a `CborDate` (exact). */
export type DateInput = Date | CborDate;

/** `value` is an `ARID`, else a `TypeError`. */
export function expectArid(value: unknown, name: string): ARID {
  if (value instanceof ARID) return value;
  throw new TypeError(`${name} must be an ARID`);
}

/** `value` is a `Date` holding a time or a `CborDate`, else a `TypeError`. */
export function expectDateInput(value: unknown, name: string): DateInput {
  if (value instanceof CborDate) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  throw new TypeError(`${name} must be a valid Date or a CborDate`);
}

/** `value` is a finite, non-negative number of milliseconds, else a `TypeError`. */
export function expectDuration(value: unknown, name: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  throw new TypeError(`${name} must be a finite, non-negative number of milliseconds`);
}

/** `value` is an `XIDDocument`, else a `TypeError`. */
export function expectDocument(value: unknown, name: string): XIDDocument {
  if (value instanceof XIDDocument) return value;
  throw new TypeError(`${name} must be an XIDDocument`);
}

/** `value` is an `Envelope`, else a `TypeError`. */
export function expectEnvelope(value: unknown, name: string): Envelope {
  if (value instanceof Envelope) return value;
  throw new TypeError(`${name} must be an Envelope`);
}

/** `value` holds the encapsulation private key a `Decrypter` provides, else a `TypeError`. */
export function expectDecrypter(value: unknown, name: string): Decrypter {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<Decrypter>).encapsulationPrivateKey === "function"
  ) {
    return value as Decrypter;
  }
  throw new TypeError(`${name} must be a Decrypter (the recipient's private keys)`);
}

/** `value` is an instance of `cls`, else a `TypeError`. */
export function expectInstance<T>(
  value: unknown,
  cls: { readonly prototype: T; readonly name: string },
  name: string,
): T {
  if (value instanceof (cls as unknown as abstract new () => T)) return value;
  throw new TypeError(`${name} must be a ${cls.name}`);
}
