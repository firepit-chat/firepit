import Link from "next/link";
import {
    type LucideIcon,
    ArrowRight,
    Flame,
    MessageSquare,
    RadioTower,
    Settings,
    ShieldCheck,
    Sparkles,
    Users,
} from "lucide-react";

import { getCachedUserRoleTags } from "@/lib/cached-data";
import { getServerSession } from "@/lib/auth-server";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

type LandingFeature = {
    description: string;
    icon: LucideIcon;
    title: string;
};

type LandingSignal = {
    label: string;
    value: string;
};

const publicFeatures: LandingFeature[] = [
    {
        description:
            "Channels, direct messages, threads, pins, and search now sit inside one calmer workspace.",
        icon: MessageSquare,
        title: "Conversation first",
    },
    {
        description:
            "Servers, channels, categories, and invite flows stay easy to scan and quick to join.",
        icon: Users,
        title: "Community structure",
    },
    {
        description:
            "Moderation, reports, and role-aware controls remain visible without crowding the everyday chat flow.",
        icon: ShieldCheck,
        title: "Safer defaults",
    },
] as const;

const publicSignals: LandingSignal[] = [
    {
        label: "Activation",
        value: "Sign in, complete your profile, and join a space.",
    },
    {
        label: "Messaging",
        value: "Servers, DMs, threads, pins, and search share one model.",
    },
    {
        label: "Operations",
        value: "Roles, moderation, and audit visibility stay close at hand.",
    },
] as const;

function FeatureCard({ feature }: { feature: LandingFeature }) {
    return (
        <Card className="rounded-xl border border-border/80 p-6">
            <span className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted/70 text-primary">
                <feature.icon className="h-4.5 w-4.5" />
            </span>
            <CardTitle className="text-lg font-semibold tracking-tight">
                {feature.title}
            </CardTitle>
            <CardDescription className="leading-6">
                {feature.description}
            </CardDescription>
        </Card>
    );
}

function SignalCard({ signal }: { signal: LandingSignal }) {
    return (
        <div>
            <p className="text-xs font-semibold text-muted-foreground">
                {signal.label}
            </p>
            <p className="mt-1 text-sm leading-6 text-foreground">
                {signal.value}
            </p>
        </div>
    );
}

import type { Route } from "next";

interface WorkspaceActionButtonProps {
    href: Route;
    icon: LucideIcon;
    label: string;
    variant?: "default" | "outline" | "secondary";
}

function WorkspaceActionButton({
    href,
    icon: Icon,
    label,
    variant = "outline",
}: WorkspaceActionButtonProps) {
    return (
        <Button
            asChild
            className="w-full justify-start rounded-lg"
            size="lg"
            variant={variant}
        >
            <Link href={href}>
                <Icon className="h-4 w-4" />
                {label}
            </Link>
        </Button>
    );
}

