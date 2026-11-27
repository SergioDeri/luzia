/** Machine-readable error codes the handler returns in JSON error bodies. */
export type LuziaErrorCode =
  | 'method_not_allowed'
  | 'invalid_request'
  /** The request's `Origin` is not in the allowed origins (403). */
  | 'origin_not_allowed'
  /**
   * The conversation has more Visitor messages than `limits.maxMessages`, or
   * more than `2 × maxMessages − 1` messages in all (429).
   */
  | 'conversation_limit_reached'
  /**
   * A Visitor message is longer than `limits.maxMessageLength`, or an Agent
   * reply in the conversation is longer than `limits.maxReplyLength` (413).
   */
  | 'message_too_long'
  /** The request body is larger than `limits.maxRequestBytes` (413); it is not read further. */
  | 'request_too_large'
  /**
   * The chat model failed before replying, or the embeddings model failed
   * while searching the Knowledge Base (502). A failure mid-reply breaks the
   * stream instead.
   */
  | 'provider_error';

/** Body of every non-streamed error response: `{ error: { code, message } }`. */
export interface LuziaErrorBody {
  error: { code: LuziaErrorCode; message: string };
}

export function errorResponse(
  status: number,
  code: LuziaErrorCode,
  message: string,
  headers?: HeadersInit,
): Response {
  const body: LuziaErrorBody = { error: { code, message } };
  return Response.json(body, { status, headers });
}
