import { Query } from "node-appwrite";
import { redirect } from "next/navigation";
import { MessageSquare, ShieldAlert } from "lucide-react";
import type { FileAttachment, Server } from "@/lib/types";
import {
    getAdminClient,
    listAllServersPage,
    listGlobalMessages,
} from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { listMembershipsForUser } from "@/lib/appwrite-servers";
import { getProfilesByUserIds } from "@/lib/appwrite-profiles";
import { getUserRoleTags } from "@/lib/appwrite-roles";
import { checkUserRoles, requireAuth } from "@/lib/auth-server";
import { getServerClient } from "@/lib/appwrite-server";
import {
    getChannelAccessForUser,
    getServerPermissionsForUser,
} from "@/lib/server-channel-access";
import { chunkValues } from "@/lib/appwrite-pagination";
import { ModerationSidebar } from "@/components/moderation-sidebar";
import { ModerationMessageList } from "./ModerationMessageList";

// Data is per-user and per-server; don't pre-render statically.
export const instant = false;

const SERVER_PAGE_SCAN_LIMIT = 3; // safety cap on pages
const MESSAGE_LIMIT = 30;

type ModerationMessage = {
    $id: string;
    attachments?: FileAttachment[];
    imageUrl?: string;
    removedAt?: string;
    removedBy?: string;
    serverId?: string;
    channelId?: string;
    text?: string;
    userId?: string;
    userName?: string;
    mentions?: string[];
};

type ModerationDisplayMessage = ModerationMessage & {
    senderDisplay: string;
    serverDisplay: string;
    channelDisplay: string;
    removedByDisplay?: string;
};

function shortId(value?: string) {
    if (!value) {
        return "";
    }
    return value.slice(0, 8);
}

async function fetchServerOptions(serverIds: string[]): Promise<Server[]> {
    const env = getEnvConfig();
    const { databases } = getAdminClient();
    const pages = await Promise.all(
        chunkValues(serverIds, 100).map((chunk) =>
            databases.listDocuments(env.databaseId, env.collections.servers, [
                Query.equal("$id", chunk),
                Query.limit(chunk.length),
            ]),
        ),
    );
    const servers: Server[] = [];
    for (const page of pages) {
        for (const raw of page.documents) {
            const d = raw as Record<string, unknown>;
            servers.push({
                $id: String(d.$id),
                name: typeof d.name === "string" && d.name ? d.name : "Unnamed Server",
                $createdAt: String(d.$createdAt ?? ""),
                ownerId: String(d.ownerId ?? ""),
            });
        }
    }
    return servers;
}

async function listAllServerIds(): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < SERVER_PAGE_SCAN_LIMIT; i += 1) {
        const page = await listAllServersPage(100, cursor);
        ids.push(...page.items.map((s) => s.$id));
        if (!page.nextCursor) {
            break;
        }
        cursor = page.nextCursor;
    }
    return ids;
}

async function listModeratableServers(
    userId: string,
    roles: Awaited<ReturnType<typeof checkUserRoles>>,
): Promise<Server[]> {
    let serverIds: string[];
    if (roles.isModerator || roles.isAdmin) {
        serverIds = await listAllServerIds();
    } else {
        const memberships = await listMembershipsForUser(userId);
        serverIds = [...new Set(memberships.map((m) => m.serverId))];
    }

    const servers = await fetchServerOptions(serverIds);
    if (roles.isModerator || roles.isAdmin) {
        return servers;
    }

    const env = getEnvConfig();
    const { databases } = getServerClient();
    const moderated: Server[] = [];
    for (const server of servers) {
        if (server.ownerId === userId) {
            moderated.push(server);
            continue;
        }
        try {
            const access = await getServerPermissionsForUser(
                databases,
                env,
                server.$id,
                userId,
            );
            if (access.permissions.manageMessages) {
                moderated.push(server);
            }
        } catch {
            // Skip servers the user can no longer access (e.g. deleted)
        }
    }
    return moderated;
}

async function resolveSelectedChannel(
    serverId: string,
    userId: string,
    channelId: string | undefined,
) {
    if (!channelId) {
        return null;
    }
    const env = getEnvConfig();
    const { databases } = getServerClient();
    try {
        const doc = await databases.getDocument(
            env.databaseId,
            env.collections.channels,
            channelId,
        );
        const d = doc as Record<string, unknown>;
        if (String(d.serverId) !== serverId) {
            return null;
        }
        const access = await getChannelAccessForUser(
            databases,
            env,
            channelId,
            userId,
        );
        if (!access.canRead) {
            return null;
        }
        return {
            $id: channelId,
            name: typeof d.name === "string" && d.name ? d.name : "channel",
        };
    } catch {
        return null;
    }
}

async function buildBadgeMapSimple(
    docs: { userId?: string; removedBy?: string }[],
) {
    const map: Record<string, string[]> = {};
    const ids = new Set<string>();
    for (const d of docs) {
        if (d.userId) {
            ids.add(d.userId);
        }
        if (d.removedBy) {
            ids.add(d.removedBy);
        }
    }
    for (const id of ids) {
        const info = await getUserRoleTags(id);
        map[id] = info.tags.map((t) => t.label);
    }
    return map;
}

