import { NextResponse } from "next/server";

import { AuthError, requireAdmin } from "@/lib/auth-server";
import { logger } from "@/lib/posthog-utils";
import {
    getSignupPolicy,
    isSignupPolicy,
    listPendingSignups,
    setSignupPolicy,
} from "@/lib/signup-policy";

function errorResponse(error: unknown): NextResponse {
    if (error instanceof AuthError) {
        return NextResponse.json(
            { error: error.message },
            { status: error.code === "UNAUTHORIZED" ? 401 : 403 },
        );
    }
    logger.error("Admin signups request failed", {
        error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
        { error: "Admin signup request failed" },
        { status: 500 },
    );
}

/**
 * GET /api/admin/signups
 *
 * Returns the instance signup policy plus every account awaiting admin
 * approval. Admin only (Bearer token or session cookie).
 */
export async function GET() {
    try {
        await requireAdmin();

        const [policy, pending] = await Promise.all([
            getSignupPolicy(),
            listPendingSignups(),
        ]);

        return NextResponse.json({ policy, pending });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * POST /api/admin/signups { policy: "open" | "approval" | "disabled" }
 *
 * Changes the instance signup policy. Admin only.
 */
export async function POST(request: Request) {
    try {
        const { user } = await requireAdmin();

        const body = (await request.json()) as { policy?: unknown };
        if (!isSignupPolicy(body.policy)) {
            return NextResponse.json(
                { error: 'Policy must be "open", "approval", or "disabled"' },
                { status: 400 },
            );
        }

        const success = await setSignupPolicy(body.policy, user.$id);
        if (!success) {
            return NextResponse.json(
                { error: "Failed to update signup policy" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true, policy: body.policy });
    } catch (error) {
        return errorResponse(error);
    }
}