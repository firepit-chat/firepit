import { describe, expect, it } from "vitest";
import { Effect, Result } from "effect";

import {
    AppwriteCallError,
    appwriteQuery,
    isTransientAppwriteError,
} from "@/lib/appwrite-effect";

describe("appwrite-effect", () => {
    it("classifies transient and permanent Appwrite failures", () => {
        expect(isTransientAppwriteError({ code: 503 })).toBe(true);
        expect(isTransientAppwriteError({ code: 429 })).toBe(true);
        expect(isTransientAppwriteError(new Error("fetch failed"))).toBe(true);
        expect(isTransientAppwriteError({ code: 400 })).toBe(false);
        expect(isTransientAppwriteError({ code: 401 })).toBe(false);
        expect(isTransientAppwriteError(new Error("invalid query"))).toBe(
            false,
        );
    });

    it("retries a transient failure and succeeds", async () => {
        let attempts = 0;

        const outcome = await Effect.runPromise(
            Effect.result(
                appwriteQuery("test read", async () => {
                    attempts += 1;
                    if (attempts < 3) {
                        throw Object.assign(new Error("unavailable"), {
                            code: 503,
                        });
                    }
                    return "ok";
                }),
            ),
        );

        expect(attempts).toBe(3);
        expect(Result.isSuccess(outcome)).toBe(true);
        if (Result.isSuccess(outcome)) {
            expect(outcome.success).toBe("ok");
        }
    });

    it("does not retry a permanent failure", async () => {
        let attempts = 0;

        const outcome = await Effect.runPromise(
            Effect.result(
                appwriteQuery("test read", async () => {
                    attempts += 1;
                    throw Object.assign(new Error("bad request"), {
                        code: 400,
                    });
                }),
            ),
        );

        expect(attempts).toBe(1);
        expect(Result.isFailure(outcome)).toBe(true);
        if (Result.isFailure(outcome)) {
            expect(outcome.failure).toBeInstanceOf(AppwriteCallError);
            expect(outcome.failure.transient).toBe(false);
        }
    });
});
