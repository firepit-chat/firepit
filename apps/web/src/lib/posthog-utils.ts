/**
 * PostHog utilities.
 *
 * Server-side logging, error tracking, and event capture for Firepit's
 * PostHog instance. Single telemetry provider: PostHog.
 */

import { NextResponse } from "next/server";
import { SeverityNumber, logs } from "@opentelemetry/api-logs";
import type { Logger } from "@opentelemetry/api-logs";
import { after } from "next/server";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
    BatchLogRecordProcessor,
    LoggerProvider,
    SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";

import { PostHog } from "posthog-node";

import { isTelemetryAllowedForUser } from "@/lib/telemetry-consent";

// OTLP log pipeline to PostHog. Resolved lazily so importing this module
// touches no env or telemetry state.
function getPostHogLogsConfig() {
    const token =
        process.env.POSTHOG_PROJECT_API_KEY ??
        process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ??
        "";
    const host =
        process.env.POSTHOG_LOGS_HOST ??
        process.env.POSTHOG_HOST ??
        "https://us.i.posthog.com";

    return {
        token,
        url: `${host.replace(/\/$/, "")}/i/v1/logs`,
    };
}

let loggerProvider: LoggerProvider | null = null;
let serverLogger: Logger | null = null;

// Lazily constructs the OTLP log pipeline. Returns null when credentials are
// missing outside test environments, so importing this module is side-effect-free.
function getLoggerProvider(): LoggerProvider | null {
    if (loggerProvider) {
        return loggerProvider;
    }

    const { token, url } = getPostHogLogsConfig();
    if (!token && process.env.NODE_ENV !== "test") {
        return null;
    }

    const exporter = new OTLPLogExporter({
        url,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });
    const provider = new LoggerProvider({
        resource: resourceFromAttributes({
            "service.name": "firepit-web",
        }),
        processors: [
            process.env.NODE_ENV === "production"
                ? new BatchLogRecordProcessor({
                      exporter,
                      scheduledDelayMillis: 1_000,
                  })
                : new SimpleLogRecordProcessor({ exporter }),
        ],
    });

    loggerProvider = provider;
    return provider;
}

function getServerLogger(): Logger | null {
    if (serverLogger) {
        return serverLogger;
    }
    const provider = getLoggerProvider();
    if (!provider) {
        return null;
    }
    serverLogger = provider.getLogger("firepit-web");
    return serverLogger;
}

type LogAttributeValue = string | number | boolean | null | undefined;

function normalizeLogAttributes(
    attributes?: Record<string, unknown>,
): Record<string, LogAttributeValue> | undefined {
    if (!attributes) {
        return undefined;
    }

    const normalizedAttributes: Record<string, LogAttributeValue> = {};

    for (const [key, value] of Object.entries(attributes)) {
        if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            value === null ||
            value === undefined
        ) {
            normalizedAttributes[key] = value;
            continue;
        }

        if (typeof value === "bigint") {
            normalizedAttributes[key] = value.toString();
            continue;
        }

        try {
            normalizedAttributes[key] = JSON.stringify(value);
        } catch {
            normalizedAttributes[key] = String(value);
        }
    }

    return normalizedAttributes;
}

let loggerProviderRegistered = false;

export function registerPostHogLoggerProvider() {
    if (loggerProviderRegistered || process.env.NODE_ENV === "test") {
        return;
    }

    loggerProviderRegistered = true;
    const provider = getLoggerProvider();
    if (provider) {
        logs.setGlobalLoggerProvider(provider);
    }
}

const SENSITIVE_ATTRIBUTE_KEYS = new Set([
    "email",
    "token",
    "api_key",
    "apikey",
    "api_secret",
    "secret",
    "password",
    "passphrase",
    "authorization",
    "cookie",
    "set-cookie",
    "session_id",
    "session",
    "ip_address",
    "request_body",
]);

function isSensitiveAttributeKey(key: string): boolean {
    const normalized = key.toLowerCase().replace(/\s+/g, "_");
    if (SENSITIVE_ATTRIBUTE_KEYS.has(normalized)) {
        return true;
    }
    return (
        normalized.includes("token") ||
        normalized.includes("secret") ||
        normalized.includes("password") ||
        normalized.includes("authorization") ||
        normalized.includes("cookie") ||
        normalized === "ip" ||
        normalized.includes("ip_address") ||
        normalized.endsWith("_ip")
    );
}

function redactValue(key: string, value: unknown): unknown {
    if (isSensitiveAttributeKey(key)) {
        return "[REDACTED]";
    }
    if (Array.isArray(value)) {
        return value.map((item, index) => redactValue(String(index), item));
    }
    if (value && typeof value === "object") {
        return redactAttributes(value as Record<string, unknown>);
    }
    return value;
}

