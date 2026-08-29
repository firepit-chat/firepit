/**
 * Tests for client-logger
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/client-logger";

describe("ClientLogger", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    let mockPostHog: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPostHog = {
            capture: vi.fn(),
            captureException: vi.fn(),
        };

        // Mock console methods
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        delete (global as any).window;
        vi.restoreAllMocks();
    });

    describe("info", () => {
        it("should log to console in development mode", () => {
            process.env.NODE_ENV = "development";

            logger.info("Test info message", { userId: "123" });

            expect(console.log).toHaveBeenCalledWith(
                "[INFO] Test info message",
                { userId: "123" },
            );
        });

        it("should not log to console in production mode", () => {
            process.env.NODE_ENV = "production";

            logger.info("Test info message");

            expect(console.log).not.toHaveBeenCalled();
        });

        it("should capture to PostHog when hydrated in the browser", () => {
            (global as any).window = { posthog: mockPostHog };
            process.env.NODE_ENV = "production";

            logger.info("Test message", { key: "value" });

            expect(mockPostHog.capture).toHaveBeenCalledWith("log_info", {
                message: "Test message",
                key: "value",
            });
        });

        it("should handle info without attributes", () => {
            process.env.NODE_ENV = "development";

            logger.info("Simple message");

            expect(console.log).toHaveBeenCalledWith(
                "[INFO] Simple message",
                "",
            );
        });
    });

    describe("warn", () => {
        it("should log warnings to console in development", () => {
            process.env.NODE_ENV = "development";

            logger.warn("Warning message", { severity: "high" });

            expect(console.warn).toHaveBeenCalledWith(
                "[WARN] Warning message",
                {
                    severity: "high",
                },
            );
        });

        it("should not log to console in production", () => {
            process.env.NODE_ENV = "production";

            logger.warn("Warning message");

            expect(console.warn).not.toHaveBeenCalled();
        });

        it("should capture warnings to PostHog", () => {
            (global as any).window = { posthog: mockPostHog };

            logger.warn("Warning", { code: 123 });

            expect(mockPostHog.capture).toHaveBeenCalledWith("log_warn", {
                message: "Warning",
                code: 123,
            });
        });
    });

    describe("error", () => {
        it("should log errors to console in development", () => {
            process.env.NODE_ENV = "development";

            logger.error("Error message", new Error("Test error"), {
                context: "test",
            });

            expect(console.error).toHaveBeenCalledWith(
                "[ERROR] Error message",
                expect.any(Error),
                { context: "test" },
            );
        });

        it("should send Error objects to PostHog captureException", () => {
            (global as any).window = { posthog: mockPostHog };
            const testError = new Error("Test error");

            logger.error("Error occurred", testError, { userId: "456" });

            expect(mockPostHog.captureException).toHaveBeenCalledWith(
                testError,
                {
                    message: "Error occurred",
                    userId: "456",
                },
            );
        });

        it("should capture string errors as log_error events", () => {
            (global as any).window = { posthog: mockPostHog };

            logger.error("Error message", "String error", { context: "api" });

            expect(mockPostHog.capture).toHaveBeenCalledWith("log_error", {
                message: "Error message",
                error: "String error",
                context: "api",
            });
        });

        it("should fall back to a client_error event when captureException is unavailable", () => {
            const posthogWithoutException = { capture: vi.fn() };
            (global as any).window = { posthog: posthogWithoutException };
            const testError = new Error("boom");

            logger.error("Error occurred", testError);

            expect(posthogWithoutException.capture).toHaveBeenCalledWith(
                "client_error",
                expect.objectContaining({
                    errorMessage: "boom",
                    message: "Error occurred",
                }),
            );
        });

        it("should handle errors without error object", () => {
            process.env.NODE_ENV = "development";

            logger.error("Error message");

            expect(console.error).toHaveBeenCalledWith(
                "[ERROR] Error message",
                "",
                "",
            );
        });

        it("should handle errors without attributes", () => {
            process.env.NODE_ENV = "development";
            const testError = new Error("Test");

            logger.error("Error", testError);

            expect(console.error).toHaveBeenCalledWith(
                "[ERROR] Error",
                testError,
                "",
            );
        });
    });

    describe("debug", () => {
        it("should log debug messages in development mode", () => {
            process.env.NODE_ENV = "development";

            logger.debug("Debug message", { detail: "test" });

            expect(console.log).toHaveBeenCalledWith("[DEBUG] Debug message", {
                detail: "test",
            });
        });

        it("should never send debug to PostHog", () => {
            (global as any).window = { posthog: mockPostHog };
            process.env.NODE_ENV = "development";

            logger.debug("Debug message");

            expect(mockPostHog.capture).not.toHaveBeenCalled();
            expect(mockPostHog.captureException).not.toHaveBeenCalled();
        });
    });

    describe("server-side", () => {
        it("should not throw when there is no window", () => {
            logger.info("Test");
            logger.error("Test error", new Error("nope"));
        });
    });

    describe("attribute types", () => {
        it("should handle various attribute types", () => {
            process.env.NODE_ENV = "development";

            logger.info("Test", {
                string: "value",
                number: 123,
                boolean: true,
                null: null,
                undefined: undefined,
            });

            expect(console.log).toHaveBeenCalledWith("[INFO] Test", {
                string: "value",
                number: 123,
                boolean: true,
                null: null,
                undefined: undefined,
            });
        });
    });
});