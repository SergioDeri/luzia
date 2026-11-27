import type { Env } from '../chat-model.ts';
import { LuziaConfigError } from '../errors.ts';

/** Comma-separated allowed origins, used when `allowedOrigins` is omitted from the handler config. */
export const ALLOWED_ORIGINS_ENV = 'LUZIA_ALLOWED_ORIGINS';

/** How a request's `Origin` relates to the server. */
export type OriginVerdict =
  /** No `Origin` header (server-to-server calls, `luzia eval`) or the server's own origin. */
  | { kind: 'same-origin' }
  /** A different origin the Owner allowed: answered with CORS headers. */
  | { kind: 'allowed'; origin: string }
  | { kind: 'rejected'; origin: string };

/**
 * Normalizes the Owner's allowed origins (config first, then the environment)
 * to `scheme://host[:port]`. Fails at startup on anything that isn't one.
 */
export function resolveAllowedOrigins(configured: readonly string[] | undefined, env: Env): Set<string> {
  const raw = configured ?? (env[ALLOWED_ORIGINS_ENV] ?? '').split(',');
  const origins = new Set<string>();
  for (const entry of raw) {
    const value = entry.trim();
    if (!value) continue;
    let origin: string;
    try {
      origin = new URL(value).origin;
    } catch {
      origin = 'null';
    }
    if (origin === 'null') {
      throw new LuziaConfigError(
        `Invalid allowed origin "${value}". Use a full origin such as https://ada.dev (scheme, host and optional port).`,
      );
    }
    origins.add(origin);
  }
  return origins;
}

/**
 * Same-origin needs no configuration: a request is same-origin when its
 * `Origin` matches the request URL, or the `Host` / `X-Forwarded-Host` the
 * request arrived on (so it also holds behind a proxy).
 */
export function checkOrigin(request: Request, allowed: ReadonlySet<string>): OriginVerdict {
  const origin = request.headers.get('origin');
  if (origin === null) return { kind: 'same-origin' };
  if (isSameOrigin(request, origin)) return { kind: 'same-origin' };
  if (allowed.has(origin)) return { kind: 'allowed', origin };
  return { kind: 'rejected', origin };
}

function isSameOrigin(request: Request, origin: string): boolean {
  if (origin === new URL(request.url).origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [request.headers.get('x-forwarded-host'), request.headers.get('host')];
  return hosts.some((value) => value !== null && value.split(',')[0]?.trim() === host);
}
