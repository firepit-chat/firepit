import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Account, Client, Users } from "node-appwrite";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { logger } from "@/lib/posthog-utils";
import { ensureAllowedRequestOrigin } from "@/lib/request-origin";


/**
 * GET /api/session
 *
 * Returns a short-lived JWT minted from the httpOnly session cookie, so the
 * client can authenticate the realtime WebSocket without ever receiving the
 * raw session secret.
 *
 * `account.createJWT()` was removed in node-appwrite 29; the replacement lives
 * on the server-side `users` service, which needs an API key and an explicit
 * user id. The user id is therefore resolved by verifying the cookie session
 * against Appwrite rather than decoded out of the cookie — reading `sub` from
 * the unverified cookie would let a caller mint a JWT as any user, because
 * `users.createJWT` runs with the API key and trusts the id it is given.
 */
export async function GET() {
    try {
        const env = getEnvConfig();
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(`a_session_${env.project}`);

        if (!sessionCookie?.value) {
            return NextResponse.json(
                { error: "No session found" },
                { status: 401 },
            );
        }

        // Verifies the session and returns the account it belongs to.
        const sessionClient = new Client()
            .setEndpoint(env.endpoint)
            .setProject(env.project)
            .setSession(sessionCookie.value);

        const account = await new Account(sessionClient).get();
        const userId = account.$id;

        const jwt = await new Users(
            getServerClient().client,
        ).createJWT({ userId });

        return NextResponse.json({
            jwt: jwt.jwt,
            project: env.project,
        });
    } catch (error) {
        logger.error("Failed to create realtime JWT", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to get session" },
            { status: 500 },
        );
    }
}

/**
 * POST /api/session
 *
 * Sets the httpOnly session cookie from the browser SDK's session secret.
 * This is called after the browser SDK creates a session (with full user scopes)
 * so the server can set the httpOnly cookie for SSR compatibility.
 */
export async function POST(request: Request) {
    try {
        const env = getEnvConfig();

        const disallowedOrigin = ensureAllowedRequestOrigin(request);
        if (disallowedOrigin) {
            return NextResponse.json(
                { error: "Origin is not allowed" },
                { status: 403 },
            );
        }

        let parsed: unknown;
        try {
            parsed = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON" },
                { status: 400 },
            );
        }

        if (typeof parsed !== "object" || parsed === null) {
            return NextResponse.json(
                { error: "session and project are required" },
                { status: 400 },
            );
        }

        const { session, project, remember } = parsed as {
            session?: unknown;
            project?: unknown;
            remember?: unknown;
        };

        if (typeof session !== "string" || typeof project !== "string") {
            return NextResponse.json(
                { error: "session and project are required" },
                { status: 400 },
            );
        }

        if (project !== env.project) {
            return NextResponse.json(
                { error: "Invalid project" },
                { status: 400 },
            );
        }

        // Verify the secret is a real Appwrite session before persisting it.
        try {
            const verifyClient = new Client()
                .setEndpoint(env.endpoint)
                .setProject(env.project)
                .setSession(session);
            await new Account(verifyClient).get();
        } catch {
            return NextResponse.json(
                { error: "Invalid session" },
                { status: 401 },
            );
        }

        const cookieStore = await cookies();
        // Remember-me: persistent 1-year cookie by default. When unchecked the
        // cookie is session-only (no maxAge) and clears when the browser closes.
        const rememberMe = remember === undefined || remember === true;

        cookieStore.set(`a_session_${env.project}`, session, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            ...(rememberMe ? { maxAge: 60 * 60 * 24 * 365 } : {}),
            path: "/",
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to set session cookie", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to set session cookie" },
            { status: 500 },
        );
    }
}
