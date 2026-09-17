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
  type ContinuationFromEnvelopeOptions,
} from "./continuation";
export { type DateInput } from "./guards";
export { type ToEnvelopeOptions, type FromEnvelopeOptions } from "./sealing";
export { SealedRequest, type SealedRequestInput } from "./sealed-request";
export {
  SealedResponse,
  type SealedResponseInput,
  type ResponseOk,
  type ResponseErr,
} from "./sealed-response";
export { SealedEvent, type SealedEventInput, type FromEnvelopeEventOptions } from "./sealed-event";
