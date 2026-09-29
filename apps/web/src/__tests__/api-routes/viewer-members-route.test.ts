import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockListDocuments, mockGetServerSession, mockGetServerPermissionsForUser } =
    vi.hoisted(() => ({
        mockListDocuments: vi.fn(),
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
    getServerClient: vi.fn(() => ({ databases: { listDocuments: mockListDocuments } })),
}));

vi.mock("@/lib/auth-server", () => ({ getServerSession: mockGetServerSession }));

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

const { GET } = await import(
    "../../app/api/servers/[serverId]/viewer/members/route"
);

const ROLES = [
    { $id: "role-owner", name: "Owner", color: "#ff0000", position: 100 },
    { $id: "role-mod", name: "Mod", color: "#00ff00", position: 50 },
    { $id: "role-member", name: "Member", color: "#0000ff", position: 1 },
];

function mockCollections(
    collections: Record<string, Array<Record<string, unknown>>>,
) {
    mockListDocuments.mockImplementation(
        async (_db: string, collectionId: string) => ({
            documents: collections[collectionId] ?? [],
        }),
    );
}

function seed(members: Array<{ userId: string; roleIds: string[] }>) {
    mockCollections({
        memberships: members.map((m) => ({ userId: m.userId })),
        role_assignments: members.map((m) => ({
            userId: m.userId,
            roleIds: m.roleIds,
        })),
        roles: ROLES,
        banned_users: [],
        muted_users: [],
        profiles: members.map((m) => ({
            userId: m.userId,
            userName: m.userId,
            displayName: m.userId.toUpperCase(),
        })),
    });
}

const call = () =>
    GET(new Request("http://localhost/api/servers/server-1/viewer/members"), {
        params: Promise.resolve({ serverId: "server-1" }),
    });

describe("viewer members route", () => {
    beforeEach(() => {
        mockListDocuments.mockReset();
        mockGetServerSession.mockReset();
        mockGetServerPermissionsForUser.mockReset();
        mockGetServerSession.mockResolvedValue({ $id: "caller-1" });
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: {},
        });
    });

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null);
        const response = await call();
        expect(response.status).toBe(401);
    });

    it("returns 403 for a non-member", async () => {
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: false,
            permissions: {},
        });
        const response = await call();
        expect(response.status).toBe(403);
    });

    it("does not require manageRoles", async () => {
        // The whole point of this endpoint: a plain member can read it.
        mockGetServerPermissionsForUser.mockResolvedValue({
            isMember: true,
            permissions: { manageRoles: false },
        });
        seed([{ userId: "user-1", roleIds: ["role-member"] }]);
        const response = await call();
        expect(response.status).toBe(200);
    });

    it("never exposes role ids, ban, or mute state", async () => {
        seed([{ userId: "user-1", roleIds: ["role-mod"] }]);
        mockCollections({
            memberships: [{ userId: "user-1" }],
            role_assignments: [{ userId: "user-1", roleIds: ["role-mod"] }],
            roles: ROLES,
            banned_users: [{ userId: "user-1", reason: "spam" }],
            muted_users: [{ userId: "user-1", reason: "loud" }],
            profiles: [{ userId: "user-1", displayName: "User One" }],
        });
        const response = await call();
        const data = await response.json();
        expect(response.status).toBe(200);
        const member = data.members[0];
        expect(Object.keys(member).sort()).toEqual([
            "avatarUrl",
            "displayName",
            "role",
            "userId",
            "username",
        ]);
        expect(member.roleIds).toBeUndefined();
        expect(member.isBanned).toBeUndefined();
        expect(member.isMuted).toBeUndefined();
    });

    it("returns a stable non-null handle even with no profile username", async () => {
        // `profiles` has no username column, so the handle falls back to the
        // account ID. This asserts a real value, not just a present key.
        mockCollections({
            memberships: [{ userId: "user-1" }],
            role_assignments: [{ userId: "user-1", roleIds: [] }],
            roles: ROLES,
            banned_users: [],
            muted_users: [],
            profiles: [{ userId: "user-1", displayName: "User One" }],
        });
        const response = await call();
        const data = await response.json();
        expect(data.members[0].username).toBe("user-1");
    });

    it("resolves each member's highest-ranked role", async () => {
        seed([
            { userId: "user-1", roleIds: ["role-member", "role-owner"] },
            { userId: "user-2", roleIds: ["role-mod", "role-member"] },
        ]);
        const response = await call();
        const data = await response.json();
        const byId = Object.fromEntries(
            data.members.map((m: { userId: string }) => [m.userId, m]),
        );
        expect(byId["user-1"].role).toEqual({
            id: "role-owner",
            name: "Owner",
            color: "#ff0000",
            position: 100,
        });
        expect(byId["user-2"].role.id).toBe("role-mod");
    });

    it("sorts by role rank, then by name", async () => {
        seed([
            { userId: "zeta", roleIds: ["role-member"] },
            { userId: "alpha", roleIds: ["role-member"] },
            { userId: "owner", roleIds: ["role-owner"] },
            { userId: "mod", roleIds: ["role-mod"] },
        ]);
        const response = await call();
        const data = await response.json();
        expect(data.members.map((m: { userId: string }) => m.userId)).toEqual([
            "owner",
            "mod",
            "alpha",
            "zeta",
        ]);
    });

    it("sorts members with no role below everyone who has one", async () => {
        seed([
            { userId: "norole-a", roleIds: [] },
            { userId: "hasrole", roleIds: ["role-member"] },
            { userId: "norole-b", roleIds: [] },
        ]);
        const response = await call();
        const data = await response.json();
        expect(data.members.map((m: { userId: string }) => m.userId)).toEqual([
            "hasrole",
            "norole-a",
            "norole-b",
        ]);
    });

    it("ignores role ids that no longer exist", async () => {
        seed([{ userId: "user-1", roleIds: ["role-deleted"] }]);
        const response = await call();
        const data = await response.json();
        expect(data.members[0].role).toBeNull();
    });
});
