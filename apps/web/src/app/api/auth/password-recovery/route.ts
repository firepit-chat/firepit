import { NextResponse } from "next/server";
import { Account, Client } from "node-appwrite";
import { getEnvConfig } from "@/lib/appwrite-core";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/posthog-utils";

const PASSWORD_RECOVERY_RATE_LIMIT = {
    maxRequests: 3,
    windowMs: 60 * 60 * 1000,
};

function getRecoveryRedirectUrl(): string {
    const configuredBaseUrl =
        process.env.SERVER_URL?.trim() ||
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        "http://localhost:3000";

    const normalizedBaseUrl = configuredBaseUrl.replace(/\/$/, "");
    return `${normalizedBaseUrl}/reset-password`;
}

function rateLimitResponse(retryAfter: number | undefined): NextResponse {
    return NextResponse.json(
        {
            error:
                "Too many password reset requests. Please try again in an hour.",
        },
        {
            status: 429,
            headers: { "Retry-After": String(retryAfter ?? 3600) },
        },
    );
}

/**
 * POST /api/auth/password-recovery
 *
 * Sends a password recovery (reset) email via Account.createRecovery. Kept
 * generic on success so the response never reveals whether an email exists.
 */
export async function POST(request: Request) {
    let email: string | undefined;
    try {
        const body = (await request.json()) as { email?: string };
        email = body.email;

        if (!email || typeof email !== "string") {
            return NextResponse.json(
                { error: "Email is required" },
                { status: 400 },
            );
        }

        const emailLimit = checkRateLimit(
            `password-recovery-email:${email.toLowerCase()}`,
            PASSWORD_RECOVERY_RATE_LIMIT,
        );
        if (!emailLimit.allowed) {
            return rateLimitResponse(emailLimit.retryAfter);
        }

        const clientIp = getClientIp(request);
        if (clientIp) {
            const ipLimit = checkRateLimit(
                `password-recovery-ip:${clientIp}`,
                PASSWORD_RECOVERY_RATE_LIMIT,
            );
            if (!ipLimit.allowed) {
                return rateLimitResponse(ipLimit.retryAfter);
            }
        }

        const env = getEnvConfig();
        const apiKey = process.env.APPWRITE_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: "Server API key not configured" },
                { status: 500 },
            );
        }

        const client = new Client()
            .setEndpoint(env.endpoint)
            .setProject(env.project)
            .setKey(apiKey);

        await new Account(client).createRecovery({
            email,
            url: getRecoveryRedirectUrl(),
        });

        // Always respond generically to prevent account enumeration.
        return NextResponse.json({
            success: true,
            message:
                "If an account exists for that email, a password reset link has been sent.",
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : String(error);
        if (/hostname|platform/i.test(message)) {
            logger.warn(
                "Password recovery URL hostname is not a registered Appwrite platform. Register this host (e.g. localhost vs 127.0.0.1) under Appwrite console -> Project -> Overview -> Platforms.",
                { error: message },
            );
        }

        logger.error("Password recovery request failed", {
            emailProvided: Boolean(email),
            error: message,
        });

        // Even on failure, stay generic.
        return NextResponse.json({
            success: true,
            message:
                "If an account exists for that email, a password reset link has been sent.",
        });
    }
}