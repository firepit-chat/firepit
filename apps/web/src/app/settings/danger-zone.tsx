"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { deactivateAccountAction, deleteAccountAction } from "./actions";

export function DangerZone() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState<"deactivate" | "delete" | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const runAction = async (
        kind: "deactivate" | "delete",
        action: (formData: FormData) => Promise<
            { success: true; message: string } | { success: false; error: string }
        >,
    ) => {
        setBusy(kind);
        try {
            const formData = new FormData();
            formData.set(
                "password",
                kind === "delete" ? deletePassword : password,
            );
            const result = await action(formData);
            if (result.success) {
                toast.success(result.message);
                if (kind === "delete") {
                    setDeleteDialogOpen(false);
                }
                router.push("/login");
            } else {
                toast.error(result.error);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Action failed.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="grid gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/70 p-4">
                <div>
                    <p className="text-sm font-medium text-foreground">
                        Deactivate account
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Take a break. Your account is hidden until you sign in
                        again, which reactivates it automatically.
                    </p>
                </div>
                <Button
                    disabled={busy !== null}
                    onClick={() =>
                        void runAction("deactivate", deactivateAccountAction)
                    }
                    type="button"
                    variant="outline"
                >
                    {busy === "deactivate" ? "Deactivating..." : "Deactivate"}
                </Button>
            </div>

            <div className="space-y-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-semibold text-destructive">
                            Delete account
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Permanently deletes your account. This cannot be
                            undone.
                        </p>
                    </div>
                </div>
                <div className="grid">
                    <Dialog
                        onOpenChange={setDeleteDialogOpen}
                        open={deleteDialogOpen}
                    >
                        <DialogTrigger asChild>
                            <Button
                                className="w-full sm:w-auto"
                                disabled={busy !== null}
                                type="button"
                                variant="destructive"
                            >
                                Delete account
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>
                                    Permanently delete your account?
                                </DialogTitle>
                                <DialogDescription>
                                    This wipes your profile, posts, direct
                                    messages, attachments, uploads, and all
                                    server data. Your user ID is reserved
                                    forever as a &quot;Deleted User&quot;
                                    record and can never be reused. There is no
                                    way to undo this.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="delete-confirm">
                                        Type DELETE to confirm
                                    </Label>
                                    <Input
                                        id="delete-confirm"
                                        onChange={(e) =>
                                            setConfirmDelete(
                                                e.target.value === "DELETE",
                                            )
                                        }
                                        placeholder="DELETE"
                                        type="text"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="delete-password">
                                        Current password
                                    </Label>
                                    <Input
                                        autoComplete="current-password"
                                        id="delete-password"
                                        onChange={(e) =>
                                            setDeletePassword(e.target.value)
                                        }
                                        required
                                        type="password"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    onClick={() =>
                                        setDeleteDialogOpen(false)
                                    }
                                    disabled={busy !== null}
                                    type="button"
                                    variant="outline"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="w-full sm:w-auto"
                                    disabled={
                                        busy !== null ||
                                        !confirmDelete ||
                                        !deletePassword
                                    }
                                    onClick={() =>
                                        void runAction(
                                            "delete",
                                            deleteAccountAction,
                                        )
                                    }
                                    type="button"
                                    variant="destructive"
                                >
                                    {busy === "delete"
                                        ? "Deleting..."
                                        : "Delete permanently"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="grid gap-2 max-w-sm">
                <Label htmlFor="danger-password">Current password</Label>
                <Input
                    autoComplete="current-password"
                    id="danger-password"
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    type="password"
                    value={password}
                />
            </div>
        </div>
    );
}