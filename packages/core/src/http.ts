/** Machine-readable error codes the handler returns in JSON error bodies. */
export type LuziaErrorCode = 'method_not_allowed' | 'invalid_request';

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
