import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    logger,
    recordError,
    trackApiCall,
    recordEvent,
    recordMetric,
    __resetPostHogClient,
} from "@/lib/posthog-utils";

const {
    mockEmit,
    mockSetGlobalLoggerProvider,
    mockPostHogCapture,
    mockPostHogCaptureException,
} = vi.hoisted(() => ({
    mockEmit: vi.fn(),
    mockSetGlobalLoggerProvider: vi.fn(),
    mockPostHogCapture: vi.fn(),
    mockPostHogCaptureException: vi.fn(),
}));

vi.mock("@opentelemetry/sdk-logs", () => ({
    LoggerProvider: vi.fn().mockImplementation(function () {
        return {
            getLogger: vi.fn().mockImplementation(() => ({
                emit: mockEmit,
            })),
            forceFlush: vi.fn().mockResolvedValue(undefined),
        };
    }),
    BatchLogRecordProcessor: vi.fn(),
    SimpleLogRecordProcessor: vi.fn(),
}));

vi.mock("@opentelemetry/api-logs", () => ({
    SeverityNumber: {
        DEBUG: 5,
        INFO: 9,
        WARN: 13,
        ERROR: 17,
    },
    logs: {
        setGlobalLoggerProvider: mockSetGlobalLoggerProvider,
    },
}));

vi.mock("@opentelemetry/exporter-logs-otlp-http", () => ({
    OTLPLogExporter: vi.fn(),
}));

vi.mock("@opentelemetry/resources", () => ({
    resourceFromAttributes: vi.fn().mockReturnValue({}),
}));

vi.mock("posthog-node", () => ({
    PostHog: vi.fn().mockImplementation(function () {
        return {
            capture: mockPostHogCapture,
            captureException: mockPostHogCaptureException,
            flush: vi.fn().mockResolvedValue(undefined),
            shutdown: vi.fn().mockResolvedValue(undefined),
        };
    }),
}));

vi.mock("next/server", () => ({
    NextResponse: {
        json: vi.fn().mockReturnValue({ status: 200 }),
    },
    after: vi.fn(),
}));

