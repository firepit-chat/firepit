"use client";

import { Users } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import {
    useViewerMembers,
    type ViewerMember,
} from "@/hooks/use-viewer-members";

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

/**
 * Member list panel for the chat right rail.
 *
 * The server already returns members ordered by role rank and then by name, so
 * this renders the list as given rather than re-sorting it.
 */
export function ChatMembersContent({
    serverId,
}: {
    serverId: string | null | undefined;
}) {
    const { members, loading, truncated } = useViewerMembers(serverId);

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

            <ul className="space-y-0.5">
                {members.map((member) => (
                    <li
                        key={member.userId}
                        className="flex items-center gap-2 rounded-md px-1.5 py-1"
                    >
                        <Avatar
                            alt={displayLabelFor(member)}
                            fallback={initialsFor(member)}
                            size="sm"
                            src={member.avatarUrl}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                            {displayLabelFor(member)}
                        </span>
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
                    </li>
                ))}
            </ul>

            {truncated ? (
                <p className="text-[11px] text-muted-foreground">
                    Large server — some members may be missing.
                </p>
            ) : null}
        </div>
    );
}
