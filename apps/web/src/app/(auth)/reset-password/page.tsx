"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { resetPasswordAction } from "../login/actions";

function ResetPasswordFormContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const userId = searchParams.get("userId") ?? "";
    const secret = searchParams.get("secret") ?? "";
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const hasValidToken = Boolean(userId && secret && secret.length >= 32);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password.length < 8) {
            toast.error("Password must be at least 8 characters long.");
            return;
        }

        if (password !== confirmPassword) {
            toast.error("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.set("userId", userId);
            formData.set("secret", secret);
            formData.set("password", password);
            const result = await resetPasswordAction(formData);
            if (result.success) {
                toast.success(result.message);
                router.push("/login");
            } else {
                toast.error(result.error);
            }
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : "Failed to reset password. Please try again.";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto max-w-md px-4 py-8">
            <div className="mb-6 space-y-2">
                <h1 className="font-semibold text-2xl">Reset your password</h1>
                <p className="text-muted-foreground">
                    Choose a new password for your Firepit account.
                </p>
            </div>

            {!hasValidToken ? (
                <div className="space-y-4">
                    <p className="text-muted-foreground">
                        This password reset link is invalid or has expired.
                        Please request a new one from the sign-in page.
                    </p>
                    <Button asChild variant="outline">
                        <Link href="/login">Back to sign in</Link>
                    </Button>
                </div>
            ) : (
                <form className="grid gap-4" onSubmit={onSubmit}>
                    <div className="grid gap-2">
                        <Label htmlFor="password">New password</Label>
                        <Input
                            autoComplete="new-password"
                            id="password"
                            name="password"
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            type="password"
                            value={password}
                        />
                        <p className="text-sm text-muted-foreground">
                            At least 8 characters.
                        </p>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="confirmPassword">
                            Confirm new password
                        </Label>
                        <Input
                            autoComplete="new-password"
                            id="confirmPassword"
                            name="confirmPassword"
                            onChange={(e) =>
                                setConfirmPassword(e.target.value)
                            }
                            required
                            type="password"
                            value={confirmPassword}
                        />
                    </div>
                    <Button disabled={loading} type="submit">
                        {loading ? "Resetting..." : "Reset password"}
                    </Button>
                </form>
            )}

            <p className="mt-6 text-sm text-muted-foreground">
                Remembered your password?{" "}
                <Link className="text-primary underline" href="/login">
                    Sign in
                </Link>
                .
            </p>
        </div>
    );
}

function ResetPasswordForm() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto max-w-md px-4 py-8">
                    Loading...
                </div>
            }
        >
            <ResetPasswordFormContent />
        </Suspense>
    );
}

export default function ResetPasswordPage() {
    return <ResetPasswordForm />;
}