/**
 * The server capture path resolves per-user telemetry consent asynchronously, so
 * emission lands a microtask later for records carrying a user id. Tests that
 * assert on emitted telemetry need to let that settle.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("posthog-utils", () => {
    beforeEach(() => {
        __resetPostHogClient();
        mockEmit.mockClear();
        mockSetGlobalLoggerProvider.mockClear();
        mockPostHogCapture.mockClear();
        mockPostHogCaptureException.mockClear();
        delete process.env.POSTHOG_PROJECT_API_KEY;
        delete process.env.POSTHOG_HOST;
        delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
        delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
        process.env.ENABLE_POSTHOG_IN_TESTS = "true";

        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("logger", () => {
        it("should log info messages to the OTLP pipeline", () => {
            logger.info("Test info message");
            expect(console.log).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test info message",
                    severityNumber: expect.any(Number),
                }),
            );
        });

        it("should log info messages with attributes", async () => {
            logger.info("Test info", { userId: "123" });
            await settle();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test info",
                    attributes: expect.objectContaining({ userId: "123" }),
                }),
            );
        });

        it("should redact sensitive keys from log attributes", async () => {
            logger.info("Test info", { email: "a@b.c", userId: "123" });
            await settle();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    attributes: expect.objectContaining({
                        email: "[REDACTED]",
                        userId: "123",
                    }),
                }),
            );
        });

        it("should log error messages", () => {
            logger.error("Test error message");
            expect(console.error).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test error message",
                    severityNumber: expect.any(Number),
                }),
            );
        });

        it("should log warn messages", () => {
            logger.warn("Test warning message");
            expect(console.warn).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test warning message",
                    severityNumber: expect.any(Number),
                }),
            );
        });

        it("should log debug messages", () => {
            logger.debug("Test debug message");
            expect(console.log).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test debug message",
                    severityNumber: expect.any(Number),
                }),
            );
        });

        it("should capture an application_log event when credentials exist", async () => {
            process.env.POSTHOG_PROJECT_API_KEY = "test-key";
            __resetPostHogClient();

            logger.info("Test info", { userId: "u1" });

            await settle();
            expect(mockPostHogCapture).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: "application_log",
                    distinctId: "u1",
                    properties: expect.objectContaining({
                        message: "Test info",
                    }),
                }),
            );
        });
    });

    describe("recordError", () => {
        it("should record an Error object", () => {
            const error = new Error("Test error");
            recordError(error);
            expect(console.error).toHaveBeenCalledWith("[ERROR]", error, "");
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "Test error",
                    severityNumber: expect.any(Number),
                    attributes: expect.objectContaining({
                        errorMessage: "Test error",
                        errorName: "Error",
                    }),
                }),
            );
        });

        it("should record an Error with custom attributes", () => {
            const error = new Error("Test error");
            recordError(error, { userId: "123", context: "test" });
            expect(console.error).toHaveBeenCalled();
        });

        it("should record a string error", () => {
            recordError("String error message");
            expect(console.error).toHaveBeenCalledWith(
                "[ERROR]",
                "String error message",
                "",
            );
            expect(mockEmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: "String error message",
                    attributes: expect.objectContaining({
                        errorMessage: "String error message",
                    }),
                }),
            );
        });

        it("should capture an exception event when credentials exist", async () => {
            process.env.POSTHOG_PROJECT_API_KEY = "test-key";
            __resetPostHogClient();

            recordError(new Error("boom"), { userId: "u1" });
            await settle();

            expect(mockPostHogCaptureException).toHaveBeenCalledWith(
                expect.any(Error),
                "server",
                expect.objectContaining({
                    errorMessage: "boom",
                    userId: "u1",
                }),
            );
        });

        it("should handle null error gracefully", () => {
            recordError(null as never);
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe("trackApiCall", () => {
        it("should track API call with basic info without error", () => {
            expect(() => {
                trackApiCall("/api/users", "GET", 200, 150);
            }).not.toThrow();
        });

        it("should track API call with custom attributes", () => {
            expect(() => {
                trackApiCall("/api/custom", "PATCH", 200, 75, {
                    feature: "test",
                    version: "1.0",
                });
            }).not.toThrow();
        });

        it("should track failed API call", () => {
            expect(() => {
                trackApiCall("/api/error", "GET", 500, 100, {
                    error: "Internal server error",
                });
            }).not.toThrow();
        });
    });

    describe("recordEvent", () => {
        it("should record event with name and attributes without error", () => {
            expect(() => {
                recordEvent("UserLogin", { userId: "123", method: "oauth" });
            }).not.toThrow();
        });

        it("should record event without attributes", () => {
            expect(() => {
                recordEvent("PageView", {});
            }).not.toThrow();
        });

        it("should record event with complex attributes", () => {
            expect(() => {
                recordEvent("Purchase", {
                    productId: "prod123",
                    quantity: 2,
                    price: 29.99,
                    currency: "USD",
                });
            }).not.toThrow();
        });

        it("should capture the event when credentials exist", async () => {
            process.env.POSTHOG_PROJECT_API_KEY = "test-key";
            __resetPostHogClient();

            recordEvent("UserLogin", { userId: "123", method: "oauth" });

            await settle();
            expect(mockPostHogCapture).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: "UserLogin",
                    properties: expect.objectContaining({
                        userId: "123",
                        method: "oauth",
                    }),
                }),
            );
        });
    });

    describe("recordMetric", () => {
        it("should record metric with name and value without error", () => {
            expect(() => {
                recordMetric("response.time", 150);
            }).not.toThrow();
        });

        it("should record metric with zero value", () => {
            expect(() => {
                recordMetric("errors.count", 0);
            }).not.toThrow();
        });

        it("should record metric with decimal value", () => {
            expect(() => {
                recordMetric("cpu.usage", 45.67);
            }).not.toThrow();
        });
    });
});