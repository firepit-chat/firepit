import { NextResponse } from "next/server";

import { AuthError, requireAdmin } from "@/lib/auth-server";
import { logger } from "@/lib/posthog-utils";
import { approveSignup } from "@/lib/signup-policy";
import { rejectSignupAction } from "@/app/admin/actions";

function errorResponse(error: unknown): NextResponse {
    if (error instanceof AuthError) {
        return NextResponse.json(
            { error: error.message },
            { status: error.code === "UNAUTHORIZED" ? 401 : 403 },
        );
    }
    logger.error("Admin signup action failed", {
        error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
        { error: "Failed to process signup" },
        { status: 500 },
    );
}

/**
 * POST /api/admin/signups/:userId { action: "approve" | "reject" }
 *
 * Approves a pending signup, or rejects it (deletes any profile/asset data
 * and the Appwrite account). Admin only.
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ userId: string }> },
) {
    try {
        const { user } = await requireAdmin();
        const pendingUserId = (await params).userId;

        const body = (await request.json()) as { action?: string };
        if (body.action !== "approve" && body.action !== "reject") {
            return NextResponse.json(
                { error: 'Action must be "approve" or "reject"' },
                { status: 400 },
            );
        }

        if (body.action === "approve") {
            await approveSignup(pendingUserId);
        } else {
            await rejectSignupAction(user.$id, pendingUserId);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}