export default async function Home() {
    const user = await getServerSession();
    const roles = user ? await getCachedUserRoleTags(user.$id) : null;

    if (!user) {
        return (
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                    <section className="p-8 sm:p-10">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                Firepit redesign
                            </div>

                            <div className="space-y-5">
                                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                                    A cleaner home for real-time communities.
                                </h1>
                                <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                    Firepit brings servers, direct messages,
                                    onboarding, moderation, and docs into one
                                    cohesive web workspace. The new visual
                                    direction favors calmer surfaces, clearer
                                    hierarchy, and faster daily navigation.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Button
                                    asChild
                                    size="lg"
                                >
                                    <Link href="/login">
                                        Get started
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </Button>
                                <Button
                                    asChild
                                    size="lg"
                                    variant="outline"
                                >
                                    <Link href="/chat">Preview the chat</Link>
                                </Button>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                                {publicSignals.map((signal) => (
                                    <SignalCard
                                        key={signal.label}
                                        signal={signal}
                                    />
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="grid gap-4">
                        {publicFeatures.map((feature) => (
                            <FeatureCard
                                feature={feature}
                                key={feature.title}
                            />
                        ))}

                        <Card className="rounded-xl border border-border/80">
                            <CardHeader className="space-y-2">
                                <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                    <Flame className="h-3.5 w-3.5 text-primary" />
                                    What changes here
                                </div>
                                <CardTitle className="text-lg font-semibold tracking-tight">
                                    One shell, fewer seams
                                </CardTitle>
                                <CardDescription className="leading-6">
                                    The redesign starts with the top-level shell
                                    and the landing path, then expands into
                                    chat, onboarding, settings, docs, and admin.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-muted-foreground">
                                <ul className="list-disc space-y-3 pl-5">
                                    <li>
                                        Branded surfaces with warmer, calmer
                                        color treatment.
                                    </li>
                                    <li>
                                        Clearer primary navigation for chat,
                                        docs, settings, and admin.
                                    </li>
                                    <li>
                                        Better first-run flow from login through
                                        onboarding and join paths.
                                    </li>
                                </ul>
                            </CardContent>
                        </Card>
                    </section>
                </div>
            </div>
        );
    }

    const isAdmin = roles?.isAdmin ?? false;
    const isModerator = roles?.isModerator ?? false;
    const displayName = user.name?.trim() || "there";
    const roleLabel = isAdmin
        ? "Administrator"
        : isModerator
          ? "Moderator"
          : "Member";

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <section className="p-8 sm:p-10">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                            <RadioTower className="h-3.5 w-3.5 text-primary" />
                            Welcome back
                        </div>

                        <div className="space-y-4">
                            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                                Ready when you are, {displayName}.
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                Jump back into chat, review requests, or head
                                straight to moderation and settings. The
                                workspace is built to keep the important
                                surfaces close together.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs font-medium text-muted-foreground">
                                Role: {roleLabel}
                            </span>
                            {user.email ? (
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                                    <MessageSquare className="h-3 w-3" />
                                    {user.email}
                                </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                                <Users className="h-3 w-3" />
                                User ID {user.$id.slice(0, 8)}...
                            </span>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button
                                asChild
                                size="lg"
                            >
                                <Link href="/chat">
                                    Open chat
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                            <Button
                                asChild
                                size="lg"
                                variant="outline"
                            >
                                <Link href="/settings">Settings</Link>
                            </Button>
                            {isModerator || isAdmin ? (
                                <Button
                                    asChild
                                    size="lg"
                                    variant="secondary"
                                >
                                    <Link href="/moderation">Moderation</Link>
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </section>

                <section className="grid gap-4">
                    <Card className="rounded-xl border border-border/80">
                        <CardHeader className="space-y-2 pb-3">
                            <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <MessageSquare className="h-3.5 w-3.5 text-primary" />
                                Workspace shortcuts
                            </div>
                            <CardTitle className="text-lg font-semibold tracking-tight">
                                Jump back in
                            </CardTitle>
                            <CardDescription className="leading-6">
                                The most common actions within a single glance.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <WorkspaceActionButton
                                href="/chat"
                                icon={MessageSquare}
                                label="Open chat"
                                variant="default"
                            />
                            <WorkspaceActionButton
                                href="/settings"
                                icon={Settings}
                                label="Open settings"
                                variant="outline"
                            />
                            {isModerator || isAdmin ? (
                                <WorkspaceActionButton
                                    href="/moderation"
                                    icon={ShieldCheck}
                                    label="Open moderation"
                                    variant="secondary"
                                />
                            ) : null}
                            {isAdmin ? (
                                <WorkspaceActionButton
                                    href="/admin"
                                    icon={RadioTower}
                                    label="Open admin"
                                    variant="outline"
                                />
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="rounded-xl border border-border/80">
                        <CardHeader className="space-y-2 pb-3">
                            <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <Flame className="h-3.5 w-3.5 text-primary" />
                                Account at a glance
                            </div>
                            <CardTitle className="text-lg font-semibold tracking-tight">
                                Identity and access
                            </CardTitle>
                            <CardDescription className="leading-6">
                                Quick reference for the account details that
                                shape how Firepit personalizes the workspace.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 text-sm">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground">
                                    Email
                                </p>
                                <p className="mt-0.5 text-foreground">
                                    {user.email ?? "Not provided"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground">
                                    User ID
                                </p>
                                <p className="mt-0.5 break-all font-mono text-xs text-foreground">
                                    {isAdmin || isModerator
                                        ? user.$id
                                        : `${user.$id.slice(0, 8)}...`}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground">
                                    Current role
                                </p>
                                <p className="mt-0.5 text-foreground">
                                    {roleLabel}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}
