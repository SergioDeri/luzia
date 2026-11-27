/** How long browsers may cache a preflight answer, in seconds. */
const PREFLIGHT_MAX_AGE = 60 * 60 * 24;

/**
 * Returns `response` with CORS headers for `origin`. The body is passed
 * through untouched, so streamed replies keep streaming.
 */
export function withCorsHeaders(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.append('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** The answer to a CORS preflight (`OPTIONS`) from an allowed origin. */
export function preflightResponse(request: Request, origin: string): Response {
  const requested = request.headers.get('access-control-request-headers');
  return withCorsHeaders(
    new Response(null, {
      status: 204,
      headers: {
        allow: 'POST, OPTIONS',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': requested ?? 'content-type',
        'access-control-max-age': String(PREFLIGHT_MAX_AGE),
      },
    }),
    origin,
  );
}
