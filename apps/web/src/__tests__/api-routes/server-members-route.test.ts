import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
    mockListDocuments,
    mockDeleteDocument,
    mockGetServerSession,
    mockGetServerPermissionsForUser,
} = vi.hoisted(() => ({
    mockListDocuments: vi.fn(),
    mockDeleteDocument: vi.fn(),
    mockGetServerSession: vi.fn(),
    mockGetServerPermissionsForUser: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
    Query: {
        equal: (field: string, value: string | string[]) =>
            `equal(${field},${Array.isArray(value) ? value.join("|") : value})`,
        limit: (n: number) => `limit(${n})`,
        orderAsc: (field: string) => `orderAsc(${field})`,
        cursorAfter: (cursor: string) => `cursorAfter(${cursor})`,
    },
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        databases: {
            listDocuments: mockListDocuments,
            deleteDocument: mockDeleteDocument,
        },
    })),
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/server-channel-access", () => ({
    getServerPermissionsForUser: mockGetServerPermissionsForUser,
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        endpoint: "http://localhost/v1",
        project: "test-project",
        databaseId: "test-db",
        collections: {
            memberships: "memberships",
            profiles: "profiles",
            servers: "servers",
            channels: "channels",
            roles: "roles",
            bannedUsers: "banned_users",
            mutedUsers: "muted_users",
        },
    })),
}));

const { GET } = await import("../../app/api/servers/[serverId]/members/route");

describe("server members route", () => {
    beforeEach(() => {
        mockListDocuments.mockReset();
        mockDeleteDocument.mockReset();
        mockGetServerSession.mockReset();
        mockGetServerPermissionsForUser.mockReset();

        mockGetServerSession.mockResolvedValue({ $id: "caller-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageRoles: true },
        });
    });

/**
 * Routes listDocuments by collection rather than by call order, so the test
 * does not break when the route changes how many parallel queries it issues.
 */
function mockCollections(collections: Record<string, Array<Record<string, unknown>>>) {
    mockListDocuments.mockImplementation(
        async (_db: string, collectionId: string) => ({
            documents: collections[collectionId] ?? [],
        }),
    );
}


    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/members"),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();
        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("returns 403 when caller lacks manageRoles", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageRoles: false },
        });

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/members"),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();
        expect(response.status).toBe(403);
        expect(data.error).toBe("Forbidden");
    });

    it("returns enriched members when authorized", async () => {
        mockCollections({
            memberships: [{ userId: "user-1" }, { userId: "user-2" }],
            role_assignments: [
                { userId: "user-1", roleIds: ["role-1"] },
                { userId: "user-2", roleIds: [] },
            ],
            roles: [
                { $id: "role-1", name: "Moderator", color: "#ff0000", position: 10 },
            ],
            banned_users: [{ userId: "user-1", reason: "spam" }],
            muted_users: [{ userId: "user-2", reason: "too fast" }],
            profiles: [
                { userId: "user-1", displayName: "User One", avatarUrl: "one.png" },
                { userId: "user-2", displayName: "User Two", avatarUrl: "two.png" },
            ],
        });

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/members"),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(Array.isArray(data.members)).toBe(true);
        expect(data.members).toHaveLength(2);
        // Assert the moderation lookups happened and were scoped to this server,
        // without depending on the order the parallel queries are issued in.
        for (const collectionId of ["banned_users", "muted_users"]) {
            const call = mockListDocuments.mock.calls.find(
                (callArgs) => callArgs[1] === collectionId,
            );
            expect(call, `expected a query against ${collectionId}`).toBeDefined();
            expect(call?.[0]).toBe("test-db");
            expect(call?.[2]).toContain("equal(serverId,server-1)");
        }
        expect(data.members[0].userId).toBe("user-1");
        expect(data.members[0].roleIds).toEqual(["role-1"]);
        expect(data.members[0].isBanned).toBe(true);
        expect(data.members[0].isMuted).toBe(false);
        expect(data.members[1].userId).toBe("user-2");
        expect(data.members[1].isBanned).toBe(false);
        expect(data.members[1].isMuted).toBe(true);
    });

    it("skips orphan memberships without mutating documents", async () => {
        mockCollections({
            memberships: [{ userId: "user-1" }, { userId: "missing-user" }],
            role_assignments: [{ userId: "user-1", roleIds: ["role-1"] }],
            roles: [
                { $id: "role-1", name: "Moderator", color: "#ff0000", position: 10 },
            ],
            banned_users: [{ userId: "user-1" }],
            muted_users: [],
            profiles: [
                { userId: "user-1", displayName: "User One", avatarUrl: "one.png" },
            ],
        });

        const response = await GET(
            new NextRequest("http://localhost/api/servers/server-1/members"),
            { params: Promise.resolve({ serverId: "server-1" }) },
        );

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.members).toHaveLength(1);
        expect(data.members[0].userId).toBe("user-1");
        expect(mockDeleteDocument).not.toHaveBeenCalled();
    });
});
