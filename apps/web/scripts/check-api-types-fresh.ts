#!/usr/bin/env bun
/**
 * Fails if the committed generated types are out of date with the spec.
 *
 * `check-openapi-sync` catches spec-vs-routes drift. This catches the next link
 * in the chain: someone edits `openapi-doc.yml` and forgets to regenerate, so
 * the types clients compile against quietly describe the old API. Generating
 * into a temp file and diffing keeps the committed file untouched on failure.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WEB_ROOT = join(import.meta.dir, "..");
const SPEC = join(WEB_ROOT, "docs", "openapi-doc.yml");
const COMMITTED = join(WEB_ROOT, "src", "lib", "api", "schema.ts");

const dir = mkdtempSync(join(tmpdir(), "firepit-api-types-"));
const candidate = join(dir, "schema.ts");

try {
    const result = spawnSync(
        "bunx",
        ["openapi-typescript", SPEC, "-o", candidate],
        { cwd: WEB_ROOT, stdio: "pipe" },
    );

    if (result.status !== 0) {
        console.error(
            `Failed to generate types from the spec:\n${result.stderr?.toString() ?? ""}`,
        );
        process.exit(1);
    }

    const committedSource = readFileSync(COMMITTED, "utf8");
    const candidateSource = readFileSync(candidate, "utf8");

    if (committedSource === candidateSource) {
        console.log("Generated API types are up to date.");
    } else {
        console.error(
            "src/lib/api/schema.ts is out of date with docs/openapi-doc.yml.\n" +
                "Run `bun run generate:api-types` and commit the result.",
        );
        process.exit(1);
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}
