"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { changeEmailAction, resendEmailVerificationAction } from "./actions";

export function EmailChangeForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);
    const [resending, setResending] = useState(false);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const formData = new FormData();
            formData.set("email", email);
            formData.set("password", password);
            const result = await changeEmailAction(formData);
            if (result.success) {
                toast.success(result.message);
                setEmail("");
                setPassword("");
                setVerificationSent(Boolean(result.verificationSent));
            } else {
                toast.error(result.error);
            }
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : "Email change failed.",
            );
        } finally {
            setLoading(false);
        }
    };

    const onResend = async () => {
        setResending(true);
        try {
            const result = await resendEmailVerificationAction();
            if (result.success) {
                toast.success(result.message);
            } else {
                toast.error(result.error);
            }
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : "Failed to resend verification email.",
            );
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="grid gap-4">
            <form className="grid gap-4" onSubmit={onSubmit}>
                <div className="grid gap-2">
                    <Label htmlFor="new-email">New email</Label>
                    <Input
                        autoComplete="email"
                        id="new-email"
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        type="email"
                        value={email}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input
                        autoComplete="current-password"
                        id="current-password"
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        type="password"
                        value={password}
                    />
                </div>
                <Button
                    disabled={loading}
                    type="submit"
                    className="w-full sm:w-auto"
                >
                    {loading ? "Updating..." : "Update email"}
                </Button>
            </form>

            {verificationSent && (
                <div className="grid gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
                    <p>
                        A verification link is on its way to your new address.
                        Confirm it before you sign out, or you will not be able
                        to sign back in until it is verified.
                    </p>
                    <Button
                        className="w-full sm:w-auto"
                        disabled={resending}
                        onClick={() => void onResend()}
                        type="button"
                        variant="outline"
                    >
                        {resending
                            ? "Resending..."
                            : "Resend verification email"}
                    </Button>
                </div>
            )}
        </div>
    );
}