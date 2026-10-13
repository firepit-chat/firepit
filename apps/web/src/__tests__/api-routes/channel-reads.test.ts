import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetChannelReads, mockUpsertChannelRead, mockLoggerError } =
    vi.hoisted(() => ({
        mockGetChannelReads: vi.fn(),
        mockLoggerError: vi.fn(),
        mockUpsertChannelRead: vi.fn(),
    }));

class ChannelReadsUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ChannelReadsUnavailableError";
    }
}

vi.mock("@/lib/channel-read-store", () => ({
    ChannelReadsUnavailableError,
    MAX_READS_ENTRIES: 1000,
    getChannelReads: mockGetChannelReads,
    upsertChannelRead: mockUpsertChannelRead,
}));

vi.mock("@/lib/posthog-utils", () => ({
    logger: { error: mockLoggerError, warn: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
    getServerSession: vi.fn(async () => ({ $id: "user-1" })),
}));

/**
 * Read state only drives badges, so a deployment problem must not look like a
 * retryable request error. The GET must always succeed (empty map) and the PUT
 * must report availability so the client can stop asking.
 */
describe("/api/channel-reads", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetChannelReads.mockResolvedValue({});
    });

    it("returns an empty map instead of failing when read state is broken", async () => {
        mockGetChannelReads.mockResolvedValue({});

        const { GET } = await import("@/app/api/channel-reads/route");
        const response = await GET(
            new Request("http://localhost/api/channel-reads?serverId=s1"),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            reads: {},
            serverId: "s1",
        });
    });

    it("requires serverId", async () => {
        const { GET } = await import("@/app/api/channel-reads/route");
        const response = await GET(
            new Request("http://localhost/api/channel-reads"),
        );
        expect(response.status).toBe(400);
    });

    it("reports 503 and channelReadsAvailable:false when not deployed", async () => {
        mockUpsertChannelRead.mockRejectedValue(
            new ChannelReadsUnavailableError(
                "Collection 'channel_reads' not found",
            ),
        );

        const { PUT } = await import("@/app/api/channel-reads/route");
        const response = await PUT(
            new Request("http://localhost/api/channel-reads", {
                body: JSON.stringify({
                    channelId: "c1",
                    lastReadAt: "2026-01-01T00:00:00.000Z",
                    serverId: "s1",
                }),
                method: "PUT",
            }),
        );

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            channelReadsAvailable: false,
            error: "Channel read state is unavailable",
        });
    });

    it("keeps availability true on an ordinary failure so the client backs off rather than disables", async () => {
        mockUpsertChannelRead.mockRejectedValue(new Error("boom"));

        const { PUT } = await import("@/app/api/channel-reads/route");
        const response = await PUT(
            new Request("http://localhost/api/channel-reads", {
                body: JSON.stringify({
                    channelId: "c1",
                    lastReadAt: "2026-01-01T00:00:00.000Z",
                    serverId: "s1",
                }),
                method: "PUT",
            }),
        );

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toMatchObject({
            channelReadsAvailable: true,
        });
    });

    it("rejects a malformed timestamp", async () => {
        const { PUT } = await import("@/app/api/channel-reads/route");
        const response = await PUT(
            new Request("http://localhost/api/channel-reads", {
                body: JSON.stringify({
                    channelId: "c1",
                    lastReadAt: "not-a-date",
                    serverId: "s1",
                }),
                method: "PUT",
            }),
        );
        expect(response.status).toBe(400);
        expect(mockUpsertChannelRead).not.toHaveBeenCalled();
    });

    // Appwrite serializes `$createdAt` with a `+00:00` offset while `$updatedAt`
    // uses `Z`. A Z-only validator rejected every real `$createdAt` with a 400,
    // so unread badges silently stopped working. Verbatim from the messages
    // collection on the live project.
    it.each([
        ["offset form", "2025-10-16T13:32:34.133+00:00", "2025-10-16T13:32:34.133Z"],
        ["Z form", "2025-10-16T13:33:19.895Z", "2025-10-16T13:33:19.895Z"],
        ["no fraction", "2025-10-16T13:33:19Z", "2025-10-16T13:33:19.000Z"],
        ["non-UTC offset", "2025-10-16T08:32:34.133-05:00", "2025-10-16T13:32:34.133Z"],
    ])("accepts and normalizes Appwrite's %s", async (_label, sent, stored) => {
        mockUpsertChannelRead.mockResolvedValue({ c1: stored });

        const { PUT } = await import("@/app/api/channel-reads/route");
        const response = await PUT(
            new Request("http://localhost/api/channel-reads", {
                body: JSON.stringify({
                    channelId: "c1",
                    lastReadAt: sent,
                    serverId: "s1",
                }),
                method: "PUT",
            }),
        );

        expect(response.status).toBe(200);
        expect(mockUpsertChannelRead).toHaveBeenCalledWith(
            expect.objectContaining({ lastReadAt: stored }),
        );
    });

    it("clamps a client clock running ahead of the server", async () => {
        mockUpsertChannelRead.mockResolvedValue({ c1: "x" });

        const { PUT } = await import("@/app/api/channel-reads/route");
        await PUT(
            new Request("http://localhost/api/channel-reads", {
                body: JSON.stringify({
                    channelId: "c1",
                    lastReadAt: "2999-01-01T00:00:00.000Z",
                    serverId: "s1",
                }),
                method: "PUT",
            }),
        );

        const sent = mockUpsertChannelRead.mock.calls[0]?.[0];
        expect(Date.parse(sent.lastReadAt)).toBeLessThanOrEqual(Date.now());
    });
});
