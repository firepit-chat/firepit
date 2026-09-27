"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { logger as clientLogger } from "@/lib/client-logger";
import type { PendingSignup, SignupPolicy } from "@/lib/signup-policy";

import {
    approveSignupAction,
    getSignupPolicyAction,
    listPendingSignupsAction,
    rejectSignupAction,
    setSignupPolicyAction,
} from "./actions";

interface SignupControlsProps {
    userId: string;
}

const POLICY_LABELS: Record<SignupPolicy, string> = {
    open: "Open (anyone can sign up)",
    approval: "Individual approval required",
    disabled: "No signups allowed",
};

export function SignupControls({ userId }: SignupControlsProps) {
    const [policy, setPolicy] = useState<SignupPolicy>("open");
    const [loading, setLoading] = useState(true);
    const [savingPolicy, setSavingPolicy] = useState(false);
    const [pending, setPending] = useState<PendingSignup[]>([]);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [nextPolicy, pendingSignups] = await Promise.all([
                getSignupPolicyAction(userId),
                listPendingSignupsAction(userId),
            ]);
            setPolicy(nextPolicy);
            setPending(pendingSignups);
        } catch (error) {
            clientLogger.error(
                "Failed to load signup controls:",
                error instanceof Error ? error : String(error),
            );
            toast.error("Failed to load signup controls");
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void load();
    }, [load]);

    const handlePolicyChange = async (next: SignupPolicy) => {
        setSavingPolicy(true);
        const previous = policy;
        setPolicy(next);
        try {
            await setSignupPolicyAction(userId, next);
            toast.success("Signup policy updated");
        } catch (error) {
            setPolicy(previous);
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to update signup policy";
            toast.error(message);
        } finally {
            setSavingPolicy(false);
        }
    };

    const handleApprove = async (pendingUserId: string) => {
        setBusy(pendingUserId);
        try {
            await approveSignupAction(userId, pendingUserId);
            toast.success("Signup approved");
            setPending((prev) =>
                prev.filter((p) => p.userId !== pendingUserId),
            );
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Approval failed",
            );
        } finally {
            setBusy(null);
        }
    };

    const handleReject = async (pendingUserId: string) => {
        if (
            !window.confirm(
                "Rejecting deletes this signup permanently. Continue?",
            )
        ) {
            return;
        }
        setBusy(pendingUserId);
        try {
            await rejectSignupAction(userId, pendingUserId);
            toast.success("Signup rejected and removed");
            setPending((prev) =>
                prev.filter((p) => p.userId !== pendingUserId),
            );
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Rejection failed",
            );
        } finally {
            setBusy(null);
        }
    };

    if (loading) {
        return (
            <section className="rounded-xl border border-border/80 bg-card p-6">
                <div className="mb-4 flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Signups</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    Loading signup controls...
                </p>
            </section>
        );
    }

    return (
        <section className="rounded-xl border border-border/80 bg-card p-6">
            <div className="mb-2 flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Signups</h2>
            </div>
            <p className="text-sm text-muted-foreground">
                Control who can create accounts on this instance.
            </p>

            <div className="mt-5 max-w-sm space-y-2">
                <Label htmlFor="signup-policy">Signup policy</Label>
                <Select
                    disabled={savingPolicy}
                    onValueChange={(value) =>
                        void handlePolicyChange(value as SignupPolicy)
                    }
                    value={policy}
                >
                    <SelectTrigger id="signup-policy">
                        <SelectValue placeholder="Select a policy" />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(POLICY_LABELS).map(
                            ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                    {label}
                                </SelectItem>
                            ),
                        )}
                    </SelectContent>
                </Select>
            </div>

            {policy === "approval" && (
                <div className="mt-6">
                    <div className="mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold text-foreground">
                            Pending approvals
                        </h3>
                        {pending.length > 0 && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                                {pending.length}
                            </span>
                        )}
                    </div>

                    {pending.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No signups waiting for approval.
                        </p>
                    ) : (
                        <ul className="grid gap-3">
                            {pending.map((signup) => (
                                <li
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2.5"
                                    key={signup.userId}
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground">
                                            {signup.name}
                                        </p>
                                        <p className="mt-0.5 break-all text-xs text-muted-foreground">
                                            {signup.email}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <Button
                                            disabled={busy !== null}
                                            onClick={() =>
                                                void handleApprove(signup.userId)
                                            }
                                            size="sm"
                                            type="button"
                                        >
                                            Approve
                                        </Button>
                                        <Button
                                            disabled={busy !== null}
                                            onClick={() =>
                                                void handleReject(signup.userId)
                                            }
                                            size="sm"
                                            type="button"
                                            variant="destructive"
                                        >
                                            Reject
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}