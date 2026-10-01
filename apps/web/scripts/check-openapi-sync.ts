#!/usr/bin/env bun
/**
 * Fails if docs/openapi-doc.yml disagrees with the real route handlers in
 * src/app/api. Hand-written API docs rot silently: a handler can be renamed,
 * moved, or have a method added with nothing pointing at the spec, and the
 * drift only surfaces when a generated client calls a route that isn't there.
 *
 * Checks in both directions:
 *   - missing  a handler exists but the spec does not document it
 *   - phantom  the spec documents a path/method that has no handler
 *   - excluded paths on the allowlist (debug/test helpers)
 *
 * OPTIONS is deliberately ignored: the only OPTIONS handlers are CORS
 * origin-guard preflights on the upload routes, which browsers negotiate
 * themselves and which carry no request/response contract worth publishing.
 *
 * Run: bun run check:openapi        (exit 1 on drift)
 *      bun run check:openapi --list (print the drift without failing)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB_ROOT = join(import.meta.dir, "..");
const API_DIR = join(WEB_ROOT, "src", "app", "api");
const SPEC_PATH = join(WEB_ROOT, "docs", "openapi-doc.yml");

/** Internal helpers that are deliberately not part of the public API. */
const EXCLUDED = new Set(["/api/debug-cookies", "/api/debug/auth", "/api/test-env"]);

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
type Method = (typeof METHODS)[number];

const HTTP_METHOD_RE =
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

/** `[channelId]` -> `{channelId}`, `[...slug]` -> `{slug}`, drop `(group)`. */
function toSpecPath(routeDir: string): string {
    let p = "/" + relative(join(WEB_ROOT, "src", "app"), routeDir).split(/[\\/]/).join("/");
    p = p.replace(/\/\([^)]*\)/g, "");
    p = p.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
    p = p.replace(/\[(\.\.\.)?([^\]]+)\]/g, "{$2}");
    return p || "/";
}

function findRouteFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...findRouteFiles(full));
        else if (/^route\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

const handlers = new Map<string, Set<Method>>();
for (const file of findRouteFiles(API_DIR)) {
    const src = readFileSync(file, "utf8");
    const path = toSpecPath(file.replace(/route\.tsx?$/, ""));
    const methods = handlers.get(path) ?? new Set<Method>();
    for (const m of src.matchAll(HTTP_METHOD_RE)) {
        methods.add(m[1].toLowerCase() as Method);
    }
    handlers.set(path, methods);
}

// The spec is imported rather than hand-parsed so this stays dependency-free.
const spec = (await import(SPEC_PATH)) as {
    paths?: Record<string, Record<string, unknown>>;
};
const specPaths = spec.paths ?? {};

const missing: string[] = [];
for (const [path, methods] of handlers) {
    if (EXCLUDED.has(path)) continue;
    for (const method of methods) {
        if (!specPaths[path]?.[method]) missing.push(`${method.toUpperCase()} ${path}`);
    }
}

const phantom: string[] = [];
for (const [path, operations] of Object.entries(specPaths)) {
    for (const method of Object.keys(operations)) {
        if (!METHODS.includes(method as Method)) continue;
        if (!handlers.get(path)?.has(method as Method)) {
            phantom.push(`${method.toUpperCase()} ${path}`);
        }
    }
}

const excludedPresent = [...EXCLUDED].filter((p) => handlers.has(p));
// The denominator counts only operations the spec is actually expected to
// cover, so the allowlisted debug/test paths do not inflate it.
const inScope = [...handlers].filter(([path]) => !EXCLUDED.has(path));
const totalOps = inScope.reduce((n, [, m]) => n + m.size, 0);
const documented = totalOps - missing.length;
const summary = `${documented}/${totalOps} operations documented across ${inScope.length} paths`;

if (process.argv.includes("--list")) {
    for (const m of missing) console.log(`missing  ${m}`);
    for (const p of phantom) console.log(`phantom  ${p}`);
    console.log(`\n${summary}`);
} else {
    for (const m of missing) console.error(`missing  ${m}`);
    for (const p of phantom) console.error(`phantom  ${p}`);
    if (excludedPresent.length) {
        console.error(`note: allowlisted debug/test paths skipped: ${excludedPresent.join(", ")}`);
    }
    console.error(`\n${summary}`);
    if (missing.length || phantom.length) {
        console.error(`\nSpec is out of sync with the handlers.`);
        process.exit(1);
    }
}
