"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useState, type FormEvent } from "react";
import {
    Check,
    ChevronDown,
    Flame,
    LaptopMinimal,
    LogOut,
    Moon,
    Search,
    Sun,
    UserPlus,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { logoutAction } from "@/app/(auth)/login/actions";
import { NotificationsMenu } from "@/components/notifications-menu";
import { useAuth } from "@/contexts/auth-context";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { useFriends } from "@/hooks/useFriends";
import type { NavigationItemPreferenceId } from "@/lib/types";
import { resetSharedClient } from "@/lib/realtime-pool";
import { cn } from "@/lib/utils";

import { Avatar } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { StatusIndicator } from "./status-indicator";

const THEME_ICONS = {
    light: Sun,
    dark: Moon,
    system: LaptopMinimal,
} as const;

type HeaderProps = {
    onSearchClick?: () => void;
};

type NavigationLink = {
    count?: number;
    label: string;
    to: Route;
    visible: boolean;
};

type HeaderProfile = {
    avatarUrl?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
    displayName?: string;
};

function isValidHeaderProfile(data: unknown): data is HeaderProfile {
    if (typeof data !== "object" || data === null) {
        return false;
    }

    const record = data as Record<string, unknown>;
    for (const key of [
        "avatarUrl",
        "displayName",
        "avatarFramePreset",
        "avatarFrameUrl",
    ] as const) {
        const value = record[key];
        if (typeof value !== "undefined" && typeof value !== "string") {
            return false;
        }
    }

    return true;
}

function isActiveRoute(pathname: string, route: Route) {
    if (route === "/") {
        return pathname === "/";
    }

    return pathname === route || pathname.startsWith(`${route}/`);
}

function getNavigationLinkClassName(active: boolean) {
    return cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    );
}

