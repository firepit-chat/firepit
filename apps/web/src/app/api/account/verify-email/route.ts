import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth-server";
import { resendAccountVerification } from "@/lib/account-actions";
import { getActiveSessionToken } from "@/lib/active-session-token";
import { logger } from "@/lib/posthog-utils";

function errorResponse(error: unknown): NextResponse {
    if (error instanceof AuthError) {
        return NextResponse.json(
            { error: error.message },
            { status: error.code === "UNAUTHORIZED" ? 401 : 403 },
        );
    }
    logger.error("Email verification resend failed", {
        error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
        { error: "Failed to send verification email" },
        { status: 500 },
    );
}

/**
 * POST /api/account/verify-email
 *
 * Re-sends the email verification link using the caller's active session.
 */
export async function POST() {
    try {
        const user = await requireAuth();
        const sessionToken = await getActiveSessionToken();
        const result = await resendAccountVerification(user, sessionToken);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        return errorResponse(error);
    }
}