function redactAttributes(
    attributes?: Record<string, unknown>,
): Record<string, unknown> | undefined {
    if (!attributes) {
        return undefined;
    }
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) {
        redacted[key] = redactValue(key, value);
    }
    return redacted;
}

function emitPostHogLog(params: {
    body: string;
    severityNumber: SeverityNumber;
    attributes?: Record<string, unknown>;
}) {
    if (!shouldSendToPostHog()) {
        return;
    }

    registerPostHogLoggerProvider();

    const serverLoggerInstance = getServerLogger();
    if (!serverLoggerInstance) {
        return;
    }

    // Same consent gate as the capture path: a structured log record carrying a
    // user id is still that person's telemetry, so it must not outlive their
    // opt-out. Records with no identifiable user are infrastructure logs and
    // always go out.
    const distinctId = getDistinctId(params.attributes);
    if (distinctId === SERVER_DISTINCT_ID) {
        serverLoggerInstance.emit({
            body: params.body,
            severityNumber: params.severityNumber,
            attributes: normalizeLogAttributes(
                redactAttributes(params.attributes),
            ),
        });
        return;
    }

    void isTelemetryAllowedForUser(distinctId).then((allowed) => {
        if (!allowed) {
            return;
        }
        serverLoggerInstance.emit({
            body: params.body,
            severityNumber: params.severityNumber,
            attributes: normalizeLogAttributes(
                redactAttributes(params.attributes),
            ),
        });
    });
}

export function flushPostHogLogs() {
    const provider = getLoggerProvider();
    if (!provider) {
        return Promise.resolve();
    }
    return provider.forceFlush();
}

let postHogLogFlushScheduled = false;

function schedulePostHogLogFlush() {
    if (postHogLogFlushScheduled) {
        return;
    }
    postHogLogFlushScheduled = true;

    const runFlush = () => {
        void flushPostHogLogs()
            .catch(() => {})
            .finally(() => {
                postHogLogFlushScheduled = false;
            });
    };

    try {
        after(runFlush);
    } catch {
        runFlush();
    }
}

type PostHogShim = {
    capture: (...args: Parameters<PostHog["capture"]>) => void;
    captureException: (
        ...args: Parameters<PostHog["captureException"]>
    ) => void;
    flush: () => Promise<void>;
    shutdown: () => Promise<void>;
};

function createNoOpShim(): PostHogShim {
    return {
        capture() {},
        captureException() {},
        async flush() {},
        async shutdown() {},
    };
}

let posthogClient: PostHog | PostHogShim | null = null;

// ponytail: test-only reset for the PostHog singleton. No-op in production.
export function __resetPostHogClient() {
    if (process.env.NODE_ENV === "production") {
        return;
    }
    posthogClient = null;
}

function hasPostHogCredentials() {
    const projectToken =
        process.env.POSTHOG_PROJECT_API_KEY ??
        process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

    return Boolean(projectToken);
}

function shouldSendToPostHog() {
    if (process.env.NODE_ENV === "test") {
        return process.env.ENABLE_POSTHOG_IN_TESTS === "true";
    }

    if (typeof window !== "undefined") {
        return false;
    }

    return hasPostHogCredentials();
}

export function getPostHogClient() {
    if (!posthogClient) {
        const projectApiKey =
            process.env.POSTHOG_PROJECT_API_KEY ??
            process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ??
            "";
        const host =
            process.env.POSTHOG_HOST ??
            process.env.NEXT_PUBLIC_POSTHOG_HOST ??
            "https://us.i.posthog.com";

        if (!projectApiKey) {
            posthogClient = createNoOpShim();
        } else {
            posthogClient = new PostHog(projectApiKey, {
                host,
                flushAt: 20,
                flushInterval: 2_000,
            });
        }
    }
    return posthogClient;
}

let postHogClientFlushScheduled = false;

function schedulePostHogClientFlush() {
    if (postHogClientFlushScheduled) {
        return;
    }
    postHogClientFlushScheduled = true;

    const runFlush = () => {
        void getPostHogClient()
            .flush()
            .catch(() => {})
            .finally(() => {
                postHogClientFlushScheduled = false;
            });
    };

    try {
        after(runFlush);
    } catch {
        runFlush();
    }
}

function toError(value: unknown): Error {
    if (value instanceof Error) {
        return value;
    }
    return new Error(typeof value === "string" ? value : String(value));
}