export default function Header({ onSearchClick }: HeaderProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { setTheme, theme } = useTheme();
    const { userData, userStatus, loading, setUserData, updateUserStatus } =
        useAuth();
    const { navigationPreferences } = useDeveloperMode(
        userData?.userId ?? null,
    );
    const { incoming, loading: friendsLoading } = useFriends(
        Boolean(userData && navigationPreferences.showFriendsInNavigation),
    );
    const [isMounted, setIsMounted] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [headerProfile, setHeaderProfile] = useState<HeaderProfile | null>(
        null,
    );
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [customStatusMessage, setCustomStatusMessage] = useState("");

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!userData?.userId) {
            setHeaderProfile(null);
            return;
        }

        const controller = new AbortController();

        void (async () => {
            try {
                const response = await fetch(
                    `/api/users/${userData.userId}/profile`,
                    {
                        signal: controller.signal,
                    },
                );

                if (!response.ok) {
                    setHeaderProfile(null);
                    return;
                }

                const data = (await response.json()) as unknown;
                if (isValidHeaderProfile(data)) {
                    setHeaderProfile(data);
                } else {
                    setHeaderProfile(null);
                }
            } catch {
                if (!controller.signal.aborted) {
                    setHeaderProfile(null);
                }
            }
        })();

        return () => {
            controller.abort();
        };
    }, [userData?.userId]);

    useEffect(() => {
        setCustomStatusMessage(userStatus?.customMessage ?? "");
    }, [userStatus?.customMessage]);

    const isAuthenticated = Boolean(userData);
    const roles = userData?.roles;
    const incomingRequestCount = friendsLoading ? 0 : incoming.length;
    const showContent = isMounted && !loading;
    const displayName =
        headerProfile?.displayName?.trim() || userData?.name || "Account";
    const currentStatus = userStatus?.status || "offline";

    const optionalLinks: Record<NavigationItemPreferenceId, NavigationLink> = {
        docs: {
            label: "Docs",
            to: "/docs",
            visible:
                !isAuthenticated || navigationPreferences.showDocsInNavigation,
        },
        friends: {
            label: "Friends",
            to: "/friends",
            count: incomingRequestCount > 0 ? incomingRequestCount : undefined,
            visible:
                isAuthenticated &&
                Boolean(navigationPreferences.showFriendsInNavigation),
        },
        settings: {
            label: "Settings",
            to: "/settings",
            visible:
                isAuthenticated &&
                Boolean(navigationPreferences.showSettingsInNavigation),
        },
    };

    const menuTheme = theme ?? "system";

    const links: NavigationLink[] = [
        { to: "/", label: "Home", visible: true },
        { to: "/chat", label: "Chat", visible: true },
        ...navigationPreferences.navigationItemOrder.flatMap((item) => {
            const link = optionalLinks[item];
            return link?.visible ? [link] : [];
        }),
        ...(roles?.isModerator
            ? [
                  {
                      to: "/moderation" as Route,
                      label: "Moderation",
                      visible: true,
                  },
              ]
            : []),
        ...(roles?.isAdmin
            ? [{ to: "/admin" as Route, label: "Admin", visible: true }]
            : []),
    ];

    async function handleLogout() {
        setLoggingOut(true);
        let resetAttempted = false;

        try {
            posthog.capture(
                "user_logged_out",
                {
                    source: "header",
                },
                {
                    send_instantly: true,
                },
            );
            await new Promise((resolve) => {
                setTimeout(resolve, 250);
            });
            posthog.reset();
            await logoutAction();
            await resetSharedClient();
            resetAttempted = true;
            setUserData(null);
            router.push("/");
        } catch {
            if (!resetAttempted) {
                try {
                    await resetSharedClient();
                } catch {
                    // Ignore cleanup errors during forced logout fallback.
                }
            }
            setUserData(null);
            location.href = "/";
        } finally {
            setLoggingOut(false);
        }
    }

    async function handleCustomStatusSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const result = await updateUserStatus(
            currentStatus,
            customStatusMessage.trim() || undefined,
        );

        if (result.success) {
            setAccountMenuOpen(false);
            return;
        }

        toast.error(result.error || "Failed to update status");
    }

    return (
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl supports-backdrop-filter:bg-background/75">
            <div className="mx-auto flex w-full max-w-376 items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
                <Link
                    className="group mr-1 inline-flex shrink-0 items-center gap-2.5"
                    href="/"
                >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Flame className="size-4.5" />
                    </span>
                    <span className="hidden text-[15px] font-semibold tracking-tight text-foreground sm:inline">
                        firepit
                    </span>
                </Link>

                <nav
                    aria-label="Main navigation"
                    className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none"
                >
                    {links.map((link) => {
                        const active = showContent
                            ? isActiveRoute(pathname, link.to)
                            : false;

                        if (!showContent) {
                            return (
                                <span
                                    className={cn(
                                        getNavigationLinkClassName(false),
                                        "cursor-default bg-muted/60 text-muted-foreground/70",
                                    )}
                                    key={link.to}
                                >
                                    {link.label}
                                </span>
                            );
                        }

                        return (
                            <Link
                                aria-current={active ? "page" : undefined}
                                className={getNavigationLinkClassName(active)}
                                href={link.to}
                                key={link.to}
                            >
                                <span>{link.label}</span>
                                {link.count ? (
                                    <Badge
                                        className="h-4 min-w-4 rounded-full px-1.5 text-[10px] leading-none"
                                        variant={
                                            active ? "default" : "secondary"
                                        }
                                    >
                                        {link.count}
                                    </Badge>
                                ) : null}
                            </Link>
                        );
                    })}
                </nav>

                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    {onSearchClick && (
                        <Button
                            aria-label="Search messages"
                            className="rounded-lg"
                            onClick={onSearchClick}
                            size="icon"
                            title="Search messages (Ctrl+K)"
                            type="button"
                            variant="ghost"
                        >
                            <Search className="h-5 w-5" />
                        </Button>
                    )}
                    {isAuthenticated ? (
                        <NotificationsMenu userId={userData?.userId ?? null} />
                    ) : (
                        <ThemeToggleMenu theme={menuTheme} setTheme={setTheme} />
                    )}
                    {showContent ? (
                        isAuthenticated && userData ? (
                            <>
                                {navigationPreferences.showAddFriendInHeader ? (
                                    <Button
                                        asChild
                                        size="sm"
                                        variant="secondary"
                                    >
                                        <Link href="/chat?compose=1">
                                            <UserPlus className="h-4 w-4" />
                                            <span className="hidden sm:inline">
                                                Add Friend
                                            </span>
                                            <span className="sr-only sm:hidden">
                                                Add Friend
                                            </span>
                                        </Link>
                                    </Button>
                                ) : null}

                                <DropdownMenu
                                    onOpenChange={setAccountMenuOpen}
                                    open={accountMenuOpen}
                                >
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            className="group h-auto gap-2 rounded-lg border-border/70 bg-background/70 px-1.5 py-1 hover:bg-background"
                                            type="button"
                                            variant="outline"
                                        >
                                            <Avatar
                                                alt={displayName}
                                                framePreset={
                                                    headerProfile?.avatarFramePreset
                                                }
                                                frameUrl={
                                                    headerProfile?.avatarFrameUrl
                                                }
                                                fallback={displayName}
                                                size="md"
                                                src={
                                                    headerProfile?.avatarUrl
                                                }
                                            />
                                            <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
                                                <span className="max-w-32 truncate text-sm font-medium text-foreground">
                                                    {displayName}
                                                </span>
                                            </span>
                                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="end"
                                        className="w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-border/60 bg-card/95 p-2 shadow-lg"
                                    >
                                        <div className="px-3 py-2">
                                            <p className="text-sm font-semibold text-foreground">
                                                {displayName}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Manage your presence and
                                                account session
                                            </p>
                                        </div>

                                        <DropdownMenuSeparator />

                                        <div className="px-3 py-2">
                                            <p className="text-[11px] font-semibold text-muted-foreground">
                                                Status
                                            </p>
                                        </div>
                                        {(
                                            [
                                                "online",
                                                "away",
                                                "busy",
                                                "offline",
                                            ] as const
                                        ).map((status) => (
                                            <DropdownMenuItem
                                                disabled={
                                                    currentStatus === status
                                                }
                                                key={status}
                                                onClick={() => {
                                                    void updateUserStatus(
                                                        status,
                                                    );
                                                }}
                                                className="rounded-md px-3 py-2"
                                            >
                                                <div className="flex w-full items-center justify-between gap-3">
                                                    <StatusIndicator
                                                        showLabel
                                                        size="sm"
                                                        status={status}
                                                    />
                                                    {currentStatus ===
                                                    status ? (
                                                        <Check className="h-4 w-4 text-primary" />
                                                    ) : null}
                                                </div>
                                            </DropdownMenuItem>
                                        ))}

                                        <div className="space-y-3 px-3 py-2">
                                            <p className="text-[11px] font-semibold text-muted-foreground">
                                                Custom status
                                            </p>
                                            <form
                                                className="space-y-3"
                                                onSubmit={(event) => {
                                                    void handleCustomStatusSubmit(
                                                        event,
                                                    );
                                                }}
                                            >
                                                <Input
                                                    aria-label="Custom status message"
                                                    className="rounded-md"
                                                    onChange={(event) =>
                                                        setCustomStatusMessage(
                                                            event.target.value,
                                                        )
                                                    }
                                                    placeholder="What's your status?"
                                                    value={
                                                        customStatusMessage
                                                    }
                                                />
                                                <Button
                                                    className="w-full rounded-md"
                                                    size="sm"
                                                    type="submit"
                                                    variant="outline"
                                                >
                                                    Save custom status
                                                </Button>
                                            </form>
                                        </div>

                                        <DropdownMenuSeparator />

                                        <div className="px-3 py-2">
                                            <p className="text-[11px] font-semibold text-muted-foreground">
                                                Theme
                                            </p>
                                        </div>
                                        {(
                                            [
                                                "light",
                                                "dark",
                                                "system",
                                            ] as const
                                        ).map((nextTheme) => {
                                            const Icon =
                                                THEME_ICONS[nextTheme];
                                            return (
                                                <DropdownMenuItem
                                                    key={nextTheme}
                                                    onClick={() => {
                                                        setTheme(nextTheme);
                                                    }}
                                                    className="rounded-md px-3 py-2"
                                                >
                                                    <div className="flex w-full items-center justify-between gap-3">
                                                        <span className="inline-flex items-center gap-2">
                                                            <Icon className="h-4 w-4 text-primary" />
                                                            {nextTheme
                                                                .charAt(0)
                                                                .toUpperCase() +
                                                                nextTheme.slice(
                                                                    1,
                                                                )}
                                                        </span>
                                                        {menuTheme ===
                                                        nextTheme ? (
                                                            <Check className="h-4 w-4 text-primary" />
                                                        ) : null}
                                                    </div>
                                                </DropdownMenuItem>
                                            );
                                        })}

                                        <DropdownMenuSeparator />

                                        <DropdownMenuItem
                                            className="rounded-md px-3 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                                            disabled={loggingOut}
                                            onClick={() => {
                                                void handleLogout();
                                            }}
                                        >
                                            <LogOut className="mr-2 h-4 w-4" />
                                            {loggingOut
                                                ? "Logging out..."
                                                : "Logout"}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        ) : (
                            <Button
                                asChild
                                className="rounded-lg"
                                variant="outline"
                            >
                                <Link href="/login">Login</Link>
                            </Button>
                        )
                    ) : (
                        <div className="h-9 w-36 animate-pulse rounded-lg bg-muted/70" />
                    )}
                </div>
            </div>
        </header>
    );
}

function ThemeToggleMenu({
    setTheme,
    theme,
}: {
    setTheme: (theme: string) => void;
    theme: string;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    aria-label="Toggle theme"
                    className="rounded-lg"
                    size="icon"
                    type="button"
                    variant="outline"
                >
                    <span className="relative inline-flex size-5 items-center justify-center">
                        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-40 rounded-xl border border-border/60 bg-card/95 p-2 shadow-lg"
            >
                {(["light", "dark", "system"] as const).map((nextTheme) => (
                    <DropdownMenuItem
                        key={nextTheme}
                        onClick={() => setTheme(nextTheme)}
                        className="rounded-md px-3 py-2"
                    >
                        <div className="flex w-full items-center justify-between gap-3">
                            <span>
                                {nextTheme.charAt(0).toUpperCase() +
                                    nextTheme.slice(1)}
                            </span>
                            {theme === nextTheme ? (
                                <Check className="h-4 w-4 text-primary" />
                            ) : null}
                        </div>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
