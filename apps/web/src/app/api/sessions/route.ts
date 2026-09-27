import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { Account, Client } from "node-appwrite";

import { getEnvConfig } from "@/lib/appwrite-core";
import {
    extractBearerToken,
    invalidateSessionCacheForToken,
} from "@/lib/auth-server";
import { logger } from "@/lib/posthog-utils";

function getSessionClient(secret: string): Account {
    const env = getEnvConfig();
    const client = new Client()
        .setEndpoint(env.endpoint)
        .setProject(env.project)
        .setSession(secret);
    return new Account(client);
}

/**
 * The session secret that authenticated this request: Bearer token from the
 * headers (mobile) or the session cookie (browser). Falls back to the cookie
 * so cookie callers keep working unchanged.
 */
async function getSessionSecret(): Promise<string | null> {
    try {
        const headerStore = await headers();
        const headerValue =
            headerStore.get("x-firepit-token") ??
            headerStore.get("Authorization") ??
            "";
        const token = extractBearerToken(headerValue);
        if (token) {
            return token;
        }
    } catch {
        // No headers in this context; fall through to the cookie.
    }

    try {
        const env = getEnvConfig();
        const cookieStore = await cookies();
        return cookieStore.get(`a_session_${env.project}`)?.value ?? null;
    } catch {
        return null;
    }
}

function mapSession(session: {
    $id: string;
    $createdAt?: string;
    expire?: string;
    osName?: string;
    osVersion?: string;
    clientName?: string;
    clientType?: string;
    clientVersion?: string;
    deviceName?: string;
    deviceModel?: string;
    current?: boolean;
}) {
    return {
        $id: session.$id,
        createdAt: session.$createdAt,
        expiresAt: session.expire,
        current: session.current === true,
        os: session.osName ?? null,
        osVersion: session.osVersion ?? null,
        client: session.clientName ?? null,
        clientType: session.clientType ?? null,
        device: session.deviceName ?? null,
        deviceModel: session.deviceModel ?? null,
    };
}

/**
 * GET /api/sessions
 *
 * Lists sessions for the currently logged-in user (from Bearer token or
 * session cookie), driven by the session client so a user can only ever see
 * their own sessions.
 */
export async function GET() {
    try {
        const sessionSecret = await getSessionSecret();

        if (!sessionSecret) {
            return NextResponse.json(
                { error: "No session found" },
                { status: 401 },
            );
        }

        const account = getSessionClient(sessionSecret);
        const response = await account.listSessions();

        return NextResponse.json({
            sessions: (response.sessions ?? []).map(mapSession),
        });
    } catch (error) {
        logger.error("Failed to list sessions", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to list sessions" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/sessions?sessionId=...  |  DELETE /api/sessions?revokeOthers=1
 *
 * Revokes a single session or every other session. Revoking "current" also
 * clears the session cookie. (Callers send `clearCookie=1` alongside the
 * current session id so the server knows to drop the cookie.)
 */
export async function DELETE(request: Request) {
    try {
        const env = getEnvConfig();
        const sessionSecret = await getSessionSecret();

        if (!sessionSecret) {
            return NextResponse.json(
                { error: "No session found" },
                { status: 401 },
            );
        }

        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId");
        const revokeOthers = url.searchParams.get("revokeOthers") === "1";
        const clearCookie = url.searchParams.get("clearCookie") === "1";

        const account = getSessionClient(sessionSecret);

        if (revokeOthers) {
            const response = await account.listSessions();
            for (const session of response.sessions ?? []) {
                if (session.current === true) {continue;}
                try {
                    await account.deleteSession({ sessionId: session.$id });
                } catch (error) {
                    logger.warn("Failed to revoke individual session", {
                        sessionId: session.$id,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
            }
        } else if (sessionId) {
            await account.deleteSession({ sessionId });
        } else {
            return NextResponse.json(
                { error: "sessionId or revokeOthers is required" },
                { status: 400 },
            );
        }

        if (clearCookie) {
            const cookieStore = await cookies();
            cookieStore.delete(`a_session_${env.project}`);
            invalidateSessionCacheForToken(
                env.endpoint,
                env.project,
                sessionSecret,
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to revoke session(s)", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to revoke session(s)" },
            { status: 500 },
        );
    }
}