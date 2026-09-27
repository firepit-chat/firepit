import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquarePlus, Sparkles, Users } from "lucide-react";

import { FriendsSettings } from "@/components/friends-settings";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth-server";

export default async function FriendsPage() {
    const user = await requireAuth().catch(() => {
        redirect("/login");
    });

    if (!user) {
        redirect("/login");
    }

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid gap-8">
                <section className="grid gap-6 p-8 sm:p-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                            <Users className="h-3.5 w-3.5 text-primary" />
                            Connections
                        </div>
                        <div className="space-y-4">
                            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                                Friends and requests, without the clutter.
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                Review incoming requests, keep sent invitations
                                in order, and jump into direct messages with the
                                people you talk to most.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button asChild className="rounded-lg">
                                <Link href="/chat?compose=1">
                                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                                    Add friend
                                </Link>
                            </Button>
                            <Button
                                asChild
                                className="rounded-lg border-border/70"
                                variant="outline"
                            >
                                <Link href="/settings">Privacy settings</Link>
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border/80 p-5">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Quick overview
                        </div>
                        <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                            <li className="rounded-md border border-border/60 bg-background/60 px-3 py-2.5">
                                Incoming requests land in the first tab.
                            </li>
                            <li className="rounded-md border border-border/60 bg-background/60 px-3 py-2.5">
                                Sent invites stay easy to cancel or revisit.
                            </li>
                            <li className="rounded-md border border-border/60 bg-background/60 px-3 py-2.5">
                                Privacy settings remain one click away.
                            </li>
                        </ul>
                    </div>
                </section>

                <FriendsSettings />
            </div>
        </div>
    );
}
