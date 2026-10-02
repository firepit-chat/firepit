import { describe, expect, it } from "vitest";

import {
    ensureAllowedRequestOrigin,
    getAllowedOrigin,
    getRequestOrigins,
    isSameOrigin,
} from "@/lib/request-origin";

/**
 * A stub rather than a real `Request`: happy-dom drops `origin` and `host` as
 * forbidden header names, which would silently turn every case here into the
 * "no Origin header" path. The module under test only reads `url` and
 * `headers.get()`, so this is faithful and explicit.
 */
function makeRequest(options: {
    url: string;
    headers?: Record<string, string>;
}) {
    const lower = new Map(
        Object.entries(options.headers ?? {}).map(([key, value]) => [
            key.toLowerCase(),
            value,
        ]),
    );
    return {
        url: options.url,
        headers: {
            get: (name: string) => lower.get(name.toLowerCase()) ?? null,
        },
    } as unknown as Request;
}

describe("request origin", () => {
    describe("same-origin detection behind a proxy", () => {
        it("matches a plain same-origin request", () => {
            const request = makeRequest({
                url: "https://app.example.com/api/session",
                headers: { origin: "https://app.example.com" },
            });
            expect(ensureAllowedRequestOrigin(request)).toBeNull();
        });

        it("matches when the proxy forwards host but not the scheme", () => {
            // This is the production failure: Next.js builds http:// from the
            // internal request while the browser sends https://.
            const request = makeRequest({
                url: "http://app.example.com/api/session",
                headers: {
                    origin: "https://app.example.com",
                    host: "app.example.com",
                    "x-forwarded-host": "app.example.com",
                },
            });
            expect(ensureAllowedRequestOrigin(request)).toBeNull();
        });

        it("matches when the proxy forwards both host and scheme", () => {
            const request = makeRequest({
                url: "https://app.example.com/api/session",
                headers: {
                    origin: "https://app.example.com",
                    "x-forwarded-host": "app.example.com",
                    "x-forwarded-proto": "https",
                },
            });
            expect(ensureAllowedRequestOrigin(request)).toBeNull();
        });

        it("handles a comma-joined x-forwarded-host", () => {
            const request = makeRequest({
                url: "https://internal:3000/api/session",
                headers: {
                    origin: "https://app.example.com",
                    "x-forwarded-host": "app.example.com, internal:3000",
                    "x-forwarded-proto": "https",
                },
            });
            expect(ensureAllowedRequestOrigin(request)).toBeNull();
        });

        it("still rejects a genuinely cross-origin request", () => {
            const request = makeRequest({
                url: "https://app.example.com/api/session",
                headers: {
                    origin: "https://evil.example.net",
                    host: "app.example.com",
                    "x-forwarded-host": "app.example.com",
                },
            });
            expect(ensureAllowedRequestOrigin(request)).toBe(
                "https://evil.example.net",
            );
        });

        it("allows a request with no Origin header", () => {
            // Non-browser clients cannot be CSRF victims.
            const request = makeRequest({
                url: "https://app.example.com/api/session",
            });
            expect(ensureAllowedRequestOrigin(request)).toBeNull();
        });
    });

    describe("getRequestOrigins", () => {
        it("includes the URL origin and the forwarded host over both schemes", () => {
            // No x-forwarded-proto: the https spelling is what rescues a
            // TLS-terminating proxy that forwards only the hostname.
            const origins = getRequestOrigins(
                makeRequest({
                    url: "http://app.example.com/api/session",
                    headers: { "x-forwarded-host": "app.example.com" },
                }),
            );
            expect(origins).toContain("http://app.example.com");
            expect(origins).toContain("https://app.example.com");
        });
    });

    describe("CORS header", () => {
        it("is absent for a same-origin request", () => {
            const request = makeRequest({
                url: "https://app.example.com/api/session",
                headers: { origin: "https://app.example.com" },
            });
            expect(getAllowedOrigin(request)).toBeUndefined();
        });

        it("is absent for an unconfigured cross-origin request", () => {
            const request = makeRequest({
                url: "https://app.example.com/api/session",
                headers: { origin: "https://elsewhere.example" },
            });
            expect(getAllowedOrigin(request)).toBeUndefined();
        });
    });

    describe("isSameOrigin", () => {
        it("normalises the Origin header before comparing", () => {
            const request = makeRequest({
                url: "https://app.example.com/api/session",
                headers: { origin: "https://app.example.com" },
            });
            expect(
                isSameOrigin(request, "https://app.example.com/"),
            ).toBe(true);
        });
    });
});