function toErrorMetadata(value: unknown) {
    if (value instanceof Error) {
        return {
            errorMessage: value.message,
            errorName: value.name,
            errorStack: value.stack,
        };
    }
    return {
        errorMessage: typeof value === "string" ? value : String(value),
    };
}

function capturePostHogServerError(
    error: unknown,
    properties?: Record<string, unknown>,
) {
    const errorObject = toError(error);

    const distinctId = getDistinctId(properties);

    void (async () => {
        if (
            distinctId !== SERVER_DISTINCT_ID &&
            !(await isTelemetryAllowedForUser(distinctId))
        ) {
            return;
        }

        try {
            getPostHogClient().captureException(errorObject, "server", {
                errorMessage: errorObject.message,
                errorName: errorObject.name,
                errorStack: errorObject.stack,
                ...properties,
            });
            schedulePostHogClientFlush();
        } catch {
            // Telemetry forwarding should never impact request handling.
        }
    })();
}

let posthogProcessHandlersRegistered = false;
const capturedUnhandledRejectionErrors = new WeakSet<Error>();

const POSTHOG_FLUSH_TIMEOUT_MS = 5_000;

export function registerPostHogProcessHandlers() {
    if (posthogProcessHandlersRegistered || process.env.NODE_ENV === "test") {
        return;
    }

    posthogProcessHandlersRegistered = true;

    process.on("uncaughtExceptionMonitor", (error, origin) => {
        if (error instanceof Error && capturedUnhandledRejectionErrors.has(error)) {
            return;
        }

        try {
            getPostHogClient().captureException(toError(error), "server", {
                origin: `uncaught_exception:${origin}`,
                ...toErrorMetadata(error),
            });
        } catch {
            // Telemetry forwarding should never impact process-level handlers.
        }
    });

    process.on("unhandledRejection", (reason) => {
        const error = toError(reason);
        capturedUnhandledRejectionErrors.add(error);
        try {
            getPostHogClient().captureException(error, "server", {
                origin: "unhandled_rejection",
            });
        } catch {
            // Telemetry forwarding should never impact process-level handlers.
        }
    });

    const flushWithTimeout = (client: { flush: () => Promise<void> }) =>
        new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, POSTHOG_FLUSH_TIMEOUT_MS);
            void client
                .flush()
                .catch(() => {})
                .finally(() => {
                    clearTimeout(timer);
                    resolve();
                });
        });

    process.once("beforeExit", () => {
        const client = posthogClient;
        if (client) {
            void flushWithTimeout(client);
        }
    });

    process.once("SIGINT", () => {
        const client = posthogClient;
        void (async () => {
            if (client) {
                await flushWithTimeout(client);
            }
            process.exit(130);
        })();
    });

    process.once("SIGTERM", () => {
        const client = posthogClient;
        void (async () => {
            if (client) {
                await flushWithTimeout(client);
            }
            process.exit(143);
        })();
    });
}

function getDistinctId(attributes?: Record<string, unknown>) {
    const candidate =
        attributes?.distinctId ??
        attributes?.userId ??
        attributes?.actorUserId ??
        attributes?.senderId ??
        attributes?.authorUserId ??
        attributes?.actorId;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
    }

    return SERVER_DISTINCT_ID;
}

function getPersonProperties(attributes?: Record<string, unknown>) {
    if (!attributes) {
        return undefined;
    }

    if (getDistinctId(attributes) === "server") {
        return undefined;
    }

    const usernameCandidate =
        attributes.username ??
        attributes.userName ??
        attributes.actorUserName ??
        attributes.name;

    const properties: Record<string, unknown> = {};
    if (
        typeof usernameCandidate === "string" &&
        usernameCandidate.trim().length > 0
    ) {
        properties.username = usernameCandidate;
    }

    return Object.keys(properties).length > 0 ? properties : undefined;
}

/** Sentinel distinct id for telemetry with no resolvable person. */
const SERVER_DISTINCT_ID = "server";

/**
 * Drops telemetry attributable to a user who disabled it.
 *
 * The consent lookup is async and the capture path is synchronous, so the
 * check runs inside a floating promise and the capture happens in its
 * continuation. Events with no identifiable user keep the "server" distinct id
 * and are always sent — there is no person whose consent could apply.
 */
