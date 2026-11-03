"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { StatusIndicator } from "@/components/status-indicator";
import {
    useViewerMembers,
    type ViewerMember,
} from "@/hooks/use-viewer-members";
import { useStatusSubscription } from "@/app/chat/hooks/useStatusSubscription";
import { partitionByPresence } from "@/lib/presence";
import type { UserStatus } from "@/lib/types";

function initialsFor(member: ViewerMember): string {
    const label = member.displayName || member.username || "";
    const trimmed = label.trim();
    if (!trimmed) {
        return "?";
    }
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function displayLabelFor(member: ViewerMember): string {
    return member.displayName || member.username || "Unknown member";
}

function MemberRow({
    member,
    status,
    onOpenProfile,
}: {
    member: ViewerMember;
    status: UserStatus | undefined;
    onOpenProfile: (userId: string, displayName: string) => void;
}) {
    const label = displayLabelFor(member);
    const customStatus = status?.customMessage?.trim();

    return (
        <li>
            <button
                type="button"
                onClick={() => onOpenProfile(member.userId, label)}
                className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent/50"
            >
                <Avatar
                    alt={label}
                    fallback={initialsFor(member)}
                    size="sm"
                    src={member.avatarUrl}
                    framePreset={member.avatarFramePreset ?? undefined}
                    frameUrl={member.avatarFrameUrl ?? undefined}
                />

                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate text-xs text-foreground">
                            {label}
                        </span>
                        {status ? (
                            <StatusIndicator status={status.status} size="sm" />
                        ) : null}
                        {member.role ? (
                            <span
                                className="max-w-[7rem] shrink-0 truncate rounded px-1.5 py-0.5 text-[10px] font-medium"
                                style={{
                                    color: member.role.color,
                                    backgroundColor: `${member.role.color}1f`,
                                }}
                                title={member.role.name}
                            >
                                {member.role.name}
                            </span>
                        ) : null}
                    </span>
                    {/* Indented under the name so it reads as a status rather
                        than as a second label. */}
                    {customStatus ? (
                        <span className="truncate pl-0.5 text-[11px] italic text-muted-foreground">
                            {customStatus}
                        </span>
                    ) : null}
                </span>
            </button>
        </li>
    );
}

function MemberGroup({
    title,
    members,
    statuses,
    onOpenProfile,
}: {
    title: string;
    members: ViewerMember[];
    statuses: Map<string, UserStatus>;
    onOpenProfile: (userId: string, displayName: string) => void;
}) {
    if (members.length === 0) {
        return null;
    }

    return (
        <div className="space-y-0.5">
            <div className="flex items-center gap-2 px-1.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {title}
                <span className="font-normal normal-case tracking-normal">
                    ({members.length})
                </span>
            </div>
            <ul className="space-y-0.5">
                {members.map((member) => (
                    <MemberRow
                        key={member.userId}
                        member={member}
                        status={statuses.get(member.userId)}
                        onOpenProfile={onOpenProfile}
                    />
                ))}
            </ul>
        </div>
    );
}

/**
 * Member list panel for the chat right rail.
 *
 * The server already returns members ordered by role rank and then by name, so
 * this partitions that order into online and offline groups rather than
 * re-sorting: a stable partition preserves role precedence within each group.
 */
export function ChatMembersContent({
    serverId,
    onOpenProfile,
}: {
    serverId: string | null | undefined;
    onOpenProfile?: (userId: string, displayName: string) => void;
}) {
    const { members, loading, truncated } = useViewerMembers(serverId);
    const memberIds = useMemo(
        () => members.map((member) => member.userId),
        [members],
    );
    const { statuses } = useStatusSubscription(
        memberIds,
        Boolean(serverId) && memberIds.length > 0,
    );

    const { online, offline } = useMemo(
        () =>
            partitionByPresence(
                members,
                (member) => statuses.get(member.userId)?.status,
            ),
        [members, statuses],
    );

    const openProfile = onOpenProfile ?? (() => undefined);

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                Members
                {members.length > 0 ? (
                    <span className="text-xs font-normal text-muted-foreground">
                        {members.length}
                    </span>
                ) : null}
            </div>

            {loading && members.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    Loading members…
                </p>
            ) : null}

            {!loading && members.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    No members to show.
                </p>
            ) : null}

            {members.length > 0 ? (
                <>
                    <MemberGroup
                        title="Online"
                        members={online}
                        statuses={statuses}
                        onOpenProfile={openProfile}
                    />
                    <MemberGroup
                        title="Offline"
                        members={offline}
                        statuses={statuses}
                        onOpenProfile={openProfile}
                    />
                </>
            ) : null}

            {truncated ? (
                <p className="text-[11px] text-muted-foreground">
                    Large server — some members may be missing.
                </p>
            ) : null}
        </div>
    );
}
