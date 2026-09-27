/**
 * Client-side logger with PostHog routing.
 * Sends events to PostHog (when hydrated in the browser) and falls back
 * to console in development.
 */

type BrowserPostHog = {
    capture: (event: string, properties?: Record<string, unknown>) => void;
    captureException?: (
        error: Error,
        properties?: Record<string, unknown>,
    ) => void;
};

function getBrowserPostHog(): BrowserPostHog | null {
    if (typeof window === "undefined") {
        return null;
    }

    return (
        (
            window as unknown as {
                posthog?: BrowserPostHog;
            }
        ).posthog ?? null
    );
}

export function recordClientAction(
    action: string,
    attributes?: Record<string, unknown>,
) {
    const posthog = getBrowserPostHog();
    if (posthog) {
        posthog.capture(action, attributes);
    }
}

export function recordClientError(
    error: Error,
    attributes?: Record<string, unknown>,
) {
    const posthog = getBrowserPostHog();
    if (!posthog) {
        return;
    }

    if (posthog.captureException) {
        posthog.captureException(error, attributes);
    } else {
        posthog.capture("client_error", {
            errorMessage: error.message,
            errorName: error.name,
            errorStack: error.stack,
            ...attributes,
        });
    }
}

interface LogAttributes {
    [key: string]: string | number | boolean | null | undefined;
}

class ClientLogger {
    private shouldLog(): boolean {
        return process.env.NODE_ENV !== "production";
    }

    info(message: string, attributes?: LogAttributes): void {
        recordClientAction("log_info", { message, ...attributes });

        if (this.shouldLog()) {
            console.log(`[INFO] ${message}`, attributes ?? "");
        }
    }

    warn(message: string, attributes?: LogAttributes): void {
        recordClientAction("log_warn", { message, ...attributes });

        if (this.shouldLog()) {
            console.warn(`[WARN] ${message}`, attributes ?? "");
        }
    }

    error(
        message: string,
        error?: Error | string,
        attributes?: LogAttributes,
    ): void {
        if (error instanceof Error) {
            recordClientError(error, { message, ...attributes });
        } else {
            recordClientAction("log_error", {
                message,
                error: error?.toString(),
                ...attributes,
            });
        }

        if (this.shouldLog()) {
            console.error(`[ERROR] ${message}`, error ?? "", attributes ?? "");
        }
    }

    debug(message: string, attributes?: LogAttributes): void {
        if (this.shouldLog()) {
            console.log(`[DEBUG] ${message}`, attributes ?? "");
        }
    }
}

export const logger = new ClientLogger();