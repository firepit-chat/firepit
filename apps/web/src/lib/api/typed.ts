/**
 * Ergonomic aliases over the generated API types.
 *
 * `src/lib/api/schema.ts` is generated from `docs/openapi-doc.yml` and must not
 * be edited by hand — run `bun run generate:api-types`. Reaching an operation
 * through `paths["/a/{b}"]["get"]["responses"][200]` is correct but unreadable
 * at every call site, so the shapes the app actually consumes are named here,
 * still derived from the spec rather than restated.
 *
 * Anything added to this file must be a `paths` projection. A hand-written
 * duplicate is exactly the drift the generated types exist to remove: the
 * member viewer's `role` shape previously existed in three places (the spec,
 * `lib/server-members.ts`, and the mobile client) and the mobile copy had
 * already gone stale.
 *
 * The spec declares no `operationId`, so the generator's `operations` helper is
 * empty and `paths` is the addressable index. Adding operationIds later would
 * let these become `operations["getViewerMembers"]` without changing callers.
 */

import type { components, paths } from "./schema";

type JsonResponse<
    Path extends keyof paths,
    Method extends "get" | "post" | "put" | "patch" | "delete",
    Status extends 200 | 201 | 204,
> = paths[Path][Method] extends { responses: infer R }
    ? R extends Record<Status, { content: { "application/json": infer Body } }>
        ? Body
        : never
    : never;

export type MemberPrimaryRole = components["schemas"]["MemberPrimaryRole"];

/** `GET /api/servers/{serverId}/viewer/members` — the member rail. */
export type ViewerMembersResponse = JsonResponse<
    "/api/servers/{serverId}/viewer/members",
    "get",
    200
>;

export type ViewerMember = ViewerMembersResponse["members"][number];

/** `GET /api/servers/{serverId}/members` — role management, `manageRoles` only. */
export type ServerMembersResponse = JsonResponse<
    "/api/servers/{serverId}/members",
    "get",
    200
>;

/** `GET /api/me` — the signed-in user. */
export type CurrentUserResponse = JsonResponse<"/api/me", "get", 200>;

/** `GET /api/roles` — server roles, pre-sorted by descending position. */
export type RolesResponse = JsonResponse<"/api/roles", "get", 200>;

/** `GET /api/messages/{messageId}/poll` — poll state for a message. */
export type MessagePollResponse = JsonResponse<
    "/api/messages/{messageId}/poll",
    "get",
    200
>;
