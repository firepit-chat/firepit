"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type SessionInfo = {
    $id: string;
    current?: boolean;
    os?: string | null;
    client?: string | null;
    device?: string | null;
    createdAt?: string;
};

export function SessionManager() {
    const router = useRouter();
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/sessions");
            const data = (await response.json()) as {
                sessions?: SessionInfo[];
                error?: string;
            };
            if (data.error) {
                toast.error(data.error);
                setSessions([]);
            } else {
                setSessions(data.sessions ?? []);
            }
        } catch {
            toast.error("Failed to load sessions.");
            setSessions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const revoke = async (sessionId: string, isCurrent: boolean) => {
        setRevoking(true);
        try {
            const query = new URLSearchParams({ sessionId });
            if (isCurrent) {
                query.set("clearCookie", "1");
            }
            const response = await fetch(`/api/sessions?${query.toString()}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                const data = (await response.json().catch(() => ({}))) as {
                    error?: string;
                };
                toast.error(data.error ?? "Failed to revoke session.");
                return;
            }
            toast.success(isCurrent ? "Signed out of this device." : "Session revoked.");
            if (isCurrent) {
                router.push("/login");
            } else {
                await load();
            }
        } finally {
            setRevoking(false);
        }
    };

    const revokeOthers = async () => {
        setRevoking(true);
        try {
            const response = await fetch("/api/sessions?revokeOthers=1", {
                method: "DELETE",
            });
            if (!response.ok) {
                const data = (await response.json().catch(() => ({}))) as {
                    error?: string;
                };
                toast.error(data.error ?? "Failed to revoke sessions.");
                return;
            }
            toast.success("All other sessions revoked.");
            await load();
        } finally {
            setRevoking(false);
        }
    };

    const formatDate = (value?: string) =>
        value ? new Date(value).toLocaleDateString() : "Unknown";

    return (
        <div className="space-y-4">
            {loading ? (
                <p className="text-sm text-muted-foreground">Loading sessions...</p>
            ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No active sessions found.
                </p>
            ) : (
                <ul className="grid gap-3">
                    {sessions.map((session) => (
                        <li
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2.5"
                            key={session.$id}
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">
                                    {session.os || "Unknown device"}
                                    {session.current ? (
                                        <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                                            This device
                                        </span>
                                    ) : null}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {session.client || "Firepit"} · Signed in{" "}
                                    {formatDate(session.createdAt)}
                                </p>
                            </div>
                            <Button
                                disabled={revoking}
                                onClick={() =>
                                    void revoke(session.$id, session.current === true)
                                }
                                size="sm"
                                type="button"
                                variant={session.current ? "destructive" : "outline"}
                            >
                                {session.current ? "Sign out" : "Revoke"}
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            {!loading && sessions.length > 1 ? (
                <Button
                    disabled={revoking}
                    onClick={() => void revokeOthers()}
                    type="button"
                    variant="outline"
                >
                    Sign out all other devices
                </Button>
            ) : null}
        </div>
    );
}