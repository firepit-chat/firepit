"use client";

import type { ReactNode } from "react";

import { initPostHogClient } from "@/lib/posthog-client";

/**
 * Initializes the browser PostHog SDK once, before any descendant can capture.
 *
 * Rendered rather than called from an effect so that the first `capture` in a
 * child — sign-in, registration, onboarding — is not queued against an
 * uninitialized SDK. `initPostHogClient` is guarded, so double-invocation under
 * Strict Mode is a no-op.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
    initPostHogClient();
    return <>{children}</>;
}
