// Active session token shared by /api/account/* routes: whichever credential
// authenticated this request (x-firepit-token / Authorization header for
// mobile, session cookie for the browser) so server-side calls act on the
// same session the client is using.

import { cookies, headers } from "next/headers";

import { extractBearerToken } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";

export async function getActiveSessionToken(): Promise<string | null> {
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
        const cookieStore = await cookies();
        return (
            cookieStore.get(`a_session_${getEnvConfig().project}`)?.value ??
            null
        );
    } catch {
        return null;
    }
}