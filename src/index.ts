/**
 * Copyright © 2023-2026 Blockchain Commons, LLC
 *
 * Gordian Sealed Transaction Protocol: requests, responses and events
 * signed by their sender's XID document and encrypted to their recipients,
 * carrying continuations that let each party get its state back.
 *
 * @packageDocumentation
 */

// Ported from gstp-rust

export {
  GstpError,
  GSTP_ERROR_CODES,
  type GstpErrorCode,
  type GstpErrorDetails,
  type GstpErrorDetailsByCode,
  type GstpErrorDetailsFor,
  type GstpErrorTyped,
} from "./error";
export {
  Continuation,
  type ContinuationInput,
  type ContinuationCheck,
  type OpenContinuationOptions,
} from "./continuation";
export { type DateInput } from "./guards";
export { type SealOptions, type OpenOptions } from "./sealing";
export { SealedRequest, type SealedRequestInput } from "./sealed-request";
export { SealedResponse, type SealedResponseInput } from "./sealed-response";
export { SealedEvent, type SealedEventInput, type OpenEventOptions } from "./sealed-event";
