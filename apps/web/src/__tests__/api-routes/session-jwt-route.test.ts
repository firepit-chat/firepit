import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    mockAccountGet,
    mockUsersCreateJWT,
    mockGetServerClient,
} = vi.hoisted(() => ({
    mockAccountGet: vi.fn(),
    mockUsersCreateJWT: vi.fn(),
    mockGetServerClient: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
    Account: class {
        get = mockAccountGet;
    },
    Users: class {
        createJWT = mockUsersCreateJWT;
    },
    Client: class {
        setEndpoint = vi.fn().mockReturnThis();
        setProject = vi.fn().mockReturnThis();
        setSession = vi.fn().mockReturnThis();
        setKey = vi.fn().mockReturnThis();
    },
}));

vi.mock("next/headers", () => ({
    cookies: vi.fn(async () => ({ get: mockGetCookie })),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getEnvConfig: vi.fn(() => ({
        endpoint: "http://localhost/v1",
        project: "test-project",
    })),
}));

vi.mock("@/lib/appwrite-server", () => ({ getServerClient: mockGetServerClient }));

vi.mock("@/lib/posthog-utils", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockGetCookie = vi.fn();

const { GET } = await import("@/app/api/session/route");

describe("GET /api/session", () => {
    beforeEach(() => {
        mockGetCookie.mockReset();
        mockAccountGet.mockReset();
        mockUsersCreateJWT.mockReset();
        mockGetServerClient.mockReset();

        mockGetCookie.mockReturnValue({ value: "session-secret" });
        mockAccountGet.mockResolvedValue({ $id: "user-1" });
        mockUsersCreateJWT.mockResolvedValue({ jwt: "realtime-jwt" });
        mockGetServerClient.mockReturnValue({ client: { endpoint: "admin" } });
    });

    it("mints a JWT for the user the cookie session belongs to", async () => {
        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({ jwt: "realtime-jwt", project: "test-project" });
        // The id must come from Appwrite's verification of the session, not
        // from anything decoded out of the cookie.
        expect(mockUsersCreateJWT).toHaveBeenCalledWith({
            userId: "user-1",
        });
    });

    it("401s when there is no session cookie", async () => {
        mockGetCookie.mockReturnValue(undefined);
        const response = await GET();

        expect(response.status).toBe(401);
        expect(mockAccountGet).not.toHaveBeenCalled();
        expect(mockUsersCreateJWT).not.toHaveBeenCalled();
    });

    it("does not mint a JWT when the session fails verification", async () => {
        mockAccountGet.mockRejectedValue(new Error("unauthorized"));
        const response = await GET();

        // Never reaches the minting step, so an invalid cookie cannot produce a
        // token for any user.
        expect(mockUsersCreateJWT).not.toHaveBeenCalled();
        expect(response.status).toBe(500);
    });

    it("propagates a minting failure rather than returning a token", async () => {
        mockUsersCreateJWT.mockRejectedValue(new Error("missing scope"));
        const response = await GET();

        expect(response.status).toBe(500);
        const data = await response.json();
        expect(data.jwt).toBeUndefined();
    });
});