function capturePostHogEvent(
    event: string,
    attributes?: Record<string, unknown>,
) {
    if (!shouldSendToPostHog()) {
        return;
    }

    const distinctId = getDistinctId(attributes);

    void (async () => {
        if (
            distinctId !== SERVER_DISTINCT_ID &&
            !(await isTelemetryAllowedForUser(distinctId))
        ) {
            return;
        }

        try {
            const posthog = getPostHogClient();
            const safeAttributes = redactAttributes(attributes);
            const personProperties = getPersonProperties(safeAttributes);
            posthog.capture({
                distinctId,
                event,
                properties: personProperties
                    ? {
                          ...safeAttributes,
                          $set: {
                              ...personProperties,
                          },
                      }
                    : safeAttributes,
            });
            schedulePostHogClientFlush();
        } catch {
            // Telemetry forwarding should never impact request handling.
        }
    })();
}

/**
 * Log levels for structured logging
 */
const LogLevel = {
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
} as const;

type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

const consoleMethodByLevel: Record<
    LogLevelType,
    (message: string, ...args: unknown[]) => void
> = {
    debug: (message, ...args) => console.log(message, ...args),
    info: (message, ...args) => console.log(message, ...args),
    warn: (message, ...args) => console.warn(message, ...args),
    error: (message, ...args) => console.error(message, ...args),
};

const severityByLevel: Record<LogLevelType, SeverityNumber> = {
    debug: SeverityNumber.DEBUG,
    info: SeverityNumber.INFO,
    warn: SeverityNumber.WARN,
    error: SeverityNumber.ERROR,
};

/**
 * Log a structured message to PostHog (and console outside production).
 */
function log(
    level: LogLevelType,
    message: string,
    attributes?: Record<string, unknown>,
) {
    if (process.env.NODE_ENV !== "production") {
        consoleMethodByLevel[level](
            `[${String(level).toUpperCase()}]`,
            message,
            attributes || "",
        );
    }

    const timestamp = new Date().toISOString();

    emitPostHogLog({
        body: message,
        severityNumber: severityByLevel[level],
        attributes: {
            level,
            message,
            timestamp,
            ...attributes,
        },
    });
    schedulePostHogLogFlush();

    capturePostHogEvent("application_log", {
        level,
        message,
        timestamp,
        ...attributes,
    });
}

/**
 * Convenience logging functions
 */
export const logger = {
    debug: (message: string, attributes?: Record<string, unknown>) =>
        log(LogLevel.DEBUG, message, attributes),

    info: (message: string, attributes?: Record<string, unknown>) =>
        log(LogLevel.INFO, message, attributes),

    warn: (message: string, attributes?: Record<string, unknown>) =>
        log(LogLevel.WARN, message, attributes),

    error: (message: string, attributes?: Record<string, unknown>) =>
        log(LogLevel.ERROR, message, attributes),
};

/**
 * Record an error with PostHog
 */
export function recordError(
    error: Error | string,
    customAttributes?: Record<string, unknown>,
) {
    if (process.env.NODE_ENV !== "production") {
        console.error("[ERROR]", error, customAttributes || "");
    }

    const errorObject =
        error instanceof Error ? error : new Error(String(error));

    emitPostHogLog({
        body: errorObject.message,
        severityNumber: SeverityNumber.ERROR,
        attributes: {
            errorMessage: errorObject.message,
            errorName: errorObject.name,
            errorStack: errorObject.stack,
            ...customAttributes,
        },
    });
    schedulePostHogLogFlush();

    if (shouldSendToPostHog()) {
        capturePostHogServerError(errorObject, customAttributes);
    }
}

/**
 * Record a custom event in PostHog
 */
export function recordEvent(
    eventType: string,
    attributes: Record<string, unknown>,
) {
    capturePostHogEvent(eventType, attributes);
}

/**
 * Record a custom metric in PostHog
 */
export function recordMetric(name: string, value: number) {
    capturePostHogEvent("metric_recorded", {
        metricName: name,
        value,
    });
}

/**
 * Track API endpoint performance
 */
export function trackApiCall(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    attributes?: Record<string, unknown>,
) {
    recordEvent("ApiCall", {
        endpoint,
        method,
        statusCode,
        duration,
        success: statusCode >= 200 && statusCode < 300,
        ...attributes,
    });

    recordMetric(`Custom/API/${endpoint}/${method}`, duration);
}

/**
 * Track message events
 */
export function trackMessage(
    type: "sent" | "edited" | "deleted",
    channelType: "channel" | "dm",
    attributes?: Record<string, unknown>,
) {
    recordEvent("Message", {
        type,
        channelType,
        ...attributes,
    });
}

/**
 * Return a 401 Unauthorized response with logging
 */
export function returnUnauthorized(attributes?: Record<string, unknown>) {
    logger.warn("Unauthorized request", attributes);
    return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
    );
}

/**
 * Return a 403 Forbidden response with logging
 */
export function returnForbidden(attributes?: Record<string, unknown>) {
    logger.warn("Forbidden request", attributes);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}