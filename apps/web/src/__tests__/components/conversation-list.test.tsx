/// <reference lib="dom" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";

import { ConversationList } from "@/app/chat/components/ConversationList";
import type { Conversation } from "@/lib/types";

const mockUseFriends = vi.fn();
const mockGetOrCreateConversation = vi.fn();
const mockPush = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("@/hooks/useFriends", () => ({
    useFriends: (enabled: boolean) => mockUseFriends(enabled),
}));

vi.mock("@/lib/appwrite-dms-client", () => ({
    getOrCreateConversation: (...args: unknown[]) =>
        mockGetOrCreateConversation(...args),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

describe("ConversationList", () => {
    function createTestConversation(
        overrides: Partial<Conversation>,
    ): Conversation {
        return {
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "conv-1",
            participants: ["current-user", "friend-1"],
            ...overrides,
        };
    }

    // The timestamp is the one part of the row that must never give up space:
    // it is what keeps every time in the same place. Everything else ellipsises.
    function rowTimestampFor(lastMessageAt: string, name: string) {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-ts",
                        lastMessageAt,
                        otherUser: { displayName: name } as never,
                    }),
                ]}
                currentUserId="current-user"
                loading={false}
                onSelectConversation={vi.fn()}
            />,
        );
        const cell = document.querySelector("span.tabular-nums");
        if (!cell) throw new Error("timestamp not rendered");
        return cell;
    }

    it("keeps the timestamp unshrinkable and unwrappable", () => {
        const cell = rowTimestampFor(
            "2026-03-10T12:12:00.000Z",
            "A".repeat(200),
        );
        expect(cell.className).toContain("shrink-0");
        expect(cell.className).toContain("whitespace-nowrap");
        expect(cell.className).toContain("tabular-nums");
    });

    it("truncates a long name instead of letting it push the timestamp", () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-long",
                        lastMessageAt: "2026-03-10T12:12:00.000Z",
                        otherUser: { displayName: "B".repeat(200) } as never,
                    }),
                ]}
                currentUserId="current-user"
                loading={false}
                onSelectConversation={vi.fn()}
            />,
        );
        const name = screen.getByText("B".repeat(200));
        expect(name.className).toContain("truncate");
    });

    // Truncation only engages if every flex ancestor between the name and the
    // row can shrink. A single missing `min-w-0` lets a long name (or a long
    // system-announcement line) push the timestamp and the options menu out of
    // the panel entirely, which is what made them unreachable.
    // A 1:1 row used to render the dot only when a status was already present,
    // which hid it for auto-set and not-yet-loaded statuses — the people you
    // most want to spot. It now always shows one.
    it("always shows a status dot on a one-to-one row", () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-no-status",
                        otherUser: {
                            displayName: "No Status Yet",
                        } as never,
                    }),
                ]}
                currentUserId="current-user"
                loading={false}
                onSelectConversation={vi.fn()}
            />,
        );

        // The dot carries a title of the status name. The friend row also
        // renders one now, so scope to the DM row under test.
        const row = screen.getByText("No Status Yet").closest("button");
        expect(
            row?.parentElement?.querySelector('[title="Offline"]'),
        ).not.toBeNull();
    });

    // Friends render only in the friends section (the rows below exclude them),
    // so that row has to carry the same affordances as a DM row or the only way
    // to act on a friend is to start a conversation with them first.
    it("gives a friend with a conversation a date and the options menu", () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-friend",
                        lastMessageAt: "2026-03-10T12:12:00.000Z",
                        otherUser: {
                            displayName: "Friend One",
                            userId: "friend-1",
                        } as never,
                    }),
                ]}
                currentUserId="current-user"
                loading={false}
                onMuteConversation={vi.fn()}
                onSelectConversation={vi.fn()}
            />,
        );

        expect(
            screen.getByLabelText("Options for Friend One"),
        ).toBeInTheDocument();
    });

    it("still shows a status dot for a friend", () => {
        render(
            <ConversationList
                conversations={[]}
                currentUserId="current-user"
                loading={false}
                onSelectConversation={vi.fn()}
            />,
        );

        expect(screen.getAllByTitle("Offline").length).toBeGreaterThan(0);
    });

    // The friend row used to render a second, always-present button next to the
    // options menu. It held a permanent 32px slot even while invisible, which
    // pushed every friend timestamp left of the DM timestamps below.
    it("gives a friend row one trailing control so dates align", () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-friend",
                        lastMessageAt: "2026-03-10T12:12:00.000Z",
                        otherUser: {
                            displayName: "Friend One",
                            userId: "friend-1",
                        } as never,
                    }),
                ]}
                currentUserId="current-user"
                loading={false}
                onMuteConversation={vi.fn()}
                onSelectConversation={vi.fn()}
            />,
        );

        const friendRow = screen
            .getByLabelText("Options for Friend One")
            .closest("div.group");

        // A single trailing button, matching a DM row.
        expect(friendRow?.querySelectorAll("button").length).toBe(2);
    });

    // A row rendered the raw stored status word, so an automatic status read as
    // lowercase "offline" rather than a readable label.
    it("renders a readable presence label on a one-to-one row", () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-status",
                        otherUser: {
                            displayName: "Status Person",
                            status: "offline",
                        } as never,
                    }),
                ]}
                currentUserId="current-user"
                loading={false}
                onSelectConversation={vi.fn()}
            />,
        );

        // The friend row also renders a presence label, so scope to this row.
        const row = screen.getByText("Status Person").closest("button");
        expect(row?.textContent).toContain("Offline");
    });

    it("shows the custom status text when one is set", () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-custom",
                        otherUser: {
                            displayName: "Custom Person",
                            status: "busy",
                            statusMessage: "2.2 coming soon",
                        } as never,
                    }),
                ]}
                currentUserId="current-user"
                loading={false}
                onSelectConversation={vi.fn()}
            />,
        );

        expect(screen.getByText("Busy — 2.2 coming soon")).toBeInTheDocument();
    });

    it("lets every ancestor between the name and the row shrink", () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-shrink",
                        lastMessageAt: "2026-03-10T12:12:00.000Z",
                        otherUser: { displayName: "D".repeat(200) } as never,
                    }),
                ]}
                currentUserId="current-user"
                loading={false}
                onSelectConversation={vi.fn()}
            />,
        );

        const name = screen.getByText("D".repeat(200));
        // Walk up to the row and require `min-w-0` on each flex level.
        let node: HTMLElement | null = name;
        let depth = 0;
        while (node && depth < 8) {
            const className = node.className ?? "";
            if (/\bflex\b/.test(className)) {
                expect(className, `missing min-w-0 on: ${className}`).toContain(
                    "min-w-0",
                );
            }
            node = node.parentElement;
            depth += 1;
        }
    });

    it("does not let the unread badge be squeezed by the name", () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-badge",
                        lastMessageAt: "2026-03-10T12:12:00.000Z",
                        otherUser: { displayName: "C".repeat(200) } as never,
                    }),
                ]}
                conversationUnreadStateById={{
                    "conv-badge": { count: 7, muted: false },
                }}
                currentUserId="current-user"
                loading={false}
                onSelectConversation={vi.fn()}
            />,
        );
        const badge = screen.getByText("7");
        expect(badge.className).toContain("shrink-0");
    });

    function clickFriendShortcut(name: string) {
        const label = screen.getAllByText(name)[0];
        const shortcutButton = label.closest("button");
        if (!shortcutButton) {
            throw new Error(`Shortcut button not found for ${name}`);
        }

        fireEvent.click(shortcutButton);
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", vi.fn());
        mockUseFriends.mockReturnValue({
            friends: [
                {
                    friendship: {
                        $id: "friendship-1",
                    },
                    user: {
                        userId: "friend-1",
                        displayName: "Friend One",
                        pronouns: "they/them",
                    },
                },
            ],
            incoming: [
                {
                    friendship: {
                        $id: "incoming-1",
                    },
                    user: {
                        userId: "incoming-user",
                        displayName: "Incoming User",
                    },
                },
            ],
            loading: false,
            actionLoading: null,
            acceptFriendRequest: vi.fn().mockResolvedValue(true),
            declineFriendRequest: vi.fn().mockResolvedValue(true),
            removeFriendship: vi.fn().mockResolvedValue(true),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("creates a direct message from a friend shortcut when no existing conversation exists", async () => {
        mockGetOrCreateConversation.mockResolvedValue({ $id: "conv-new" });
        const onConversationCreated = vi.fn();

        render(
            <ConversationList
                conversations={[]}
                currentUserId="current-user"
                loading={false}
                onConversationCreated={onConversationCreated}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        clickFriendShortcut("Friend One");

        await waitFor(() => {
            expect(mockGetOrCreateConversation).toHaveBeenCalledWith(
                "current-user",
                "friend-1",
            );
        });

        expect(onConversationCreated).toHaveBeenCalledWith({ $id: "conv-new" });
    });

    it("selects an existing one-to-one conversation from a friend shortcut", async () => {
        const onSelectConversation = vi.fn();
        const conversation = createTestConversation({
            $id: "conv-existing",
            otherUser: { userId: "friend-1", displayName: "Friend One" },
        });

        render(
            <ConversationList
                conversations={[conversation]}
                currentUserId="current-user"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={onSelectConversation}
                selectedConversationId={null}
            />,
        );

        clickFriendShortcut("Friend One");

        expect(mockGetOrCreateConversation).not.toHaveBeenCalled();
        expect(onSelectConversation).toHaveBeenCalledWith(conversation);
    });

    it("prioritizes unread conversations when unread state is provided", async () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-read",
                        otherUser: {
                            userId: "friend-read",
                            displayName: "Read Friend",
                        },
                        participants: ["current-user", "friend-read"],
                    }),
                    createTestConversation({
                        $id: "conv-unread",
                        otherUser: {
                            userId: "friend-unread",
                            displayName: "Unread Friend",
                        },
                        participants: ["current-user", "friend-unread"],
                    }),
                ]}
                conversationUnreadStateById={{
                    "conv-unread": { count: 2, muted: false },
                }}
                currentUserId="current-user"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("Unread Friend")).toBeInTheDocument();
        });
        expect(screen.queryByText("Read Friend")).not.toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("ignores legacy unreadThreadCount fallback under message_v2 contract", async () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $createdAt: "2026-03-10T12:00:00.000Z",
                        $id: "conv-legacy",
                        otherUser: {
                            displayName: "Legacy Friend",
                            userId: "legacy-friend",
                        },
                        participants: ["current-user", "legacy-friend"],
                        unreadThreadCount: 5,
                    }),
                ]}
                currentUserId="current-user"
                inboxContractVersion="message_v2"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        const conversationButton = screen.getByRole("button", {
            name: /legacy friend/i,
        });

        expect(within(conversationButton).queryByText("5")).toBeNull();
    });

    it("uses conversation unread state over legacy unreadThreadCount in message_v2", async () => {
        render(
            <ConversationList
                conversations={[
                    createTestConversation({
                        $id: "conv-mention",
                        otherUser: {
                            userId: "mention-author",
                            displayName: "Mention Author",
                        },
                        participants: ["current-user", "mention-author"],
                        unreadThreadCount: 99,
                    }),
                ]}
                conversationUnreadStateById={{
                    "conv-mention": { count: 3, muted: false },
                }}
                currentUserId="current-user"
                inboxContractVersion="message_v2"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={vi.fn()}
                selectedConversationId={null}
            />,
        );

        expect(
            screen.getByRole("button", { name: /mention author/i }),
        ).toHaveTextContent("3");
        expect(
            screen.getByRole("button", { name: /mention author/i }),
        ).not.toHaveTextContent("99");
    });

    it("selects a conversation when a row is clicked", async () => {
        const onSelectConversation = vi.fn();
        const conversation = createTestConversation({
            $id: "conv-select",
            otherUser: {
                userId: "select-user",
                displayName: "Select Me",
            },
            participants: ["current-user", "select-user"],
        });

        render(
            <ConversationList
                conversations={[conversation]}
                currentUserId="current-user"
                loading={false}
                onConversationCreated={vi.fn()}
                onNewConversation={vi.fn()}
                onSelectConversation={onSelectConversation}
                selectedConversationId={null}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /select me/i }));

        expect(onSelectConversation).toHaveBeenCalledWith(conversation);
        expect(mockPush).not.toHaveBeenCalled();
    });
});