async function enrichForChannel(
    documents: ModerationMessage[],
    serverName: string,
    channelName: string,
): Promise<ModerationDisplayMessage[]> {
    const userIds = new Set<string>();
    for (const message of documents) {
        if (message.userId) {
            userIds.add(message.userId);
        }
        if (message.removedBy) {
            userIds.add(message.removedBy);
        }
    }
    const profiles = await getProfilesByUserIds([...userIds]);

    return documents.map((message) => {
        const senderProfile = message.userId
            ? profiles.get(message.userId)
            : null;
        const removedByProfile = message.removedBy
            ? profiles.get(message.removedBy)
            : null;

        return {
            ...message,
            senderDisplay:
                message.userName?.trim() ||
                senderProfile?.displayName ||
                shortId(message.userId),
            serverDisplay: serverName,
            channelDisplay: channelName,
            removedByDisplay: message.removedBy
                ? (removedByProfile?.displayName ?? shortId(message.removedBy))
                : undefined,
        };
    });
}

export default async function ModerationPage(props: {
    searchParams?: Promise<Record<string, string | string[]>>;
}) {
    const searchParams = await props.searchParams;

    const user = await requireAuth().catch(() => redirect("/"));
    const roles = await checkUserRoles(user.$id);
    const servers = await listModeratableServers(user.$id, roles);

    const requestedServerId =
        typeof searchParams?.serverId === "string"
            ? searchParams.serverId
            : undefined;
    const selectedServer =
        servers.find((s) => s.$id === requestedServerId) ?? servers[0] ?? null;

    if (!selectedServer) {
        return (
            <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
                <Header />
                <div className="rounded-xl border border-border/80 p-8 text-center">
                    <p className="text-sm font-semibold text-muted-foreground">
                        No moderation access
                    </p>
                    <p className="mt-2 text-muted-foreground">
                        You need the manage messages permission in a server to
                        use moderation tools.
                    </p>
                </div>
            </main>
        );
    }

    const channelId =
        typeof searchParams?.channelId === "string"
            ? searchParams.channelId
            : undefined;
    const channel = await resolveSelectedChannel(
        selectedServer.$id,
        user.$id,
        channelId,
    );

    let isAdmin = false;
    let documents: ModerationDisplayMessage[] = [];
    let badgeMap: Record<string, string[]> = {};
    let nextCursor: string | undefined;
    if (channel) {
        const env = getEnvConfig();
        const { databases } = getServerClient();
        const access = await getServerPermissionsForUser(
            databases,
            env,
            selectedServer.$id,
            user.$id,
        );
        isAdmin =
            roles.isAdmin ||
            access.isServerOwner ||
            access.permissions.administrator;

        const fetched = await listGlobalMessages({
            limit: MESSAGE_LIMIT,
            serverId: selectedServer.$id,
            channelId: channel.$id,
            includeRemoved: true,
        });
        const raw = fetched.items as unknown as ModerationMessage[];
        documents = await enrichForChannel(
            raw,
            selectedServer.name,
            channel.name,
        );
        badgeMap = await buildBadgeMapSimple(raw);
        nextCursor = fetched.nextCursor || undefined;
    }

    return (
        <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
            <Header serverName={selectedServer.name} />

            <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                <ModerationSidebar
                    servers={servers}
                    selectedServerId={selectedServer.$id}
                    selectedChannelId={channel?.$id}
                    userId={user.$id}
                />

                <section className="min-w-0 space-y-6">
                    {channel && documents ? (
                        <>
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-lg font-semibold">
                                    Messages in {channel.name}
                                </h2>
                                <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                                    {documents.length} result
                                    {documents.length === 1 ? "" : "s"}
                                </span>
                            </div>
                            <div className="rounded-xl border border-border/80 p-4">
                                <ModerationMessageList
                                    badgeMap={badgeMap}
                                    channelId={channel.$id}
                                    initialMessages={documents}
                                    isAdmin={isAdmin}
                                />
                            </div>
                            {nextCursor && (
                                <div className="flex justify-center pt-2">
                                    <form
                                        className="inline-flex items-center gap-3 rounded-xl border border-border/80 px-6 py-4"
                                        method="get"
                                    >
                                        <input
                                            name="serverId"
                                            type="hidden"
                                            value={selectedServer.$id}
                                        />
                                        <input
                                            name="channelId"
                                            type="hidden"
                                            value={channel.$id}
                                        />
                                        <input
                                            name="cursor"
                                            type="hidden"
                                            value={nextCursor}
                                        />
                                        <button
                                            className="rounded-lg border border-border/60 bg-background px-5 py-2 text-sm font-medium text-foreground transition hover:border-foreground/40"
                                            type="submit"
                                        >
                                            Load more messages
                                        </button>
                                    </form>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="rounded-xl border border-border/80 p-8 text-center">
                            <MessageSquare
                                className="mx-auto h-8 w-8 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <p className="mt-3 text-sm text-muted-foreground">
                                Pick a channel from the sidebar to review its
                                messages.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}

function Header({ serverName }: { serverName?: string }) {
    return (
        <header className="rounded-xl border border-border/80 p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Live moderation tools
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {serverName ? `Moderate ${serverName}` : "Moderation panel"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Sweep a server&apos;s messages, review removed ones, and take
                action without leaving this workspace.
            </p>
        </header>
    );
}