import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// With cacheComponents, `next build` prerenders GET handlers in static route
// segments. The private-cache session lookup rejects when that prerender ends,
// and a try/catch in the handler turns the rejection into a 500. Calling
// connection() first stops the prerender before any session lookup.
const API_DIR = path.resolve(__dirname, "../../app/api");

function findStaticRouteFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory()) {
            return entry.name.startsWith("[")
                ? []
                : findStaticRouteFiles(path.join(dir, entry.name));
        }
        return entry.name === "route.ts" ? [path.join(dir, entry.name)] : [];
    });
}

const authenticatedGetRoutes = findStaticRouteFiles(API_DIR)
    .map((file) => ({
        route: path.relative(API_DIR, path.dirname(file)),
        source: readFileSync(file, "utf8"),
    }))
    .filter(
        ({ source }) =>
            /export (async )?function GET\(/.test(source) &&
            source.includes('from "@/lib/auth-server"'),
    );

describe("static authenticated GET routes", () => {
    it("finds the routes to check", () => {
        expect(authenticatedGetRoutes.map(({ route }) => route)).toEqual(
            expect.arrayContaining([
                "gifs/search",
                "memberships",
                "search/messages",
            ]),
        );
    });

    it.each(authenticatedGetRoutes)(
        "/api/$route calls connection() before any other work",
        ({ source }) => {
            expect(source).toMatch(
                /export (async )?function GET\([^)]*\)[^{]*\{(\s*\/\/[^\n]*)*\s*await connection\(\);/,
            );
        },
    );
});
