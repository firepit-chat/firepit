import { firepitRequest } from "@/lib/firepit/http";
import type {
    AccountActionResult,
    ModerationMessageEntry,
    ModerationMessagesResponse,
    SessionEntry,
    SignupControlsResponse,
    SignupPolicy,
} from "@/lib/firepit/types";

export async function requestPasswordReset(baseUrl: string, email: string) {
    return firepitRequest<AccountActionResult>({
        baseUrl,
        path: "/api/auth/password-recovery",
        method: "POST",
        body: { email },
    });
}

export async function changeAccountEmail(
    baseUrl: string,
    token: string,
    email: string,
    password: string,
) {
    return firepitRequest<AccountActionResult>({
        baseUrl,
        path: "/api/account/email",
        method: "POST",
        token,
        body: { email, password },
    });
}

export async function resendAccountVerification(
    baseUrl: string,
    token: string,
) {
    return firepitRequest<AccountActionResult>({
        baseUrl,
        path: "/api/account/verify-email",
        method: "POST",
        token,
    });
}

export async function deactivateAccount(
    baseUrl: string,
    token: string,
    password: string,
) {
    return firepitRequest<AccountActionResult>({
        baseUrl,
        path: "/api/account/deactivate",
        method: "POST",
        token,
        body: { password },
    });
}

export async function deleteAccount(
    baseUrl: string,
    token: string,
    password: string,
) {
    return firepitRequest<AccountActionResult>({
        baseUrl,
        path: "/api/account/delete",
        method: "POST",
        token,
        body: { password },
    });
}

export async function fetchSessions(
    baseUrl: string,
    token: string,
): Promise<SessionEntry[]> {
    const res = await firepitRequest<{ sessions?: SessionEntry[] }>({
        baseUrl,
        path: "/api/sessions",
        token,
    });
    return res.sessions ?? [];
}

export async function revokeSession(
    baseUrl: string,
    token: string,
    sessionId: string,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: "/api/sessions",
        method: "DELETE",
        token,
        query: { sessionId },
    });
}

export async function revokeOtherSessions(baseUrl: string, token: string) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: "/api/sessions",
        method: "DELETE",
        token,
        query: { revokeOthers: "1" },
    });
}

export async function fetchSignupControls(
    baseUrl: string,
    token: string,
) {
    return firepitRequest<SignupControlsResponse>({
        baseUrl,
        path: "/api/admin/signups",
        token,
    });
}

export async function setSignupPolicy(
    baseUrl: string,
    token: string,
    policy: SignupPolicy,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: "/api/admin/signups",
        method: "POST",
        token,
        body: { policy },
    });
}

export async function actOnSignup(
    baseUrl: string,
    token: string,
    userId: string,
    action: "approve" | "reject",
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/admin/signups/${encodeURIComponent(userId)}`,
        method: "POST",
        token,
        body: { action },
    });
}

export async function fetchModerationMessages(
    baseUrl: string,
    token: string,
    serverId: string,
    options: {
        channelId?: string;
        onlyRemoved?: boolean;
        text?: string;
        limit?: number;
        cursorAfter?: string;
    } = {},
): Promise<{ items: ModerationMessageEntry[]; nextCursor: string | null }> {
    const res = await firepitRequest<ModerationMessagesResponse>({
        baseUrl,
        path: `/api/servers/${encodeURIComponent(serverId)}/moderation/messages`,
        token,
        query: {
            channelId: options.channelId,
            onlyRemoved: options.onlyRemoved,
            text: options.text,
            limit: options.limit,
            cursorAfter: options.cursorAfter,
        },
    });
    return {
        items: res.items ?? [],
        nextCursor: res.nextCursor ?? null,
    };
}

export type MessageModerationAction =
    | "soft-delete"
    | "restore"
    | "hard-delete";

export async function applyMessageAction(
    baseUrl: string,
    token: string,
    messageId: string,
    action: MessageModerationAction,
) {
    return firepitRequest<{ success?: boolean }>({
        baseUrl,
        path: `/api/moderation/messages/${encodeURIComponent(messageId)}`,
        method: "POST",
        token,
        body: { action },
    });
}