import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth-server";
import { changeAccountEmail } from "@/lib/account-actions";
import { logger } from "@/lib/posthog-utils";

function errorResponse(error: unknown): NextResponse {
    if (error instanceof AuthError) {
        return NextResponse.json(
            { error: error.message },
            { status: error.code === "UNAUTHORIZED" ? 401 : 403 },
        );
    }
    logger.error("Account email change failed", {
        error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
        { error: "Failed to change email" },
        { status: 500 },
    );
}

/**
 * POST /api/account/email { email, password }
 *
 * Changes the signed-in user's email after verifying the current password.
 * Bearer-token (mobile) and cookie (web) callers are both supported.
 */
export async function POST(request: Request) {
    try {
        const user = await requireAuth();

        const body = (await request.json()) as {
            email?: string;
            password?: string;
        };

        const result = await changeAccountEmail(user, {
            email: typeof body.email === "string" ? body.email : "",
            password: typeof body.password === "string" ? body.password : "",
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        return errorResponse(error);
    }
}