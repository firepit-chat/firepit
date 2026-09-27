import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth-server";
import { deleteAccount } from "@/lib/account-actions";
import { getActiveSessionToken } from "@/lib/active-session-token";
import { logger } from "@/lib/posthog-utils";

function errorResponse(error: unknown): NextResponse {
    if (error instanceof AuthError) {
        return NextResponse.json(
            { error: error.message },
            { status: error.code === "UNAUTHORIZED" ? 401 : 403 },
        );
    }
    logger.error("Account deletion failed", {
        error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
        { error: "Failed to delete account" },
        { status: 500 },
    );
}

/**
 * POST /api/account/delete { password }
 *
 * Permanently deletes the signed-in user's account (tombstoning the profile)
 * after verifying the current password. The client clears its local session
 * on success.
 */
export async function POST(request: Request) {
    try {
        const user = await requireAuth();

        const body = (await request.json()) as { password?: string };
        const sessionToken = await getActiveSessionToken();
        const result = await deleteAccount(
            user,
            typeof body.password === "string" ? body.password : "",
            sessionToken,
        );

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        return errorResponse(error);
    }
}