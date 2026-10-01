/**
 * Origin checking for cookie-setting and other CSRF-sensitive endpoints.
 *
 * Previously each of the five routes that needed this (`/api/session`,
 * `/api/direct-messages`, and the three upload routes) carried its own copy of
 * the same logic. All of them shared one weakness: same-origin was decided with
 * `new URL(request.url).origin`, which behind a reverse proxy is built from the
 * forwarded headers Next.js sees. A proxy that forwards the public hostname but
 * not `x-forwarded-proto` yields `http://app.example.com` while the browser
 * sends `Origin: https://app.example.com`, so the comparison fails. With
 * `ALLOWED_ORIGINS` unset — which was possible because it was never documented
 * — the request was rejected with "Origin is not allowed".
 *
 * This compares the `Origin` header against every plausible spelling of the
 * request's own origin, so a correct proxy setup passes regardless of which
 * headers it sets. `ALLOWED_ORIGINS` remains the escape hatch for genuinely
 * cross-origin clients.
 */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0);

export function getConfiguredAllowedOrigins(): string[] {
    return ALLOWED_ORIGINS;
}

/**
 * The origin to echo back in `Access-Control-Allow-Origin`, or undefined when
 * the caller is not a configured cross-origin client. Same-origin requests get
 * no CORS header at all, which is correct — the browser does not need one.
 */
export function getAllowedOrigin(request?: Request): string | undefined {
    const originHeader = request?.headers.get("origin");
    if (!originHeader) {
        return undefined;
    }
    const origin = normalizeOrigin(originHeader) ?? originHeader.trim();
    return ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
}

function normalizeOrigin(value: string): string | null {
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

/**
 * Every origin this request could legitimately have come from, derived from the
 * URL Next.js built plus the standard forwarding headers.
 */
export function getRequestOrigins(request: Request): string[] {
    const origins = new Set<string>();

    const fromUrl = normalizeOrigin(request.url);
    if (fromUrl) {
        origins.add(fromUrl);
    }

    const forwardedProto = request.headers
        .get("x-forwarded-proto")
        ?.split(",")[0]
        ?.trim();
    const forwardedHost = request.headers
        .get("x-forwarded-host")
        ?.split(",")[0]
        ?.trim();
    const hostHeader = request.headers.get("host")?.trim();

    const hosts = [forwardedHost, hostHeader, fromUrl ? new URL(fromUrl).host : ""]
        .filter((value): value is string => Boolean(value));

    // Schemes to try. `https` is included even when nothing says so: the
    // failure being fixed is a TLS-terminating proxy that forwards the public
    // hostname but not the scheme, and production origins are https. This
    // cannot weaken the check — the browser's `Origin` still has to match one
    // of ours, and a real cross-origin caller cannot forge it.
    const schemes = [
        forwardedProto,
        fromUrl ? new URL(fromUrl).protocol.replace(/:$/, "") : "",
        "https",
        "http",
    ].filter((value, index, all): value is string =>
        Boolean(value) && all.indexOf(value) === index,
    );

    for (const scheme of schemes) {
        for (const host of hosts) {
            const candidate = normalizeOrigin(`${scheme}://${host}`);
            if (candidate) {
                origins.add(candidate);
            }
        }
    }

    return [...origins];
}

/** True when the request's `Origin` matches the request's own origin. */
export function isSameOrigin(request: Request, originHeader: string): boolean {
    const origin = normalizeOrigin(originHeader);
    if (!origin) {
        return false;
    }
    return getRequestOrigins(request).includes(origin);
}

/**
 * Returns the disallowed origin, or null when the request may proceed.
 *
 * A missing request or a missing `Origin` header is allowed: handlers forward
 * an optional request (the `OPTIONS` preflights do), and non-browser clients
 * cannot be CSRF victims. This matches the behaviour the routes had before
 * this was centralised.
 */
export function ensureAllowedRequestOrigin(
    request?: Request,
): string | null {
    if (!request) {
        return null;
    }

    const originHeader = request.headers.get("origin");
    if (!originHeader) {
        return null;
    }

    const origin = normalizeOrigin(originHeader) ?? originHeader.trim();

    if (isSameOrigin(request, origin)) {
        return null;
    }

    return ALLOWED_ORIGINS.includes(origin) ? null : origin;
}
