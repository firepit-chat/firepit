/**
 * Next.js Instrumentation Hook
 *
 * This file is automatically loaded by Next.js on both server and edge runtimes.
 * It registers PostHog telemetry hooks for the Node.js runtime only.
 *
 * Documentation: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") {
        return;
    }

    try {
        const {
            registerPostHogLoggerProvider,
            registerPostHogProcessHandlers,
        } = await import("./src/lib/posthog-utils");
        registerPostHogLoggerProvider();
        registerPostHogProcessHandlers();
    } catch (error) {
        // PostHog runtime hooks are optional and should not block startup.
        const payload = error instanceof Error ? `${error.message} ${error.stack ?? ""}` : String(error);
        if (typeof globalThis.reportError === "function") {
            globalThis.reportError(new Error(payload));
        } else {
            console.error(payload);
        }
    }
}