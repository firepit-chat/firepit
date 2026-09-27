import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth-server";
import { deactivateAccount } from "@/lib/account-actions";
import { logger } from "@/lib/posthog-utils";

function errorResponse(error: unknown): NextResponse {
    if (error instanceof AuthError) {
        return NextResponse.json(
            { error: error.message },
            { status: error.code === "UNAUTHORIZED" ? 401 : 403 },
        );
    }
    logger.error("Account deactivation failed", {
        error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
        { error: "Failed to deactivate account" },
        { status: 500 },
    );
}

/**
 * POST /api/account/deactivate { password }
 *
 * Deactivates the signed-in user's account after verifying the current
 * password. The client clears its local session on success.
 */
export async function POST(request: Request) {
    try {
        const user = await requireAuth();

        const body = (await request.json()) as { password?: string };
        const result = await deactivateAccount(
            user,
            typeof body.password === "string" ? body.password : "",
        );

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        return errorResponse(error);
    }
}