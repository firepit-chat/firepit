import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    actionHardDelete,
    actionRestore,
    actionSoftDelete,
} from "../app/moderation/actions";

// Setup environment before any imports
const env = process.env as Record<string, string>;
env.APPWRITE_ENDPOINT = "http://localhost";
env.APPWRITE_PROJECT_ID = "test-project";
env.APPWRITE_API_KEY = "test-api-key";

vi.mock("../lib/appwrite-audit", () => ({ recordAudit: vi.fn() }));
vi.mock("../lib/appwrite-admin", () => ({
    adminSoftDeleteMessage: vi.fn(),
    adminRestoreMessage: vi.fn(),
    adminDeleteMessage: vi.fn(),
    getAdminMessageAuditContext: vi.fn(),
}));
vi.mock("../lib/server-channel-access", () => ({
    getServerPermissionsForUser: vi.fn(),
}));
vi.mock("../lib/appwrite-core", () => ({
    getEnvConfig: vi.fn().mockReturnValue({
        project: "test-project",
        databaseId: "db",
        collections: {
            servers: "servers",
            channels: "channels",
            messages: "messages",
        },
    }),
}));
vi.mock("../lib/appwrite-server", () => ({
    getServerClient: vi.fn().mockReturnValue({ databases: {}, client: {} }),
}));
vi.mock("next/headers", () => ({
    cookies: async () => ({ get: () => ({ value: "session" }) }),
}));

// Mock auth-server helper
vi.mock("../lib/auth-server", () => ({
    requireAuth: vi.fn(),
    checkUserRoles: vi.fn(),
}));

// Mock Appwrite SDK for getServerSession
vi.mock("appwrite", () => {
    class MockClient {
        setEndpoint() {
            return this;
        }
        setProject() {
            return this;
        }
    }
    class MockAccount {
        get() {
            return Promise.resolve({
                $id: "moderatorUser",
                name: "Mod",
                email: "mod@example.com",
            });
        }
    }
    const mod: Record<string, unknown> = {};
    Object.defineProperty(mod, "Client", { get: () => MockClient });
    Object.defineProperty(mod, "Account", { get: () => MockAccount });
    return mod;
});

const {
    adminSoftDeleteMessage,
    adminRestoreMessage,
    adminDeleteMessage,
    getAdminMessageAuditContext,
} = await import("../lib/appwrite-admin");
const { recordAudit } = await import("../lib/appwrite-audit");
const { getServerPermissionsForUser } = await import(
    "../lib/server-channel-access"
);
const { requireAuth, checkUserRoles } = await import("../lib/auth-server");

function setGlobalRoles(mod: boolean, admin: boolean) {
    (requireAuth as any).mockResolvedValue({
        $id: "moderatorUser",
        name: "Mod",
        email: "mod@example.com",
    });
    (checkUserRoles as any).mockResolvedValue({
        isModerator: mod,
        isAdmin: admin,
    });
}

function setServerAccess(access: {
    isServerOwner?: boolean;
    manageMessages?: boolean;
    administrator?: boolean;
}) {
    (getServerPermissionsForUser as any).mockResolvedValue({
        serverId: "server-1",
        isServerOwner: access.isServerOwner ?? false,
        isMember: true,
        permissions: {
            manageMessages: access.manageMessages ?? false,
            administrator: access.administrator ?? false,
        },
        roleIds: [],
        roles: [],
    });
}

beforeEach(async () => {
    vi.clearAllMocks();
    setGlobalRoles(true, true);
    setServerAccess({ manageMessages: true });
    (getAdminMessageAuditContext as any).mockResolvedValue({
        $id: "m1",
        userId: "author-1",
        serverId: "server-1",
        channelId: "channel-1",
        text: "Test message content",
    });
});

describe("moderation actions", () => {
    it("soft delete records audit + metrics for global admin", async () => {
        await actionSoftDelete("m1");
        expect(adminSoftDeleteMessage).toHaveBeenCalledWith(
            "m1",
            "moderatorUser",
        );
        expect(recordAudit).toHaveBeenCalledWith(
            "soft_delete",
            "m1",
            "moderatorUser",
            expect.objectContaining({
                serverId: "server-1",
                targetUserId: "author-1",
                channelId: "channel-1",
            }),
        );
    });

    it("soft delete allowed for server moderator with manageMessages", async () => {
        setGlobalRoles(false, false);
        setServerAccess({ manageMessages: true });
        await actionSoftDelete("m2");
        expect(adminSoftDeleteMessage).toHaveBeenCalledWith(
            "m2",
            "moderatorUser",
        );
    });

    it("soft delete allowed for server owner", async () => {
        setGlobalRoles(false, false);
        setServerAccess({ isServerOwner: true });
        await actionSoftDelete("m3");
        expect(adminSoftDeleteMessage).toHaveBeenCalledWith(
            "m3",
            "moderatorUser",
        );
    });

    it("soft delete forbidden without manageMessages or global role", async () => {
        setGlobalRoles(false, false);
        setServerAccess({});
        await expect(actionSoftDelete("m4")).rejects.toThrow("Forbidden");
        expect(adminSoftDeleteMessage).not.toHaveBeenCalled();
    });

    it("soft delete allowed for global moderator even without server perms", async () => {
        setGlobalRoles(true, false);
        setServerAccess({});
        await actionSoftDelete("m5");
        expect(adminSoftDeleteMessage).toHaveBeenCalled();
    });

    it("restore records audit", async () => {
        await actionRestore("m6");
        expect(adminRestoreMessage).toHaveBeenCalledWith("m6");
        expect(recordAudit).toHaveBeenCalledWith(
            "restore",
            "m6",
            "moderatorUser",
            expect.objectContaining({
                serverId: "server-1",
                targetUserId: "author-1",
            }),
        );
    });

    it("hard delete allowed for global admin", async () => {
        await actionHardDelete("m7");
        expect(adminDeleteMessage).toHaveBeenCalledWith("m7");
        expect(recordAudit).toHaveBeenCalledWith(
            "hard_delete",
            "m7",
            "moderatorUser",
            expect.objectContaining({
                serverId: "server-1",
                targetUserId: "author-1",
                details: expect.stringContaining(
                    "Message permanently deleted by admin",
                ),
            }),
        );
    });

    it("hard delete allowed for server administrator role", async () => {
        setGlobalRoles(false, false);
        setServerAccess({ administrator: true, manageMessages: true });
        await actionHardDelete("m8");
        expect(adminDeleteMessage).toHaveBeenCalledWith("m8");
    });

    it("hard delete allowed for server owner", async () => {
        setGlobalRoles(false, false);
        setServerAccess({ isServerOwner: true });
        await actionHardDelete("m9");
        expect(adminDeleteMessage).toHaveBeenCalledWith("m9");
    });

    it("hard delete forbidden for non-admin server moderator", async () => {
        setGlobalRoles(false, false);
        setServerAccess({ manageMessages: true });
        await expect(actionHardDelete("m10")).rejects.toThrow("Forbidden");
        expect(adminDeleteMessage).not.toHaveBeenCalled();
    });

    it("hard delete forbidden for global moderator without admin", async () => {
        setGlobalRoles(true, false);
        setServerAccess({ isServerOwner: false, administrator: false });
        await expect(actionHardDelete("m11")).rejects.toThrow("Forbidden");
        expect(adminDeleteMessage).not.toHaveBeenCalled();
    });

    it("throws if the message does not exist", async () => {
        (getAdminMessageAuditContext as any).mockResolvedValue(null);
        await expect(actionSoftDelete("m12")).rejects.toThrow(
            "Message not found",
        );
    });
});