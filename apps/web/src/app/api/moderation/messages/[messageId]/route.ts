import { NextResponse } from "next/server";

import { AuthError, requireAuth } from "@/lib/auth-server";
import {
    actionHardDelete,
    actionRestore,
    actionSoftDelete,
} from "@/app/moderation/actions";
import { logger } from "@/lib/posthog-utils";

const ACTION_PARSERS = {
    "soft-delete": actionSoftDelete,
    restore: actionRestore,
    "hard-delete": actionHardDelete,
} as const;

/**
 * POST /api/moderation/messages/:messageId { action: "soft-delete" | "restore" | "hard-delete" }
 *
 * Applies a moderation action to a message. Gating (moderator/admin, server
 * owner, or manage-messages / administrator permission) happens inside the
 * shared moderation actions, which also rate-limit and record audit events.
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ messageId: string }> },
) {
    try {
        await requireAuth();
        const messageId = (await params).messageId;

        const body = (await request.json()) as { action?: unknown };
        if (
            body.action !== "soft-delete" &&
            body.action !== "restore" &&
            body.action !== "hard-delete"
        ) {
            return NextResponse.json(
                {
                    error:
                        'Action must be "soft-delete", "restore", or "hard-delete"',
                },
                { status: 400 },
            );
        }

        await ACTION_PARSERS[body.action](messageId);

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.code === "UNAUTHORIZED" ? 401 : 403 },
            );
        }

        const message =
            error instanceof Error ? error.message : String(error);

        if (message === "Message not found") {
            return NextResponse.json(
                { error: "Message not found" },
                { status: 404 },
            );
        }
        if (message.startsWith("Forbidden")) {
            return NextResponse.json({ error: message }, { status: 403 });
        }
        if (
            message === "Rate limit exceeded" ||
            message === "Duplicate action suppressed"
        ) {
            return NextResponse.json(
                { error: "Too many requests. Try again in a moment." },
                { status: 429 },
            );
        }

        logger.error("Moderation action failed", {
            action: undefined,
            error: message,
        });
        return NextResponse.json(
            { error: "Failed to apply moderation action" },
            { status: 500 },
        );
    }
}