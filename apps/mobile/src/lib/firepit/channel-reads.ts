import { firepitRequest } from "@/lib/firepit/http";

/**
 * Per-channel read state, mirroring the web app's /api/channel-reads: the server
 * keeps a channelId -> lastReadAt map per user per server.
 */
export type ChannelReadMap = Record<string, string>;

export type ChannelReadsResponse = {
    reads: ChannelReadMap;
    serverId: string;
};

export async function fetchChannelReads(
    baseUrl: string,
    token: string,
    serverId: string,
) {
    const response = await firepitRequest<ChannelReadsResponse>({
        baseUrl,
        path: "/api/channel-reads",
        query: { serverId },
        token,
    });
    return response.reads ?? {};
}

/** Best-effort: a failed mark only leaves the channel looking unread. */
export async function markChannelRead(
    baseUrl: string,
    token: string,
    serverId: string,
    channelId: string,
    lastReadAt: string,
) {
    const response = await firepitRequest<ChannelReadsResponse>({
        baseUrl,
        body: { channelId, lastReadAt, serverId },
        method: "PUT",
        path: "/api/channel-reads",
        token,
    });
    return response.reads ?? {};
}
