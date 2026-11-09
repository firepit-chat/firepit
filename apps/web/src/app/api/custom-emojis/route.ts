import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { describeAppwriteError } from "@/lib/appwrite-errors";
import {
    CUSTOM_EMOJIS_UNAVAILABLE_HEADER,
    type CustomEmoji,
} from "@/lib/types";
import { logger } from "@/lib/posthog-utils";

const FILE_EXTENSION_REGEX = /\.[^.]+$/;

// Log the first failure of an outage only; a success re-arms the log.
let failureLogged = false;

/**
 * GET /api/custom-emojis
 * List all custom emojis from Appwrite Storage using admin client.
 * When Appwrite fails, returns an empty list with the unavailable header.
 */
export async function GET() {
    try {
        const { storage } = getAdminClient();
        const env = getEnvConfig();

        // List all files in the emojis bucket
        const files = await storage.listFiles(env.buckets.emojis, [
            Query.orderDesc("$createdAt"),
            Query.limit(100),
        ]);

        const emojis: CustomEmoji[] = files.files.map((file) => {
            const emojiName = file.name.replace(FILE_EXTENSION_REGEX, "");

            return {
                fileId: file.$id,
                url: `/api/emoji/${file.$id}`,
                name: emojiName,
            };
        });

        failureLogged = false;
        const response = NextResponse.json(emojis);

        // Cache custom emojis for 5 minutes (rarely change)
        // Allow stale data for 30 minutes while revalidating
        response.headers.set(
            "Cache-Control",
            "public, s-maxage=300, stale-while-revalidate=1800",
        );

        return response;
    } catch (error) {
        if (!failureLogged) {
            failureLogged = true;
            logger.error(
                `Error fetching custom emojis${describeAppwriteError(error)}`,
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
        }
        return NextResponse.json([], {
            headers: {
                "Cache-Control": "no-store",
                [CUSTOM_EMOJIS_UNAVAILABLE_HEADER]: "1",
            },
        });
    }
}
