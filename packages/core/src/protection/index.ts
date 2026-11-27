import type { Env } from '../env.ts';
import { errorResponse } from '../http.ts';
import { preflightResponse, withCorsHeaders } from './cors.ts';
import { ALLOWED_ORIGINS_ENV, checkOrigin, resolveAllowedOrigins } from './origins.ts';

import { checkLimits, readBodyWithinLimit, resolveLimits } from './limits.ts';

export { ALLOWED_ORIGINS_ENV } from './origins.ts';
export { DEFAULT_LIMITS, LIMIT_ENV, REPLY_CHARS_PER_TOKEN, type LuziaLimits } from './limits.ts';
import type { LuziaLimits } from './limits.ts';

export interface ProtectionConfig {
  /**
   * Origins (e.g. `https://ada.dev`) allowed to call the handler from a
   * browser on another origin. Same-origin requests and requests without an
   * `Origin` header are always accepted. When omitted, read from the
   * comma-separated LUZIA_ALLOWED_ORIGINS environment variable.
   */
  allowedOrigins?: string[];
  /**
   * Per-conversation and per-request limits. Each one omitted is read from its
   * environment variable (see {@link LIMIT_ENV}), else falls back to
   * {@link DEFAULT_LIMITS}.
   */
  limits?: Partial<LuziaLimits>;
}

type Handler = (request: Request) => Promise<Response>;

/**
 * Guards the chat handler: rejects disallowed origins, answers CORS
 * preflight, adds CORS headers to every response (streamed or not) for
 * allowed cross-origin callers, and enforces the conversation limits.
 */
export function createProtection(config: ProtectionConfig, env: Env) {
  const allowedOrigins = resolveAllowedOrigins(config.allowedOrigins, env);
  const limits = resolveLimits(config.limits, env);

  return {
    limits,
    /** The request body as text, or the `request_too_large` error response when it exceeds `maxRequestBytes`. */
    readBody: (request: Request) => readBodyWithinLimit(request, limits.maxRequestBytes),
    /** The limit error response when the conversation exceeds a limit, else `null`. */
    checkLimits: (messages: readonly { role: string; content: string }[]) => checkLimits(messages, limits),

    wrap(handler: Handler): Handler {
      return async (request) => {
        const verdict = checkOrigin(request, allowedOrigins);
        if (verdict.kind === 'rejected') {
          return errorResponse(
            403,
            'origin_not_allowed',
            `Origin ${verdict.origin} is not allowed to use this luzIA server. Add it to allowedOrigins (or ${ALLOWED_ORIGINS_ENV}).`,
            { vary: 'Origin' },
          );
        }
        if (request.method === 'OPTIONS') {
          return verdict.kind === 'allowed'
            ? preflightResponse(request, verdict.origin)
            : new Response(null, { status: 204, headers: { allow: 'GET, POST, OPTIONS' } });
        }
        const response = await handler(request);
        return verdict.kind === 'allowed' ? withCorsHeaders(response, verdict.origin) : response;
      };
    },
  };
}
